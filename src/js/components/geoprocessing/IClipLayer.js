"use strict";

class IClipLayer {
  constructor() {
    this.name = "Recortar capa";
    this.namePrefix = "recorte_";
    this.selectedLayerName = null;
    this.selectedFormat = "geojson";
    this.isDrawing = false;
  }

  getFields() {
    return [
      {
        name: "Capa",
        title: "Capa a recortar",
        element: "select",
        id: "select-capa",
        references: "drawedLayers",
        allowedTypes: ["polygon", "rectangle"],
      },
      {
        name: "Formato",
        title: "Formato de descarga",
        element: "select",
        id: "select-formato",
        options: [
          { value: "geojson", text: "GeoJSON (.geojson)" },
          { value: "kml", text: "KML (.kml)" },
          { value: "shp", text: "Shapefile (.zip / GeoJSON)" },
        ],
      },
      {
        name: "Dibujar Polígono",
        element: "button",
        id: "drawPolygonBtn",
        onclick: () => this.drawPolygon(),
      },
      {
        name: "Dibujar Rectángulo",
        element: "button",
        id: "drawRectangleBtn",
        onclick: () => this.drawRectangle(),
      },
    ];
  }

  drawPolygon() {
    if (typeof L === "undefined" || !L.Draw || !L.Draw.Polygon) {
      new UserMessage("Herramienta de dibujo no disponible.", true, "error");
      return;
    }
    this.clearPreviousSelection();
    const drawPolygon = new L.Draw.Polygon(mapa, {
      shapeOptions: {
        color: "#008dc9",
        fillColor: "#008dc9",
        fillOpacity: 0.25,
        weight: 3,
      },
    });
    this.currentDrawHandler = drawPolygon;
    isSelectionDrawingActive = true;
    $("#drawPolygonBtn").addClass("ag-btn-disabled");
    $("#drawRectangleBtn").addClass("ag-btn-disabled");

    $("#msgClipStatus")
      .html(
        "Haga clic en el mapa para trazar los vértices. Cierre haciendo clic en el <b>primer punto</b> o <b>doble clic</b>." +
        " <button id='btnFinishPolygon' type='button' class='btn btn-xs btn-primary' style='margin-left:8px;padding:2px 8px;font-size:11px;'>Cerrar forma</button>" +
        " <button id='btnCancelClipDraw' type='button' class='btn btn-xs btn-default' style='margin-left:4px;padding:2px 8px;font-size:11px;'>Cancelar</button>"
      )
      .removeClass("hidden")
      .css("color", "#333");

    $("#btnFinishPolygon").off("click").on("click", (e) => {
      e.preventDefault();
      if (this.currentDrawHandler && typeof this.currentDrawHandler.completeShape === "function") {
        this.currentDrawHandler.completeShape();
      }
    });

    $("#btnCancelClipDraw").off("click").on("click", (e) => {
      e.preventDefault();
      this.cancelDrawing();
    });

    const onMapDblClick = (e) => {
      if (this.currentDrawHandler && typeof this.currentDrawHandler.completeShape === "function") {
        if (this.currentDrawHandler._markers && this.currentDrawHandler._markers.length >= 3) {
          if (e && e.originalEvent) {
            L.DomEvent.stopPropagation(e.originalEvent);
          }
          this.currentDrawHandler.completeShape();
        }
      }
    };
    mapa.on("dblclick", onMapDblClick);

    const onDrawFinished = () => {
      mapa.off("dblclick", onMapDblClick);
      mapa.off("draw:created", onDrawFinished);
      mapa.off("draw:drawstop", onDrawFinished);
      isSelectionDrawingActive = false;
      $("#drawPolygonBtn").removeClass("ag-btn-disabled");
      $("#drawRectangleBtn").removeClass("ag-btn-disabled");
      this.currentDrawHandler = null;
    };

    mapa.once("draw:created", onDrawFinished);
    mapa.once("draw:drawstop", onDrawFinished);

    drawPolygon.enable();
  }

