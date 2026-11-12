/**
 * Panel de Capas Activas y Orden de Superposición (IDESA).
 * Permite visualizar todas las capas activas en el mapa, reordenarlas mediante arrastrar y soltar (Drag & Drop),
 * ajustar su opacidad rápida, ocultarlas temporalmente, fijar el panel (pin) o desactivarlas.
 */
class ActiveLayersOrder {
  constructor() {
    window.activeLayersOrderInstance = this;
    this.panelElem = null;
    this.btnElem = null;
    this.badgeElem = null;
    this.activeOrder = []; // Array de nombres de capa: [0] es Arriba (primer plano), [N] es Abajo (fondo)
    this.draggedItem = null;
    this.isApplying = false;
    this.isPinned = false;
    this._panelObserverAttached = false;
    this._lastRawCount = -1;
  }

  /**
   * Inicializa el componente, botón en botonera, observadores y primer render.
   */
  createComponent() {
    this.ensurePanelInMenuContent();
    this.ensureButtonInBotonera();
    this.setupMenuHooks();
    this.updateBadge();
    this.render(); // Pre-renderizar para que el panel nunca esté vacío al abrirse
  }

  /**
   * Asegura la presencia del botón en la barra lateral (#botonera) y le vincula el evento de renderizado.
   */
  ensureButtonInBotonera() {
    let btn = document.getElementById("active-layers-btn");
    const botonera = document.getElementById("botonera");
    if (!botonera) return;

    if (!btn) {
      btn = document.createElement("button");
      btn.className = "ag-btn ag-btn-primary menu-section-btn";
      btn.id = "active-layers-btn";
      btn.setAttribute("data-target", "active-layers-panel");
      btn.setAttribute("aria-label", "Capas activas y orden de superposición");
      btn.setAttribute("title", "Capas activas y orden de superposición");
      btn.innerHTML = `
        <i class="fa-solid fa-arrow-down-up-across-line" aria-label="Ordenar capas activas"></i>
        <span id="active-layers-badge" class="alo-btn-badge badge-hidden">0</span>
      `;

      const sidebarBtn = document.getElementById("sidebar-btn");
      if (sidebarBtn && sidebarBtn.nextElementSibling) {
        sidebarBtn.after(btn);
      } else {
        botonera.prepend(btn);
      }
    }

    // Vincular listener de renderizado cada vez que se presione el botón
    if (!btn._alo_click_attached) {
      btn._alo_click_attached = true;
      btn.addEventListener("click", () => {
        setTimeout(() => {
          this.syncActiveLayersOrder();
          this.updateBadge();
          this.render();
        }, 15);
      });
    }

    this.btnElem = btn;
    this.badgeElem = document.getElementById("active-layers-badge");
  }

  /**
   * Asegura la presencia del contenedor del panel en #menu-content con observador de apertura.
   */
  ensurePanelInMenuContent() {
    let panel = document.getElementById("active-layers-panel");
    const menuContent = document.getElementById("menu-content");
    if (!menuContent) return;

    if (!panel) {
      panel = document.createElement("div");
      panel.id = "active-layers-panel";
      panel.style.display = "none";
      menuContent.appendChild(panel);
    }

    this.panelElem = panel;

    // Observar cuando se hace visible para re-renderizar la información más reciente
    if (window.MutationObserver && !this._panelObserverAttached) {
      this._panelObserverAttached = true;
      const observer = new MutationObserver(() => {
        if (panel.style.display === "block") {
          this.syncActiveLayersOrder();
          this.render();
        }
      });
      observer.observe(panel, { attributes: true, attributeFilter: ["style"] });
    }
  }

  /**
   * Conecta con los eventos de cambio de capas en Argenmap/gestorMenu y mapa Leaflet de manera indestructible.
   */
  setupMenuHooks() {
    const checkAndUpdate = () => {
      this.syncActiveLayersOrder();
      this.updateBadge();
      if (this.isPanelOpen()) {
        this.render();
      }
    };

    // 1. Hooking indestructible con Object.defineProperty sobre gestorMenu.activeLayersHasBeenUpdated
    const hookGestor = () => {
      if (window.gestorMenu) {
        if (!window.gestorMenu._alo_defined_property) {
          window.gestorMenu._alo_defined_property = true;
          let _currentHook = window.gestorMenu.activeLayersHasBeenUpdated;

          Object.defineProperty(window.gestorMenu, "activeLayersHasBeenUpdated", {
            get() {
              return _currentHook;
            },
            set(newFn) {
              _currentHook = () => {
                if (typeof newFn === "function") {
                  try {
                    newFn();
                  } catch (e) {
                    console.warn(e);
                  }
                }
                checkAndUpdate();
              };
            },
            configurable: true,
            enumerable: true,
          });

          if (_currentHook) {
            window.gestorMenu.activeLayersHasBeenUpdated = _currentHook;
          }
        }

        // Interceptar además addActiveLayer y removeActiveLayer directamente
        ["addActiveLayer", "removeActiveLayer"].forEach((fnName) => {
          if (
            typeof window.gestorMenu[fnName] === "function" &&
            !window.gestorMenu[fnName]._alo_wrapped
          ) {
            const orig = window.gestorMenu[fnName];
            window.gestorMenu[fnName] = function (...args) {
              const res = orig.apply(this, args);
              setTimeout(checkAndUpdate, 50);
              return res;
            };
            window.gestorMenu[fnName]._alo_wrapped = true;
          }
        });
      }
    };

    hookGestor();
    setTimeout(hookGestor, 500);
    setTimeout(hookGestor, 1500);
    setTimeout(hookGestor, 3000);

    // 2. Escuchar clics en elementos de capa del menú lateral (#sidebar)
    document.addEventListener("click", (e) => {
      if (
        e.target &&
        e.target.closest &&
        (e.target.closest(".capa") ||
          e.target.closest(".menu-section-btn") ||
          e.target.closest(".name-layer") ||
          e.target.closest("#menuPined"))
      ) {
        setTimeout(checkAndUpdate, 150);
      }
    });

    // 3. Escuchar eventos en el mapa Leaflet
    if (window.mapa && typeof window.mapa.on === "function") {
      window.mapa.on("layeradd layerremove", () => {
        setTimeout(checkAndUpdate, 100);
      });
    }

    // 4. Intervalo periódico ligero de sincronización (cada 700ms)
    setInterval(() => {
      const raw = this.getRawActiveLayers();
      if (raw.length !== this._lastRawCount) {
        this._lastRawCount = raw.length;
        checkAndUpdate();
      }
    }, 700);
  }

