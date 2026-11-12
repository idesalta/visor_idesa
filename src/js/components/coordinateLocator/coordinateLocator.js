/**
 * Herramienta de Localización por Coordenadas (IDESA).
 * Permite a los usuarios ingresar coordenadas en formato Sexagesimal (Grados, Minutos, Segundos)
 * o Grados Decimales, posicionar un marcador en el mapa con auto-zoom y consultar/copiar ambos formatos.
 */
class CoordinateLocator {
  constructor() {
    this.modalElem = null;
    this.marker = null;
    this.activeTab = "gms"; // 'gms' | 'dec'
  }

  /**
   * Crea e inyecta el botón en la barra superior izquierda de Leaflet (donde están medir, imprimir, etc.)
   */
  createComponent() {
    if (document.getElementById("coordinateLocator")) return;

    const container =
      document.querySelector(".leaflet-top.leaflet-left") ||
      document.querySelector(".leaflet-control-container .leaflet-top.leaflet-left") ||
      document.querySelector("#mapa .leaflet-top.leaflet-left");

    if (!container) {
      setTimeout(() => this.createComponent(), 500);
      return;
    }

    const elem = document.createElement("div");
    elem.className = "leaflet-bar leaflet-control";
    elem.id = "coordinateLocator";
    elem.title = "Localizar por Coordenadas (GMS / Decimal)";
    elem.innerHTML = `
      <a class="iconCoord-container" role="button" tabindex="0" aria-label="Localizar por Coordenadas">
        <i class="fa-solid fa-location-crosshairs" aria-hidden="true"></i>
      </a>
    `;

    elem.onclick = (e) => {
      e.stopPropagation();
      this.toggleModal();
    };

    elem.ondblclick = (e) => {
      e.stopPropagation();
    };

    // Insertar después de medir si ya existe en el contenedor, o al final
    const measureElem = container.querySelector(".leaflet-control-measure");
    if (measureElem) {
      measureElem.after(elem);
    } else {
      container.appendChild(elem);
    }
  }

  /**
   * Alterna la visibilidad del diálogo.
   */
  toggleModal() {
    if (this.modalElem) {
      this.closeModal();
    } else {
      this.openModal();
    }
  }

