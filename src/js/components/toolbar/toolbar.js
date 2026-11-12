/**
 * Control de visualización y ordenamiento de barras de herramientas de Leaflet (IDESA / GEOINTA).
 * Mantiene la disposición exacta y estable:
 * - Columna vertical derecha (.leaflet-top.leaflet-right):
 *     1. Llave inglesa (#hideBtnLeft, 'Esconder herramientas')
 *     2. Lapicito (#hideBtnRight, 'Esconder herramientas de dibujo')
 *     3. Barra de dibujo de Leaflet Draw
 * - Fila horizontal superior (.leaflet-top.leaflet-left):
 *     1. Medir distancias/áreas (.leaflet-control-measure)
 *     2. Localizar coordenadas (#coordinateLocator)
 *     3. Zoom Ventana (+) (#boxZoomIn)
 *     4. Zoom Ventana (-) (#boxZoomOut)
 *     5. Cuadrícula (.leaflet-control-customgraticule)
 *     6. Pantalla completa (#fullscreen)
 *     7. Captura (#screenShoter)
 *     8. Imprimir PDF (#pdfPrinter)
 *     9. Consultar datos (#consultData)
 */
class ToolbarVisibilityToggler {
  constructor() {
    window.toolbarVisibilityToggler = this;
    this.isSyncing = false;
  }

  /**
   * Crea o asegura un botón en la barra vertical derecha (.leaflet-top.leaflet-right).
   */
  createBtn(id, btnId, title, iconClass) {
    let elem = document.getElementById(btnId);
    if (!elem) {
      elem = document.createElement("div");
      elem.className = "leaflet-bar leaflet-control";
      elem.id = btnId;
      elem.title = title;
      elem.style.cursor = "pointer";

      const elemIcon = document.createElement("a");
      elemIcon.id = id;
      elemIcon.setAttribute("role", "button");
      elemIcon.setAttribute("tabindex", "0");
      elemIcon.setAttribute("aria-label", title);
      elemIcon.innerHTML = `<span id="map-toolbar-span" class="${iconClass}" aria-hidden="true"></span>`;
      elem.appendChild(elemIcon);

      elem.addEventListener("click", (e) => {
        e.stopPropagation();
        const targetContainerSelector =
          btnId === "hideBtnRight"
            ? ".leaflet-top.leaflet-right"
            : ".leaflet-top.leaflet-left";
        const targetContainer = document.querySelector(targetContainerSelector);
        if (targetContainer) {
          this.toggleToolbarVisibility(targetContainer);
        }
      });

      elem.addEventListener("dblclick", (e) => {
        e.stopPropagation();
      });
    }

    const rightContainer = document.querySelector(".leaflet-top.leaflet-right");
    if (rightContainer && elem.parentElement !== rightContainer) {
      rightContainer.appendChild(elem);
    }
  }

  /**
   * Asegura que en la columna derecha (.leaflet-top.leaflet-right):
   * 1º lugar: hideBtnLeft (Llave inglesa)
   * 2º lugar: hideBtnRight (Lapicito)
   * 3º lugar en adelante: Barra de dibujo (Leaflet Draw)
   */
  ensureRightTopPosition() {
    const rightContainer = document.querySelector(".leaflet-top.leaflet-right");
    if (!rightContainer) return;

    const leftBtn = document.getElementById("hideBtnLeft");
    const rightBtn = document.getElementById("hideBtnRight");

    if (leftBtn) {
      if (leftBtn.parentElement !== rightContainer) {
        rightContainer.prepend(leftBtn);
      } else if (rightContainer.firstElementChild !== leftBtn) {
        rightContainer.prepend(leftBtn);
      }
    }

    if (rightBtn) {
      if (rightBtn.parentElement !== rightContainer) {
        if (leftBtn && leftBtn.parentElement === rightContainer) {
          leftBtn.after(rightBtn);
        } else {
          rightContainer.prepend(rightBtn);
        }
      } else if (leftBtn && leftBtn.parentElement === rightContainer) {
        if (leftBtn.nextElementSibling !== rightBtn) {
          leftBtn.after(rightBtn);
        }
      }
    }
  }

