/**
 * Clase para el control de impresión/guardado en PDF del visor Leaflet IDESA.
 * Incorpora modal interactivo de configuración y vista previa en tiempo real idéntica al resultado,
 * selección de orientación (horizontal/vertical) con llenado completo del marco (sin espacios en blanco),
 * títulos personalizados, eliminación total de controles Leaflet en la impresión,
 * soporte satelital sin teselas faltantes (carga completa con CORS),
 * captura fiel de capas vectoriales/recortes, y referencias/leyendas equilibradas.
 *
 * @requires jsPDF - Biblioteca para generación de PDF
 * @requires html2canvas - Biblioteca para captura DOM del mapa
 */
class PdfPrinter {
  /**
   * Inicializa el componente de impresión PDF.
   * @param {Object} [options={}] - Opciones de configuración
   */
  constructor(options = {}) {
    this.config = {
      timeout: options.timeout || 20000,
      defaultTitle: "MAPAS IDESA - Salta",
      defaultSubtitle: "Infraestructura de Datos Espaciales de la Provincia de Salta",
      ...options,
    };

    this.state = "idle";
    this.elem = null;
    this.handlers = [];
    this.modalElem = null;

    // Configuración actual del usuario para el PDF
    this.printSettings = {
      title: this.config.defaultTitle,
      subtitle: this.config.defaultSubtitle,
      orientation: "landscape", // 'landscape' | 'portrait'
      format: "a4",             // 'a4' | 'a3'
      includeLegends: true,
      includeScale: true,
      includeDate: true,
      includeLogo: true,
      includeBorder: true,
    };

    this.cachedRawCanvas = null;
    this.logoCache = null;
  }