  /**
   * Abre el diálogo de localización de coordenadas.
   */
  openModal() {
    if (this.modalElem) this.closeModal();

    const overlay = document.createElement("div");
    overlay.id = "coord-locator-overlay";
    overlay.innerHTML = `
      <div class="coord-dialog" role="dialog" aria-modal="true" aria-labelledby="coord-dialog-title">
        <div class="coord-header" id="coord-header">
          <h3 id="coord-dialog-title">
            <i class="fa-solid fa-location-crosshairs"></i> Localizar por Coordenadas
          </h3>
          <div class="coord-header-actions">
            <button type="button" class="coord-close-btn" id="coord-close-btn" title="Cerrar">&times;</button>
          </div>
        </div>

        <div class="coord-body">
          <!-- Pestañas de Formato -->
          <div class="coord-tabs">
            <button type="button" class="coord-tab-btn active" id="tab-btn-gms">Sexagesimal (GMS)</button>
            <button type="button" class="coord-tab-btn" id="tab-btn-dec">Grados Decimales</button>
          </div>

          <!-- Sección Sexagesimal (GMS) -->
          <div class="coord-section" id="section-gms">
            <div class="coord-group">
              <label class="coord-label">Latitud (GMS)</label>
              <div class="coord-gms-inputs">
                <div class="coord-input-box" title="Grados">
                  <input type="number" id="gms-lat-deg" min="0" max="90" placeholder="24" />
                  <span class="coord-unit">°</span>
                </div>
                <div class="coord-input-box" title="Minutos">
                  <input type="number" id="gms-lat-min" min="0" max="59" placeholder="47" />
                  <span class="coord-unit">'</span>
                </div>
                <div class="coord-input-box" title="Segundos">
                  <input type="number" id="gms-lat-sec" min="0" max="59.99" step="0.01" placeholder="09.2" />
                  <span class="coord-unit">"</span>
                </div>
                <select id="gms-lat-hemi" class="coord-select" title="Hemisferio">
                  <option value="S" selected>Sur (S)</option>
                  <option value="N">Norte (N)</option>
                </select>
              </div>
            </div>

            <div class="coord-group">
              <label class="coord-label">Longitud (GMS)</label>
              <div class="coord-gms-inputs">
                <div class="coord-input-box" title="Grados">
                  <input type="number" id="gms-lon-deg" min="0" max="180" placeholder="65" />
                  <span class="coord-unit">°</span>
                </div>
                <div class="coord-input-box" title="Minutos">
                  <input type="number" id="gms-lon-min" min="0" max="59" placeholder="24" />
                  <span class="coord-unit">'</span>
                </div>
                <div class="coord-input-box" title="Segundos">
                  <input type="number" id="gms-lon-sec" min="0" max="59.99" step="0.01" placeholder="42.1" />
                  <span class="coord-unit">"</span>
                </div>
                <select id="gms-lon-hemi" class="coord-select" title="Hemisferio">
                  <option value="O" selected>Oeste (O)</option>
                  <option value="E">Este (E)</option>
                </select>
              </div>
            </div>
          </div>

          <!-- Sección Decimal -->
          <div class="coord-section" id="section-dec" style="display: none;">
            <div class="coord-group">
              <label class="coord-label" for="dec-lat">Latitud Decimal</label>
              <input type="number" id="dec-lat" class="coord-dec-input" step="0.000001" min="-90" max="90" placeholder="-24.785903" />
            </div>
            <div class="coord-group">
              <label class="coord-label" for="dec-lon">Longitud Decimal</label>
              <input type="number" id="dec-lon" class="coord-dec-input" step="0.000001" min="-180" max="180" placeholder="-65.411694" />
            </div>
          </div>

          <!-- Acciones Rápidas -->
          <div class="coord-quick-actions">
            <button type="button" class="coord-link-btn" id="coord-btn-get-center">
              <i class="fa-solid fa-crosshairs"></i> Tomar centro actual del mapa
            </button>
            <button type="button" class="coord-link-btn" id="coord-btn-clear" style="color:#64748b;">
              <i class="fa-solid fa-eraser"></i> Limpiar
            </button>
          </div>
        </div>

        <div class="coord-footer">
          <button type="button" class="coord-btn-secondary" id="coord-btn-cancel">Cerrar</button>
          <button type="button" class="coord-btn-primary" id="coord-btn-locate">
            <i class="fa-solid fa-map-pin"></i> Localizar en Mapa
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    this.modalElem = overlay;

    // Hacer arrastrable por la cabecera
    const dialog = overlay.querySelector(".coord-dialog");
    const header = overlay.querySelector(".coord-header");
    this.makeDraggable(dialog, header);

    // Listeners
    document.getElementById("coord-close-btn").onclick = () => this.closeModal();
    document.getElementById("coord-btn-cancel").onclick = () => this.closeModal();

    // Tabs
    const tabGms = document.getElementById("tab-btn-gms");
    const tabDec = document.getElementById("tab-btn-dec");
    const secGms = document.getElementById("section-gms");
    const secDec = document.getElementById("section-dec");

    tabGms.onclick = () => {
      this.activeTab = "gms";
      tabGms.classList.add("active");
      tabDec.classList.remove("active");
      secGms.style.display = "flex";
      secDec.style.display = "none";
    };

    tabDec.onclick = () => {
      this.activeTab = "dec";
      tabDec.classList.add("active");
      tabGms.classList.remove("active");
      secDec.style.display = "flex";
      secGms.style.display = "none";
    };

    // Sincronización en tiempo real
    this.setupSyncListeners();

    // Botón Tomar centro actual del mapa
    document.getElementById("coord-btn-get-center").onclick = () => this.captureMapCenter();

    // Botón Limpiar
    document.getElementById("coord-btn-clear").onclick = () => this.clearAll();

    // Botón Localizar
    document.getElementById("coord-btn-locate").onclick = () => this.locateCoordinates();
  }

  /**
   * Cierra el modal.
   */
  closeModal() {
    if (this.modalElem && document.body.contains(this.modalElem)) {
      document.body.removeChild(this.modalElem);
    }
    this.modalElem = null;
  }

  /**
   * Sincroniza bidireccionalmente los valores entre GMS y Decimal al escribir.
   */
  setupSyncListeners() {
    const gmsInputs = [
      "gms-lat-deg",
      "gms-lat-min",
      "gms-lat-sec",
      "gms-lat-hemi",
      "gms-lon-deg",
      "gms-lon-min",
      "gms-lon-sec",
      "gms-lon-hemi",
    ];

    gmsInputs.forEach((id) => {
      const el = document.getElementById(id);
      if (el) {
        el.oninput = () => this.syncGmsToDec();
        el.onchange = () => this.syncGmsToDec();
      }
    });

    const decLat = document.getElementById("dec-lat");
    const decLon = document.getElementById("dec-lon");

    if (decLat) {
      decLat.oninput = () => this.syncDecToGms();
    }
    if (decLon) {
      decLon.oninput = () => this.syncDecToGms();
    }
  }

  /**
   * Convierte valores de GMS a Decimal y llena los inputs decimales.
   */
  syncGmsToDec() {
    const latDeg = parseFloat(document.getElementById("gms-lat-deg")?.value) || 0;
    const latMin = parseFloat(document.getElementById("gms-lat-min")?.value) || 0;
    const latSec = parseFloat(document.getElementById("gms-lat-sec")?.value) || 0;
    const latHemi = document.getElementById("gms-lat-hemi")?.value || "S";

    const lonDeg = parseFloat(document.getElementById("gms-lon-deg")?.value) || 0;
    const lonMin = parseFloat(document.getElementById("gms-lon-min")?.value) || 0;
    const lonSec = parseFloat(document.getElementById("gms-lon-sec")?.value) || 0;
    const lonHemi = document.getElementById("gms-lon-hemi")?.value || "O";

    let decLat = latDeg + latMin / 60 + latSec / 3600;
    if (latHemi === "S") decLat = -decLat;

    let decLon = lonDeg + lonMin / 60 + lonSec / 3600;
    if (lonHemi === "O" || lonHemi === "W") decLon = -decLon;

    const decLatInput = document.getElementById("dec-lat");
    const decLonInput = document.getElementById("dec-lon");

    if (decLatInput && (latDeg || latMin || latSec)) {
      decLatInput.value = decLat.toFixed(6);
    }
    if (decLonInput && (lonDeg || lonMin || lonSec)) {
      decLonInput.value = decLon.toFixed(6);
    }
  }

  /**
   * Convierte valores de Decimal a GMS y llena las cajitas de sexagesimal.
   */
  syncDecToGms() {
    const latVal = parseFloat(document.getElementById("dec-lat")?.value);
    const lonVal = parseFloat(document.getElementById("dec-lon")?.value);

    if (!isNaN(latVal)) {
      const gmsLat = this.decimalToGms(latVal, true);
      document.getElementById("gms-lat-deg").value = gmsLat.deg;
      document.getElementById("gms-lat-min").value = gmsLat.min;
      document.getElementById("gms-lat-sec").value = gmsLat.sec;
      document.getElementById("gms-lat-hemi").value = gmsLat.hemi;
    }

    if (!isNaN(lonVal)) {
      const gmsLon = this.decimalToGms(lonVal, false);
      document.getElementById("gms-lon-deg").value = gmsLon.deg;
      document.getElementById("gms-lon-min").value = gmsLon.min;
      document.getElementById("gms-lon-sec").value = gmsLon.sec;
      document.getElementById("gms-lon-hemi").value = gmsLon.hemi;
    }
  }

  /**
   * Convierte un valor decimal a objeto GMS.
   */
  decimalToGms(decimal, isLat) {
    const abs = Math.abs(decimal);
    const deg = Math.floor(abs);
    const minFloat = (abs - deg) * 60;
    const min = Math.floor(minFloat);
    const sec = parseFloat(((minFloat - min) * 60).toFixed(2));
    let hemi = "";
    if (isLat) {
      hemi = decimal < 0 ? "S" : "N";
    } else {
      hemi = decimal < 0 ? "O" : "E";
    }
    return { deg, min, sec, hemi };
  }

  /**
   * Formatea un par de coordenadas decimales a texto GMS legible.
   */
  formatGmsString(lat, lng) {
    const gLat = this.decimalToGms(lat, true);
    const gLng = this.decimalToGms(lng, false);
    return `${gLat.deg}° ${gLat.min}' ${gLat.sec}" ${gLat.hemi}, ${gLng.deg}° ${gLng.min}' ${gLng.sec}" ${gLng.hemi}`;
  }