  /**
   * Comprueba si el panel está abierto en pantalla.
   */
  isPanelOpen() {
    return this.panelElem && this.panelElem.style.display === "block";
  }

  /**
   * Sincroniza la lista interna de orden con las capas actualmente activas (excluyendo mapas base).
   */
  syncActiveLayersOrder() {
    const rawActive = this.getRawActiveLayers();

    // Mantener las capas que siguen activas en el orden que ya definió el usuario
    const nextOrder = this.activeOrder.filter((l) => rawActive.includes(l));

    // Si hay nuevas capas activadas que no estaban en el orden previo, agregarlas ARRIBA (última encendida)
    rawActive.forEach((l) => {
      if (!nextOrder.includes(l)) {
        nextOrder.unshift(l); // En la cima de la pila
      }
    });

    this.activeOrder = nextOrder;
  }

  /**
   * Obtiene la lista cruda de nombres de capas activas del gestorMenu o overlayMaps,
   * excluyendo estrictamente los mapas base (argenmap, esri, satelitales, etc.).
   */
  getRawActiveLayers() {
    const list = [];
    const baseLayers = [
      "argenmap",
      "argenmap_gris",
      "esri_imagery",
      "google_satellite",
      "google_hybrid",
      "esri_imagery_t",
      "Fondo Oceánico",
      "fondo_oceanico",
    ];

    if (window.gestorMenu && Array.isArray(gestorMenu.availableBaseLayers)) {
      gestorMenu.availableBaseLayers.forEach((b) => {
        if (b && !baseLayers.includes(b)) baseLayers.push(b);
      });
    }

    if (window.gestorMenu && Array.isArray(gestorMenu.activeLayers)) {
      gestorMenu.activeLayers.forEach((l) => {
        if (l && !list.includes(l) && !baseLayers.includes(l)) {
          list.push(l);
        }
      });
    }

    if (window.overlayMaps) {
      Object.keys(window.overlayMaps).forEach((l) => {
        if (l && !list.includes(l) && !baseLayers.includes(l)) {
          list.push(l);
        }
      });
    }

    return list;
  }

  /**
   * Actualiza el badge numérico sobre el botón de la barra lateral.
   */
  updateBadge() {
    const raw = this.getRawActiveLayers();
    const count = raw.length;
    this._lastRawCount = count;

    if (!this.badgeElem) {
      this.badgeElem = document.getElementById("active-layers-badge");
    }

    if (this.badgeElem) {
      this.badgeElem.textContent = count;
      if (count > 0) {
        this.badgeElem.classList.remove("badge-hidden");
        this.badgeElem.style.display = "flex";
      } else {
        this.badgeElem.classList.add("badge-hidden");
        this.badgeElem.style.display = "none";
      }
    }
  }

