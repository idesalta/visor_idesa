<div align="center">
  <img src="src/styles/images/logoIDESAok-300x99.png" alt="IDESA - Infraestructura de Datos Espaciales de Salta" width="300" />
  <h1>Visor de Mapas IDESA</h1>
  <p><strong>Visor interactivo de información geográfica de la Provincia de Salta</strong></p>
  <p>
    <a href="https://github.com/idesalta/visor_idesa">
      <img src="https://img.shields.io/badge/GitHub-idesalta%2Fvisor__idesa-680205?style=flat&logo=github" alt="Repositorio GitHub" />
    </a>
  </p>
</div>

---

## Acerca del Proyecto

**MAPAS IDESA** es el visor geográfico interactivo de la **Infraestructura de Datos Espaciales de la Provincia de Salta (IDESA)**. Permite a ciudadanos, investigadores, organismos públicos e instituciones explorar, consultar, superponer y procesar datos espaciales provinciales y nacionales en tiempo real desde cualquier navegador web.

Este desarrollo toma como base tecnológica y funcional el visor de mapas de código abierto **[Argenmap][]**, creado y mantenido por el **[Instituto Geográfico Nacional (IGN)][]**, el cual está construido sobre la librería **[Leaflet][]**. A partir de esta sólida base, el equipo de IDESA ha incorporado optimizaciones, personalizaciones estéticas y nuevas herramientas especializadas.

---

## Mejoras Desarrolladas en el Visor IDESA

Respecto a la versión base de Argenmap, este visor incorpora las siguientes capacidades y mejoras:

1. **Geoproceso de Recorte de Capas Vectoriales (Clip Layer):**
   - Herramienta que permite seleccionar una capa vectorial activa y recortarla espacialmente a partir de un polígono dibujado por el usuario en pantalla.
   - Procesamiento geométrico en el cliente mediante **Turf.js**.
   - El resultado del recorte se incorpora automáticamente al árbol de capas como una nueva capa temática con estilo y visualización independiente.

2. **Consulta Interactiva (Popups) en Capas Locales, Externas y Recortadas:**
   - Habilitación de popups informativos al hacer clic sobre elementos de capas añadidas por el usuario en formatos **KML, GeoJSON, Shapefiles (.zip)** o servicios **WMS**.
   - Soporte de consulta de atributos para las capas resultantes de geoprocesos (como las capas recortadas).

3. **Nuevos Mapas Base Satelitales e Híbridos:**
   - Incorporación directa de capas base satelitales y satelitales con etiquetas de alta resolución (**Google Satellite** y **Google Hybrid**), sumadas a los mapas oficiales del **IGN**, **OpenStreetMap** y relieve **Esri Hillshade**.

4. **Identidad Visual y Personalización Institucional:**
   - Adaptación completa a la línea gráfica y cromática de IDESA (color distintivo `#680205`).
   - Modal institucional *"Acerca de IDESA"* con enlace al repositorio oficial y listado de funcionalidades.
   - Corrección y optimización visual en pestañas y menús desplegables de capas activas agregadas y geoprocesadas.

5. **Módulo Avanzado de Impresión y Exportación a PDF:**
   - **Ventana modal de configuración con vista previa interactiva:** Muestra en tiempo real una simulación fiel de la hoja (A4 o A3) antes de exportar, actualizándose al instante con cualquier cambio de título, orientación o capas.
   - **Aprovechamiento total del espacio de página (Sin franjas blancas):** El mapa llena el 100% del marco cartográfico asignado tanto en orientación **Horizontal (Apaisado)** como **Vertical (Retrato)** mediante recorte centrado (`cropCanvasToRatio`), eliminando los vacíos y bandas blancas de pantalla ancha.
   - **Diagramación equilibrada de referencias (Leyendas):** En orientación vertical, las referencias se organizan automáticamente en 2 columnas balanceadas por altura para evitar huecos o desfasajes; en horizontal, se integran en un panel lateral compacto.
   - **Captura cartográfica limpia:** Ocultación automática de los controles web de Leaflet (botones de zoom `+/-`, barra de dibujo, selector de capas) durante la exportación para que el mapa quede estrictamente cartográfico.
   - **Soporte satelital y WMS sin teselas faltantes ni timeouts:** Verificación activa de carga completa de todas las teselas antes de la captura (`complete === true`), resolviendo los bloqueos CORS y evitando recuadros en blanco.
   - **Personalización de metadatos institucionales:** Título editable, subtítulo u organismo, logotipo oficial de IDESA, fecha y hora de emisión, escala gráfica calibrada y rosa de los vientos (símbolo de norte).

6. **Herramienta de Búsqueda por Atributos y Consulta Alfanumérica (Filtros AND / OR):**
   - Herramienta con acceso directo en la botonera lateral (`fa-filter`) para consultar cualquier capa activa vectorial o de catálogo (por ejemplo Catastro / `fc_parcelas_v20`).
   - Carga dinámica de campos reales mediante `DescribeFeatureType` en GeoServer o inspección de propiedades locales.
   - Constructor de filtros con condiciones múltiples combinables por lógica `AND` (cumplir todas las condiciones) u `OR` (cumplir alguna condición), permitiendo buscar por ejemplo un catastro y un plano determinado en una misma consulta.
   - Resaltado y selección visual de los elementos encontrados sobre el mapa con auto-zoom centrado (`fitBounds`) y fichas de datos en popups interactivos.
   - Descarga directa de los elementos seleccionados en formato **KML** (para Google Earth / GPS) y **GeoJSON**, además de visualización en la tabla de atributos del visor.