  /**
   * Asegura el orden exacto de los botones en la barra horizontal (.leaflet-top.leaflet-left):
   * 1. Medir distancias/áreas (.leaflet-control-measure)
   * 2. Localizar coordenadas (#coordinateLocator)
   * 3. Zoom Ventana (+) (#boxZoomIn)
   * 4. Zoom Ventana (-) (#boxZoomOut)
   * 5. Cuadrícula (.leaflet-control-customgraticule)
   * 6. Pantalla completa (#fullscreen)
   * 7. Captura (#screenShoter)
   * 8. Imprimir PDF (#pdfPrinter)
   * 9. Consultar datos (#consultData)
   */
  orderLeftToolbar() {
    const leftContainer = document.querySelector(".leaflet-top.leaflet-left");
    if (!leftContainer) return;

    // Rescatar si hideBtnLeft o hideBtnRight cayeron por error en el contenedor izquierdo
    const rightContainer = document.querySelector(".leaflet-top.leaflet-right");
    ["hideBtnLeft", "hideBtnRight"].forEach((bId) => {
      const b = document.getElementById(bId);
      if (b && b.parentElement === leftContainer && rightContainer) {
        rightContainer.appendChild(b);
      }
    });

    const desiredSelectors = [
      ".leaflet-control-measure",
      "#coordinateLocator",
      "#boxZoomIn",
      "#boxZoomOut",
      ".leaflet-control-customgraticule",
      "#fullscreen",
      "#screenShoter",
      "#pdfPrinter",
      "#consultData",
      "#loadLayersButton",
    ];

    let prevElem = null;
    desiredSelectors.forEach((sel) => {
      const el = leftContainer.querySelector(sel);
      if (el) {
        if (prevElem === null) {
          if (leftContainer.firstElementChild !== el) {
            leftContainer.prepend(el);
          }
        } else {
          if (prevElem.nextElementSibling !== el) {
            prevElem.after(el);
          }
        }
        prevElem = el;
      }
    });
  }

  /**
   * Sincroniza ambas barras evitando bucles de reentrada.
   */
  syncAll() {
    if (this.isSyncing) return;
    this.isSyncing = true;
    try {
      this.ensureRightTopPosition();
      this.orderLeftToolbar();
    } finally {
      setTimeout(() => {
        this.isSyncing = false;
      }, 30);
    }
  }

  /**
   * Alterna la visibilidad de los controles dependientes.
   * Si se pulsa la llave inglesa (hideBtnLeft): oculta/muestra los botones horizontales (.leaflet-top.leaflet-left).
   * Si se pulsa el lápiz (hideBtnRight): oculta/muestra la barra de dibujo (.leaflet-top.leaflet-right).
   */
  toggleToolbarVisibility(btnTool) {
    if (!btnTool) return;
    let anyVisible = false;
    btnTool.childNodes.forEach((node) => {
      if (node.nodeType === 1 && node.id !== "hideBtnRight" && node.id !== "hideBtnLeft") {
        if (!node.hidden && node.style.display !== "none") {
          anyVisible = true;
        }
      }
    });

    const shouldHide = anyVisible;
    btnTool.childNodes.forEach((node) => {
      if (node.nodeType === 1 && node.id !== "hideBtnRight" && node.id !== "hideBtnLeft") {
        node.hidden = shouldHide;
        node.style.display = shouldHide ? "none" : "";
      }
    });
  }

  /**
   * Oculta o muestra una barra según el parámetro booleano.
   */
  hideToolbar(toolbar, show) {
    if (!toolbar) return;
    toolbar.childNodes.forEach((node) => {
      if (node.nodeType === 1 && node.id !== "hideBtnRight" && node.id !== "hideBtnLeft") {
        node.hidden = !show;
        node.style.display = !show ? "none" : "";
      }
    });
  }

  /**
   * Inicializa el componente y los observadores automáticos para estabilidad continua.
   */
  createComponent(showToolbar) {
    this.createBtn(
      "map-toolbar-icon-left",
      "hideBtnLeft",
      "Esconder herramientas",
      "fa-solid fa-wrench",
    );
    this.createBtn(
      "map-toolbar-icon-right",
      "hideBtnRight",
      "Esconder herramientas de dibujo",
      "bx bxs-pencil",
    );

    const observeContainer = (selector) => {
      const el = document.querySelector(selector);
      if (el && window.MutationObserver) {
        const observer = new MutationObserver(() => {
          this.syncAll();
        });
        observer.observe(el, { childList: true });
      }
    };

    observeContainer(".leaflet-top.leaflet-right");
    observeContainer(".leaflet-top.leaflet-left");

    const apply = () => {
      this.syncAll();
      const rightToolbar = document.querySelector(".leaflet-top.leaflet-right");
      const leftToolbar = document.querySelector(".leaflet-top.leaflet-left");
      if (rightToolbar && typeof showToolbar === "boolean" && !showToolbar) {
        this.hideToolbar(rightToolbar, showToolbar);
      }
      if (leftToolbar && typeof showToolbar === "boolean" && !showToolbar) {
        this.hideToolbar(leftToolbar, showToolbar);
      }
    };

    if (document.readyState === "complete") {
      apply();
    } else {
      window.addEventListener("load", apply);
    }

    [100, 300, 600, 1000, 1800, 2800, 4000].forEach((ms) => {
      setTimeout(apply, ms);
    });
  }
}