  /**
   * Normaliza identificadores de capas para comparación flexible (remueve workspace geonode:, ign:).
   */
  _normalizeName(str) {
    if (!str) return "";
    const part = str.includes(":") ? str.split(":")[1] : str;
    return part.toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  /**
   * Busca metadatos amigables para una capa activa (título legible, sección, municipio, etc.).
   */
  getLayerMeta(layerName) {
    let title = "";
    let section = "";
    let tab = "Datos";
    let layerId = null;

    const normTarget = this._normalizeName(layerName);

    // 1. Buscar en gestorMenu.items y sus composites
    if (window.gestorMenu) {
      if (typeof gestorMenu.getLayerIdByName === "function") {
        layerId = gestorMenu.getLayerIdByName(layerName);
      }

      if (gestorMenu.items) {
        for (const secKey in gestorMenu.items) {
          const composite = gestorMenu.items[secKey];
          if (composite && composite.itemsComposite) {
            for (const itemKey in composite.itemsComposite) {
              const item = composite.itemsComposite[itemKey];
              if (!item) continue;
              const iNombre = item.nombre || "";
              const cNombre = (item.capa && item.capa.nombre) || "";

              if (
                iNombre === layerName ||
                cNombre === layerName ||
                this._normalizeName(iNombre) === normTarget ||
                this._normalizeName(cNombre) === normTarget
              ) {
                title =
                  (item.capa && item.capa.titulo) ||
                  item.titulo ||
                  (item.capa && item.capa.nombre) ||
                  item.nombre;
                section = composite.nombre || secKey;
                tab =
                  composite.tab && (composite.tab.id || composite.tab.content)
                    ? composite.tab.id || composite.tab.content
                    : "Datos";
                if (!layerId && typeof item.getId === "function") {
                  layerId = item.getId();
                }
                break;
              }
            }
          }
          if (title) break;
        }
      }
    }

    // 2. Buscar en el DOM (#sidebar) por si los elementos HTML ya tienen los títulos amigables
    if (!title) {
      const sidebar = document.getElementById("sidebar");
      if (sidebar) {
        const links = sidebar.querySelectorAll("a[nombre], [layername], li.capa");
        for (const el of links) {
          const nom =
            el.getAttribute("nombre") ||
            el.getAttribute("layername") ||
            (el.id ? el.id.replace(/^child-/, "") : "");
          if (nom === layerName || this._normalizeName(nom) === normTarget) {
            const span = el.querySelector('span[data-toggle2="tooltip"]');
            if (span && span.innerText.trim()) {
              title = span.innerText.trim();
            } else if (el.innerText && el.innerText.trim()) {
              title = el.innerText.trim();
            }
            const parentPanel = el.closest(".menu5, .panel");
            if (parentPanel) {
              const groupTitle = parentPanel.querySelector(".item-group-title");
              if (groupTitle) section = groupTitle.innerText.trim();
            }
            break;
          }
        }
      }
    }

    // 3. Buscar en gestorMenu.layersInfo / customizedLayers
    if (!title && window.gestorMenu && gestorMenu.layersInfo) {
      for (const key in gestorMenu.layersInfo) {
        const info = gestorMenu.layersInfo[key];
        if (info && info.customizedLayers) {
          for (const cKey in info.customizedLayers) {
            if (cKey === layerName || this._normalizeName(cKey) === normTarget) {
              title = info.customizedLayers[cKey].new_title;
              section = info.name || section;
              break;
            }
          }
        }
        if (title) break;
      }
    }

    // 4. Buscar en gestorMenu.layersDataForWfs
    if (!title && window.gestorMenu && gestorMenu.layersDataForWfs) {
      const wfsData = gestorMenu.layersDataForWfs[layerName];
      if (wfsData && wfsData.title) {
        title = wfsData.title;
      }
    }

    // 5. Fallback con formateo inteligente (quitar prefijos geonode:, ign: y hashes UUID)
    if (!title) {
      let clean = layerName.includes(":") ? layerName.split(":")[1] : layerName;
      // Quitar hashes UUID como _7354439de7a8b0eca1f2ec3fff94d0f0 o _v2d91c00617
      clean = clean.replace(/_[a-f0-9]{12,}/gi, "");
      clean = clean.replace(/_v[0-9]+[a-f0-9]*/gi, "");
      clean = clean.replace(/_/g, " ").trim();
      title = clean.charAt(0).toUpperCase() + clean.slice(1);
    }

    // Limpiar caracteres remanentes en títulos
    title = title.replace(/_/g, " ").trim();

    return { layerName, title, section, tab, layerId, item: null };
  }

  /**
   * Renderiza el contenido completo del panel interactivo.
   */
  render() {
    if (!this.panelElem) this.ensurePanelInMenuContent();
    if (!this.panelElem) return;

    this.syncActiveLayersOrder();
    const layers = this.activeOrder;
    const count = layers.length;

    let html = `
      <div class="alo-header">
        <div class="alo-header-info">
          <div class="alo-title-row">
            <h4 class="alo-title">Capas Activas</h4>
            <span class="alo-badge-count">${count}</span>
          </div>
          <p class="alo-subtitle">${count <= 1 ? "Control de opacidad y superposición" : "Arrastra desde ⋮⋮ para cambiar el orden"}</p>
        </div>
        <div class="alo-header-actions">
          <button class="alo-pin-btn ${this.isPinned ? "pinned" : ""}" id="alo-btn-pin" title="${this.isPinned ? "Desfijar panel" : "Fijar panel en pantalla"}">
            <i class="fa-solid fa-thumbtack"></i>
          </button>
          <button class="alo-close-btn" id="alo-btn-close" title="Cerrar panel">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
      </div>
    `;

    if (count === 0) {
      html += `
        <div class="alo-empty-state">
          <i class="fa-solid fa-layer-group alo-empty-icon"></i>
          <h5 class="alo-empty-title">No hay capas activas</h5>
          <p class="alo-empty-desc">Enciende capas desde el Menú de Capas para visualizar y organizar su superposición aquí.</p>
          <button class="alo-open-menu-btn" id="alo-btn-open-sidebar">
            <i class="fa-solid fa-folder-open"></i> Abrir Menú de Capas
          </button>
        </div>
      `;
    } else {
      if (count === 1) {
        html += `
          <div class="alo-hint-banner single-layer">
            <span class="alo-hint-item"><i class="fa-solid fa-circle-info"></i> 1 capa activa. Active más capas para reorganizar la superposición.</span>
          </div>
        `;
      } else {
        html += `
          <div class="alo-hint-banner">
            <span class="alo-hint-item"><strong>▲ Arriba:</strong> Primer plano</span>
            <span class="alo-hint-item"><strong>▼ Abajo:</strong> Fondo</span>
          </div>
        `;
      }

      html += `<ul class="alo-list" id="alo-sortable-list">`;

      layers.forEach((layerName, index) => {
        const meta = this.getLayerMeta(layerName);
        const lyr = window.overlayMaps ? window.overlayMaps[layerName] : null;
        let opacityVal = 1;
        if (lyr && lyr.options && typeof lyr.options.opacity === "number") {
          opacityVal = lyr.options.opacity;
        }

        const isMunicipio =
          (meta.tab && meta.tab.toLowerCase().includes("muni")) ||
          (meta.section && meta.section.toLowerCase().includes("lerma"));
        const tagClass = isMunicipio ? "alo-tag municipio" : "alo-tag";
        const tagText = meta.section || meta.tab || "Capa";

        html += `
          <li class="alo-item" data-layer-name="${layerName}" data-index="${index}">
            <div class="alo-item-main">
              <span class="alo-drag-handle" title="Haga clic sostenido en este icono para subir o bajar">
                <i class="fa-solid fa-grip-vertical"></i>
              </span>
              <div class="alo-item-text">
                <span class="alo-item-title">${meta.title}</span>
                <div class="alo-item-meta">
                  <span class="${tagClass}">${tagText}</span>
                </div>
              </div>
              <div class="alo-item-actions">
                <button class="alo-action-btn legend-btn" data-layer="${layerName}" title="Ver simbología y leyenda">
                  <i class="fa-solid fa-palette"></i>
                </button>
                <button class="alo-action-btn remove-btn" data-layer="${layerName}" title="Desactivar capa">
                  <i class="fa-solid fa-trash-can"></i>
                </button>
              </div>
            </div>
            <div class="alo-opacity-row">
              <span class="alo-opacity-label"><i class="fa-solid fa-circle-half-stroke"></i> Opacidad:</span>
              <input type="range" class="alo-opacity-slider" min="0" max="1" step="0.05" value="${opacityVal}" data-layer="${layerName}" draggable="false">
              <span class="alo-opacity-val">${Math.round(opacityVal * 100)}%</span>
            </div>
          </li>
        `;
      });

      html += `</ul>`;
    }

    this.panelElem.innerHTML = html;
    this.bindEvents();
  }

  /**
   * Conecta eventos de cierre, atajos, pin, sliders de opacidad, eliminación y Drag & Drop.
   */
  bindEvents() {
    // Cerrar panel
    const closeBtn = document.getElementById("alo-btn-close");
    if (closeBtn) {
      closeBtn.onclick = (e) => {
        e.stopPropagation();
        if (this.panelElem) {
          this.panelElem.classList.remove("menuFixed");
          this.panelElem.style.display = "none";
        }
      };
    }

    // Fijar / Desfijar panel (Pin)
    const pinBtn = document.getElementById("alo-btn-pin");
    if (pinBtn) {
      pinBtn.onclick = (e) => {
        e.stopPropagation();
        this.isPinned = !this.isPinned;
        pinBtn.classList.toggle("pinned", this.isPinned);
        pinBtn.title = this.isPinned ? "Desfijar panel" : "Fijar panel en pantalla";
        if (this.panelElem) {
          this.panelElem.classList.toggle("menuFixed", this.isPinned);
        }
      };
    }

    // Botón abrir menú de capas desde empty state
    const openSidebarBtn = document.getElementById("alo-btn-open-sidebar");
    if (openSidebarBtn) {
      openSidebarBtn.onclick = (e) => {
        e.stopPropagation();
        if (this.panelElem) this.panelElem.style.display = "none";
        const sidebar = document.getElementById("sidebar");
        if (sidebar) sidebar.style.display = "block";
      };
    }

    // Sliders de opacidad (con desacople total de Drag & Drop)
    const sliders = this.panelElem.querySelectorAll(".alo-opacity-slider");
    sliders.forEach((slider) => {
      // Evitar que arrastrar el slider intente arrastrar la tarjeta
      slider.addEventListener("mousedown", (e) => {
        e.stopPropagation();
        const li = slider.closest(".alo-item");
        if (li) li.removeAttribute("draggable");
      });

      slider.oninput = (e) => {
        e.stopPropagation();
        const val = parseFloat(e.target.value);
        const lName = e.target.getAttribute("data-layer");
        const valSpan = e.target.parentElement.querySelector(".alo-opacity-val");
        if (valSpan) valSpan.textContent = `${Math.round(val * 100)}%`;

        if (window.overlayMaps && window.overlayMaps[lName]) {
          const lyr = window.overlayMaps[lName];
          if (typeof lyr.setOpacity === "function") {
            lyr.setOpacity(val);
          }
          // Sincronizar slider en el menú lateral si existe
          const menuRange = document.getElementById("range-" + lName);
          if (menuRange) menuRange.value = val;
        }
      };
    });

    // Botones ver leyenda / simbología
    const legendBtns = this.panelElem.querySelectorAll(".legend-btn");
    legendBtns.forEach((btn) => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const lName = btn.getAttribute("data-layer");
        this.showLegendModal(lName);
      };
    });

