/**
 * Herramienta de Zoom por Ventana (Box Zoom In / Box Zoom Out).
 * Permite al usuario seleccionar un área rectangular sobre el mapa con el mouse
 * para realizar un acercamiento (Zoom In +) o un alejamiento (Zoom Out -) centrado en dicha ventana.
 */
class BoxZoomTool {
  constructor() {
    this.elemIn = null;
    this.elemOut = null;
    this.currentMode = null; // 'in' | 'out' | null
    this.isDragging = false;
    this.startPoint = null;
    this.marqueeElem = null;
    this.hintElem = null;

    // Bound event handlers
    this._onMouseDown = this.onMouseDown.bind(this);
    this._onMouseMove = this.onMouseMove.bind(this);
    this._onMouseUp = this.onMouseUp.bind(this);
    this._onKeyDown = this.onKeyDown.bind(this);
  }

  /**
   * Crea e inyecta los dos botones de Zoom Ventana (separados) en la barra superior de Leaflet.
   */
  createComponent() {
    if (document.getElementById("boxZoomIn") || document.getElementById("boxZoomOut")) return;

    const container =
      document.querySelector(".leaflet-top.leaflet-left") ||
      document.querySelector(".leaflet-control-container .leaflet-top.leaflet-left") ||
      document.querySelector("#mapa .leaflet-top.leaflet-left");

    if (!container) {
      setTimeout(() => this.createComponent(), 500);
      return;
    }

    // Botón individual de Zoom Ventana (+)
    const elemIn = document.createElement("div");
    elemIn.className = "leaflet-bar leaflet-control";
    elemIn.id = "boxZoomIn";
    elemIn.innerHTML = `
      <a class="box-zoom-btn" id="box-zoom-in-btn" title="Zoom ventana (+): Dibuje un recuadro para acercar" role="button" tabindex="0" aria-label="Zoom ventana acercar">
        <i class="fa-solid fa-magnifying-glass-plus" aria-hidden="true"></i>
      </a>
    `;
    elemIn.ondblclick = (e) => e.stopPropagation();

    // Botón individual de Zoom Ventana (-)
    const elemOut = document.createElement("div");
    elemOut.className = "leaflet-bar leaflet-control";
    elemOut.id = "boxZoomOut";
    elemOut.innerHTML = `
      <a class="box-zoom-btn" id="box-zoom-out-btn" title="Zoom ventana (-): Dibuje un recuadro para alejar" role="button" tabindex="0" aria-label="Zoom ventana alejar">
        <i class="fa-solid fa-magnifying-glass-minus" aria-hidden="true"></i>
      </a>
    `;
    elemOut.ondblclick = (e) => e.stopPropagation();

    // Insertar después de coordinateLocator o measure si ya existen
    const coordElem = container.querySelector("#coordinateLocator");
    const measureElem = container.querySelector(".leaflet-control-measure");
    if (coordElem) {
      coordElem.after(elemIn);
      elemIn.after(elemOut);
    } else if (measureElem) {
      measureElem.after(elemIn);
      elemIn.after(elemOut);
    } else {
      container.appendChild(elemIn);
      container.appendChild(elemOut);
    }

    this.elemIn = elemIn;
    this.elemOut = elemOut;

    const btnIn = elemIn.querySelector("#box-zoom-in-btn");
    const btnOut = elemOut.querySelector("#box-zoom-out-btn");

    if (btnIn) {
      btnIn.onclick = (e) => {
        e.stopPropagation();
        this.toggleMode("in");
      };
    }

    if (btnOut) {
      btnOut.onclick = (e) => {
        e.stopPropagation();
        this.toggleMode("out");
      };
    }
  }

  /**
   * Activa o desactiva el modo de zoom indicado.
   * @param {'in'|'out'} mode
   */
  toggleMode(mode) {
    if (this.currentMode === mode) {
      this.deactivate();
    } else {
      this.activate(mode);
    }
  }