7. **Panel de Capas Activas y Orden de Superposición (TOC con Drag & Drop):**
   - Acceso con botón dedicado en la botonera lateral izquierda (`fa-arrow-down-up-across-line`) y badge numérico amarillo en tiempo real.
   - **Reorganización interactiva mediante Arrastrar y Soltar (Drag & Drop):** Permite cambiar el orden de las capas encendidas tomando el tirador `⋮⋮`.
   - **Control de superposición en Leaflet y GeoServer WMS:** Aplica de inmediato el orden visual (`zIndex`, `bringToFront` y reordenamiento de subcapas WMS `_subLayers`) para garantizar que la capa superior quede siempre en primer plano.
   - **Deslizadores de opacidad continua:** Ajuste individual de 0% a 100% en tiempo real sin interferir con el arrastre de tarjetas.
   - **Desactivación sincronizada bidireccional (`🗑️`):** Al remover una capa activa, se apaga de inmediato en el mapa y en el menú general de capas, actualizando los contadores de cada categoría.
   - **Fijación en pantalla (Pin `📌`):** Permite fijar el panel para interactuar, navegar o consultar el mapa sin que la ventana se cierre al hacer clic.

8. **Ventana Flotante de Leyenda y Simbología Oficial (Icono Paleta 🎨):**
   - Botón de paleta de colores en cada capa activa para abrir su simbología oficial generada por GeoServer (`GetLegendGraphic`).
   - **Ventana flotante arrastrable con el mouse:** Se puede desplazar a cualquier sector de la pantalla tomando la cabecera.
   - **Fondo no bloqueante y sin desenfoque:** El mapa permanece 100% visible, nítido e interactivo por detrás de la ventana.
   - **Escala natural 1:1 con scroll vertical:** Ideal para leyendas complejas, anchas o con numerosas clases (como *Suelos del NOA*, *Unidades de Vegetación*, *OTBN*), eliminando distorsiones o aplastamientos y permitiendo un desplazamiento fluido.

9. **Estructura Dual del Menú de Capas (Pestañas DATOS y MUNICIPIOS):**
   - Organización en pestañas superiores dentro del menú de capas:
     - **DATOS:** Temáticas provinciales completas (Límites, Infraestructura, Clima, etc.).
     - **MUNICIPIOS:** Coberturas e información geográfica local clasificada por municipio (iniciando con *Rosario de Lerma*).
   - Compatible y gestionable mediante la aplicación administrativa `gestion datos_json` (Streamlit).

10. **Localización por Coordenadas (Sexagesimal GMS y Grados Decimales):**
   - Integrada en la barra de herramientas superior derecha junto a medición e impresión (`fa-location-crosshairs`).
   - Panel interactivo arrastrable con cajitas numéricas individuales para Grados (°), Minutos ('), Segundos (") y Hemisferio (Sur/Norte, Oeste/Este), además de pestaña para Grados Decimales.
   - Sincronización bidireccional instantánea entre ambos formatos al escribir.
   - Captura rápida de coordenadas del centro actual del mapa.
   - Marcador animado distintivo con efecto de pulso, auto-zoom centrado y ficha informativa en popup con botón de copia rápida al portapapeles.

11. **Herramienta de Zoom por Ventana (+ y -) (Box Zoom):**
   - Botones duales en la barra de herramientas para acercar (`fa-magnifying-glass-plus`) y alejar (`fa-magnifying-glass-minus`) mediante el trazado interactivo de un recuadro en el mapa con el mouse.
   - Cálculo automático de encuadre óptimo para acercamiento (`fitBounds`) o cálculo de escala y centrado para alejamiento proporcional al tamaño del recuadro dibujado.
   - Soporte para cancelación inmediata mediante la tecla `Escape`.

---

## Funcionalidades Principales

- Visualización y superposición de capas WMS y WMTS federadas de organismos provinciales y nacionales.
- Incorporación dinámica de capas desde archivos locales (**KML, GeoJSON, Shapefile .zip, GPX, WKT, TopoJSON**) o URLs remotas.
- Herramientas de dibujo, medición de distancias y cálculo de áreas.
- Consulta de datos por clic puntual o filtro geométrico espacial.
- Descarga de capturas de mapa en formato **PNG** y mapas compuestos en formato **PDF** con escala y leyendas.
- Generación de enlaces con parámetros de estado (coordenadas, zoom y capas activas visibles).

---

## Repositorio Oficial

El código fuente, reportes de problemas y mejoras de este proyecto se gestionan en:
👉 **[https://github.com/idesalta/visor_idesa](https://github.com/idesalta/visor_idesa)**

---

## Documentación y Enlaces

- [Guía de Instalación y Despliegue](src/docs/deployment.md)
- [Configuración de Capas, Mapas Base y Preferencias](src/docs/configuration.md)
- [Listado de Funcionalidades](src/docs/features.md)
- [Colaborar con el Proyecto](src/docs/contributing.md)
- [Infraestructura de Datos Espaciales de Salta (IDESA)](http://idesa.gob.ar/)
- [Instituto Geográfico Nacional (IGN)](https://www.ign.gob.ar)

[Argenmap]: https://github.com/ign-argentina/argenmap
[Instituto Geográfico Nacional (IGN)]: https://www.ign.gob.ar
[Leaflet]: https://leafletjs.com/