    // Botones quitar/desactivar capa
    const removeBtns = this.panelElem.querySelectorAll(".remove-btn");
    removeBtns.forEach((btn) => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const lName = btn.getAttribute("data-layer");
        this.deactivateLayer(lName);
      };
    });

    // Conectar Drag & Drop nativo únicamente desde el tirador (grip handle)
    this.bindDragAndDrop();
  }

  /**
   * Obtiene la lista de URLs candidatas para la leyenda de la capa a partir de todas las fuentes autorizadas (DOM, configuración, overlayMaps, gestorMenu).
   */
  getLayerLegendCandidates(layerName) {
    const meta = this.getLayerMeta(layerName);
    const normTarget = this._normalizeName(layerName);
    const normTitle = meta.title ? this._normalizeName(meta.title) : "";
    const cleanTitle = meta.title ? meta.title.toLowerCase().trim() : "";
    const candidates = [];

    const addCandidate = (url) => {
      if (!url || typeof url !== "string") return;
      const cleanUrl = url.trim();
      if (
        cleanUrl.startsWith("http") &&
        !cleanUrl.includes("noimage") &&
        !cleanUrl.includes("error") &&
        !cleanUrl.includes("/wms/ows") && // Evitar la ruta rota de Capa.getLegendURL()
        !candidates.includes(cleanUrl)
      ) {
        candidates.push(cleanUrl);
      }
    };

    // Construye variantes de URLs de GetLegendGraphic respetando los estándares de GeoServer e IDESA
    const buildWmsVariants = (rawHost, lyrName) => {
      if (!rawHost || !lyrName) return;

      let host = rawHost.trim().replace(/\/+$/, "");
      if (host.endsWith("/wms/ows")) {
        host = host.replace(/\/wms\/ows$/, "/wms");
      }
      const sep = host.includes("?") ? "&" : "?";

      const cleanLyr = lyrName.trim();
      const pureLyr = cleanLyr.includes(":") ? cleanLyr.split(":")[1] : cleanLyr;

      const layerVariants = [cleanLyr];
      if (pureLyr !== cleanLyr && !layerVariants.includes(pureLyr)) {
        layerVariants.push(pureLyr);
      }

      if (!cleanLyr.includes(":")) {
        if (host.includes("ign.gob.ar")) {
          layerVariants.push(`limites:${cleanLyr}`);
          layerVariants.push(`ign:${cleanLyr}`);
        } else {
          layerVariants.push(`geonode:${cleanLyr}`);
        }
      }

      // Parámetros idénticos a los definidos en constants.js y utilizados en entities.js por el visor de IDESA
      const legendOptionsParams =
        "&transparent=true&scale=1&LEGEND_OPTIONS=fontAntiAliasing:true;dpi:111;fontName:verdana;hideEmptyRules:false;labelMargin:5;forceLabels:on;forceTitles:on;";

      layerVariants.forEach((l) => {
        // 1. Formato oficial IDESA / GeoNode (utilizado con éxito en el menú lateral)
        addCandidate(
          `${host}${sep}service=WMS&request=GetLegendGraphic&format=image%2Fpng&version=1.1.1&layer=${encodeURIComponent(l)}${legendOptionsParams}`
        );
        addCandidate(
          `${host}${sep}service=WMS&request=GetLegendGraphic&format=image/png&version=1.1.1&layer=${l}${legendOptionsParams}`
        );

        // 2. Formato estándar WMS 1.1.1 con forceLabels
        addCandidate(
          `${host}${sep}service=WMS&request=GetLegendGraphic&format=image/png&version=1.1.1&layer=${l}&transparent=true&legend_options=forceLabels:on;fontAntiAliasing:true`
        );

        // 3. Formato universal WMS 1.1.1 / 1.3.0 sin vendor options
        addCandidate(
          `${host}${sep}service=WMS&request=GetLegendGraphic&format=image/png&version=1.1.1&layer=${l}&transparent=true`
        );
        addCandidate(
          `${host}${sep}service=WMS&request=GetLegendGraphic&format=image/png&version=1.3.0&layer=${l}&transparent=true`
        );
        addCandidate(
          `${host}${sep}service=WMS&request=GetLegendGraphic&format=image/png&layer=${l}&transparent=true`
        );
      });

      // Si el host es un virtual workspace (/geoserver/limites/wms), agregar también la versión sin workspace
      if (host.includes("/geoserver/") && !host.endsWith("/geoserver/wms")) {
        const rootHost = host.replace(/\/geoserver\/[^/]+\/wms/, "/geoserver/wms");
        if (rootHost !== host) {
          layerVariants.forEach((l) => {
            addCandidate(
              `${rootHost}${sep}service=WMS&request=GetLegendGraphic&format=image%2Fpng&version=1.1.1&layer=${encodeURIComponent(l)}${legendOptionsParams}`
            );
            addCandidate(
              `${rootHost}${sep}service=WMS&request=GetLegendGraphic&format=image/png&version=1.1.1&layer=${l}&transparent=true`
            );
          });
        }
      }
    };

    // 1. Buscar en todo el DOM si la imagen ya fue generada / mostrada en el menú lateral o combobox
    const allLegendImgs = document.querySelectorAll(
      ".legend-img-max, .expand-legend-graphic img, .legend-layer img, img.legend-img, img"
    );
    for (const dImg of allLegendImgs) {
      if (dImg && dImg.src && dImg.src.startsWith("http") && dImg.src.includes("GetLegendGraphic")) {
        const s = dImg.src;
        const parent = dImg.closest("li.capa") || dImg.closest(".capa") || dImg.parentElement;
        let isMatch = false;

        if (s.includes(layerName) || (normTarget && s.toLowerCase().includes(normTarget))) {
          isMatch = true;
        } else if (cleanTitle && s.toLowerCase().includes(encodeURIComponent(cleanTitle))) {
          isMatch = true;
        } else if (parent) {
          const text = (parent.textContent || "").toLowerCase();
          if (cleanTitle && text.includes(cleanTitle)) {
            isMatch = true;
          }
        }

        if (isMatch) {
          let cleanS = s.replace(/forceLabels:off/g, "forceLabels:on").replace(/forceTitles:off/g, "forceTitles:on");
          addCandidate(cleanS);
        }
      }
    }

    // 2. Buscar en gestorMenu.items y sus composites
    if (window.gestorMenu && gestorMenu.items) {
      for (const secKey in gestorMenu.items) {
        const comp = gestorMenu.items[secKey];
        if (comp && comp.itemsComposite) {
          for (const k in comp.itemsComposite) {
            const it = comp.itemsComposite[k];
            if (!it) continue;
            const iname = it.nombre || "";
            const cname = (it.capa && it.capa.nombre) || "";
            const ititle = (it.capa && it.capa.titulo) || it.titulo || "";

            const match =
              iname === layerName ||
              cname === layerName ||
              (normTarget && this._normalizeName(iname) === normTarget) ||
              (normTarget && this._normalizeName(cname) === normTarget) ||
              (normTitle && this._normalizeName(ititle) === normTitle) ||
              (cleanTitle && ititle.toLowerCase().trim() === cleanTitle);

            if (match) {
              if (it.capa) {
                if (it.capa.legendURL) {
                  let lUrl = it.capa.legendURL;
                  lUrl = lUrl.replace(/forceLabels:off/g, "forceLabels:on").replace(/forceTitles:off/g, "forceTitles:on");
                  addCandidate(lUrl);
                  if (!lUrl.includes("LEGEND_OPTIONS")) {
                    const sep = lUrl.includes("?") ? "&" : "?";
                    addCandidate(
                      `${lUrl}${sep}transparent=true&scale=1&LEGEND_OPTIONS=fontAntiAliasing:true;dpi:111;fontName:verdana;hideEmptyRules:false;labelMargin:5;forceLabels:on;forceTitles:on;`
                    );
                  }
                }
                if (it.capa.host) {
                  buildWmsVariants(it.capa.host, cname || iname || layerName);
                }
              }
              if (it.legend) addCandidate(it.legend);
              if (it.legendImg) addCandidate(it.legendImg);
            }
          }
        }
      }
    }

    // 3. Buscar en window.app.layers (capas procesadas y cacheadas por app.setLayer)
    if (window.app && window.app.layers) {
      for (const k in window.app.layers) {
        const lyrObj = window.app.layers[k];
        if (!lyrObj) continue;
        const cname = (lyrObj.capa && lyrObj.capa.nombre) || lyrObj.nombre || k;
        const ctitle = (lyrObj.capa && lyrObj.capa.titulo) || lyrObj.titulo || "";

        const match =
          k === layerName ||
          cname === layerName ||
          (normTarget && this._normalizeName(k) === normTarget) ||
          (normTarget && this._normalizeName(cname) === normTarget) ||
          (normTitle && this._normalizeName(ctitle) === normTitle) ||
          (cleanTitle && ctitle.toLowerCase().trim() === cleanTitle);

        if (match && lyrObj.capa) {
          if (lyrObj.capa.legendURL) {
            let lUrl = lyrObj.capa.legendURL;
            lUrl = lUrl.replace(/forceLabels:off/g, "forceLabels:on").replace(/forceTitles:off/g, "forceTitles:on");
            addCandidate(lUrl);
          }
          if (lyrObj.capa.host) {
            buildWmsVariants(lyrObj.capa.host, cname || layerName);
          }
        }
      }
    }

    // 4. Buscar en window.overlayMaps (fuente activa que sirve las teselas en el mapa)
    if (window.overlayMaps) {
      for (const k in window.overlayMaps) {
        const oLyr = window.overlayMaps[k];
        if (!oLyr) continue;
        const realLayerName = oLyr._name || k;
        const match =
          k === layerName ||
          realLayerName === layerName ||
          (normTarget && this._normalizeName(k) === normTarget) ||
          (normTarget && this._normalizeName(realLayerName) === normTarget);

        if (match) {
          const host =
            (oLyr._source && oLyr._source._url) ||
            oLyr._url ||
            (oLyr._source && oLyr._source.options && oLyr._source.options.url);
          if (host) {
            buildWmsVariants(host, realLayerName);
            buildWmsVariants(host, layerName);
          }
        }
      }
    }

    // 5. Buscar en data.json (window.app.items)
    if (window.app && Array.isArray(window.app.items)) {
      for (const cat of window.app.items) {
        if (cat && cat.allowed_layers && Array.isArray(cat.allowed_layers)) {
          const match = cat.allowed_layers.find(
            (l) =>
              l === layerName ||
              this._normalizeName(l) === normTarget ||
              (normTitle && this._normalizeName(l).includes(normTitle))
          );
          if (match && cat.host) {
            buildWmsVariants(cat.host, match);
          }
        }
      }
    }

    // 6. Buscar en gestorMenu.layersInfo
    if (window.gestorMenu && gestorMenu.layersInfo) {
      for (const k in gestorMenu.layersInfo) {
        const lInfo = gestorMenu.layersInfo[k];
        if (lInfo && lInfo.allowed_layers && Array.isArray(lInfo.allowed_layers)) {
          const match = lInfo.allowed_layers.find(
            (l) =>
              l === layerName ||
              this._normalizeName(l) === normTarget ||
              (normTitle && this._normalizeName(l).includes(normTitle))
          );
          if (match && lInfo.host) {
            buildWmsVariants(lInfo.host, match);
          }
        }
      }
    }

    // 7. Buscar en gestorMenu.layersDataForWfs
    if (window.gestorMenu && gestorMenu.layersDataForWfs) {
      for (const k in gestorMenu.layersDataForWfs) {
        if (k === layerName || this._normalizeName(k) === normTarget) {
          const wfsInfo = gestorMenu.layersDataForWfs[k];
          if (wfsInfo && wfsInfo.host) {
            buildWmsVariants(wfsInfo.host, k);
          }
        }
      }
    }

    // 8. Fallbacks por heurística de servidores conocidos (IGN, INTA, IDESA)
    const lowerName = layerName.toLowerCase();
    if (
      lowerName.startsWith("ign:") ||
      lowerName.includes("departamento") ||
      lowerName.includes("gobiernoslocales") ||
      lowerName.includes("limite")
    ) {
      buildWmsVariants("https://wms.ign.gob.ar/geoserver/limites/wms", layerName);
      buildWmsVariants("https://wms.ign.gob.ar/geoserver/wms", layerName);
    }

    if (
      lowerName.includes("balanceh") ||
      lowerName.includes("inta") ||
      lowerName.includes("aridez") ||
      lowerName.includes("clima") ||
      lowerName.includes("p_ep")
    ) {
      buildWmsVariants("https://geo-nodo01.inta.gob.ar/geoserver/wms", layerName);
    }

    buildWmsVariants("https://geoportal.salta.gob.ar/geoserver/wms", layerName);

    return candidates;
  }

  /**
   * Obtiene la primera URL candidata de leyenda.
   */
  getLayerLegendURL(layerName) {
    const list = this.getLayerLegendCandidates(layerName);
    return list.length > 0 ? list[0] : "";
  }

  /**
   * Muestra la ventana flotante elegante (Modal Pop-up) con la simbología y leyenda oficial de la capa,
   * con soporte de prueba en cascada de servidores (IGN, INTA, IDESA).
   */
  showLegendModal(layerName) {
    const meta = this.getLayerMeta(layerName);
    const candidateUrls = this.getLayerLegendCandidates(layerName);

    let modalOverlay = document.getElementById("alo-legend-modal-overlay");
    if (!modalOverlay) {
      modalOverlay = document.createElement("div");
      modalOverlay.id = "alo-legend-modal-overlay";
      modalOverlay.className = "alo-legend-overlay";
      document.body.appendChild(modalOverlay);
    }

    const subText = meta.section
      ? `${meta.section} (${meta.tab || "Datos"})`
      : meta.tab || "Capa activa";

    modalOverlay.innerHTML = `
      <div class="alo-legend-modal">
        <div class="alo-legend-header">
          <div class="alo-legend-header-info">
            <div class="alo-legend-title-row">
              <i class="fa-solid fa-palette alo-legend-icon"></i>
              <h4 class="alo-legend-title" title="${meta.title}">${meta.title}</h4>
            </div>
            <span class="alo-legend-subtitle">${subText}</span>
          </div>
          <button class="alo-legend-close-btn" id="alo-modal-close-x" title="Cerrar ventana">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
        <div class="alo-legend-body" id="alo-modal-legend-body">
          <div class="alo-legend-loading">
            <i class="fa-solid fa-circle-notch fa-spin"></i>
            <span>Cargando simbología de la capa...</span>
          </div>
        </div>
        <div class="alo-legend-footer">
          <span class="alo-legend-hint"><i class="fa-solid fa-circle-info"></i> Simbología oficial WMS</span>
          <button class="alo-legend-ok-btn" id="alo-modal-close-ok">Cerrar</button>
        </div>
      </div>
    `;

    modalOverlay.style.display = "block";

    const modalElem = modalOverlay.querySelector(".alo-legend-modal");
    const headerElem = modalOverlay.querySelector(".alo-legend-header");
    if (modalElem) {
      modalElem.style.top = "85px";
      modalElem.style.right = "50px";
      modalElem.style.left = "auto";
      modalElem.style.bottom = "auto";
    }

    this.makeDraggable(modalElem, headerElem);

    const closeModal = () => {
      modalOverlay.style.display = "none";
      document.removeEventListener("keydown", onKeyDown);
    };

    const onKeyDown = (e) => {
      if (e.key === "Escape" || e.keyCode === 27) {
        closeModal();
      }
    };

    document.addEventListener("keydown", onKeyDown);

    const closeBtnX = document.getElementById("alo-modal-close-x");
    if (closeBtnX) closeBtnX.onclick = closeModal;

    const closeBtnOk = document.getElementById("alo-modal-close-ok");
    if (closeBtnOk) closeBtnOk.onclick = closeModal;

    // Cargar la imagen de la leyenda probando las URLs candidatas en cascada
    const bodyElem = document.getElementById("alo-modal-legend-body");

    let currentCandidateIndex = 0;

    const tryLoadNextCandidate = () => {
      if (currentCandidateIndex >= candidateUrls.length) {
        if (modalOverlay.style.display !== "none") {
          bodyElem.innerHTML = `
            <div class="alo-legend-error">
              <i class="fa-solid fa-triangle-exclamation"></i>
              <strong>Simbología gráfica no disponible</strong>
              <span>El servidor WMS no tiene una leyenda gráfica configurada para esta capa.</span>
            </div>
          `;
        }
        return;
      }

      const targetUrl = candidateUrls[currentCandidateIndex];
      currentCandidateIndex++;

      const img = new Image();
      img.onload = () => {
        // Si la imagen cargada es un pixel vacío (<= 1x1) y aún quedan candidatos en la lista, intentar el siguiente
        if (img.naturalWidth <= 1 && img.naturalHeight <= 1 && currentCandidateIndex < candidateUrls.length) {
          tryLoadNextCandidate();
          return;
        }

        if (modalOverlay.style.display !== "none") {
          bodyElem.innerHTML = `
            <div class="alo-legend-img-container">
              <img src="${targetUrl}" class="alo-legend-img" alt="Leyenda de ${meta.title}">
            </div>
          `;
        }
      };

      img.onerror = () => {
        // Si este candidato falló, intentar inmediatamente el siguiente
        tryLoadNextCandidate();
      };

      img.src = targetUrl;
    };

    tryLoadNextCandidate();
  }

  /**
   * Permite arrastrar libremente un elemento flotante por la pantalla usando su cabecera como tirador.
   */
  makeDraggable(element, handle) {
    if (!element || !handle) return;

    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let initialLeft = 0;
    let initialTop = 0;

    handle.onmousedown = (e) => {
      // Ignorar si se hace clic en botones de la cabecera (cerrar, etc.)
      if (
        e.target.closest("button") ||
        e.target.closest(".alo-legend-close-btn")
      ) {
        return;
      }

      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;

      const rect = element.getBoundingClientRect();
      initialLeft = rect.left;
      initialTop = rect.top;

      // Fijar posición exacta en píxeles removiendo restricciones de CSS right
      element.style.transform = "none";
      element.style.left = `${initialLeft}px`;
      element.style.top = `${initialTop}px`;
      element.style.right = "auto";
      element.style.bottom = "auto";
      element.style.margin = "0";

      const onMouseMove = (moveEvent) => {
        if (!isDragging) return;
        moveEvent.preventDefault();

        const dx = moveEvent.clientX - startX;
        const dy = moveEvent.clientY - startY;

        let newLeft = initialLeft + dx;
        let newTop = initialTop + dy;

        // Limitar a los bordes visibles de la pantalla
        const maxLeft = Math.max(10, window.innerWidth - rect.width - 15);
        const maxTop = Math.max(10, window.innerHeight - rect.height - 15);

        newLeft = Math.max(10, Math.min(newLeft, maxLeft));
        newTop = Math.max(10, Math.min(newTop, maxTop));

        element.style.left = `${newLeft}px`;
        element.style.top = `${newTop}px`;
      };

      const onMouseUp = () => {
        isDragging = false;
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
      };

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    };
  }

  /**
   * Localiza el elemento li de la capa dentro del árbol DOM del menú lateral (#sidebar).
   */
  findSidebarLayerElement(layerName) {
    const normTarget = this._normalizeName(layerName);
    const meta = this.getLayerMeta(layerName);
    const cleanTitle = meta && meta.title ? meta.title.toLowerCase().trim() : "";
    const normTitle = cleanTitle ? this._normalizeName(cleanTitle) : "";
    const sidebar = document.getElementById("sidebar") || document;

    // 1. Buscar por atributo nombre, layername o propiedad JS .nombre
    const links = sidebar.querySelectorAll("a[nombre], [layername], li.capa a, .capa a");
    for (const link of links) {
      const nom =
        link.getAttribute("nombre") ||
        link.getAttribute("layername") ||
        link.nombre ||
        "";
      if (
        nom === layerName ||
        (normTarget && this._normalizeName(nom) === normTarget) ||
        (cleanTitle && nom.toLowerCase().trim() === cleanTitle) ||
        (normTitle && this._normalizeName(nom) === normTitle)
      ) {
        return link.closest("li.capa") || link.closest(".capa") || link.parentElement;
      }
    }

    // 2. Buscar por texto del título en tooltips o enlaces
    if (cleanTitle) {
      const spans = sidebar.querySelectorAll(
        "li.capa span[data-toggle2='tooltip'], li.capa .name-layer a, li.capa span, .capa a, .capa span"
      );
      for (const span of spans) {
        const text = (span.innerText || span.textContent || "").trim().toLowerCase();
        if (
          text === cleanTitle ||
          (normTitle && this._normalizeName(text) === normTitle)
        ) {
          return span.closest("li.capa") || span.closest(".capa");
        }
      }
    }

    // 3. Buscar por ID del li que contenga el nombre normalizado
    const lis = sidebar.querySelectorAll("li.capa, .capa");
    for (const li of lis) {
      if (li.id) {
        const normId = this._normalizeName(li.id);
        if (
          (normTarget && normId.includes(normTarget)) ||
          (normTarget && normTarget.includes(normId)) ||
          (normTitle && normId.includes(normTitle))
        ) {
          return li;
        }
      }
    }

    return null;
  }

  /**
   * Desactiva una capa de forma completa y sincronizada:
   * 1. Desactiva el botón y estado en el menú lateral (#sidebar).
   * 2. Desmarca el item en gestorMenu y actualiza el contador de la categoría (ej. Geografía física).
   * 3. Remueve la capa del mapa Leaflet y de window.overlayMaps.
   */
  deactivateLayer(layerName) {
    const normTarget = this._normalizeName(layerName);
    const sidebarEl = this.findSidebarLayerElement(layerName);

    // 1. Si el elemento existe en el menú lateral y está activo, disparar su click nativo
    let clickHandled = false;
    if (sidebarEl) {
      const isActive =
        sidebarEl.classList.contains("active") ||
        (sidebarEl.className && sidebarEl.className.includes("active"));

      if (isActive) {
        const nameDiv =
          sidebarEl.querySelector(".name-layer") ||
          sidebarEl.querySelector("a") ||
          sidebarEl;

        if (nameDiv && typeof nameDiv.click === "function") {
          nameDiv.click();
          clickHandled = true;
        }
      }
      // Garantizar que la clase active quede removida del DOM del menú
      sidebarEl.classList.remove("active");
    }

    // 2. Localizar el item en gestorMenu.items y sincronizar su estado interno
    if (window.gestorMenu) {
      let itemFound = null;
      let compFound = null;

      if (gestorMenu.items) {
        for (const secKey in gestorMenu.items) {
          const comp = gestorMenu.items[secKey];
          if (comp && comp.itemsComposite) {
            for (const k in comp.itemsComposite) {
              const it = comp.itemsComposite[k];
              if (!it) continue;
              const iname = it.nombre || "";
              const cname = (it.capa && it.capa.nombre) || "";
              if (
                iname === layerName ||
                cname === layerName ||
                this._normalizeName(iname) === normTarget ||
                this._normalizeName(cname) === normTarget
              ) {
                itemFound = it;
                compFound = comp;
                break;
              }
            }
          }
          if (itemFound) break;
        }
      }

      if (itemFound) {
        // Si no fue manejado por el click del DOM y el item sigue marcado como visible
        if (!clickHandled && itemFound.getVisible && itemFound.getVisible()) {
          if (typeof gestorMenu.muestraCapa === "function") {
            try {
              gestorMenu.muestraCapa(itemFound.getId());
            } catch (e) {
              console.warn(e);
            }
          }
        }

        // Garantizar que quede marcado como invisible
        itemFound.visible = false;
        if (itemFound.capas && itemFound.capas[0]) {
          itemFound.capas[0].visible = false;
        }

        // Actualizar el contador de la categoría en el menú lateral (ej. Geografía física 2 -> 1)
        if (compFound && typeof compFound.muestraCantidadCapasVisibles === "function") {
          try {
            compFound.muestraCantidadCapasVisibles();
          } catch (e) {
            console.warn(e);
          }
        }
      }

      // Remover cualquier variante del nombre en gestorMenu.activeLayers
      if (Array.isArray(gestorMenu.activeLayers)) {
        gestorMenu.activeLayers = gestorMenu.activeLayers.filter(
          (l) => l !== layerName && this._normalizeName(l) !== normTarget
        );
      }

      // Actualizar contador total de capas
      if (typeof window.showTotalNumberofLayers === "function") {
        try {
          window.showTotalNumberofLayers();
        } catch (e) {}
      }
    }

    // 3. Remover del mapa Leaflet y de window.overlayMaps
    if (window.overlayMaps) {
      for (const k in window.overlayMaps) {
        if (k === layerName || this._normalizeName(k) === normTarget) {
          try {
            if (window.mapa) window.overlayMaps[k].removeFrom(window.mapa);
          } catch (e) {}
          delete window.overlayMaps[k];
        }
      }
    }

    // 4. Actualizar parámetros en la URL
    if (
      window.urlInteraction &&
      window.gestorMenu &&
      typeof gestorMenu.getActiveLayers === "function"
    ) {
      try {
        window.urlInteraction.layers = gestorMenu.getActiveLayers();
      } catch (e) {}
    }

    // 5. Sincronizar y re-renderizar panel de superposición
    setTimeout(() => {
      this.syncActiveLayersOrder();
      this.updateBadge();
      this.render();
    }, 120);
  }

  /**
   * Configura eventos de arrastrar y soltar con el mouse.
   * La tarjeta solo se hace arrastrable (draggable=true) cuando el usuario presiona el icono de arrastre (alo-drag-handle).
   */
  bindDragAndDrop() {
    const list = document.getElementById("alo-sortable-list");
    if (!list) return;

    const items = list.querySelectorAll(".alo-item");

    items.forEach((item) => {
      const handle = item.querySelector(".alo-drag-handle");
      if (handle) {
        handle.addEventListener("mousedown", () => {
          item.setAttribute("draggable", "true");
        });
        handle.addEventListener("mouseup", () => {
          item.removeAttribute("draggable");
        });
      }

      item.addEventListener("dragstart", (e) => {
        this.draggedItem = item;
        item.classList.add("dragging");
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", item.getAttribute("data-layer-name"));
      });

      item.addEventListener("dragend", () => {
        item.removeAttribute("draggable");
        item.classList.remove("dragging");
        items.forEach((it) => {
          it.classList.remove("drag-over-top");
          it.classList.remove("drag-over-bottom");
        });
        this.draggedItem = null;
      });

      item.addEventListener("dragover", (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";

        if (!this.draggedItem || this.draggedItem === item) return;

        const rect = item.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;

        if (e.clientY < midY) {
          item.classList.add("drag-over-top");
          item.classList.remove("drag-over-bottom");
        } else {
          item.classList.add("drag-over-bottom");
          item.classList.remove("drag-over-top");
        }
      });

      item.addEventListener("dragleave", () => {
        item.classList.remove("drag-over-top");
        item.classList.remove("drag-over-bottom");
      });

      item.addEventListener("drop", (e) => {
        e.preventDefault();
        item.classList.remove("drag-over-top");
        item.classList.remove("drag-over-bottom");

        if (!this.draggedItem || this.draggedItem === item) return;

        const rect = item.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;

        if (e.clientY < midY) {
          list.insertBefore(this.draggedItem, item);
        } else {
          list.insertBefore(this.draggedItem, item.nextSibling);
        }

        // Obtener el nuevo orden a partir de la lista en el DOM
        const newOrder = Array.from(list.children).map((li) =>
          li.getAttribute("data-layer-name"),
        );

        this.applyLayerOrder(newOrder);
      });
    });
  }

  /**
   * Aplica el nuevo orden de superposición tanto en Leaflet como en GeoServer (WMS).
   * newOrder: Array de nombres de capas de Arriba (primer plano) a Abajo (fondo).
   */
  applyLayerOrder(newOrder) {
    if (this.isApplying || !newOrder || newOrder.length === 0) return;
    this.isApplying = true;

    try {
      this.activeOrder = newOrder;

      // En el mapa, para que newOrder[0] quede arriba del todo, se debe pintar desde el fondo hacia arriba:
      const bottomToTop = [...newOrder].reverse();

      const sourcesMap = new Map();

      bottomToTop.forEach((layerName, index) => {
        const lyr = window.overlayMaps ? window.overlayMaps[layerName] : null;
        if (!lyr) return;

        const targetZ = 150 + index * 5;

        // 1. Z-Index y bringToFront en capas de Leaflet
        if (typeof lyr.setZIndex === "function") {
          lyr.setZIndex(targetZ);
        }
        if (typeof lyr.bringToFront === "function") {
          lyr.bringToFront();
        }

        if (lyr._overlay) {
          if (typeof lyr._overlay.setZIndex === "function") {
            lyr._overlay.setZIndex(targetZ);
          }
          if (typeof lyr._overlay.bringToFront === "function") {
            lyr._overlay.bringToFront();
          }
        }

        // 2. Si la capa pertenece a una fuente L.WMS.Source de GeoServer
        if (lyr._source) {
          const src = lyr._source;
          if (!sourcesMap.has(src)) {
            sourcesMap.set(src, []);
          }
          sourcesMap.get(src).push(layerName);
        }
      });

      // 3. Reordenar los subLayers en cada WMS Source para que GeoServer renderice en orden exacto
      sourcesMap.forEach((layersForSource, src) => {
        if (src._subLayers) {
          const newSubLayers = {};
          // En WMS LAYERS=a,b -> 'a' es fondo, 'b' es cima
          layersForSource.forEach((lyrName) => {
            newSubLayers[lyrName] = true;
          });
          // Mantener subcapas que pudieran pertenecer a la fuente
          for (const k in src._subLayers) {
            if (!newSubLayers[k]) {
              newSubLayers[k] = src._subLayers[k];
            }
          }
          src._subLayers = newSubLayers;
          if (typeof src.update === "function") {
            src.update();
          }
        }
      });

      // 4. Actualizar gestorMenu.activeLayers reflejando el orden visual
      if (window.gestorMenu && Array.isArray(gestorMenu.activeLayers)) {
        const updated = [...newOrder];
        gestorMenu.activeLayers.forEach((l) => {
          if (!updated.includes(l)) updated.push(l);
        });
        gestorMenu.activeLayers = updated;
      }
    } catch (err) {
      console.error("Error aplicando orden de capas:", err);
    } finally {
      setTimeout(() => {
        this.isApplying = false;
      }, 50);
    }
  }
}

// Auto-inicialización si el DOM ya está listo
if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      if (!window.activeLayersOrderInstance) {
        new ActiveLayersOrder().createComponent();
      }
    });
  } else {
    setTimeout(() => {
      if (!window.activeLayersOrderInstance) {
        new ActiveLayersOrder().createComponent();
      }
    }, 100);
  }
}