  /**
   * Activa la captura de recuadro en el mapa.
   * @param {'in'|'out'} mode
   */
  activate(mode) {
    this.deactivate(); // Limpiar estado anterior si lo hubiera

    const mapObj = window.mapa || window.map;
    if (!mapObj) return;

    this.currentMode = mode;

    // Actualizar botones en UI
    const btnIn = document.getElementById("box-zoom-in-btn");
    const btnOut = document.getElementById("box-zoom-out-btn");

    if (mode === "in" && btnIn) {
      btnIn.classList.add("active");
    } else if (mode === "out" && btnOut) {
      btnOut.classList.add("active", "box-zoom-out-active");
    }

    // Desactivar arrastre normal del mapa mientras se dibuja la ventana
    if (mapObj.dragging) mapObj.dragging.disable();
    if (mapObj.boxZoom) mapObj.boxZoom.disable();

    // Cambiar cursor del mapa
    const mapContainer = mapObj.getContainer();
    mapContainer.style.setProperty("cursor", "crosshair", "important");

    // Conectar eventos del mouse sobre el contenedor del mapa
    mapContainer.addEventListener("mousedown", this._onMouseDown, true);
    window.addEventListener("mousemove", this._onMouseMove, true);
    window.addEventListener("mouseup", this._onMouseUp, true);
    window.addEventListener("keydown", this._onKeyDown, true);

    // Mostrar aviso sutil en pantalla
    this.showHint(
      mode === "in"
        ? "Zoom Ventana (+): Dibuje un recuadro en el mapa para acercar (ESC para cancelar)"
        : "Zoom Ventana (-): Dibuje un recuadro en el mapa para alejar (ESC para cancelar)"
    );
  }

  /**
   * Desactiva la herramienta y restaura la interacción del mapa.
   */
  deactivate() {
    this.currentMode = null;
    this.isDragging = false;
    this.startPoint = null;

    if (this.marqueeElem && this.marqueeElem.parentNode) {
      this.marqueeElem.parentNode.removeChild(this.marqueeElem);
    }
    this.marqueeElem = null;
    this.removeHint();

    // Restaurar botones
    const btnIn = document.getElementById("box-zoom-in-btn");
    const btnOut = document.getElementById("box-zoom-out-btn");
    if (btnIn) btnIn.classList.remove("active");
    if (btnOut) btnOut.classList.remove("active", "box-zoom-out-active");

    const mapObj = window.mapa || window.map;
    if (mapObj) {
      if (mapObj.dragging) mapObj.dragging.enable();
      if (mapObj.boxZoom) mapObj.boxZoom.enable();

      const mapContainer = mapObj.getContainer();
      mapContainer.style.removeProperty("cursor");

      mapContainer.removeEventListener("mousedown", this._onMouseDown, true);
    }

    window.removeEventListener("mousemove", this._onMouseMove, true);
    window.removeEventListener("mouseup", this._onMouseUp, true);
    window.removeEventListener("keydown", this._onKeyDown, true);
  }

  /**
   * Muestra notificación de ayuda.
   */
  showHint(text) {
    this.removeHint();
    const hint = document.createElement("div");
    hint.className = "box-zoom-hint";
    hint.innerHTML = `<i class="fa-solid fa-magnifying-glass"></i> ${text}`;
    document.body.appendChild(hint);
    this.hintElem = hint;
  }

  /**
   * Quita la notificación de ayuda.
   */
  removeHint() {
    if (this.hintElem && this.hintElem.parentNode) {
      this.hintElem.parentNode.removeChild(this.hintElem);
    }
    this.hintElem = null;
  }

  /**
   * Evento Mousedown: inicia el recuadro de selección.
   */
  onMouseDown(e) {
    if (!this.currentMode) return;
    if (e.button !== 0) return; // Solo clic izquierdo

    // Si el clic ocurrió sobre algún control o botón, ignorar
    if (e.target.closest(".leaflet-control") || e.target.closest(".navbar") || e.target.closest("#botonera")) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    const mapObj = window.mapa || window.map;
    if (!mapObj) return;

    const mapContainer = mapObj.getContainer();
    const rect = mapContainer.getBoundingClientRect();

    this.isDragging = true;
    this.startPoint = {
      clientX: e.clientX,
      clientY: e.clientY,
      containerX: e.clientX - rect.left,
      containerY: e.clientY - rect.top,
    };

    if (!this.marqueeElem) {
      this.marqueeElem = document.createElement("div");
      this.marqueeElem.className =
        "box-zoom-marquee " + (this.currentMode === "out" ? "zoom-out" : "zoom-in");
      mapContainer.appendChild(this.marqueeElem);
    }

    this.marqueeElem.style.left = `${this.startPoint.containerX}px`;
    this.marqueeElem.style.top = `${this.startPoint.containerY}px`;
    this.marqueeElem.style.width = "0px";
    this.marqueeElem.style.height = "0px";
    this.marqueeElem.style.display = "block";
  }