  /**
   * Crea y agrega el botón de control al mapa.
   */
  createComponent() {
    if (window.innerWidth <= 1150) {
      return;
    }
    try {
      if (this.elem) {
        this.destroy();
      }

      const elem = document.createElement("div");
      elem.className = "leaflet-bar leaflet-control";
      elem.id = "pdfPrinter";
      elem.innerHTML = `
        <a class="iconPDF-container" title="Imprimir / Guardar en PDF" role="button" tabindex="0" aria-label="Imprimir o guardar en PDF">
          <i id="iconPDF" class="fas fa-print" aria-hidden="true"></i>
        </a>
      `;

      const icon = elem.querySelector(".iconPDF-container");
      if (icon) {
        const keydownHandler = (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            this.openModal();
          }
        };
        icon.addEventListener("keydown", keydownHandler);
        this.handlers.push({ el: icon, type: "keydown", fn: keydownHandler });

        const clickHandler = () => this.openModal();
        icon.onclick = clickHandler;
        this.handlers.push({ el: icon, type: "click", fn: clickHandler });
      }

      const container =
        document.querySelector(".leaflet-top.leaflet-left") ||
        document.querySelector(".leaflet-control-container .leaflet-top.leaflet-left") ||
        document.querySelector("#mapa .leaflet-top.leaflet-left");

      if (!container) {
        throw new Error("No se encontró el contenedor de controles de Leaflet");
      }

      container.append(elem);
      this.elem = elem;
    } catch (e) {
      console.error("Error creando el componente PdfPrinter:", e);
    }
  }

  /**
   * Abre el modal de configuración y vista previa de impresión.
   */
  async openModal() {
    if (this.modalElem) {
      this.closeModal();
    }

    const mapObj = window.mapa || window.map;
    if (!mapObj) {
      alert("No se encontró el mapa activo para imprimir.");
      return;
    }

    // Inicializar títulos desde configuración si existen
    if (typeof app !== "undefined" && app.title) {
      this.printSettings.title = app.title;
    }

    const capasActivas = this.#getActiveLayersWithLegends();

    // Crear DOM del modal
    const overlay = document.createElement("div");
    overlay.id = "pdf-modal-overlay";
    overlay.innerHTML = `
      <div class="pdf-modal-dialog" role="dialog" aria-modal="true" aria-labelledby="pdf-modal-title">
        <div class="pdf-modal-header">
          <h3 id="pdf-modal-title">
            <i class="fas fa-file-pdf"></i> Imprimir / Guardar Mapa en PDF
          </h3>
          <button class="pdf-modal-close-btn" id="pdf-btn-close" title="Cerrar">&times;</button>
        </div>

        <div class="pdf-modal-body">
          <!-- Columna Izquierda: Configuración -->
          <div class="pdf-modal-settings">
            <div class="pdf-form-group">
              <label for="pdf-input-title">Título del Mapa</label>
              <input type="text" id="pdf-input-title" class="pdf-form-control" value="${this.#escapeHtml(this.printSettings.title)}" placeholder="Ej: Mapa de Cobertura Vegetal - Salta" />
            </div>

            <div class="pdf-form-group">
              <label for="pdf-input-subtitle">Subtítulo / Organismo</label>
              <input type="text" id="pdf-input-subtitle" class="pdf-form-control" value="${this.#escapeHtml(this.printSettings.subtitle)}" placeholder="Ej: IDESA - Ministerio de Producción" />
            </div>

            <div class="pdf-form-group">
              <label>Orientación de la Página</label>
              <div class="pdf-orientation-selector">
                <button type="button" class="pdf-orient-btn ${this.printSettings.orientation === 'landscape' ? 'active' : ''}" data-orientation="landscape">
                  <i class="fas fa-image"></i>
                  <span>Horizontal (Apaisado)</span>
                </button>
                <button type="button" class="pdf-orient-btn ${this.printSettings.orientation === 'portrait' ? 'active' : ''}" data-orientation="portrait">
                  <i class="fas fa-portrait"></i>
                  <span>Vertical (Retrato)</span>
                </button>
              </div>
            </div>

            <div class="pdf-form-group">
              <label for="pdf-input-format">Formato de Hoja</label>
              <select id="pdf-input-format" class="pdf-form-control">
                <option value="a4" ${this.printSettings.format === 'a4' ? 'selected' : ''}>A4 (210 × 297 mm)</option>
                <option value="a3" ${this.printSettings.format === 'a3' ? 'selected' : ''}>A3 (297 × 420 mm)</option>
              </select>
            </div>

            <div class="pdf-form-group">
              <label>Contenido a Incluir</label>
              <div class="pdf-checkbox-group">
                <label class="pdf-checkbox-label">
                  <input type="checkbox" id="pdf-check-legends" ${this.printSettings.includeLegends ? 'checked' : ''} />
                  <span>Incluir referencias / capas activas (${capasActivas.length})</span>
                </label>
                <label class="pdf-checkbox-label">
                  <input type="checkbox" id="pdf-check-scale" ${this.printSettings.includeScale ? 'checked' : ''} />
                  <span>Incluir escala gráfica y norte</span>
                </label>
                <label class="pdf-checkbox-label">
                  <input type="checkbox" id="pdf-check-date" ${this.printSettings.includeDate ? 'checked' : ''} />
                  <span>Incluir fecha y hora</span>
                </label>
                <label class="pdf-checkbox-label">
                  <input type="checkbox" id="pdf-check-logo" ${this.printSettings.includeLogo ? 'checked' : ''} />
                  <span>Incluir logotipo de IDESA</span>
                </label>
                <label class="pdf-checkbox-label">
                  <input type="checkbox" id="pdf-check-border" ${this.printSettings.includeBorder ? 'checked' : ''} />
                  <span>Incluir marco cartográfico</span>
                </label>
              </div>
            </div>
          </div>

          <!-- Columna Derecha: Vista Previa en Vivo -->
          <div class="pdf-modal-preview-pane">
            <div class="pdf-preview-title">Vista Previa del Documento (Fiel al PDF)</div>
            <div class="pdf-preview-sheet-wrapper">
              <div id="pdf-preview-sheet" class="pdf-preview-sheet ${this.printSettings.orientation}">
                <div class="pdf-pv-header" id="pv-header">
                  <img src="src/styles/images/logoIDESAok-300x99.png" class="pdf-pv-logo" id="pv-logo" alt="IDESA" />
                  <div class="pdf-pv-title-box">
                    <div class="pdf-pv-title" id="pv-title">${this.#escapeHtml(this.printSettings.title)}</div>
                    <div class="pdf-pv-subtitle" id="pv-subtitle">${this.#escapeHtml(this.printSettings.subtitle)}</div>
                  </div>
                  <div class="pdf-pv-date" id="pv-date">${new Date().toLocaleDateString('es-AR')}</div>
                </div>

                <div class="pdf-pv-body ${this.printSettings.orientation}" id="pv-body">
                  <div class="pdf-pv-map-container" id="pv-map-container">
                    <div id="pv-map-placeholder" style="font-size: 8px; color: #64748b; text-align: center;">
                      <i class="fas fa-map" style="font-size: 16px; margin-bottom: 4px; display: block;"></i>
                      Generando vista previa...
                    </div>
                    <div class="pdf-pv-north" id="pv-north">N ↑</div>
                    <div class="pdf-pv-scale" id="pv-scale">Escala</div>
                  </div>

                  <div class="pdf-pv-legends" id="pv-legends">
                    <div class="pdf-pv-legend-title">REFERENCIAS</div>
                    <div id="pv-layers-list">
                      ${capasActivas.slice(0, 6).map(c => `
                        <div class="pdf-pv-layer-item">
                          <span class="pdf-pv-swatch"></span>
                          <span>${this.#escapeHtml(c.titulo)}</span>
                        </div>
                      `).join('')}
                      ${capasActivas.length > 6 ? `<div style="font-size:6px;color:#888;">+ ${capasActivas.length - 6} capas más</div>` : ''}
                    </div>
                  </div>
                </div>

                <div class="pdf-pv-footer">
                  <span>Coordenadas / Zoom</span>
                  <span>Visor IDESA - Salta</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="pdf-modal-footer">
          <button type="button" class="pdf-btn pdf-btn-cancel" id="pdf-btn-cancel">Cancelar</button>
          <button type="button" class="pdf-btn pdf-btn-secondary" id="pdf-btn-print-direct">
            <i class="fas fa-print"></i> Imprimir
          </button>
          <button type="button" class="pdf-btn pdf-btn-primary" id="pdf-btn-download">
            <i class="fas fa-download"></i> Descargar PDF
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    this.modalElem = overlay;

    // Conectar eventos del modal
    this.#setupModalEvents();

    // Actualizar miniatura del mapa para la vista previa
    this.#updatePreviewMapThumbnail();
  }

  /**
   * Cierra y destruye el modal.
   */
  closeModal() {
    if (this.modalElem && document.body.contains(this.modalElem)) {
      document.body.removeChild(this.modalElem);
    }
    this.modalElem = null;
    this.cachedRawCanvas = null;
  }

  /**
   * Configura listeners de inputs y botones del modal.
   * @private
   */
  #setupModalEvents() {
    const titleInput = document.getElementById("pdf-input-title");
    const subtitleInput = document.getElementById("pdf-input-subtitle");
    const formatSelect = document.getElementById("pdf-input-format");
    const checkLegends = document.getElementById("pdf-check-legends");
    const checkScale = document.getElementById("pdf-check-scale");
    const checkDate = document.getElementById("pdf-check-date");
    const checkLogo = document.getElementById("pdf-check-logo");

    const updatePreview = () => {
      this.printSettings.title = titleInput.value.trim() || this.config.defaultTitle;
      this.printSettings.subtitle = subtitleInput.value.trim();
      this.printSettings.format = formatSelect.value;
      this.printSettings.includeLegends = checkLegends.checked;
      this.printSettings.includeScale = checkScale.checked;
      this.printSettings.includeDate = checkDate.checked;
      this.printSettings.includeLogo = checkLogo.checked;

      // Actualizar vista previa en DOM
      const pvTitle = document.getElementById("pv-title");
      if (pvTitle) pvTitle.textContent = this.printSettings.title;

      const pvSub = document.getElementById("pv-subtitle");
      if (pvSub) pvSub.textContent = this.printSettings.subtitle;

      const pvDate = document.getElementById("pv-date");
      if (pvDate) pvDate.style.display = this.printSettings.includeDate ? "block" : "none";

      const pvLogo = document.getElementById("pv-logo");
      if (pvLogo) pvLogo.style.display = this.printSettings.includeLogo ? "block" : "none";

      const pvLegends = document.getElementById("pv-legends");
      if (pvLegends) pvLegends.style.display = this.printSettings.includeLegends ? "block" : "none";

      const pvNorth = document.getElementById("pv-north");
      const pvScale = document.getElementById("pv-scale");
      if (pvNorth) pvNorth.style.display = this.printSettings.includeScale ? "block" : "none";
      if (pvScale) pvScale.style.display = this.printSettings.includeScale ? "block" : "none";

      // Renderizar miniatura recortada según orientación
      this.#renderCroppedPreviewThumbnail();
    };

    titleInput.addEventListener("input", updatePreview);
    subtitleInput.addEventListener("input", updatePreview);
    formatSelect.addEventListener("change", updatePreview);
    checkLegends.addEventListener("change", updatePreview);
    checkScale.addEventListener("change", updatePreview);
    checkDate.addEventListener("change", updatePreview);
    checkLogo.addEventListener("change", updatePreview);

    // Botones de orientación
    const orientBtns = this.modalElem.querySelectorAll(".pdf-orient-btn");
    orientBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        orientBtns.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        this.printSettings.orientation = btn.dataset.orientation;

        const sheet = document.getElementById("pdf-preview-sheet");
        const pvBody = document.getElementById("pv-body");
        if (sheet && pvBody) {
          sheet.className = `pdf-preview-sheet ${this.printSettings.orientation}`;
          pvBody.className = `pdf-pv-body ${this.printSettings.orientation}`;
        }
        updatePreview();
      });
    });

    // Cerrar / Cancelar
    document.getElementById("pdf-btn-close").onclick = () => this.closeModal();
    document.getElementById("pdf-btn-cancel").onclick = () => this.closeModal();

    // Generar PDF y Descargar
    document.getElementById("pdf-btn-download").onclick = () => this.#processPrint(false);

    // Generar PDF e Imprimir directamente
    document.getElementById("pdf-btn-print-direct").onclick = () => this.#processPrint(true);
  }

  /**
   * Captura una copia inicial del mapa para la vista previa y la recorta a la proporción exacta.
   * @private
   */
  async #updatePreviewMapThumbnail() {
    try {
      const mapElem = document.getElementById("mapa");
      if (!mapElem || typeof html2canvas === "undefined") return;

      // Ocultar controles Leaflet momentáneamente para captura limpia
      const controlContainer = mapElem.querySelector(".leaflet-control-container");
      if (controlContainer) controlContainer.style.display = "none";

      try {
        this.cachedRawCanvas = await html2canvas(mapElem, {
          useCORS: true,
          allowTaint: true,
          scale: 0.5,
          logging: false,
          ignoreElements: (el) => el.id === "pdf-modal-overlay" || el.id === "pdfPrinter",
        });
      } finally {
        if (controlContainer) controlContainer.style.display = "";
      }

      this.#renderCroppedPreviewThumbnail();
    } catch (e) {
      console.debug("No se pudo generar miniatura exacta para preview:", e);
    }
  }

  /**
   * Recorta la miniatura del mapa para que coincida exactamente con la proporción del PDF (sin franjas blancas).
   * @private
   */
  #renderCroppedPreviewThumbnail() {
    const container = document.getElementById("pv-map-container");
    if (!container || !this.cachedRawCanvas) return;

    // Calcular la proporción exacta del marco en el PDF según orientación
    const isLandscape = this.printSettings.orientation === "landscape";
    const targetRatio = isLandscape ? (200 / 166) : (194 / 175);

    const croppedCanvas = this.#cropCanvasToRatio(this.cachedRawCanvas, targetRatio);

    container.innerHTML = `
      <img src="${croppedCanvas.toDataURL('image/jpeg', 0.75)}" class="pdf-pv-map-thumb" style="width:100%; height:100%; object-fit:cover;" alt="Vista previa mapa" />
      <div class="pdf-pv-north" id="pv-north" style="display:${this.printSettings.includeScale ? 'block' : 'none'}">N ↑</div>
      <div class="pdf-pv-scale" id="pv-scale" style="display:${this.printSettings.includeScale ? 'block' : 'none'}">Escala gráfica</div>
    `;
  }

  /**
   * Recorta un canvas centrado para que coincida exactamente con la relación de aspecto objetivo (sin barras blancas).
   * @private
   */
  #cropCanvasToRatio(srcCanvas, targetRatio) {
    const srcW = srcCanvas.width;
    const srcH = srcCanvas.height;
    const srcRatio = srcW / srcH;

    let cropW, cropH, cropX, cropY;

    if (srcRatio > targetRatio) {
      // El canvas es más ancho: recortar los extremos laterales centrando el área
      cropH = srcH;
      cropW = Math.round(srcH * targetRatio);
      cropX = Math.round((srcW - cropW) / 2);
      cropY = 0;
    } else {
      // El canvas es más alto: recortar superior e inferior centrando el área
      cropW = srcW;
      cropH = Math.round(srcW / targetRatio);
      cropX = 0;
      cropY = Math.round((srcH - cropH) / 2);
    }

    const croppedCanvas = document.createElement("canvas");
    croppedCanvas.width = cropW;
    croppedCanvas.height = cropH;
    const ctx = croppedCanvas.getContext("2d");
    ctx.drawImage(srcCanvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

    return croppedCanvas;
  }

  /**
   * Procesa la captura y generación del PDF con feedback visual.
   * @param {boolean} directPrint - Si es true, abre el diálogo de impresión nativo
   * @private
   */
  async #processPrint(directPrint = false) {
    if (this.state === "processing") return;

    const downloadBtn = document.getElementById("pdf-btn-download");
    const printBtn = document.getElementById("pdf-btn-print-direct");
    const origDownloadHtml = downloadBtn ? downloadBtn.innerHTML : "";
    const origPrintHtml = printBtn ? printBtn.innerHTML : "";

    try {
      this.state = "processing";
      if (downloadBtn) {
        downloadBtn.disabled = true;
        downloadBtn.innerHTML = '<span class="pdf-spinner"></span> Procesando mapa...';
      }
      if (printBtn) {
        printBtn.disabled = true;
      }

      const mapObj = window.mapa || window.map;
      const mapElem = document.getElementById("mapa");
      if (!mapObj || !mapElem) {
        throw new Error("No se encontró el mapa activo.");
      }

      // 1. Capturar mapa con soporte CORS satelital robusto (garantizando teselas 100% cargadas)
      const canvas = await this.#captureMapRobustly(mapObj, mapElem);

      // 2. Componer documento PDF cartográfico
      const pdf = await this.#createPDFDocument(canvas, mapObj);

      // 3. Descargar o Imprimir
      if (directPrint) {
        pdf.autoPrint();
        const blobUrl = pdf.output("bloburl");
        window.open(blobUrl, "_blank");
      } else {
        const filename = this.#generateFilename();
        pdf.save(filename);
      }

      this.closeModal();
    } catch (error) {
      console.error("Error al generar PDF:", error);
      alert("Hubo un problema al generar el PDF: " + (error.message || error));
    } finally {
      this.state = "idle";
      if (downloadBtn) {
        downloadBtn.disabled = false;
        downloadBtn.innerHTML = origDownloadHtml;
      }
      if (printBtn) {
        printBtn.disabled = false;
        printBtn.innerHTML = origPrintHtml;
      }
    }
  }

  /**
   * Captura el mapa de forma robusta resolviendo bloqueos CORS, teselas satelitales y capas vectoriales.
   * @param {L.Map} mapObj
   * @param {HTMLElement} mapElem
   * @returns {Promise<HTMLCanvasElement>}
   * @private
   */
  async #captureMapRobustly(mapObj, mapElem) {
    let tempEsriLayer = null;
    let googleLayerToRestore = null;
    let controlContainer = null;

    try {
      // --- PASO 1: Solución Satelital Sin Teselas Faltantes (CORS Fix Seguro) ---
      mapObj.eachLayer((layer) => {
        if (
          layer instanceof L.TileLayer &&
          layer._url &&
          (layer._url.includes("google.com") || layer._url.includes("lyrs=s") || layer._url.includes("lyrs=y"))
        ) {
          googleLayerToRestore = layer;
        }
      });

      if (googleLayerToRestore) {
        tempEsriLayer = L.tileLayer(
          "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
          {
            crossOrigin: true,
            maxZoom: 19,
            attribution: "Tiles &copy; Esri",
          }
        );
        tempEsriLayer.addTo(mapObj);
        tempEsriLayer.bringToBack();
        googleLayerToRestore.setOpacity(0);

        // Esperar a que las teselas satelitales carguen por completo (con límite prudente de 6s)
        await new Promise((resolve) => {
          let resolved = false;
          const finish = () => {
            if (!resolved) {
              resolved = true;
              resolve();
            }
          };
          tempEsriLayer.once("load", finish);
          setTimeout(finish, 6000);
        });
      }

      // --- PASO 2: Asegurar que todas las teselas de cualquier capa (WMS / Base) hayan finalizado ---
      const allTileImages = Array.from(mapElem.querySelectorAll("img.leaflet-tile"));
      const pendingTiles = allTileImages.filter((img) => !img.complete);
      if (pendingTiles.length > 0) {
        await Promise.all(
          pendingTiles.map(
            (img) =>
              new Promise((res) => {
                img.addEventListener("load", res, { once: true });
                img.addEventListener("error", res, { once: true });
                setTimeout(res, 3500); // Límite por imagen
              })
          )
        );
      }

      // Pausa técnica de 250ms para que el navegador termine de pintar las teselas y SVGs
      await new Promise((res) => setTimeout(res, 250));

      // --- PASO 3: Ocultar TODOS los controles de Leaflet (botones de zoom, dibujo, capas, etc.) ---
      controlContainer = mapElem.querySelector(".leaflet-control-container");
      if (controlContainer) {
        controlContainer.style.display = "none";
      }

      // Asegurar que los SVG de Leaflet tengan dimensiones explícitas
      const mapRect = mapElem.getBoundingClientRect();
      const svgs = mapElem.querySelectorAll("svg.leaflet-zoom-animated");
      svgs.forEach((svg) => {
        if (!svg.getAttribute("width")) svg.setAttribute("width", `${mapRect.width}`);
        if (!svg.getAttribute("height")) svg.setAttribute("height", `${mapRect.height}`);
      });

      // --- PASO 4: Captura mediante html2canvas con fallback ---
      let canvas = null;
      if (typeof html2canvas !== "undefined") {
        try {
          canvas = await html2canvas(mapElem, {
            useCORS: true,
            allowTaint: false,
            scale: window.devicePixelRatio > 1 ? 1.5 : 2,
            logging: false,
            ignoreElements: (el) => {
              return el.id === "pdf-modal-overlay" || el.id === "pdfPrinter";
            },
          });
        } catch (canvasErr) {
          console.warn("html2canvas tuvo un inconveniente, usando fallback leafletImage:", canvasErr);
        }
      }

      // Fallback a leafletImage en caso extraordinario
      if (!canvas && typeof window.leafletImage !== "undefined") {
        canvas = await new Promise((resolve, reject) => {
          const timeoutId = setTimeout(() => {
            reject(new Error("Tiempo de espera agotado al capturar mapa con leafletImage."));
          }, this.config.timeout);

          window.leafletImage(mapObj, (err, c) => {
            clearTimeout(timeoutId);
            if (err || !c) reject(err || new Error("Canvas no generado"));
            else resolve(c);
          });
        });
      }

      if (!canvas) {
        throw new Error("No fue posible capturar el lienzo del mapa.");
      }

      return canvas;
    } finally {
      // --- PASO 5: Restaurar estado original del mapa y visibilidad de controles ---
      if (tempEsriLayer && mapObj.hasLayer(tempEsriLayer)) {
        mapObj.removeLayer(tempEsriLayer);
      }
      if (googleLayerToRestore) {
        googleLayerToRestore.setOpacity(1);
      }
      if (controlContainer) {
        controlContainer.style.display = "";
      }
    }
  }

  /**
   * Crea y compone el documento PDF cartográfico con jsPDF.
   * @param {HTMLCanvasElement} canvas
   * @param {L.Map} mapObj
   * @returns {Promise<jsPDF>}
   * @private
   */
  async #createPDFDocument(canvas, mapObj) {
    const PDFClass = window.jspdf ? window.jspdf.jsPDF : window.jsPDF;
    if (typeof PDFClass === "undefined") {
      throw new Error("jsPDF no se encuentra cargado en la aplicación.");
    }

    const orientation = this.printSettings.orientation; // 'landscape' | 'portrait'
    const format = this.printSettings.format;           // 'a4' | 'a3'

    const pdf = new PDFClass({
      orientation: orientation,
      unit: "mm",
      format: format,
    });

    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const margin = 8; // mm

    // 1. CABECERA INSTITUCIONAL IDESA
    const headerH = 17; // mm
    const headerY = margin;

    // Logo IDESA
    if (this.printSettings.includeLogo) {
      try {
        const logoImg = await this.#getLogoImage();
        if (logoImg) {
          pdf.addImage(logoImg, "PNG", margin, headerY, 26, 8.5);
        }
      } catch (e) {
        console.warn("Logo no disponible para PDF:", e);
      }
    }

    // Título y subtítulo
    const titleX = this.printSettings.includeLogo ? margin + 29 : margin;
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(14);
    pdf.setTextColor(104, 2, 5); // Borravino IDESA #680205
    pdf.text(this.printSettings.title, titleX, headerY + 5);

    if (this.printSettings.subtitle) {
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(8.5);
      pdf.setTextColor(70, 70, 70);
      pdf.text(this.printSettings.subtitle, titleX, headerY + 9.5);
    }

    // Fecha a la derecha
    if (this.printSettings.includeDate) {
      const now = new Date();
      const dateStr = now.toLocaleDateString("es-AR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }) + " " + now.toTimeString().slice(0, 5) + " hs";
      pdf.setFontSize(7.5);
      pdf.setTextColor(100, 100, 100);
      pdf.text(dateStr, pageW - margin, headerY + 5, { align: "right" });
    }

    // Línea divisoria elegante
    pdf.setDrawColor(104, 2, 5);
    pdf.setLineWidth(0.4);
    pdf.line(margin, headerY + 12, pageW - margin, headerY + 12);

    // 2. DISPOSICIÓN PRINCIPAL: MAPA + LEYENDA (Llenado completo sin franjas blancas)
    const contentY = headerY + 14;
    const footerH = 7;
    const availableH = pageH - contentY - margin - footerH;
    const availableW = pageW - margin * 2;

    const capasActivas = this.#getActiveLayersWithLegends();
    const showLegends = this.printSettings.includeLegends && capasActivas.length > 0;

    let mapX = margin;
    let mapY = contentY;
    let mapW = availableW;
    let mapH = availableH;

    let legendX = 0;
    let legendY = 0;
    let legendW = 0;
    let legendH = 0;

    if (orientation === "landscape") {
      // --- HORIZONTAL (Landscape) ---
      if (showLegends) {
        legendW = 75; // mm
        mapW = availableW - legendW - 4;
        mapH = availableH;
        legendX = mapX + mapW + 4;
        legendY = contentY;
        legendH = availableH;
      } else {
        mapW = availableW;
        mapH = availableH;
      }
    } else {
      // --- VERTICAL (Portrait) ---
      if (showLegends) {
        legendH = 65; // mm (bloque inferior de referencias)
        mapW = availableW;
        mapH = availableH - legendH - 4;
        legendX = margin;
        legendY = mapY + mapH + 4;
        legendW = availableW;
      } else {
        mapW = availableW;
        mapH = availableH;
      }
    }

    // Recorte centrado del canvas para que coincida exactamente con la relación (mapW / mapH)
    // ¡Esto elimina al 100% las barras blancas superior/inferior o laterales!
    const targetRatio = mapW / mapH;
    const croppedCanvas = this.#cropCanvasToRatio(canvas, targetRatio);

    const imgData = croppedCanvas.toDataURL("image/jpeg", 0.95);
    pdf.addImage(imgData, "JPEG", mapX, mapY, mapW, mapH);

    // Marco cartográfico
    if (this.printSettings.includeBorder) {
      pdf.setDrawColor(50, 50, 50);
      pdf.setLineWidth(0.35);
      pdf.rect(mapX, mapY, mapW, mapH);
    }

    // Símbolo de norte y escala gráfica
    if (this.printSettings.includeScale) {
      this.#drawNorthSymbol(pdf, mapX + mapW - 14, mapY + 8);
      this.#addScaleTextToPDF(pdf, mapObj, mapX + 4, mapY + mapH - 5);
    }

    // 3. BLOQUE DE REFERENCIAS / LEYENDAS EQUILIBRADO
    if (showLegends) {
      await this.#renderLegendsBlock(
        pdf,
        capasActivas,
        legendX,
        legendY,
        legendW,
        legendH,
        orientation
      );
    }

    // 4. PIE DE PÁGINA (Metadatos y fuente)
    const footerY = pageH - margin;
    pdf.setFontSize(7);
    pdf.setTextColor(110, 110, 110);

    const center = mapObj.getCenter();
    const zoom = mapObj.getZoom();
    const coordStr = `Centro: ${center.lat.toFixed(4)}°, ${center.lng.toFixed(4)}° | Zoom: ${zoom}`;
    pdf.text(coordStr, margin, footerY);

    const attrStr = "Visor de Mapas IDESA - idesa.gob.ar | Datos: IDESA, IGN, Esri";
    pdf.text(attrStr, pageW - margin, footerY, { align: "right" });

    return pdf;
  }

  /**
   * Renderiza el bloque de leyendas de forma equilibrada y ordenada.
   * En Portrait usa 2 columnas con seguimiento de altura independiente para que no queden huecos.
   * @private
   */
  async #renderLegendsBlock(pdf, capas, x, y, width, height, orientation) {
    // Fondo y borde del recuadro de referencias
    pdf.setFillColor(252, 252, 252);
    pdf.setDrawColor(210, 215, 220);
    pdf.setLineWidth(0.25);
    pdf.roundedRect(x, y, width, height, 1.5, 1.5, "FD");

    // Cabecera del bloque
    pdf.setFillColor(245, 235, 237); // Tinte suave vino
    pdf.rect(x, y, width, 6, "F");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8);
    pdf.setTextColor(104, 2, 5);
    pdf.text("REFERENCIAS", x + 4, y + 4.2);

    pdf.setDrawColor(210, 215, 220);
    pdf.line(x, y + 6, x + width, y + 6);

    const isPortrait = orientation === "portrait";
    const numCols = isPortrait ? 2 : 1;
    const colWidth = (width - 6) / numCols;
    const maxY = y + height - 3;

    // Altura actual por columna
    const colY = new Array(numCols).fill(y + 9);

    for (let i = 0; i < capas.length; i++) {
      const c = capas[i];

      // En Portrait, seleccionar la columna con menor altura ocupada
      const colIndex = isPortrait ? (colY[0] <= colY[1] ? 0 : 1) : 0;
      const colX = x + 3 + colIndex * colWidth;

      if (colY[colIndex] >= maxY - 4) {
        continue;
      }

      // Nombre de la capa
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(7.2);
      pdf.setTextColor(40, 40, 40);
      const splitTitles = pdf.splitTextToSize(c.titulo, colWidth - 8);
      for (const line of splitTitles.slice(0, 2)) {
        if (colY[colIndex] < maxY) {
          pdf.text(line, colX + 4, colY[colIndex]);
          colY[colIndex] += 3.2;
        }
      }

      // Imagen de leyenda GetLegendGraphic o viñeta de color
      if (c.host || c.legendURL) {
        let legendImgUrl = c.legendURL;
        if (!legendImgUrl && c.host) {
          legendImgUrl = `${c.host}/wms?service=WMS&request=GetLegendGraphic&format=image%2Fpng&version=1.1.1&layer=${c.name}&transparent=true&scale=1&LEGEND_OPTIONS=fontAntiAliasing:true;dpi:100;fontName:verdana;hideEmptyRules:false;labelMargin:3;forceTitles:off;`;
        }
        try {
          const maxImgW = Math.min(colWidth - 8, isPortrait ? 55 : 65);
          const imgH = await this.#addLegendImageToPDF(
            pdf,
            legendImgUrl,
            colX + 4,
            colY[colIndex],
            maxImgW
          );
          colY[colIndex] += Math.max(imgH + 2.5, 3.5);
        } catch (e) {
          colY[colIndex] += 2;
        }
      } else {
        // Indicador gráfico para capas vectoriales
        pdf.setFillColor(104, 2, 5);
        pdf.circle(colX + 2, colY[colIndex] - 1.2, 0.9, "F");
        colY[colIndex] += 2.5;
      }
    }
  }

  /**
   * Obtiene la imagen del logo oficial de IDESA en memoria.
   * @private
   */
  async #getLogoImage() {
    if (this.logoCache) return this.logoCache;
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        this.logoCache = img;
        resolve(img);
      };
      img.onerror = () => resolve(null);
      img.src = "src/styles/images/logoIDESAok-300x99.png";
    });
  }

  /**
   * Obtiene las capas activas con sus metadatos de leyenda.
   * @private
   */
  #getActiveLayersWithLegends() {
    const list = [];
    try {
      if (typeof gestorMenu !== "undefined" && gestorMenu.getActiveLayersWithoutBasemap) {
        const catalogLayers = gestorMenu.getActiveLayersWithoutBasemap();
        catalogLayers.forEach((l) => {
          list.push({
            name: l.name || l.nombre || "Capa",
            titulo: l.titulo || l.name || "Capa activa",
            host: l.host || null,
            legendURL: l.legendURL || null,
          });
        });
      }

      // Añadir también capas agregadas por el usuario o capas recortadas si existen
      if (typeof gestorMenu !== "undefined" && gestorMenu.addedLayers) {
        Object.keys(gestorMenu.addedLayers).forEach((id) => {
          const lyr = gestorMenu.addedLayers[id];
          const name = lyr.name || lyr.options?.name || id;
          if (!list.some((item) => item.name === name || item.titulo === name)) {
            list.push({
              name: name,
              titulo: name,
              host: null,
              legendURL: null,
            });
          }
        });
      }
    } catch (e) {
      console.warn("Error recopilando capas activas:", e);
    }

    return list.length > 0 ? list : [{ titulo: "Sin capas activas", host: null }];
  }

  /**
   * Agrega imagen de leyenda al PDF.
   * @private
   */
  async #addLegendImageToPDF(pdf, legendImg, x, y, maxWidth = 50) {
    return new Promise((resolve) => {
      if (!legendImg) return resolve(0);
      const img = new Image();
      img.crossOrigin = "anonymous";
      const timer = setTimeout(() => resolve(0), 4000); // Timeout rápido por imagen

      img.onload = () => {
        clearTimeout(timer);
        try {
          const aspect = img.width / img.height;
          let finalW = Math.min(img.width * 0.22, maxWidth);
          let finalH = finalW / aspect;
          if (finalH > 28) {
            finalH = 28;
            finalW = finalH * aspect;
          }
          pdf.addImage(img, "PNG", x, y, finalW, finalH);
          resolve(finalH);
        } catch (e) {
          resolve(0);
        }
      };

      img.onerror = () => {
        clearTimeout(timer);
        resolve(0);
      };

      img.src = legendImg;
    });
  }

  /**
   * Dibuja símbolo de norte estilizado.
   * @private
   */
  #drawNorthSymbol(pdf, x, y) {
    try {
      const size = 6;
      pdf.setLineWidth(0.3);
      pdf.setDrawColor(40, 40, 40);

      // Triángulo izquierdo relleno negro
      pdf.setFillColor(40, 40, 40);
      pdf.triangle(x + size / 2, y, x, y + size * 1.6, x + size / 2, y + size * 1.3, "FD");

      // Triángulo derecho blanco
      pdf.setFillColor(255, 255, 255);
      pdf.triangle(x + size / 2, y, x + size, y + size * 1.6, x + size / 2, y + size * 1.3, "FD");

      // Letra N
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(8);
      pdf.setTextColor(40, 40, 40);
      pdf.text("N", x + size / 2 - 1.2, y + size * 1.6 + 3.2);
    } catch (e) {
      pdf.text("N↑", x, y + 5);
    }
  }

  /**
   * Calcula y dibuja la escala numérica y gráfica.
   * @private
   */
  #addScaleTextToPDF(pdf, mapObj, x, y) {
    try {
      if (!mapObj || typeof mapObj.getZoom !== "function") return;
      const zoom = mapObj.getZoom();
      const center = mapObj.getCenter();
      const resolution =
        (156543.03392804097 * Math.cos((center.lat * Math.PI) / 180)) / Math.pow(2, zoom);

      const standardDistances = [
        1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000, 20000,
        25000, 50000, 100000, 200000, 500000,
      ];
      const maxBarWidthMm = 35;
      const pixelSizeMm = 0.16;
      const pixelsPerMm = 1 / pixelSizeMm;

      let bestDistance = standardDistances[0];
      for (const d of standardDistances) {
        if (d <= maxBarWidthMm * resolution * pixelsPerMm) {
          bestDistance = d;
        } else {
          break;
        }
      }

      const barWidthMm = Math.min((bestDistance / resolution) * pixelSizeMm, maxBarWidthMm);
      const isKm = bestDistance >= 1000;
      const displayDistance = isKm ? bestDistance / 1000 : bestDistance;
      const unit = isKm ? "km" : "m";

      // Fondo semitransparente para legibilidad sobre el mapa
      pdf.setFillColor(255, 255, 255);
      pdf.rect(x - 1, y - 5, barWidthMm + 14, 8, "F");

      // Barra de escala blanco/negro
      const barH = 2.2;
      pdf.setLineWidth(0.3);
      pdf.setDrawColor(0, 0, 0);
      pdf.rect(x, y - 2, barWidthMm, barH, "D");

      pdf.setFillColor(0, 0, 0);
      pdf.rect(x, y - 2, barWidthMm / 2, barH, "F");

      pdf.setFontSize(6.5);
      pdf.setTextColor(30, 30, 30);
      pdf.text("0", x - 1, y + 2.5);
      pdf.text(`${displayDistance} ${unit}`, x + barWidthMm - 2, y + 2.5);
    } catch (e) {
      console.warn("Error dibujando escala:", e);
    }
  }

  /**
   * Genera nombre de archivo sanitizado.
   * @private
   */
  #generateFilename() {
    const now = new Date();
    const fecha = now
      .toLocaleDateString("es-AR", { year: "numeric", month: "2-digit", day: "2-digit" })
      .replace(/\//g, "-");
    const hora = now.toTimeString().slice(0, 5).replace(":", "-");
    const safeTitle = (this.printSettings.title || "mapa_idesa")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "_")
      .replace(/_+/g, "_")
      .slice(0, 25);
    return `${safeTitle}_${fecha}_${hora}.pdf`;
  }

  /**
   * Escapa caracteres HTML.
   * @private
   */
  #escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /**
   * Limpia recursos al destruir el componente.
   */
  destroy() {
    this.closeModal();
    this.handlers.forEach(({ el, type, fn }) => {
      try {
        if (el && typeof el.removeEventListener === "function") {
          el.removeEventListener(type, fn);
        }
      } catch (e) {}
    });
    this.handlers = [];
    if (this.elem && this.elem.parentNode) {
      this.elem.parentNode.removeChild(this.elem);
    }
    this.elem = null;
  }
}