  drawRectangle() {
    if (typeof L === "undefined" || !L.Draw || !L.Draw.Rectangle) {
      new UserMessage("Herramienta de dibujo no disponible.", true, "error");
      return;
    }
    this.clearPreviousSelection();
    const drawRectangle = new L.Draw.Rectangle(mapa, {
      shapeOptions: {
        color: "#008dc9",
        fillColor: "#008dc9",
        fillOpacity: 0.25,
        weight: 3,
      },
    });
    this.currentDrawHandler = drawRectangle;
    isSelectionDrawingActive = true;
    $("#drawPolygonBtn").addClass("ag-btn-disabled");
    $("#drawRectangleBtn").addClass("ag-btn-disabled");

    $("#msgClipStatus")
      .html(
        "Haga clic y arrastre en el mapa para trazar el rectángulo." +
        " <button id='btnCancelClipDraw' type='button' class='btn btn-xs btn-default' style='margin-left:8px;padding:2px 8px;font-size:11px;'>Cancelar</button>"
      )
      .removeClass("hidden")
      .css("color", "#333");

    $("#btnCancelClipDraw").off("click").on("click", (e) => {
      e.preventDefault();
      this.cancelDrawing();
    });

    const onDrawFinished = () => {
      mapa.off("draw:created", onDrawFinished);
      mapa.off("draw:drawstop", onDrawFinished);
      isSelectionDrawingActive = false;
      $("#drawPolygonBtn").removeClass("ag-btn-disabled");
      $("#drawRectangleBtn").removeClass("ag-btn-disabled");
      this.currentDrawHandler = null;
    };

    mapa.once("draw:created", onDrawFinished);
    mapa.once("draw:drawstop", onDrawFinished);

    drawRectangle.enable();
  }

  cancelDrawing() {
    if (this.currentDrawHandler && typeof this.currentDrawHandler.disable === "function") {
      try {
        this.currentDrawHandler.disable();
      } catch (e) {}
    }
    this.currentDrawHandler = null;
    isSelectionDrawingActive = false;
    $("#drawPolygonBtn").removeClass("ag-btn-disabled");
    $("#drawRectangleBtn").removeClass("ag-btn-disabled");
    $("#msgClipStatus")
      .html("Dibujo cancelado. Puede volver a dibujar o seleccionar otra herramienta.")
      .removeClass("hidden")
      .css("color", "#777");
  }

  clearPreviousSelection() {
    if (this.currentDrawHandler && typeof this.currentDrawHandler.disable === "function") {
      try {
        this.currentDrawHandler.disable();
      } catch (e) {}
    }
    this.currentDrawHandler = null;
    isSelectionDrawingActive = false;
    $("#drawPolygonBtn").removeClass("ag-btn-disabled");
    $("#drawRectangleBtn").removeClass("ag-btn-disabled");

    if (typeof drawnItems !== "undefined" && drawnItems && drawnItems._layers) {
      Object.values(drawnItems._layers).forEach((lyr) => {
        if (
          lyr &&
          ((lyr.id && String(lyr.id).includes("selection_")) ||
            (lyr.name && String(lyr.name).includes("selection_")) ||
            (lyr.options && lyr.options.fillColor === "#008dc9" && lyr.options.color === "#008dc9"))
        ) {
          drawnItems.removeLayer(lyr);
        }
      });
    }

    if (mapa && mapa.editableLayers) {
      ["polygon", "rectangle"].forEach((type) => {
        if (mapa.editableLayers[type]) {
          for (let i = mapa.editableLayers[type].length - 1; i >= 0; i--) {
            const lyr = mapa.editableLayers[type][i];
            if (
              lyr &&
              ((lyr.id && String(lyr.id).includes("selection_")) ||
                (lyr.name && String(lyr.name).includes("selection_")) ||
                (lyr.options && lyr.options.fillColor === "#008dc9" && lyr.options.color === "#008dc9"))
            ) {
              if (typeof drawnItems !== "undefined" && drawnItems && drawnItems.hasLayer(lyr)) {
                drawnItems.removeLayer(lyr);
              }
              mapa.editableLayers[type].splice(i, 1);
            }
          }
        }
      });
    }
  }