  /**
   * Captura el centro del mapa actual y llena los campos.
   */
  captureMapCenter() {
    const mapObj = window.mapa || window.map;
    if (!mapObj) return;

    const center = mapObj.getCenter();
    const lat = center.lat;
    const lng = center.lng;

    const decLatInput = document.getElementById("dec-lat");
    const decLonInput = document.getElementById("dec-lon");
    if (decLatInput) decLatInput.value = lat.toFixed(6);
    if (decLonInput) decLonInput.value = lng.toFixed(6);

    this.syncDecToGms();
  }

  /**
   * Ejecuta la localización y posiciona el marcador en el mapa.
   */
  locateCoordinates() {
    let lat = null;
    let lng = null;

    if (this.activeTab === "dec") {
      lat = parseFloat(document.getElementById("dec-lat")?.value);
      lng = parseFloat(document.getElementById("dec-lon")?.value);
    } else {
      const latDeg = parseFloat(document.getElementById("gms-lat-deg")?.value) || 0;
      const latMin = parseFloat(document.getElementById("gms-lat-min")?.value) || 0;
      const latSec = parseFloat(document.getElementById("gms-lat-sec")?.value) || 0;
      const latHemi = document.getElementById("gms-lat-hemi")?.value || "S";

      const lonDeg = parseFloat(document.getElementById("gms-lon-deg")?.value) || 0;
      const lonMin = parseFloat(document.getElementById("gms-lon-min")?.value) || 0;
      const lonSec = parseFloat(document.getElementById("gms-lon-sec")?.value) || 0;
      const lonHemi = document.getElementById("gms-lon-hemi")?.value || "O";

      if (latDeg === 0 && latMin === 0 && latSec === 0) {
        alert("Por favor ingrese la latitud.");
        return;
      }
      if (lonDeg === 0 && lonMin === 0 && lonSec === 0) {
        alert("Por favor ingrese la longitud.");
        return;
      }

      lat = latDeg + latMin / 60 + latSec / 3600;
      if (latHemi === "S") lat = -lat;

      lng = lonDeg + lonMin / 60 + lonSec / 3600;
      if (lonHemi === "O" || lonHemi === "W") lng = -lng;
    }

    if (isNaN(lat) || isNaN(lng)) {
      alert("Por favor ingrese coordenadas válidas.");
      return;
    }

    if (lat < -90 || lat > 90) {
      alert("La latitud debe encontrarse entre -90° y 90°.");
      return;
    }
    if (lng < -180 || lng > 180) {
      alert("La longitud debe encontrarse entre -180° y 180°.");
      return;
    }

    this.addMarkerToMap(lat, lng);
  }

