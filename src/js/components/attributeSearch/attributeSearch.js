/**
 * Herramienta de Búsqueda por Atributos para el Visor IDESA.
 * Permite buscar elementos en capas activas (como Suelos, Desmontes, Catastro o capas locales)
 * filtrando por uno, múltiples campos o en TODOS los campos alfanuméricos simultáneamente.
 * Soporta filtros espaciales: Toda la capa, Vista actual del mapa o Recuadro dibujado con el mouse.
 * Resalta y selecciona los elementos encontrados en el mapa con auto-zoom,
 * y permite descargarlos directamente en formato KML o GeoJSON y visualizarlos en tabla.
 */
class AttributeSearch {
  constructor() {
    this.modalElem = null;
    this.selectionLayer = null;
    this.currentResults = null;
    this.currentLayer = null;
    this.availableFields = [];
    this.fieldsCache = {};
    this.conditionCount = 0;
    this.floatingToolbar = null;
    this.isMinimized = false;
    this.savedConditions = null;
    this.savedLayerIndex = 0;
    this.savedLogic = "AND";

    // Filtro espacial
    this.spatialScope = "all"; // 'all' | 'view' | 'box'
    this.customBbox = null; // [minLng, minLat, maxLng, maxLat]
    this.boxRectLayer = null; // Capa visual del recuadro dibujado
    this.isDrawingBox = false;
    this.geomPropertyCache = {};
  }

  /**
   * Crea e inyecta el botón en la botonera lateral izquierda.
   */
  createComponent() {
    if (document.getElementById("attribute-search-btn")) return;

    const botonera = document.getElementById("botonera");
    if (!botonera) {
      console.warn("AttributeSearch: No se encontró el contenedor #botonera");
      return;
    }

    const btn = document.createElement("button");
    btn.className = "ag-btn ag-btn-primary menu-section-btn";
    btn.id = "attribute-search-btn";
    btn.title = "Búsqueda por atributos / Consulta";
    btn.setAttribute("aria-label", "Búsqueda por atributos");
    btn.innerHTML = `<i class="fa-solid fa-filter" aria-hidden="true"></i>`;

    btn.onclick = (e) => {
      e.stopPropagation();
      this.toggleModal();
    };

    const geoprocesosBtn = document.getElementById("geoprocesos-btn");
    if (geoprocesosBtn) {
      botonera.insertBefore(btn, geoprocesosBtn);
    } else {
      botonera.appendChild(btn);
    }
  }

  /**
   * Alterna la visibilidad del modal.
   */
  toggleModal() {
    if (this.modalElem) {
      if (this.isMinimized) {
        this.toggleMinimize();
      } else {
        this.closeModal();
      }
    } else {
      this.openModal();
    }
  }

  /**
   * Limpia y normaliza una URL de servicio para obtener el endpoint WFS.
   */
  getWfsBaseUrl(host) {
    if (!host) return "";
    let clean = host.trim().replace(/\?.*$/, "");
    clean = clean
      .replace(/\/wms\/?$/i, "/wfs")
      .replace(/\/gwc\/service\/wmts\/?$/i, "/wfs");
    if (!clean.endsWith("/wfs") && !clean.endsWith("/ows")) {
      clean += "/wfs";
    }
    return clean;
  }

  /**
   * Obtiene la lista de capas activas consultables (Catálogo WMS/WFS, capas locales, recortes).
   * @returns {Array<Object>}
   */
  getSearchableLayers() {
    const layers = [];
    const addedNames = new Set();

    const registerLayer = (item) => {
      if (!item || !item.name || addedNames.has(item.name)) return;
      addedNames.add(item.name);

      const isCatastro =
        item.name.toLowerCase().includes("parcela") ||
        item.name.toLowerCase().includes("catastro") ||
        (item.title && (item.title.toLowerCase().includes("catastro") || item.title.toLowerCase().includes("parcela")));

      layers.push({
        type: item.type || "wfs",
        name: item.name,
        title: item.title || item.name,
        host: item.host || "",
        isCatastro: isCatastro,
        rawLayer: item.rawLayer || null,
      });
    };

    const baseLayers = (typeof gestorMenu !== "undefined" && gestorMenu.availableBaseLayers) || [];

    // 1. Capas del catálogo mediante getActiveLayersWithoutBasemap
    if (typeof gestorMenu !== "undefined" && typeof gestorMenu.getActiveLayersWithoutBasemap === "function") {
      try {
        const catalogLayers = gestorMenu.getActiveLayersWithoutBasemap();
        if (Array.isArray(catalogLayers)) {
          catalogLayers.forEach((l) => {
            if (l) {
              const name = l.name || l.nombre || "";
              const title = l.titulo || l.title || name;
              registerLayer({
                type: "wfs",
                name: name,
                title: title,
                host: l.host || "",
                rawLayer: l.rawItem || l,
              });
            }
          });
        }
      } catch (err) {
        console.warn("AttributeSearch: Error en getActiveLayersWithoutBasemap:", err);
      }
    }

    // 2. Mapa de elementos del catálogo gestorMenu.items
    const catalogItemMap = new Map();
    if (typeof gestorMenu !== "undefined" && gestorMenu.items) {
      for (const sKey in gestorMenu.items) {
        const section = gestorMenu.items[sKey];
        if (section && section.itemsComposite) {
          for (const cKey in section.itemsComposite) {
            const it = section.itemsComposite[cKey];
            if (it && it.nombre) {
              catalogItemMap.set(it.nombre, it);
            }
          }
        }
      }
    }

    // 3. Inspeccionar gestorMenu.activeLayers
    if (typeof gestorMenu !== "undefined" && Array.isArray(gestorMenu.activeLayers)) {
      gestorMenu.activeLayers.forEach((layerName) => {
        if (!baseLayers.includes(layerName)) {
          const it = catalogItemMap.get(layerName);
          let host = "";
          let title = layerName;

          if (it) {
            title = it.titulo || it.nombre || layerName;
            if (it.capa && it.capa.host) {
              host = it.capa.host;
            } else if (it.capas && it.capas[0] && it.capas[0].host) {
              host = it.capas[0].host;
            }
          }

          if (!host && typeof overlayMaps !== "undefined" && overlayMaps[layerName]) {
            const om = overlayMaps[layerName];
            host = (om._source && om._source._url) || om._url || "";
            if (title === layerName && om.options && om.options.title) {
              title = om.options.title;
            }
          }

          if (!host && gestorMenu.layersDataForWfs && gestorMenu.layersDataForWfs[layerName]) {
            host = gestorMenu.layersDataForWfs[layerName].host || "";
          }

          registerLayer({
            type: "wfs",
            name: layerName,
            title: title,
            host: host,
            rawLayer: it || (typeof overlayMaps !== "undefined" ? overlayMaps[layerName] : null),
          });
        }
      });
    }

    // 4. Inspeccionar overlayMaps
    if (typeof overlayMaps !== "undefined") {
      Object.keys(overlayMaps).forEach((layerName) => {
        if (!baseLayers.includes(layerName)) {
          const om = overlayMaps[layerName];
          if (om) {
            const host = (om._source && om._source._url) || om._url || "";
            const title = (om.options && om.options.title) || layerName;
            registerLayer({
              type: "wfs",
              name: layerName,
              title: title,
              host: host,
              rawLayer: om,
            });
          }
        }
      });
    }

    // 5. Capas agregadas localmente (KML, GeoJSON, Shapefile, recortes)
    if (typeof gestorMenu !== "undefined" && gestorMenu.addedLayers) {
      Object.keys(gestorMenu.addedLayers).forEach((id) => {
        const lyr = gestorMenu.addedLayers[id];
        const name = lyr.name || lyr.options?.name || id;
        const title = lyr.title || lyr.options?.title || name;
        registerLayer({
          type: "local",
          name: name,
          title: title,
          host: "",
          rawLayer: lyr,
        });
      });
    }

    // 6. Capas vectoriales directas en Leaflet
    const mapObj = window.mapa || window.map;
    if (mapObj && mapObj._layers) {
      Object.values(mapObj._layers).forEach((lyr) => {
        if (lyr && lyr.feature && lyr.feature.properties && !lyr._isInternal) {
          const lyrName = lyr.options?.name || lyr.feature.id || "Capa vectorial";
          registerLayer({
            type: "local",
            name: lyrName,
            title: lyr.options?.title || lyrName,
            host: "",
            rawLayer: lyr,
          });
        }
      });
    }

    // Ordenar priorizando Catastro si existiera
    layers.sort((a, b) => (b.isCatastro ? 1 : 0) - (a.isCatastro ? 1 : 0));

    return layers;
  }