  cleanupDrawnShape(drawnShape) {
    if (this.currentDrawHandler && typeof this.currentDrawHandler.disable === "function") {
      try {
        this.currentDrawHandler.disable();
      } catch (e) {}
    }
    this.currentDrawHandler = null;
    isSelectionDrawingActive = false;

    if (drawnShape) {
      if (typeof drawnItems !== "undefined" && drawnItems && drawnItems.hasLayer(drawnShape)) {
        drawnItems.removeLayer(drawnShape);
      }
      if (typeof mapa !== "undefined" && mapa && mapa.hasLayer(drawnShape)) {
        mapa.removeLayer(drawnShape);
      }
      if (typeof mapa !== "undefined" && mapa && typeof mapa.deleteLayer === "function") {
        try {
          if (drawnShape.name) mapa.deleteLayer(drawnShape.name);
          if (drawnShape.id) mapa.deleteLayer(drawnShape.id);
        } catch (e) {}
      }
    }
    this.clearPreviousSelection();
  }

  getDrawnShape() {
    let drawn = null;
    if (mapa && mapa.editableLayers) {
      if (mapa.editableLayers.polygon && mapa.editableLayers.polygon.length > 0) {
        drawn = mapa.editableLayers.polygon.find(
          (lyr) => lyr && lyr.id && String(lyr.id).includes("selection_"),
        );
        if (!drawn) {
          drawn = mapa.editableLayers.polygon[mapa.editableLayers.polygon.length - 1];
        }
      }
      if (!drawn && mapa.editableLayers.rectangle && mapa.editableLayers.rectangle.length > 0) {
        drawn = mapa.editableLayers.rectangle.find(
          (lyr) => lyr && lyr.id && String(lyr.id).includes("selection_"),
        );
        if (!drawn) {
          drawn = mapa.editableLayers.rectangle[mapa.editableLayers.rectangle.length - 1];
        }
      }
    }
    return drawn;
  }

  getPolygonWkt(drawnShape) {
    if (!drawnShape) return null;
    let latlngs = null;
    if (typeof drawnShape.getLatLngs === "function") {
      latlngs = drawnShape.getLatLngs();
      while (Array.isArray(latlngs) && latlngs.length > 0 && Array.isArray(latlngs[0])) {
        latlngs = latlngs[0];
      }
    } else if (drawnShape._latlngs) {
      latlngs = drawnShape._latlngs;
      while (Array.isArray(latlngs) && latlngs.length > 0 && Array.isArray(latlngs[0])) {
        latlngs = latlngs[0];
      }
    }

    if (!latlngs || latlngs.length < 3) return null;

    const coords = latlngs.map((ll) => [ll.lng, ll.lat]);
    const first = coords[0];
    const last = coords[coords.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) {
      coords.push(first);
    }

    const wktPairs = coords.map((c) => `${c[0]} ${c[1]}`).join(", ");
    return `POLYGON((${wktPairs}))`;
  }

  getClipPolygonTurf(drawnShape) {
    if (!drawnShape) return null;
    try {
      if (typeof drawnShape.toGeoJSON === "function") {
        const gj = drawnShape.toGeoJSON();
        if (gj && gj.geometry && gj.geometry.type === "Polygon") {
          return turf.polygon(gj.geometry.coordinates);
        }
      }
    } catch (e) {}

    let latlngs = null;
    if (typeof drawnShape.getLatLngs === "function") {
      latlngs = drawnShape.getLatLngs();
    } else if (drawnShape._latlngs) {
      latlngs = drawnShape._latlngs;
    }
    while (Array.isArray(latlngs) && latlngs.length > 0 && Array.isArray(latlngs[0])) {
      latlngs = latlngs[0];
    }
    if (!latlngs || latlngs.length < 3) return null;

    const coords = latlngs.map((ll) => [ll.lng, ll.lat]);
    const first = coords[0];
    const last = coords[coords.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) {
      coords.push(first);
    }
    return turf.polygon([coords]);
  }