  /**
   * Agrega o actualiza el marcador en el mapa con animación y popup interactivo.
   */
  addMarkerToMap(lat, lng) {
    const mapObj = window.mapa || window.map;
    if (!mapObj) return;

    if (this.marker) {
      mapObj.removeLayer(this.marker);
      this.marker = null;
    }

    // Icono personalizado con pin IDESA y pulso
    const customIcon = L.divIcon({
      className: "coord-pin-marker",
      html: `
        <div class="coord-pin-pulse"></div>
        <i class="fa-solid fa-location-dot coord-pin-icon"></i>
      `,
      iconSize: [30, 42],
      iconAnchor: [15, 38],
      popupAnchor: [0, -38],
    });

    const gmsText = this.formatGmsString(lat, lng);
    const decText = `${lat.toFixed(6)}°, ${lng.toFixed(6)}°`;

    const popupHtml = `
      <div class="coord-popup-box">
        <div class="coord-popup-title">
          <i class="fa-solid fa-map-pin"></i> Punto Localizado
        </div>
        <table class="coord-popup-table">
          <tr>
            <td class="label">Decimal:</td>
            <td><strong>${decText}</strong></td>
          </tr>
          <tr>
            <td class="label">GMS:</td>
            <td>${gmsText}</td>
          </tr>
        </table>
        <div class="coord-popup-actions">
          <button type="button" class="coord-popup-btn" id="coord-pop-copy" title="Copiar coordenadas">
            <i class="fa-solid fa-copy"></i> Copiar
          </button>
          <button type="button" class="coord-popup-btn danger" id="coord-pop-remove" title="Quitar este marcador">
            <i class="fa-solid fa-trash"></i> Quitar
          </button>
        </div>
      </div>
    `;

    this.marker = L.marker([lat, lng], { icon: customIcon }).addTo(mapObj);
    this.marker.bindPopup(popupHtml);

    // Ajustar vista suavemente
    mapObj.setView([lat, lng], Math.max(mapObj.getZoom(), 16), { animate: true });

    // Abrir popup tras el movimiento
    setTimeout(() => {
      this.marker.openPopup();

      setTimeout(() => {
        const copyBtn = document.getElementById("coord-pop-copy");
        if (copyBtn) {
          copyBtn.onclick = () => {
            const clipText = `Lat/Lon: ${lat.toFixed(6)}, ${lng.toFixed(6)} (${gmsText})`;
            navigator.clipboard.writeText(clipText).then(() => {
              copyBtn.innerHTML = `<i class="fa-solid fa-check"></i> ¡Copiado!`;
              setTimeout(() => {
                copyBtn.innerHTML = `<i class="fa-solid fa-copy"></i> Copiar`;
              }, 1800);
            });
          };
        }

        const removeBtn = document.getElementById("coord-pop-remove");
        if (removeBtn) {
          removeBtn.onclick = () => {
            this.clearMarker();
          };
        }
      }, 100);
    }, 300);
  }