  /**
   * Abre la ventana modal de búsqueda por atributos.
   */
  async openModal() {
    this.removeDrawHint();

    if (this.modalElem) {
      if (this.isMinimized) {
        this.toggleMinimize();
        return;
      }
      this.closeModal();
    }

    const layers = this.getSearchableLayers();

    const overlay = document.createElement("div");
    overlay.id = "attribute-search-overlay";
    overlay.innerHTML = `
      <div class="as-dialog" role="dialog" aria-modal="true" aria-labelledby="as-dialog-title">
        <div class="as-header" id="as-header">
          <h3 id="as-dialog-title">
            <i class="fa-solid fa-filter"></i> Búsqueda por Atributos
          </h3>
          <div class="as-header-actions">
            <button type="button" class="as-header-btn" id="as-minimize-btn" title="Minimizar panel">
              <i class="fa-solid fa-window-minimize"></i>
            </button>
            <button type="button" class="as-close-btn" id="as-close-btn" title="Cerrar">&times;</button>
          </div>
        </div>

        <div class="as-body">
          <!-- Selector de capa activa -->
          <div class="as-group">
            <label class="as-label" for="as-layer-select">Capa Activa a Consultar</label>
            <div style="display:flex; gap:6px;">
              <select id="as-layer-select" class="as-control" style="flex:1;">
                ${
                  layers.length > 0
                    ? layers
                        .map(
                          (l, idx) =>
                            `<option value="${idx}" ${
                              idx === this.savedLayerIndex || (!this.savedLayerIndex && l.isCatastro) ? "selected" : ""
                            }>${this.escapeHtml(l.title)} ${l.isCatastro ? "(Catastro)" : ""}</option>`
                        )
                        .join("")
                    : `<option value="">-- No hay capas activas disponibles --</option>`
                }
              </select>
              <button type="button" id="as-btn-refresh-layers" class="as-control" style="width:auto; padding:0 12px; cursor:pointer;" title="Actualizar lista de capas activas">
                <i class="fa-solid fa-arrows-rotate"></i>
              </button>
            </div>
          </div>

          ${
            layers.length === 0
              ? `
            <div class="as-results-status empty">
              <i class="fa-solid fa-info-circle"></i>
              Active una o más capas en el menú de capas (por ejemplo Suelos o Desmontes) y luego presione el botón de actualizar o vuelva a abrir esta herramienta.
            </div>
          `
              : `
            <!-- Selector de Ámbito Espacial (Toda la capa, Vista actual o Recuadro) -->
            <div class="as-group">
              <label class="as-label">Ámbito Espacial de Búsqueda</label>
              <div class="as-spatial-selector">
                <label class="as-radio-label" title="Buscar en todo el territorio de la capa">
                  <input type="radio" name="as-spatial-scope" value="all" ${this.spatialScope === "all" ? "checked" : ""} />
                  <span>🌐 Toda la capa</span>
                </label>
                <label class="as-radio-label" title="Limitar la búsqueda a lo que se ve en la pantalla actual">
                  <input type="radio" name="as-spatial-scope" value="view" ${this.spatialScope === "view" ? "checked" : ""} />
                  <span>👁️ Vista actual del mapa</span>
                </label>
                <label class="as-radio-label" title="Trazar con el mouse un recuadro específico">
                  <input type="radio" name="as-spatial-scope" value="box" ${this.spatialScope === "box" ? "checked" : ""} />
                  <span>📐 Dibujar recuadro</span>
                </label>
              </div>

              <div id="as-box-status" style="${this.spatialScope === 'box' && this.customBbox ? 'display:flex;' : 'display:none;'} margin-top:6px; font-size:12px; color:#0284c7; align-items:center; gap:8px;">
                <i class="fa-solid fa-draw-polygon"></i>
                <span id="as-box-status-text">${this.customBbox ? "Recuadro delimitado en el mapa" : "Haga clic en Trazar para dibujar"}</span>
                <button type="button" id="as-btn-redraw-box" style="font-size:11px; padding:2px 8px; border-radius:4px; border:1px solid #0284c7; background:#e0f2fe; color:#0369a1; cursor:pointer;">
                  <i class="fa-solid fa-pencil"></i> Trazar en mapa
                </button>
              </div>
            </div>

            <!-- Selector de lógica AND / OR -->
            <div class="as-group">
              <label class="as-label">Criterio de Coincidencia</label>
              <div class="as-logic-selector">
                <label class="as-radio-label">
                  <input type="radio" name="as-logic" value="AND" ${this.savedLogic === "AND" ? "checked" : ""} />
                  <span>Cumplir TODAS las condiciones (AND)</span>
                </label>
                <label class="as-radio-label">
                  <input type="radio" name="as-logic" value="OR" ${this.savedLogic === "OR" ? "checked" : ""} />
                  <span>Cumplir ALGUNA condición (OR)</span>
                </label>
              </div>
            </div>

            <!-- Contenedor dinámico de condiciones -->
            <div class="as-group">
              <label class="as-label">Condiciones de Búsqueda</label>
              <div id="as-conditions-box" class="as-conditions-box">
                <!-- Las filas de condiciones se insertan aquí -->
              </div>
              <button type="button" id="as-btn-add-cond" class="as-btn-add">
                <i class="fa-solid fa-plus"></i> Agregar otra condición
              </button>
            </div>

            <!-- Contenedor de Resultados -->
            <div id="as-results-box" class="as-results-box" style="display: none;">
              <div id="as-results-status" class="as-results-status"></div>
              <div id="as-results-list" class="as-results-list" style="display: none;"></div>
              <div id="as-export-actions" class="as-export-actions">
                <button type="button" id="as-btn-view-map" class="as-btn-view-map" title="Ver elemento en el mapa">
                  <i class="fa-solid fa-map-location-dot"></i> Ver en Mapa
                </button>
                <button type="button" id="as-btn-download-kml" class="as-btn-download">
                  <i class="fa-solid fa-download"></i> Descargar en KML
                </button>
                <button type="button" id="as-btn-download-geojson" class="as-btn-download" style="background:#0284c7;">
                  <i class="fa-solid fa-file-code"></i> Descargar GeoJSON
                </button>
                <button type="button" id="as-btn-view-table" class="as-btn-table">
                  <i class="fa-solid fa-table"></i> Ver en Tabla
                </button>
                <button type="button" id="as-btn-clear-selection" class="as-btn-clear-selection">
                  <i class="fa-solid fa-trash"></i> Limpiar Selección
                </button>
              </div>
            </div>
          `
          }
        </div>

        <div class="as-footer">
          <button type="button" id="as-btn-cancel" class="as-btn-cancel">Cerrar</button>
          ${
            layers.length > 0
              ? `
            <button type="button" id="as-btn-search" class="as-btn-primary">
              <i class="fa-solid fa-magnifying-glass"></i> Buscar
            </button>
          `
              : ""
          }
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    this.modalElem = overlay;

    // Diálogo arrastrable
    const dialog = overlay.querySelector(".as-dialog");
    const header = overlay.querySelector(".as-header");
    this.makeDraggable(dialog, header);

    // Botones de cabecera
    document.getElementById("as-minimize-btn").onclick = () => this.toggleMinimize();
    document.getElementById("as-close-btn").onclick = () => this.closeModal();
    document.getElementById("as-btn-cancel").onclick = () => this.closeModal();

    // Botón refrescar capas
    const refreshBtn = document.getElementById("as-btn-refresh-layers");
    if (refreshBtn) {
      refreshBtn.onclick = () => {
        this.saveCurrentState();
        this.openModal();
      };
    }

    if (layers.length > 0) {
      const layerSelect = document.getElementById("as-layer-select");
      layerSelect.onchange = () => this.onLayerChange();

      // Listeners de ámbito espacial
      const spatialRadios = overlay.querySelectorAll('input[name="as-spatial-scope"]');
      spatialRadios.forEach((r) => {
        r.addEventListener("change", (e) => {
          this.spatialScope = e.target.value;
          const boxStatus = document.getElementById("as-box-status");
          if (this.spatialScope === "box") {
            if (boxStatus) boxStatus.style.display = "flex";
            if (!this.customBbox) {
              this.startBoxDraw();
            }
          } else {
            if (boxStatus) boxStatus.style.display = "none";
            this.clearBoxDrawLayer();
          }
        });
      });

      const redrawBtn = document.getElementById("as-btn-redraw-box");
      if (redrawBtn) {
        redrawBtn.onclick = () => this.startBoxDraw();
      }

      document.getElementById("as-btn-add-cond").onclick = () => {
        this.addConditionRow();
      };

      document.getElementById("as-btn-search").onclick = () => {
        this.executeSearch();
      };

      document.getElementById("as-btn-view-map").onclick = () => {
        this.toggleMinimize();
      };

      document.getElementById("as-btn-download-kml").onclick = () => {
        this.downloadKml();
      };

      document.getElementById("as-btn-download-geojson").onclick = () => {
        this.downloadGeoJson();
      };

      document.getElementById("as-btn-view-table").onclick = () => {
        this.viewInTable();
      };

      document.getElementById("as-btn-clear-selection").onclick = () => {
        this.clearSelection();
      };

      // Inicializar campos de la capa seleccionada
      await this.onLayerChange();

      // Si ya existían resultados previos activos, restaurar visualización
      if (this.currentResults && this.currentResults.features && this.currentResults.features.length > 0) {
        this.displayResults(this.currentResults, this.currentLayer ? this.currentLayer.title : "");
      }
    }
  }

  /**
   * Elimina el banner de ayuda de dibujo si estuviera visible.
   */
  removeDrawHint() {
    const hint = document.getElementById("as-draw-hint");
    if (hint && hint.parentNode) {
      hint.parentNode.removeChild(hint);
    }
  }

  /**
   * Inicia el modo de dibujo interactivo de recuadro sobre el mapa Leaflet.
   */
  startBoxDraw() {
    const mapObj = window.mapa || window.map;
    if (!mapObj) return;

    if (!this.isMinimized) {
      this.toggleMinimize();
    }

    this.removeDrawHint();

    const hint = document.createElement("div");
    hint.id = "as-draw-hint";
    hint.style.cssText =
      "position:fixed; top:75px; left:50%; transform:translateX(-50%); background:rgba(15,23,42,0.95); color:#fff; padding:8px 18px; border-radius:20px; font-size:12px; z-index:99999; box-shadow:0 4px 16px rgba(0,0,0,0.3); font-family:sans-serif; display:flex; align-items:center; gap:8px;";
    hint.innerHTML = `
      <i class="fa-solid fa-draw-polygon" style="color:#38bdf8;"></i>
      <span>Haga clic y arrastre sobre el mapa para definir el área de búsqueda</span>
      <button type="button" id="as-draw-hint-close" style="background:transparent; border:none; color:#94a3b8; font-size:14px; cursor:pointer; margin-left:6px;" title="Cerrar">&times;</button>
    `;
    document.body.appendChild(hint);

    mapObj.dragging.disable();
    const mapContainer = mapObj.getContainer();
    mapContainer.style.cursor = "crosshair";

    let startPoint = null;
    let marquee = null;

    const cleanup = () => {
      mapObj.off("mousedown", onMouseDown);
      mapObj.off("mousemove", onMouseMove);
      mapObj.off("mouseup", onMouseUp);
      document.removeEventListener("keydown", onKeyDown);
      mapObj.dragging.enable();
      mapContainer.style.cursor = "";
      if (marquee && marquee.parentNode) marquee.parentNode.removeChild(marquee);
      this.removeDrawHint();
    };

    const hintClose = document.getElementById("as-draw-hint-close");
    if (hintClose) {
      hintClose.onclick = () => {
        cleanup();
        if (this.isMinimized) this.toggleMinimize();
      };
    }

    const onMouseDown = (e) => {
      if (e.originalEvent.button !== 0) return;
      startPoint = e.containerPoint;

      marquee = document.createElement("div");
      marquee.className = "box-zoom-marquee";
      marquee.style.cssText = "position:absolute; border:2px dashed #0284c7; background:rgba(2,132,199,0.18); pointer-events:none; z-index:9999;";
      mapContainer.appendChild(marquee);

      mapObj.on("mousemove", onMouseMove);
      mapObj.on("mouseup", onMouseUp);
    };

    const onMouseMove = (e) => {
      if (!startPoint || !marquee) return;
      const currentPoint = e.containerPoint;
      const x = Math.min(startPoint.x, currentPoint.x);
      const y = Math.min(startPoint.y, currentPoint.y);
      const w = Math.abs(startPoint.x - currentPoint.x);
      const h = Math.abs(startPoint.y - currentPoint.y);

      marquee.style.left = `${x}px`;
      marquee.style.top = `${y}px`;
      marquee.style.width = `${w}px`;
      marquee.style.height = `${h}px`;
    };

    const onKeyDown = (e) => {
      if (e.key === "Escape" || e.keyCode === 27) {
        cleanup();
        if (this.isMinimized) this.toggleMinimize();
      }
    };

    const onMouseUp = (e) => {
      if (!startPoint) {
        cleanup();
        return;
      }
      const endPoint = e.containerPoint;
      const dist = Math.hypot(endPoint.x - startPoint.x, endPoint.y - startPoint.y);

      if (dist > 15) {
        const startLatLng = mapObj.containerPointToLatLng(startPoint);
        const endLatLng = mapObj.containerPointToLatLng(endPoint);

        const south = Math.min(startLatLng.lat, endLatLng.lat);
        const north = Math.max(startLatLng.lat, endLatLng.lat);
        const west = Math.min(startLatLng.lng, endLatLng.lng);
        const east = Math.max(startLatLng.lng, endLatLng.lng);

        this.customBbox = [west, south, east, north];

        // Dibujar recuadro visual en el mapa
        this.clearBoxDrawLayer();
        this.boxRectLayer = L.rectangle([[south, west], [north, east]], {
          color: "#0284c7",
          weight: 2,
          dashArray: "5, 5",
          fillColor: "#0284c7",
          fillOpacity: 0.12,
        }).addTo(mapObj);

        // Actualizar texto en modal
        const statusText = document.getElementById("as-box-status-text");
        if (statusText) {
          statusText.textContent = `Recuadro delimitado (${south.toFixed(2)}°, ${west.toFixed(2)}° a ${north.toFixed(2)}°, ${east.toFixed(2)}°)`;
        }
      }

      cleanup();
      if (this.isMinimized) this.toggleMinimize();
    };

    mapObj.once("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
  }

  /**
   * Elimina la capa visual del recuadro trazado.
   */
  clearBoxDrawLayer() {
    const mapObj = window.mapa || window.map;
    if (this.boxRectLayer && mapObj) {
      mapObj.removeLayer(this.boxRectLayer);
      this.boxRectLayer = null;
    }
  }

  /**
   * Cierra el modal guardando el estado.
   */
  closeModal() {
    this.removeDrawHint();
    this.saveCurrentState();
    if (this.modalElem && document.body.contains(this.modalElem)) {
      document.body.removeChild(this.modalElem);
    }
    this.modalElem = null;
    this.isMinimized = false;
  }

  /**
   * Minimiza o restaura la ventana de búsqueda.
   */
  toggleMinimize() {
    if (!this.modalElem) return;
    const dialog = this.modalElem.querySelector(".as-dialog");
    const minBtn = document.getElementById("as-minimize-btn");
    if (!dialog || !minBtn) return;

    this.isMinimized = !this.isMinimized;
    if (this.isMinimized) {
      dialog.classList.add("as-minimized");
      minBtn.innerHTML = `<i class="fa-solid fa-window-restore"></i>`;
      minBtn.title = "Restaurar panel";
    } else {
      dialog.classList.remove("as-minimized");
      minBtn.innerHTML = `<i class="fa-solid fa-window-minimize"></i>`;
      minBtn.title = "Minimizar panel";
    }
  }

  /**
   * Guarda los criterios actuales de búsqueda.
   */
  saveCurrentState() {
    if (!this.modalElem) return;
    const layerSelect = document.getElementById("as-layer-select");
    if (layerSelect) {
      this.savedLayerIndex = parseInt(layerSelect.value, 10) || 0;
    }
    const logicInput = document.querySelector("input[name='as-logic']:checked");
    if (logicInput) {
      this.savedLogic = logicInput.value;
    }
    const spatialInput = document.querySelector("input[name='as-spatial-scope']:checked");
    if (spatialInput) {
      this.spatialScope = spatialInput.value;
    }
    const rows = document.querySelectorAll(".as-condition-row");
    const conds = [];
    rows.forEach((r) => {
      const fieldSelect = r.querySelector(".as-field-select");
      const opSelect = r.querySelector(".as-op-select");
      const valInput = r.querySelector(".as-val-input");
      if (fieldSelect && opSelect && valInput) {
        conds.push({
          field: fieldSelect.value,
          op: opSelect.value,
          val: valInput.value,
        });
      }
    });
    if (conds.length > 0) {
      this.savedConditions = conds;
    }
  }

  /**
   * Permite arrastrar el diálogo modal mediante la cabecera.
   */
  makeDraggable(dialog, handle) {
    if (!dialog || !handle) return;
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;

    handle.onmousedown = (e) => {
      if (
        e.target.tagName === "BUTTON" ||
        e.target.closest("button") ||
        e.target.tagName === "INPUT" ||
        e.target.tagName === "SELECT"
      ) {
        return;
      }
      e.preventDefault();
      pos3 = e.clientX;
      pos4 = e.clientY;
      document.onmouseup = closeDrag;
      document.onmousemove = dragMove;
    };

    function dragMove(e) {
      e.preventDefault();
      pos1 = pos3 - e.clientX;
      pos2 = pos4 - e.clientY;
      pos3 = e.clientX;
      pos4 = e.clientY;

      dialog.style.position = "fixed";
      dialog.style.margin = "0";
      const newTop = Math.max(10, Math.min(window.innerHeight - 60, dialog.offsetTop - pos2));
      const newLeft = Math.max(10, Math.min(window.innerWidth - 120, dialog.offsetLeft - pos1));
      dialog.style.top = `${newTop}px`;
      dialog.style.left = `${newLeft}px`;
      dialog.style.transform = "none";
    }

    function closeDrag() {
      document.onmouseup = null;
      document.onmousemove = null;
    }
  }

  /**
   * Maneja el cambio de capa seleccionada cargando dinámicamente sus atributos.
   */
  async onLayerChange() {
    const layerSelect = document.getElementById("as-layer-select");
    if (!layerSelect) return;

    const layers = this.getSearchableLayers();
    const selectedIdx = parseInt(layerSelect.value, 10);
    this.currentLayer = layers[selectedIdx];

    if (!this.currentLayer) return;

    const box = document.getElementById("as-conditions-box");
    box.innerHTML = `<div style="font-size:0.85rem; color:#6b7280; text-align:center; padding:10px;"><span class="as-spinner" style="border-top-color:var(--primary-color, #680205); border-color:rgba(104,2,5,0.2);"></span> Cargando atributos de la capa...</div>`;

    try {
      this.availableFields = await this.fetchLayerFields(this.currentLayer);
    } catch (err) {
      console.error("Error al cargar atributos de la capa:", err);
      box.innerHTML = `<div style="color:#ef4444; padding:10px; font-size:12px;"><i class="fa-solid fa-triangle-exclamation"></i> Error al cargar atributos: ${err.message || err}</div>`;
      return;
    }

    box.innerHTML = "";
    this.conditionCount = 0;

    // Si existen condiciones guardadas de esta capa, restaurarlas
    if (this.savedConditions && this.savedConditions.length > 0) {
      this.savedConditions.forEach((c) => {
        this.addConditionRow(c.field, c.op, c.val);
      });
      this.savedConditions = null;
    } else if (this.currentLayer.isCatastro) {
      this.addConditionRow("__all__", "ILIKE", "", "Buscar en todos los campos...");
      const hasCatastroField = this.availableFields.some((f) => f.name.toLowerCase().includes("catastro"));
      if (hasCatastroField) {
        const catField = this.availableFields.find((f) => f.name.toLowerCase().includes("catastro")).name;
        this.addConditionRow(catField, "ILIKE", "", "Ej: 12345");
      }
    } else {
      this.addConditionRow("__all__", "ILIKE", "", "Buscar en cualquier atributo (ej: Haplumbreptes)...");
    }
  }

  /**
   * Normaliza tipos de datos devueltos por GeoServer (XML Schema o JSON) a categorías estándar.
   * Evita ClassCastException y operadores incompatibles en consultas CQL.
   * @param {string} rawType
   * @returns {'string'|'number'|'date'|'boolean'|'geom'}
   */
  normalizeFieldType(rawType) {
    if (!rawType) return "string";
    const t = String(rawType).toLowerCase();
    if (
      t.includes("geom") ||
      t.includes("point") ||
      t.includes("polygon") ||
      t.includes("line") ||
      t.includes("surface") ||
      t.includes("coord")
    ) {
      return "geom";
    }
    if (t.includes("date") || t.includes("time")) {
      return "date";
    }
    if (
      t.includes("int") ||
      t.includes("short") ||
      t.includes("long") ||
      t.includes("double") ||
      t.includes("float") ||
      t.includes("decimal") ||
      t.includes("numeric") ||
      t.includes("num") ||
      t.includes("real")
    ) {
      return "number";
    }
    if (t.includes("bool")) {
      return "boolean";
    }
    return "string";
  }

  /**
   * Obtiene la lista de campos alfanuméricos de una capa (WFS DescribeFeatureType, GetFeature muestra o inspección local).
   * @param {Object} layerItem
   * @returns {Promise<Array<{name:string, type:string}>>}
   */
  async fetchLayerFields(layerItem) {
    if (this.fieldsCache[layerItem.name]) {
      return this.fieldsCache[layerItem.name];
    }

    let fields = [];

    if (layerItem.type === "wfs" && layerItem.host) {
      const wfsHost = this.getWfsBaseUrl(layerItem.host);

      // Intento 1: DescribeFeatureType
      try {
        const url = `${wfsHost}?service=WFS&version=1.0.0&request=DescribeFeatureType&typeName=${encodeURIComponent(
          layerItem.name
        )}&outputFormat=application/json`;

        const res = await fetch(url);
        if (res.ok) {
          const contentType = res.headers.get("content-type") || "";
          if (contentType.includes("json")) {
            const data = await res.json();
            if (data && data.featureTypes && data.featureTypes[0] && data.featureTypes[0].properties) {
              data.featureTypes[0].properties.forEach((p) => {
                const normType = this.normalizeFieldType(p.type || p.localType);
                if (
                  normType === "geom" ||
                  p.name.toLowerCase() === "the_geom" ||
                  p.name.toLowerCase() === "geom"
                ) {
                  layerItem.geomProperty = p.name;
                  this.geomPropertyCache[layerItem.name] = p.name;
                } else {
                  fields.push({
                    name: p.name,
                    type: p.localType || p.type || "string",
                  });
                }
              });
            }
          } else {
            // Parser XML schema de GeoServer
            const xmlText = await res.text();
            const parser = new DOMParser();
            const xml = parser.parseFromString(xmlText, "text/xml");
            const elements = xml.querySelectorAll("element, xsd\\:element");
            elements.forEach((el) => {
              const name = el.getAttribute("name");
              const rawType = el.getAttribute("type") || "";
              const normType = this.normalizeFieldType(rawType);
              if (normType === "geom" || (name && (name.toLowerCase() === "the_geom" || name.toLowerCase() === "geom"))) {
                layerItem.geomProperty = name;
                this.geomPropertyCache[layerItem.name] = name;
              } else if (name) {
                fields.push({ name, type: rawType || "string" });
              }
            });
          }
        }
      } catch (err) {
        console.warn("AttributeSearch: DescribeFeatureType no disponible:", err);
      }

      // Intento 2: Si DescribeFeatureType falló, recuperar 1 feature de muestra vía GetFeature
      if (fields.length === 0) {
        try {
          const sampleUrl = `${wfsHost}?service=WFS&version=1.0.0&request=GetFeature&typeName=${encodeURIComponent(
            layerItem.name
          )}&outputFormat=application/json&maxFeatures=1`;
          const sRes = await fetch(sampleUrl);
          if (sRes.ok) {
            const sData = await sRes.json();
            if (sData && sData.features && sData.features[0] && sData.features[0].properties) {
              Object.keys(sData.features[0].properties).forEach((k) => {
                if (k.toLowerCase() !== "bbox" && k.toLowerCase() !== "the_geom" && k.toLowerCase() !== "geom") {
                  fields.push({
                    name: k,
                    type: typeof sData.features[0].properties[k] || "string",
                  });
                }
              });
            }
          }
        } catch (e) {
          // ignore
        }
      }
    }

    // Intento 3: Si es capa local o WFS falló, buscar en propiedades de features en memoria
    if (fields.length === 0 && layerItem.rawLayer) {
      const geo =
        typeof layerItem.rawLayer.toGeoJSON === "function"
          ? layerItem.rawLayer.toGeoJSON()
          : layerItem.rawLayer.feature || layerItem.rawLayer.data;

      if (geo) {
        const feat = geo.features ? geo.features[0] : geo;
        if (feat && feat.properties) {
          Object.keys(feat.properties).forEach((k) => {
            if (k !== "bbox" && k !== "styles" && k !== "the_geom" && k !== "geom") {
              fields.push({ name: k, type: typeof feat.properties[k] });
            }
          });
        }
      }
    }

    // Fallback estándar si no se pudieron recuperar campos
    if (fields.length === 0) {
      if (layerItem.isCatastro) {
        fields = [
          { name: "catastro", type: "string" },
          { name: "plano", type: "string" },
          { name: "matricula", type: "string" },
          { name: "departamento", type: "string" },
          { name: "seccion", type: "string" },
          { name: "manzana", type: "string" },
          { name: "parcela", type: "string" },
        ];
      } else {
        fields = [
          { name: "nombre", type: "string" },
          { name: "name", type: "string" },
          { name: "descripcion", type: "string" },
          { name: "subgrupo", type: "string" },
          { name: "orden", type: "string" },
          { name: "codigo", type: "string" },
          { name: "tipo", type: "string" },
        ];
      }
    }

    this.fieldsCache[layerItem.name] = fields;
    return fields;
  }

  /**
   * Agrega una fila de condición al constructor dinámico de filtros.
   */
  addConditionRow(selectedField = "__all__", operator = "ILIKE", value = "", placeholder = "") {
    const box = document.getElementById("as-conditions-box");
    if (!box) return;

    this.conditionCount++;
    const rowId = `as-cond-row-${this.conditionCount}`;

    const defaultPlaceholder =
      selectedField === "__all__"
        ? "Buscar en cualquier atributo (ej: Haplumbreptes o 2025)..."
        : "Valor a buscar...";

    const row = document.createElement("div");
    row.className = "as-condition-row";
    row.id = rowId;

    row.innerHTML = `
      <select class="as-control as-field-select" title="Seleccionar campo">
        <option value="__all__" ${selectedField === "__all__" ? "selected" : ""}>🔍 Todos los campos (Búsqueda general)</option>
        ${this.availableFields
          .map(
            (f) =>
              `<option value="${f.name}" ${f.name === selectedField ? "selected" : ""}>${f.name}</option>`
          )
          .join("")}
      </select>

      <select class="as-control as-op-select" title="Operador">
        <option value="ILIKE" ${operator === "ILIKE" ? "selected" : ""}>Contiene</option>
        <option value="=" ${operator === "=" ? "selected" : ""}>Es igual a (=)</option>
        <option value=">=" ${operator === ">=" ? "selected" : ""}>Mayor o igual (&gt;=)</option>
        <option value="<=" ${operator === "<=" ? "selected" : ""}>Menor o igual (&le;)</option>
        <option value="!=" ${operator === "!=" ? "selected" : ""}>Distinto (&ne;)</option>
      </select>

      <input type="text" class="as-control as-val-input" value="${this.escapeHtml(value)}" placeholder="${placeholder || defaultPlaceholder}" />

      <button type="button" class="as-btn-remove" title="Eliminar condición">
        <i class="fa-solid fa-trash-can"></i>
      </button>
    `;

    const fieldSelect = row.querySelector(".as-field-select");
    const opSelect = row.querySelector(".as-op-select");
    const valInput = row.querySelector(".as-val-input");

    const updateFieldState = () => {
      if (fieldSelect.value === "__all__") {
        opSelect.value = "ILIKE";
        opSelect.disabled = true;
        if (!valInput.value) {
          valInput.placeholder = "Buscar en cualquier atributo (ej: Haplumbreptes o 2025)...";
        }
      } else {
        opSelect.disabled = false;
        if (!valInput.value) {
          valInput.placeholder = "Valor a buscar...";
        }
      }
    };
    fieldSelect.addEventListener("change", updateFieldState);
    updateFieldState();

    const removeBtn = row.querySelector(".as-btn-remove");
    removeBtn.onclick = () => {
      const allRows = box.querySelectorAll(".as-condition-row");
      if (allRows.length > 1) {
        row.remove();
      } else {
        row.querySelector(".as-val-input").value = "";
      }
    };

    valInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        this.executeSearch();
      }
    });

    box.appendChild(row);
  }

  /**
   * Obtiene el BBOX activo según el ámbito espacial configurado (vista actual o recuadro).
   * @returns {Array<number>|null} [minLng, minLat, maxLng, maxLat]
   */
  getActiveSpatialBbox() {
    const mapObj = window.mapa || window.map;

    if (this.spatialScope === "view" && mapObj) {
      const b = mapObj.getBounds();
      return [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
    }

    if (this.spatialScope === "box" && this.customBbox) {
      return this.customBbox;
    }

    return null;
  }

    /**
   * Construye un fragmento CQL seguro para GeoServer evitando errores de casteo y tipos incompatibles.
   * Maneja fechas, números, booleanos y texto de forma tipada.
   */
  buildConditionCql(cond) {
    const rawVal = cond.val.trim();
    const safeVal = rawVal.replace(/'/g, "''");
    const isYear = /^\d{4}$/.test(rawVal);
    const isNumeric = /^-?\d+(\.\d+)?$/.test(rawVal);

    // Caso A: Búsqueda general en TODOS los campos
    if (cond.field === "__all__") {
      const subParts = [];

      this.availableFields.forEach((f) => {
        const normType = this.normalizeFieldType(f.type);
        const fname = f.name;

        if (normType === "date") {
          if (isYear) {
            subParts.push(`(${fname} >= '${rawVal}-01-01' AND ${fname} <= '${rawVal}-12-31')`);
          } else if (/^\d{4}-\d{2}-\d{2}$/.test(rawVal)) {
            subParts.push(`${fname} = '${rawVal}'`);
          }
        } else if (normType === "number") {
          if (isNumeric) {
            subParts.push(`${fname} = ${rawVal}`);
          }
        } else if (normType === "boolean") {
          if (rawVal.toLowerCase() === "true" || rawVal.toLowerCase() === "false") {
            subParts.push(`${fname} = ${rawVal.toLowerCase()}`);
          }
        } else {
          // Solo campos de texto: usar strToLowerCase para maxima compatibilidad case-insensitive
          const lowerSafe = safeVal.toLowerCase();
          subParts.push(`(strToLowerCase(${fname}) LIKE '%${lowerSafe}%' OR ${fname} ILIKE '%${safeVal}%')`);
        }
      });

      if (subParts.length > 0) {
        return `(${subParts.join(" OR ")})`;
      }
      return null;
    }

    // Caso B: Campo específico seleccionado
    const fieldObj = this.availableFields.find((f) => f.name === cond.field);
    const normType = this.normalizeFieldType(fieldObj ? fieldObj.type : "string");
    const fname = cond.field;

    // B.1 Campo de tipo FECHA
    if (normType === "date") {
      if (isYear) {
        if (cond.op === "ILIKE" || cond.op === "=") {
          return `(${fname} >= '${rawVal}-01-01' AND ${fname} <= '${rawVal}-12-31')`;
        } else if (cond.op === ">=") {
          return `${fname} >= '${rawVal}-01-01'`;
        } else if (cond.op === "<=") {
          return `${fname} <= '${rawVal}-12-31'`;
        } else if (cond.op === "!=") {
          return `(${fname} < '${rawVal}-01-01' OR ${fname} > '${rawVal}-12-31')`;
        }
      } else {
        const opSql = cond.op === "ILIKE" ? "=" : cond.op === "!=" ? "<>" : cond.op;
        return `${fname} ${opSql} '${safeVal}'`;
      }
    }

    // B.2 Campo de tipo NUMÉRICO
    if (normType === "number") {
      if (isNumeric) {
        const opSql = cond.op === "ILIKE" ? "=" : cond.op === "!=" ? "<>" : cond.op;
        return `${fname} ${opSql} ${rawVal}`;
      } else {
        throw new Error(`El campo '${fname}' es numérico y el valor ingresado ('${rawVal}') no es un número.`);
      }
    }

    // B.3 Campo de tipo BOOLEANO
    if (normType === "boolean") {
      const boolVal = rawVal.toLowerCase() === "true" || rawVal === "1" ? "true" : "false";
      return `${fname} = ${boolVal}`;
    }

    // B.4 Campo de tipo TEXTO (String / Varchar) - Case Insensitive (ignora mayusculas y minusculas)
    const lowerSafe = safeVal.toLowerCase();
    if (cond.op === "ILIKE") {
      return `(strToLowerCase(${fname}) LIKE '%${lowerSafe}%' OR ${fname} ILIKE '%${safeVal}%')`;
    } else if (cond.op === "=") {
      return `(strToLowerCase(${fname}) = '${lowerSafe}' OR ${fname} ILIKE '${safeVal}')`;
    } else if (cond.op === "!=") {
      return `(strToLowerCase(${fname}) <> '${lowerSafe}' AND NOT (${fname} ILIKE '${safeVal}'))`;
    } else {
      return `${fname} ${cond.op} '${safeVal}'`;
    }
  }

  async executeSearch() {
    if (!this.currentLayer) return;

    const box = document.getElementById("as-conditions-box");
    const rows = Array.from(box.querySelectorAll(".as-condition-row"));
    const conditions = [];

    rows.forEach((r) => {
      const field = r.querySelector(".as-field-select").value;
      const op = r.querySelector(".as-op-select").value;
      const val = r.querySelector(".as-val-input").value.trim();
      if (val !== "") {
        conditions.push({ field, op, val });
      }
    });

    if (conditions.length === 0) {
      alert("Ingrese al menos un término en las condiciones de búsqueda.");
      return;
    }

    const logicInput = document.querySelector('input[name="as-logic"]:checked');
    const logic = logicInput ? logicInput.value : "AND";

    const spatialBbox = this.getActiveSpatialBbox();

    const searchBtn = document.getElementById("as-btn-search");
    const origHtml = searchBtn.innerHTML;
    searchBtn.disabled = true;
    searchBtn.innerHTML = `<span class="as-spinner"></span> Buscando...`;

    try {
      let geojson = null;

      if (this.currentLayer.type === "wfs" && this.currentLayer.host) {
        geojson = await this.searchViaWfs(this.currentLayer, conditions, logic, spatialBbox);
      } else {
        geojson = await this.searchViaLocal(this.currentLayer, conditions, logic, spatialBbox);
      }

      this.displayResults(geojson, this.currentLayer.title);
    } catch (err) {
      console.error("Error en búsqueda por atributos:", err);
      this.displayError("Hubo un error al ejecutar la consulta: " + (err.message || err));
    } finally {
      searchBtn.disabled = false;
      searchBtn.innerHTML = origHtml;
    }
  }

    /**
   * Ejecuta la búsqueda vía WFS usando CQL_FILTER e integra el filtro espacial (BBOX)
   * dentro del mismo cql_filter para evitar el error de GeoServer 'bbox and cql_filter are mutually exclusive'.
   */
  async searchViaWfs(layerItem, conditions, logic, spatialBbox = null) {
    const wfsHost = this.getWfsBaseUrl(layerItem.host);

    const cqlParts = [];
    for (const c of conditions) {
      const part = this.buildConditionCql(c);
      if (part) {
        cqlParts.push(part);
      }
    }

    if (cqlParts.length === 0) {
      throw new Error("No se pudo construir un filtro válido para los términos ingresados.");
    }

    let cqlFilter = `(${cqlParts.join(` ${logic} `)})`;

    // Incorporar BBOX dentro de CQL_FILTER para que GeoServer lo procese sin conflicto
    if (spatialBbox && Array.isArray(spatialBbox) && spatialBbox.length === 4) {
      const geomProp =
        layerItem.geomProperty ||
        this.geomPropertyCache[layerItem.name] ||
        "the_geom";
      // Sintaxis ECQL oficial GeoServer: BBOX(the_geom, minx, miny, maxx, maxy, 'EPSG:4326')
      const bboxCql = `BBOX(${geomProp}, ${spatialBbox[0]}, ${spatialBbox[1]}, ${spatialBbox[2]}, ${spatialBbox[3]}, 'EPSG:4326')`;
      cqlFilter = `(${cqlFilter}) AND ${bboxCql}`;
    }

    // GeoServer GetFeature: NO pasar parámetro &bbox si ya se pasa &cql_filter
    const url = `${wfsHost}?service=WFS&version=1.0.0&request=GetFeature&typeName=${encodeURIComponent(
      layerItem.name
    )}&outputFormat=application/json&srsName=EPSG:4326&cql_filter=${encodeURIComponent(cqlFilter)}&maxFeatures=500`;

    const res = await fetch(url);
    const text = await res.text();

    let data = null;
    try {
      data = JSON.parse(text);
    } catch (e) {
      // El servidor devolvió XML (ServiceException) o HTML
      let errorMsg = text;
      const seMatch = text.match(/<ServiceException[^>]*>([\s\S]*?)<\/ServiceException>/i);
      if (seMatch) {
        errorMsg = seMatch[1].replace(/<[^>]+>/g, "").trim();
      } else {
        const bodyMatch = text.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
        if (bodyMatch) {
          errorMsg = bodyMatch[1].replace(/<[^>]+>/g, "").trim();
        }
      }
      console.error("GeoServer WFS error response:", text);
      console.error("GeoServer WFS request url:", url);
      throw new Error(`GeoServer: ${errorMsg.slice(0, 300)}`);
    }

    return data;
  }

  async searchViaLocal(layerItem, conditions, logic, spatialBbox = null) {
    const raw = layerItem.rawLayer;
    let features = [];

    if (raw && typeof raw.toGeoJSON === "function") {
      const g = raw.toGeoJSON();
      features = g.features || [g];
    } else if (raw && raw.data && raw.data.features) {
      features = raw.data.features;
    }

    let targetBounds = null;
    if (spatialBbox && typeof L !== "undefined") {
      targetBounds = L.latLngBounds([spatialBbox[1], spatialBbox[0]], [spatialBbox[3], spatialBbox[2]]);
    }

    const matches = features.filter((feat) => {
      // Filtrar primero espacialmente si aplica
      if (targetBounds && feat.geometry) {
        try {
          const tempLayer = L.geoJSON(feat);
          const b = tempLayer.getBounds();
          if (b.isValid() && !targetBounds.intersects(b)) {
            return false;
          }
        } catch (e) {
          // continuar
        }
      }

      const props = feat.properties || {};
      if (logic === "AND") {
        return conditions.every((c) => {
          if (c.field === "__all__") {
            return Object.values(props).some((val) => this.evalLocalCondition(val, "ILIKE", c.val));
          }
          return this.evalLocalCondition(props[c.field], c.op, c.val);
        });
      } else {
        return conditions.some((c) => {
          if (c.field === "__all__") {
            return Object.values(props).some((val) => this.evalLocalCondition(val, "ILIKE", c.val));
          }
          return this.evalLocalCondition(props[c.field], c.op, c.val);
        });
      }
    });

    return {
      type: "FeatureCollection",
      features: matches,
    };
  }

  /**
   * Evalúa una condición en JavaScript.
   */
  evalLocalCondition(propVal, op, targetVal) {
    if (propVal === undefined || propVal === null) return false;
    const sProp = String(propVal).toLowerCase();
    const sTarget = String(targetVal).toLowerCase();

    if (op === "ILIKE") {
      return sProp.includes(sTarget);
    } else if (op === "=") {
      return sProp === sTarget;
    } else if (op === "!=") {
      return sProp !== sTarget;
    } else if (op === ">=") {
      return parseFloat(propVal) >= parseFloat(targetVal);
    } else if (op === "<=") {
      return parseFloat(propVal) <= parseFloat(targetVal);
    }
    return false;
  }

  /**
   * Muestra los resultados obtenidos, resalta en el mapa y activa opciones de descarga.
   */
  displayResults(geojson, layerTitle) {
    const resultsBox = document.getElementById("as-results-box");
    const statusElem = document.getElementById("as-results-status");
    const listElem = document.getElementById("as-results-list");

    this.currentResults = geojson;
    const count = geojson && geojson.features ? geojson.features.length : 0;

    if (count === 0) {
      if (statusElem) {
        statusElem.className = "as-results-status empty";
        statusElem.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> No se encontraron elementos que cumplan las condiciones en el ámbito seleccionado.`;
      }
      if (listElem) listElem.style.display = "none";
      if (resultsBox) resultsBox.style.display = "block";
      this.clearMapSelection();
      this.removeFloatingToolbar();
      return;
    }

    if (resultsBox) resultsBox.style.display = "block";
    if (statusElem) {
      statusElem.className = "as-results-status success";
      statusElem.innerHTML = `<i class="fa-solid fa-check-circle"></i> Se encontraron <strong>${count}</strong> elemento(s) coincidentes.`;
    }

    // Resaltar en mapa y auto-zoom
    this.highlightOnMap(geojson);

    // Barra flotante persistente en el mapa
    this.updateFloatingToolbar();

    // Listado resumen de los primeros 40 elementos
    if (listElem) {
      listElem.style.display = "block";
      listElem.innerHTML = geojson.features
        .slice(0, 40)
        .map((f, i) => {
          const p = f.properties || {};
          const catText = p.catastro ? `Cat: ${p.catastro}` : "";
          const planoText = p.plano ? `Plano: ${p.plano}` : "";
          const matriculaText = p.matricula ? `Mat: ${p.matricula}` : "";

          const thematicText =
            p.subgrupo ||
            p.orden ||
            p.gran_grupo ||
            p.descripcion ||
            p.descripcio ||
            p.simbolo ||
            p.nombre ||
            p.name ||
            p.departamento ||
            p.provincia ||
            p.fecha_desm ||
            "";

          const mainText =
            [catText, planoText, matriculaText].filter(Boolean).join(" | ") ||
            thematicText ||
            `Elemento #${i + 1}`;

          const subText = p.departamento || p.seccion || p.provincia || "";

          return `
            <div class="as-result-item" data-idx="${i}">
              <div class="as-item-info">
                <span class="as-item-text"><i class="fa-solid fa-location-dot" style="color:#0284c7; margin-right:4px;"></i> ${this.escapeHtml(
                  mainText
                )}</span>
                ${subText ? `<span class="as-item-sub">${this.escapeHtml(subText)}</span>` : ""}
              </div>
              <button type="button" class="as-item-zoom-btn" title="Hacer zoom a este elemento" data-idx="${i}">
                <i class="fa-solid fa-crosshairs"></i> Zoom
              </button>
            </div>
          `;
        })
        .join("");

      const items = listElem.querySelectorAll(".as-result-item");
      items.forEach((item) => {
        item.onclick = (e) => {
          const idx = parseInt(item.dataset.idx, 10);
          this.zoomToFeature(idx);
        };
      });
    }
  }

  /**
   * Muestra mensaje de error en el panel.
   */
  displayError(msg) {
    const resultsBox = document.getElementById("as-results-box");
    const statusElem = document.getElementById("as-results-status");
    if (!resultsBox || !statusElem) return;

    resultsBox.style.display = "block";
    statusElem.className = "as-results-status error";
    statusElem.innerHTML = `<i class="fa-solid fa-circle-xmark"></i> ${this.escapeHtml(msg)}`;
  }

  /**
   * Resalta los elementos encontrados sobre el mapa Leaflet con una capa vectorial llamativa.
   */
  highlightOnMap(geojson) {
    const mapObj = window.mapa || window.map;
    if (!mapObj) return;

    this.clearMapSelection();

    this.selectionLayer = L.geoJSON(geojson, {
      style: {
        color: "#00e5ff", // Cian brillante resaltado
        weight: 3.5,
        opacity: 1,
        fillColor: "#00e5ff",
        fillOpacity: 0.35,
      },
      pointToLayer: (feature, latlng) => {
        return L.circleMarker(latlng, {
          radius: 9,
          fillColor: "#00e5ff",
          color: "#005577",
          weight: 2.5,
          opacity: 1,
          fillOpacity: 0.85,
        });
      },
      onEachFeature: (feature, layer) => {
        let popup = `<div style="max-height:220px; overflow-y:auto; font-size:12px; min-width:180px;">`;
        popup += `<h4 style="margin:0 0 6px 0; color:var(--primary-color, #680205); border-bottom:1.5px solid var(--primary-color, #680205); padding-bottom:3px;">Elemento Encontrado</h4>`;
        popup += `<table style="width:100%; border-collapse:collapse;">`;
        if (feature.properties) {
          Object.keys(feature.properties).forEach((k) => {
            const v = feature.properties[k];
            if (v !== null && v !== undefined && k !== "bbox" && k !== "styles") {
              popup += `<tr style="border-bottom:1px solid #eee;"><td style="font-weight:bold; padding:2px 4px; color:#555;">${this.escapeHtml(
                k
              )}</td><td style="padding:2px 4px;">${this.escapeHtml(String(v))}</td></tr>`;
            }
          });
        }
        popup += `</table></div>`;
        layer.bindPopup(popup);
      },
    }).addTo(mapObj);

    // Ajustar zoom para abarcar todos los elementos seleccionados
    try {
      const bounds = this.selectionLayer.getBounds();
      if (bounds.isValid()) {
        mapObj.fitBounds(bounds, { padding: [80, 80], maxZoom: 18 });
      }
      const layers = this.selectionLayer.getLayers();
      if (layers && layers.length === 1 && layers[0].openPopup) {
        setTimeout(() => layers[0].openPopup(), 400);
      }
    } catch (e) {
      console.warn("No se pudo ajustar bounds de selección:", e);
    }
  }

  /**
   * Hace zoom a un elemento específico de los resultados y abre su popup.
   */
  zoomToFeature(index) {
    const mapObj = window.mapa || window.map;
    if (!mapObj || !this.selectionLayer) return;

    const layers = this.selectionLayer.getLayers();
    if (layers && layers[index]) {
      const target = layers[index];
      if (target.getBounds && typeof target.getBounds === "function") {
        mapObj.fitBounds(target.getBounds(), { padding: [80, 80], maxZoom: 19 });
      } else if (target.getLatLng && typeof target.getLatLng === "function") {
        mapObj.setView(target.getLatLng(), 18);
      }
      setTimeout(() => {
        if (target.openPopup) target.openPopup();
      }, 350);
    }
  }

  /**
   * Centra y hace zoom al conjunto completo de elementos seleccionados.
   */
  zoomToAll() {
    const mapObj = window.mapa || window.map;
    if (!mapObj || !this.selectionLayer) return;
    try {
      const bounds = this.selectionLayer.getBounds();
      if (bounds.isValid()) {
        mapObj.fitBounds(bounds, { padding: [80, 80], maxZoom: 18 });
      }
      const layers = this.selectionLayer.getLayers();
      if (layers && layers.length === 1 && layers[0].openPopup) {
        setTimeout(() => layers[0].openPopup(), 350);
      }
    } catch (e) {
      console.warn("No se pudo ajustar bounds de selección:", e);
    }
  }

  /**
   * Limpia la capa de selección del mapa y el recuadro visual trazado.
   */
  clearMapSelection() {
    const mapObj = window.mapa || window.map;
    if (this.selectionLayer && mapObj) {
      mapObj.removeLayer(this.selectionLayer);
      this.selectionLayer = null;
    }
    this.clearBoxDrawLayer();
  }

  /**
   * Limpia completamente la búsqueda y la selección.
   */
  clearSelection() {
    this.clearMapSelection();
    this.currentResults = null;
    this.removeFloatingToolbar();
    const resultsBox = document.getElementById("as-results-box");
    if (resultsBox) resultsBox.style.display = "none";
  }

  /**
   * Actualiza o crea la barra flotante de acciones persistente sobre el mapa.
   */
  updateFloatingToolbar() {
    const count = this.currentResults && this.currentResults.features ? this.currentResults.features.length : 0;
    if (count === 0) {
      this.removeFloatingToolbar();
      return;
    }

    if (!this.floatingToolbar) {
      const tb = document.createElement("div");
      tb.id = "as-floating-toolbar";
      tb.className = "as-floating-toolbar";
      document.body.appendChild(tb);
      this.floatingToolbar = tb;
    }

    const title = this.currentLayer ? this.currentLayer.title : "Capa";

    this.floatingToolbar.innerHTML = `
      <div class="as-ft-badge" title="${this.escapeHtml(title)}">
        <i class="fa-solid fa-check-circle" style="color:#16a34a;"></i>
        <span><strong>${count}</strong> sel.</span>
      </div>
      <button type="button" class="as-ft-btn" id="as-ft-btn-zoom" title="Centrar y hacer zoom al elemento seleccionado">
        <i class="fa-solid fa-crosshairs"></i> Zoom
      </button>
      <button type="button" class="as-ft-btn as-ft-btn-kml" id="as-ft-btn-kml" title="Descargar elementos seleccionados en KML">
        <i class="fa-solid fa-download"></i> KML
      </button>
      <button type="button" class="as-ft-btn as-ft-btn-geojson" id="as-ft-btn-geojson" title="Descargar elementos seleccionados en GeoJSON">
        <i class="fa-solid fa-file-code"></i> GeoJSON
      </button>
      <button type="button" class="as-ft-btn" id="as-ft-btn-table" title="Ver atributos en la tabla de datos">
        <i class="fa-solid fa-table"></i> Tabla
      </button>
      <button type="button" class="as-ft-btn as-ft-btn-primary" id="as-ft-btn-reopen" title="Reabrir / Modificar búsqueda">
        <i class="fa-solid fa-filter"></i> Búsqueda
      </button>
      <button type="button" class="as-ft-btn-close" id="as-ft-btn-clear" title="Limpiar selección del mapa">
        <i class="fa-solid fa-xmark"></i>
      </button>
    `;

    document.getElementById("as-ft-btn-zoom").onclick = () => this.zoomToAll();
    document.getElementById("as-ft-btn-kml").onclick = () => this.downloadKml();
    document.getElementById("as-ft-btn-geojson").onclick = () => this.downloadGeoJson();
    document.getElementById("as-ft-btn-table").onclick = () => this.viewInTable();
    document.getElementById("as-ft-btn-reopen").onclick = () => {
      if (this.modalElem) {
        if (this.isMinimized) this.toggleMinimize();
      } else {
        this.openModal();
      }
    };
    document.getElementById("as-ft-btn-clear").onclick = () => this.clearSelection();
  }

  /**
   * Elimina la barra flotante del mapa.
   */
  removeFloatingToolbar() {
    if (this.floatingToolbar && document.body.contains(this.floatingToolbar)) {
      document.body.removeChild(this.floatingToolbar);
    }
    this.floatingToolbar = null;
  }

  /**
   * Descarga los elementos seleccionados en formato KML.
   */
  downloadKml() {
    if (!this.currentResults || !this.currentResults.features || this.currentResults.features.length === 0) {
      alert("No hay elementos seleccionados para descargar.");
      return;
    }

    const cleanName = (this.currentLayer ? this.currentLayer.title : "busqueda")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "_")
      .replace(/_+/g, "_");

    const kmlText = this.geojsonToKml(this.currentResults, `${cleanName}_seleccion`);
    const blob = new Blob([kmlText], { type: "application/vnd.google-earth.kml+xml;charset=utf-8" });

    this.triggerDownload(blob, `${cleanName}_seleccion.kml`);
  }

  /**
   * Descarga los elementos seleccionados en formato GeoJSON.
   */
  downloadGeoJson() {
    if (!this.currentResults || !this.currentResults.features || this.currentResults.features.length === 0) {
      alert("No hay elementos seleccionados para descargar.");
      return;
    }

    const cleanName = (this.currentLayer ? this.currentLayer.title : "busqueda")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "_")
      .replace(/_+/g, "_");

    const jsonText = JSON.stringify(this.currentResults, null, 2);
    const blob = new Blob([jsonText], { type: "application/json;charset=utf-8" });

    this.triggerDownload(blob, `${cleanName}_seleccion.geojson`);
  }

  /**
   * Abre los resultados en la tabla de datos inferior si Datatable/Tabulator está disponible.
   */
  viewInTable() {
    if (!this.currentResults || !this.currentResults.features || this.currentResults.features.length === 0) {
      return;
    }

    if (typeof Datatable !== "undefined" && typeof createTabulator === "function") {
      const mapObj = window.mapa || window.map;
      const center = mapObj ? mapObj.getCenter() : null;
      const tableData = new Datatable(this.currentResults, center);
      const title = `${this.currentLayer ? this.currentLayer.title : "Resultados"} (Búsqueda)`;
      createTabulator(tableData, title);
    } else {
      alert("La tabla de datos no se encuentra disponible.");
    }
  }

  /**
   * Convierte un FeatureCollection GeoJSON a archivo KML estándar compatible con Google Earth.
   */
  geojsonToKml(geojson, docName = "Busqueda_IDESA") {
    const coordsToKml = (coords) => {
      return coords.map((c) => `${c[0]},${c[1]},${c[2] || 0}`).join(" ");
    };

    const geomToKml = (geom) => {
      if (!geom) return "";
      switch (geom.type) {
        case "Point":
          return `<Point><coordinates>${coordsToKml([geom.coordinates])}</coordinates></Point>`;
        case "MultiPoint":
          return `<MultiGeometry>${geom.coordinates
            .map((c) => `<Point><coordinates>${coordsToKml([c])}</coordinates></Point>`)
            .join("")}</MultiGeometry>`;
        case "LineString":
          return `<LineString><coordinates>${coordsToKml(geom.coordinates)}</coordinates></LineString>`;
        case "MultiLineString":
          return `<MultiGeometry>${geom.coordinates
            .map((c) => `<LineString><coordinates>${coordsToKml(c)}</coordinates></LineString>`)
            .join("")}</MultiGeometry>`;
        case "Polygon":
          return `<Polygon>${geom.coordinates
            .map((ring, idx) => {
              const tag = idx === 0 ? "outerBoundaryIs" : "innerBoundaryIs";
              return `<${tag}><LinearRing><coordinates>${coordsToKml(ring)}</coordinates></LinearRing></${tag}>`;
            })
            .join("")}</Polygon>`;
        case "MultiPolygon":
          return `<MultiGeometry>${geom.coordinates
            .map((poly) => {
              return `<Polygon>${poly
                .map((ring, idx) => {
                  const tag = idx === 0 ? "outerBoundaryIs" : "innerBoundaryIs";
                  return `<${tag}><LinearRing><coordinates>${coordsToKml(ring)}</coordinates></LinearRing></${tag}>`;
                })
                .join("")}</Polygon>`;
            })
            .join("")}</MultiGeometry>`;
        default:
          return "";
      }
    };

    let placemarks = "";
    const features = geojson.features || (geojson.type === "Feature" ? [geojson] : []);

    features.forEach((feat, i) => {
      const p = feat.properties || {};
      const name =
        p.catastro
          ? `Catastro ${p.catastro}`
          : p.nombre || p.name || p.subgrupo || p.orden || p.title || p.id || `Elemento ${i + 1}`;

      const rows = Object.entries(p)
        .map(([k, v]) => `<b>${k}:</b> ${v}`)
        .join("<br/>");
      const desc = `<description><![CDATA[${rows}]]></description>`;

      const dataEntries = Object.entries(p)
        .filter(([k]) => k !== "bbox" && k !== "styles")
        .map(([k, v]) => {
          const cleanVal =
            v !== undefined && v !== null
              ? String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
              : "";
          return `      <Data name="${k}"><value>${cleanVal}</value></Data>`;
        })
        .join("\n");

      const extData = dataEntries ? `    <ExtendedData>\n${dataEntries}\n    </ExtendedData>\n` : "";

      placemarks += `    <Placemark>
      <name>${this.escapeHtml(name)}</name>
      ${desc}
${extData}      ${geomToKml(feat.geometry)}
    </Placemark>\n`;
    });

    return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
<Document>
  <name>${this.escapeHtml(docName)}</name>
${placemarks}</Document>
</kml>`;
  }

  /**
   * Dispara la descarga de un Blob en el navegador.
   */
  triggerDownload(blob, filename) {
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }

  /**
   * Escapa caracteres HTML.
   */
  escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
}

// Instancia global
window.AttributeSearch = AttributeSearch;
window.attributeSearchInstance = null;

function initAttributeSearch() {
  if (!window.attributeSearchInstance && typeof AttributeSearch !== "undefined") {
    const inst = new AttributeSearch();
    inst.createComponent();
    window.attributeSearchInstance = inst;
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initAttributeSearch);
} else {
  initAttributeSearch();
}
setTimeout(initAttributeSearch, 1200);
setTimeout(initAttributeSearch, 2500);