  clipFeatureCollection(sourceGeoJSON, clipPoly) {
    if (!sourceGeoJSON || !sourceGeoJSON.features || typeof turf === "undefined") {
      return sourceGeoJSON;
    }

    const clippedFeatures = [];
    let boundary = null;
    try {
      boundary = turf.polygonToLine(clipPoly);
    } catch (e) {}

    turf.featureEach(sourceGeoJSON, (feature) => {
      if (!feature || !feature.geometry) return;
      const geomType = feature.geometry.type;

      if (geomType === "Polygon" || geomType === "MultiPolygon") {
        try {
          const clipped = turf.intersect(feature, clipPoly);
          if (
            clipped &&
            clipped.geometry &&
            clipped.geometry.coordinates &&
            clipped.geometry.coordinates.length > 0
          ) {
            clipped.properties = Object.assign({}, feature.properties);
            clippedFeatures.push(clipped);
          }
        } catch (err) {
          console.warn("Error recortando polígono:", err);
        }
      } else if (geomType === "Point") {
        try {
          if (turf.booleanPointInPolygon(feature, clipPoly)) {
            clippedFeatures.push(JSON.parse(JSON.stringify(feature)));
          }
        } catch (err) {}
      } else if (geomType === "MultiPoint") {
        try {
          const inside = feature.geometry.coordinates.filter((coord) => {
            return turf.booleanPointInPolygon(turf.point(coord), clipPoly);
          });
          if (inside.length > 0) {
            clippedFeatures.push({
              type: "Feature",
              properties: Object.assign({}, feature.properties),
              geometry: {
                type: "MultiPoint",
                coordinates: inside,
              },
            });
          }
        } catch (err) {}
      } else if (geomType === "LineString") {
        try {
          if (turf.booleanWithin(feature, clipPoly)) {
            clippedFeatures.push(JSON.parse(JSON.stringify(feature)));
          } else if (boundary && turf.booleanIntersects(feature, clipPoly)) {
            const split = turf.lineSplit(feature, boundary);
            if (split && split.features && split.features.length > 0) {
              split.features.forEach((segment) => {
                const c = segment.geometry.coordinates;
                if (c.length >= 2) {
                  const mid = turf.midpoint(
                    turf.point(c[0]),
                    turf.point(c[c.length - 1]),
                  );
                  if (turf.booleanPointInPolygon(mid, clipPoly)) {
                    segment.properties = Object.assign({}, feature.properties);
                    clippedFeatures.push(segment);
                  }
                }
              });
            }
          }
        } catch (err) {
          console.warn("Error recortando línea:", err);
        }
      } else if (geomType === "MultiLineString") {
        try {
          feature.geometry.coordinates.forEach((lineCoords) => {
            const singleLine = turf.lineString(lineCoords, feature.properties);
            if (turf.booleanWithin(singleLine, clipPoly)) {
              clippedFeatures.push(singleLine);
            } else if (boundary && turf.booleanIntersects(singleLine, clipPoly)) {
              const split = turf.lineSplit(singleLine, boundary);
              if (split && split.features && split.features.length > 0) {
                split.features.forEach((segment) => {
                  const c = segment.geometry.coordinates;
                  if (c.length >= 2) {
                    const mid = turf.midpoint(
                      turf.point(c[0]),
                      turf.point(c[c.length - 1]),
                    );
                    if (turf.booleanPointInPolygon(mid, clipPoly)) {
                      segment.properties = Object.assign({}, feature.properties);
                      clippedFeatures.push(segment);
                    }
                  }
                });
              }
            }
          });
        } catch (err) {
          console.warn("Error recortando multilínea:", err);
        }
      }
    });

    return turf.featureCollection(clippedFeatures);
  }

  geojsonToKml(geojson, docName = "Recorte") {
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
      const name =
        (feat.properties &&
          (feat.properties.nombre ||
            feat.properties.name ||
            feat.properties.title ||
            feat.properties.id)) ||
        `Elemento ${i + 1}`;
      let desc = "";
      let extData = "";
      if (feat.properties) {
        const rows = Object.entries(feat.properties)
          .map(([k, v]) => `<b>${k}:</b> ${v}`)
          .join("<br/>");
        desc = `<description><![CDATA[${rows}]]></description>`;

        const dataEntries = Object.entries(feat.properties)
          .filter(([k]) => k !== "bbox" && k !== "styles")
          .map(([k, v]) => {
            const cleanVal =
              v !== undefined && v !== null
                ? String(v)
                    .replace(/&/g, "&amp;")
                    .replace(/</g, "&lt;")
                    .replace(/>/g, "&gt;")
                : "";
            return `      <Data name="${k}"><value>${cleanVal}</value></Data>`;
          })
          .join("\n");
        if (dataEntries) {
          extData = `    <ExtendedData>\n${dataEntries}\n    </ExtendedData>\n`;
        }
      }
      placemarks += `    <Placemark>
      <name>${name}</name>
      ${desc}
${extData}      ${geomToKml(feat.geometry)}
    </Placemark>\n`;
    });

    return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