  /**
   * Evento Mousemove: actualiza el tamaño del recuadro visual.
   */
  onMouseMove(e) {
    if (!this.isDragging || !this.startPoint || !this.marqueeElem) return;

    e.preventDefault();
    e.stopPropagation();

    const mapObj = window.mapa || window.map;
    if (!mapObj) return;

    const mapContainer = mapObj.getContainer();
    const rect = mapContainer.getBoundingClientRect();

    const curContainerX = e.clientX - rect.left;
    const curContainerY = e.clientY - rect.top;

    const left = Math.min(this.startPoint.containerX, curContainerX);
    const top = Math.min(this.startPoint.containerY, curContainerY);
    const width = Math.abs(curContainerX - this.startPoint.containerX);
    const height = Math.abs(curContainerY - this.startPoint.containerY);

    this.marqueeElem.style.left = `${left}px`;
    this.marqueeElem.style.top = `${top}px`;
    this.marqueeElem.style.width = `${width}px`;
    this.marqueeElem.style.height = `${height}px`;
  }

  /**
   * Evento Mouseup: calcula el encuadre y ejecuta el zoom in o zoom out.
   */
  onMouseUp(e) {
    if (!this.isDragging || !this.startPoint) return;

    e.preventDefault();
    e.stopPropagation();

    const mapObj = window.mapa || window.map;
    if (!mapObj) {
      this.deactivate();
      return;
    }

    const mapContainer = mapObj.getContainer();
    const rect = mapContainer.getBoundingClientRect();

    const curContainerX = e.clientX - rect.left;
    const curContainerY = e.clientY - rect.top;

    const width = Math.abs(curContainerX - this.startPoint.containerX);
    const height = Math.abs(curContainerY - this.startPoint.containerY);

    const mode = this.currentMode;

    if (width > 8 && height > 8) {
      // Se dibujó un recuadro significativo
      const p1 = mapObj.containerPointToLatLng(
        L.point(Math.min(this.startPoint.containerX, curContainerX), Math.min(this.startPoint.containerY, curContainerY))
      );
      const p2 = mapObj.containerPointToLatLng(
        L.point(Math.max(this.startPoint.containerX, curContainerX), Math.max(this.startPoint.containerY, curContainerY))
      );
      const bounds = L.latLngBounds(p1, p2);

      if (mode === "in") {
        // Zoom In al recuadro
        mapObj.fitBounds(bounds, { animate: true });
      } else if (mode === "out") {
        // Zoom Out centrado en el recuadro
        const center = bounds.getCenter();
        const mapSize = mapObj.getSize();
        const factor = Math.max(mapSize.x / width, mapSize.y / height);
        const zoomDiff = Math.max(1, Math.min(5, Math.round(Math.log2(factor))));
        const newZoom = Math.max(mapObj.getMinZoom() || 1, mapObj.getZoom() - zoomDiff);
        mapObj.setView(center, newZoom, { animate: true });
      }
    } else {
      // Si fue solo un clic puntual sin arrastrar
      const clickPt = L.point(curContainerX, curContainerY);
      const clickLatLng = mapObj.containerPointToLatLng(clickPt);

      if (mode === "in") {
        mapObj.setView(clickLatLng, mapObj.getZoom() + 1, { animate: true });
      } else if (mode === "out") {
        mapObj.setView(clickLatLng, Math.max(mapObj.getMinZoom() || 1, mapObj.getZoom() - 1), { animate: true });
      }
    }

    // Finalizar operación y restaurar
    this.deactivate();
  }

  /**
   * Cancela la operación al presionar la tecla Escape.
   */
  onKeyDown(e) {
    if (e.key === "Escape" || e.keyCode === 27) {
      this.deactivate();
    }
  }
}

// Inicialización global
window.BoxZoomTool = BoxZoomTool;
window.boxZoomToolInstance = null;

function initBoxZoomTool() {
  if (!window.boxZoomToolInstance && typeof BoxZoomTool !== "undefined") {
    const inst = new BoxZoomTool();
    inst.createComponent();
    window.boxZoomToolInstance = inst;
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initBoxZoomTool);
} else {
  initBoxZoomTool();
}
setTimeout(initBoxZoomTool, 1200);
setTimeout(initBoxZoomTool, 2500);