  /**
   * Quita el marcador del mapa.
   */
  clearMarker() {
    const mapObj = window.mapa || window.map;
    if (this.marker && mapObj) {
      mapObj.removeLayer(this.marker);
      this.marker = null;
    }
  }

  /**
   * Limpia campos y retira el marcador.
   */
  clearAll() {
    this.clearMarker();
    const ids = [
      "gms-lat-deg",
      "gms-lat-min",
      "gms-lat-sec",
      "gms-lon-deg",
      "gms-lon-min",
      "gms-lon-sec",
      "dec-lat",
      "dec-lon",
    ];
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.value = "";
    });
  }

  /**
   * Hace arrastrable el diálogo modal por su cabecera.
   */
  makeDraggable(dialog, handle) {
    if (!dialog || !handle) return;
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;

    handle.onmousedown = (e) => {
      if (e.target.tagName === "BUTTON" || e.target.closest("button") || e.target.tagName === "INPUT" || e.target.tagName === "SELECT") {
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
}

// Inicialización global
window.CoordinateLocator = CoordinateLocator;
window.coordinateLocatorInstance = null;

function initCoordinateLocator() {
  if (!window.coordinateLocatorInstance && typeof CoordinateLocator !== "undefined") {
    const inst = new CoordinateLocator();
    inst.createComponent();
    window.coordinateLocatorInstance = inst;
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initCoordinateLocator);
} else {
  initCoordinateLocator();
}
setTimeout(initCoordinateLocator, 1200);
setTimeout(initCoordinateLocator, 2500);