<Document>
  <name>${docName}</name>
${placemarks}</Document>
</kml>`;
  }

  getWfsUrl(wmsHost) {
    if (!wmsHost) return "";
    let url = wmsHost.trim().split("?")[0];
    if (/\/wms\/?$/i.test(url)) {
      return url.replace(/\/wms\/?$/i, "/wfs");
    } else if (/\/ows\/?$/i.test(url)) {
      return url.replace(/\/ows\/?$/i, "/wfs");
    } else if (url.includes("/geoserver/")) {
      return url.replace(/\/geoserver\/.*$/i, "/geoserver/wfs");
    } else {
      return url.replace(/wms/gi, "wfs");
    }
  }

  async detectGeometryColumn(wfsUrl, typeName) {
    // 1. Probar DescribeFeatureType con formato JSON
    try {
      const urlJson = `${wfsUrl}?service=WFS&version=1.1.0&request=DescribeFeatureType&typeName=${encodeURIComponent(typeName)}&outputFormat=application/json`;
      const resJson = await fetch(urlJson);
      if (resJson.ok) {
        const ct = resJson.headers.get("content-type") || "";
        if (ct.includes("json")) {
          const data = await resJson.json();
          if (data && data.featureTypes && data.featureTypes[0] && data.featureTypes[0].properties) {
            for (const prop of data.featureTypes[0].properties) {
              const type = (prop.type || prop.localType || "").toLowerCase();
              if (
                type.includes("geom") ||
                type.includes("polygon") ||
                type.includes("surface") ||
                type.includes("line") ||
                type.includes("point") ||
                type.includes("curve")
              ) {
                return prop.name;
              }
            }
          }
        }
      }
    } catch (err) {
      console.warn("No se pudo obtener DescribeFeatureType en JSON, probando XML...", err);
    }

    // 2. Probar DescribeFeatureType en formato estándar XML
    try {
      const urlXml = `${wfsUrl}?service=WFS&version=1.1.0&request=DescribeFeatureType&typeName=${encodeURIComponent(typeName)}`;
      const resXml = await fetch(urlXml);
      if (resXml.ok) {
        const text = await resXml.text();
        if (text.includes("ExceptionReport") || text.includes("ServiceException")) {
          throw new Error("La capa seleccionada no admite servicio WFS o no es una capa vectorial.");
        }
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(text, "text/xml");
        const elements = xmlDoc.querySelectorAll("element");
        for (let i = 0; i < elements.length; i++) {
          const el = elements[i];
          const type = (el.getAttribute("type") || "").toLowerCase();
          if (
            type.startsWith("gml:") ||
            type.includes("geometry") ||
            type.includes("polygon") ||
            type.includes("surface") ||
            type.includes("line") ||
            type.includes("point")
          ) {
            return el.getAttribute("name");
          }
        }
      }
    } catch (err) {
      if (err.message && err.message.includes("no admite")) throw err;
      console.warn("No se pudo parsear DescribeFeatureType XML, usando campo por defecto 'the_geom'.", err);
    }

    return "the_geom";
  }

  isVectorLayer(layerName) {
    if (typeof gestorMenu !== "undefined") {
      if (gestorMenu.layersDataForWfs && gestorMenu.layersDataForWfs.hasOwnProperty(layerName)) {
        return true;
      }
      const data = gestorMenu.getLayerData ? gestorMenu.getLayerData(layerName) : null;
      if (data && data.capa) {
        if (data.capa.tipo === "raster") return false;
        if (typeof capaEsVector === "function" && capaEsVector(data.capa)) return true;
        return true;
      }
    }

    if (typeof addedLayers !== "undefined") {
      const added = addedLayers.find((l) => l.name === layerName || l.id === layerName);
      if (added && (added.type === "geoprocess" || added.type === "geojson" || added.type === "shp" || added.type === "kml" || added.type === "WFS" || added.type === "WMS")) {
        return true;
      }
    }

    return true;
  }

  findLayerInfo(layerName) {
    // 1. gestorMenu.getActiveLayersWithoutBasemap()
    if (typeof gestorMenu !== "undefined") {
      if (typeof gestorMenu.getActiveLayersWithoutBasemap === "function") {
        try {
          const activeWithoutBase = gestorMenu.getActiveLayersWithoutBasemap();
          const found = activeWithoutBase.find((l) => l.name === layerName);
          if (found && (found.host || (found.capa && found.capa.host))) {
            return {
              name: layerName,
              title: found.title || layerName,
              host: found.host || found.capa.host,
            };
          }
        } catch (e) {}
      }

      // 2. gestorMenu.getLayerData()
      if (typeof gestorMenu.getLayerData === "function") {
        try {
          const lData = gestorMenu.getLayerData(layerName);
          if (lData && (lData.host || lData.url || (lData.capa && lData.capa.host))) {
            let host = lData.host || (lData.capa && lData.capa.host) || lData.url;
            if (host && !host.endsWith("/wms") && !host.endsWith("/wfs")) {
              host = host + "/wms";
            }
            return {
              name: layerName,
              title: lData.title || layerName,
              host: host,
            };
          }
        } catch (e) {}
      }

      // 3. gestorMenu.layersDataForWfs
      if (gestorMenu.layersDataForWfs && gestorMenu.layersDataForWfs[layerName]) {
        const wfs = gestorMenu.layersDataForWfs[layerName];
        if (wfs.host) {
          return {
            name: layerName,
            title: wfs.title || layerName,
            host: wfs.host,
          };
        }
      }

      // 4. gestorMenu.items traversal
      if (gestorMenu.items) {
        for (const secKey in gestorMenu.items) {
          const sec = gestorMenu.items[secKey];
          if (sec && sec.itemsComposite) {
            for (const itemKey in sec.itemsComposite) {
              const item = sec.itemsComposite[itemKey];
              if (!item) continue;
              if (item.capas && Array.isArray(item.capas)) {
                for (const c of item.capas) {
                  if (c.nombre === layerName) {
                    return {
                      name: layerName,
                      title: c.titulo || item.titulo || layerName,
                      host: c.host || sec.host,
                    };
                  }
                }
              }
              if (item.capa && item.capa.nombre === layerName) {
                return {
                  name: layerName,
                  title: item.capa.titulo || item.titulo || layerName,
                  host: item.capa.host || sec.host,
                };
              }
              if (item.nombre === layerName) {
                return {
                  name: layerName,
                  title: item.titulo || layerName,
                  host: (item.capa && item.capa.host) || sec.host || "",
                };
              }
            }
          }
        }
      }
    }

    // 5. app.getActiveLayers()
    if (typeof app !== "undefined" && typeof app.getActiveLayers === "function") {
      try {
        const activeLeaflet = app.getActiveLayers();
        for (const k in activeLeaflet) {
          const lyr = activeLeaflet[k];
          if (lyr && (lyr._name === layerName || lyr.name === layerName)) {
            const host = (lyr._source && lyr._source._url) || (lyr.options && lyr.options.url);
            if (host) {
              const title = (lyr._source && lyr._source.options && lyr._source.options.title) || lyr.name || layerName;
              return {
                name: layerName,
                title: title,
                host: host,
              };
            }
          }
        }
      } catch (e) {}
    }

    // 6. addedLayers
    if (typeof addedLayers !== "undefined") {
      const foundAdded = addedLayers.find((l) => l.name === layerName || l.id === layerName);
      if (foundAdded) {
        let host = foundAdded.host || (foundAdded.layer && foundAdded.layer.host);

        // Si no tiene host directo, buscar en servicesLoaded
        if (!host && typeof servicesLoaded !== "undefined") {
          const serviceId = foundAdded.id !== undefined ? foundAdded.id : (typeof layersIndex !== "undefined" ? layersIndex[layerName] : undefined);
          if (serviceId !== undefined && servicesLoaded[serviceId] && servicesLoaded[serviceId].host) {
            host = servicesLoaded[serviceId].host;
          }
        }

        // Si no, buscar en overlayMaps
        if (!host && typeof overlayMaps !== "undefined" && overlayMaps[layerName]) {
          const om = overlayMaps[layerName];
          host = om._url || (om.options && om.options.url);
        }

        if (host) {
          return {
            name: foundAdded.name || foundAdded.id,
            title: foundAdded.title || (foundAdded.layer && foundAdded.layer.title) || foundAdded.name || layerName,
            host: host,
          };
        } else if (foundAdded.layer && (foundAdded.layer.features || foundAdded.layer.type === "FeatureCollection")) {
          return {
            name: foundAdded.name || foundAdded.id,
            title: foundAdded.title || foundAdded.name || layerName,
            isLocalGeoJSON: true,
            localData: foundAdded.layer,
          };
        }
      }
    }

    // 7. Fallback global en overlayMaps
    if (typeof overlayMaps !== "undefined" && overlayMaps[layerName]) {
      const om = overlayMaps[layerName];
      const host = om._url || (om.options && om.options.url);
      if (host) {
        return {
          name: layerName,
          title: (om.options && (om.options.title || om.options.layers)) || layerName,
          host: host,
        };
      }
    }

    return null;
  }

  async executeClip() {
    const capaSelect = document.getElementById("select-capa") || document.getElementById("select-capaarecortar");
    const formatSelect = document.getElementById("select-formato") || document.getElementById("select-formatodedescarga");

    if (!capaSelect || !capaSelect.value) {
      new UserMessage("Por favor seleccione una capa vectorial activa para recortar.", true, "warning");
      return;
    }

    const layerName = capaSelect.value;
    const format = formatSelect ? formatSelect.value : "geojson";

    if (!this.isVectorLayer(layerName)) {
      new UserMessage("La capa seleccionada parece ser de tipo ráster. El recorte solo aplica a capas vectoriales.", true, "warning");
      return;
    }

    const drawnShape = this.getDrawnShape();
    if (!drawnShape) {
      new UserMessage("Por favor dibuje un polígono o rectángulo sobre el área a recortar.", true, "warning");
      return;
    }

    const cqlPolygon = this.getPolygonWkt(drawnShape);
    if (!cqlPolygon) {
      new UserMessage("Geometría de recorte no válida. Por favor vuelva a dibujarla.", true, "warning");
      return;
    }

    // Buscar información de la capa
    const layerInfo = this.findLayerInfo(layerName);
    if (!layerInfo) {
      new UserMessage("No se encontró la configuración del servicio para la capa seleccionada.", true, "error");
      return;
    }

    const isLocalGeoJSON = !!layerInfo.isLocalGeoJSON;
    const localGeoJSONData = layerInfo.localData;

    loadingBtn("on", "ejec_gp");
    const loaderEl = document.getElementById("download-loader");
    if (loaderEl) loaderEl.style.display = "none";
    if (typeof hideDownloadLoader === "function") hideDownloadLoader();

    try {
      const clipPoly = this.getClipPolygonTurf(drawnShape);
      if (!clipPoly) {
        throw new Error("No se pudo construir el polígono geométrico de recorte.");
      }

      const cleanLayerName = layerName.split(":").pop();

      // CASO A: Capa vectorial local GeoJSON
      if (isLocalGeoJSON && localGeoJSONData && typeof turf !== "undefined") {
        const clippedGeoJSON = this.clipFeatureCollection(localGeoJSONData, clipPoly);

        if (!clippedGeoJSON.features || clippedGeoJSON.features.length === 0) {
          throw new Error("El recorte no arrojó resultados. Ningún elemento cae dentro del polígono trazado.");
        }

        if (format === "kml") {
          const kmlText = this.geojsonToKml(clippedGeoJSON, `${cleanLayerName}_recorte`);
          const blob = new Blob([kmlText], { type: "application/vnd.google-earth.kml+xml" });
          downloadBlob(blob, `${cleanLayerName}_recorte.kml`);
        } else {
          const blob = new Blob([JSON.stringify(clippedGeoJSON, null, 2)], { type: "application/geo+json" });
          downloadBlob(blob, `${cleanLayerName}_recorte.geojson`);
        }

        if (geoProcessingManager && typeof geoProcessingManager.displayResult === "function") {
          geoProcessingManager.displayResult(clippedGeoJSON, drawnShape);
        }

        this.cleanupDrawnShape(drawnShape);
        new UserMessage("Capa recortada y descargada exitosamente.", true, "information");
        return;
      }

      // CASO B: Capa vectorial en GeoServer accesible por WFS
      const rawHost = layerInfo.host || "";
      const wfsUrl = this.getWfsUrl(rawHost);

      if (!wfsUrl) {
        throw new Error("No se pudo derivar la URL del servicio WFS para esta capa.");
      }

      // Detectar la columna de geometría
      const geomField = await this.detectGeometryColumn(wfsUrl, layerName);
      const cqlFilter = `INTERSECTS(${geomField},${cqlPolygon})`;

      // Petición WFS para obtener los elementos intersectantes en GeoJSON
      const geojsonParams = new URLSearchParams({
        service: "WFS",
        version: "1.0.0",
        request: "GetFeature",
        typeName: layerName,
        outputFormat: "application/json",
        srsName: "EPSG:4326",
        cql_filter: cqlFilter,
      });

      const geojsonUrl = `${wfsUrl}?${geojsonParams.toString()}`;
      const geojsonResp = await fetch(geojsonUrl);

      if (!geojsonResp.ok) {
        throw new Error(`Error en servidor WFS (${geojsonResp.status} ${geojsonResp.statusText}).`);
      }

      const geojsonText = await geojsonResp.text();
      if (geojsonText.includes("ExceptionReport") || geojsonText.includes("ServiceException")) {
        throw new Error("El servicio WFS rechazó la consulta espacial. Verifique que la capa sea vectorial y admita WFS.");
      }

      let parsedGeoJSON;
      try {
        parsedGeoJSON = JSON.parse(geojsonText);
      } catch (e) {
        throw new Error("La respuesta del servicio no es un GeoJSON válido.");
      }

      if (!parsedGeoJSON.features || parsedGeoJSON.features.length === 0) {
        throw new Error("El recorte no arrojó resultados. No se encontraron geometrías dentro del polígono seleccionado.");
      }

      // Realizar el RECORTE GEOMÉTRICO EXACTO con Turf
      const clippedGeoJSON = this.clipFeatureCollection(parsedGeoJSON, clipPoly);

      if (!clippedGeoJSON.features || clippedGeoJSON.features.length === 0) {
        throw new Error("El recorte no arrojó resultados. Ninguna geometría cae dentro del polígono trazado.");
      }

      // Descarga según formato
      if (format === "kml") {
        const kmlText = this.geojsonToKml(clippedGeoJSON, `${cleanLayerName}_recorte`);
        const blob = new Blob([kmlText], { type: "application/vnd.google-earth.kml+xml" });
        downloadBlob(blob, `${cleanLayerName}_recorte.kml`);
      } else if (format === "geojson") {
        const blob = new Blob([JSON.stringify(clippedGeoJSON, null, 2)], { type: "application/geo+json" });
        downloadBlob(blob, `${cleanLayerName}_recorte.geojson`);
      } else if (format === "shp") {
        // En GeoServer WFS el formato shape-zip no recorta geometrías a nivel submétrica/polígono (solo filtra).
        // Se descarga el GeoJSON recortado exactamente, el cual se puede abrir directamente en QGIS/ArcGIS.
        const blob = new Blob([JSON.stringify(clippedGeoJSON, null, 2)], { type: "application/geo+json" });
        downloadBlob(blob, `${cleanLayerName}_recorte.geojson`);
        new UserMessage("Se descargó en formato GeoJSON con el recorte geométrico exacto (compatible con QGIS y ArcGIS).", true, "information");
      }

      // Renderizar el resultado en el mapa a través del Geoprocessing Manager
      if (geoProcessingManager && typeof geoProcessingManager.displayResult === "function") {
        geoProcessingManager.displayResult(clippedGeoJSON, drawnShape);
      }

      // Eliminar polígono de selección del mapa
      this.cleanupDrawnShape(drawnShape);

      new UserMessage("Capa vectorial recortada y descargada exitosamente.", true, "information");
    } catch (err) {
      console.error(err);
      new UserMessage(err.message || "Ocurrió un error al ejecutar el recorte vectorial.", true, "error");
    } finally {
      loadingBtn("off", "ejec_gp");
      const loaderEl = document.getElementById("download-loader");
      if (loaderEl) loaderEl.style.display = "none";
      if (typeof hideDownloadLoader === "function") hideDownloadLoader();
    }
  }
}
