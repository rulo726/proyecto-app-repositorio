import React, { useEffect, useRef } from 'react';
import htm from 'htm';

const html = htm.bind(React.createElement);

/**
 * Componente de mapa interactivo con Leaflet.
 * Dibuja:
 * - Marcador de base/almacén
 * - Pines numerados por orden de visita y color por técnico
 * - Polilíneas reales por carretera (OSRM) diferenciadas por técnico
 */
export function MapView({
  depot,
  clinics,
  routes,
  routeGeometries,
  selectedTechId,
  mapPickMode,
  onMapClickLocation,
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const layerGroupRef = useRef(null);
  const pickModeRef = useRef(mapPickMode);
  const onMapClickRef = useRef(onMapClickLocation);

  pickModeRef.current = mapPickMode;
  onMapClickRef.current = onMapClickLocation;

  // Inicializar mapa Leaflet una sola vez
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [depot.lat, depot.lng],
      zoom: 12,
      zoomControl: true,
    });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap &copy; CARTO',
      maxZoom: 19,
    }).addTo(map);

    const group = L.layerGroup().addTo(map);
    mapRef.current = map;
    layerGroupRef.current = group;

    map.on('click', (e) => {
      if (pickModeRef.current && onMapClickRef.current) {
        onMapClickRef.current({
          lat: e.latlng.lat,
          lng: e.latlng.lng,
          address: `${e.latlng.lat.toFixed(5)}, ${e.latlng.lng.toFixed(5)}`,
        });
      }
    });

    return () => {
      map.remove();
      mapRef.current = null;
      layerGroupRef.current = null;
    };
  }, []);

  // Cambiar cursor cuando está activo el modo "Elegir en mapa"
  useEffect(() => {
    if (!containerRef.current) return;
    containerRef.current.style.cursor = mapPickMode ? 'crosshair' : '';
  }, [mapPickMode]);

  // Redibujar pines y polilíneas cuando cambien rutas, clínicas o filtro de técnico
  useEffect(() => {
    const map = mapRef.current;
    const group = layerGroupRef.current;
    if (!map || !group) return;

    group.clearLayers();
    const boundsPoints = [];

    // 1. Pin del punto de partida
    const depotIcon = L.divIcon({
      className: '',
      html: `<div class="depot-pin" title="${depot.name}">🏢</div>`,
      iconSize: [36, 36],
      iconAnchor: [18, 18],
    });

    L.marker([depot.lat, depot.lng], { icon: depotIcon, zIndexOffset: 500 })
      .bindPopup(
        `<div style="font-size:12px">
          <strong>🏢 ${depot.name}</strong><br/>
          <span>Punto de partida</span><br/>
          <span style="color:#64748b">${depot.address || ''}</span>
        </div>`
      )
      .addTo(group);
    boundsPoints.push([depot.lat, depot.lng]);

    // 2. Si ya hay rutas calculadas, dibujar polilíneas y pines asignados
    if (routes && routes.length > 0) {
      const visibleRoutes =
        selectedTechId === 'all'
          ? routes
          : routes.filter((r) => r.technician.id === selectedTechId);

      visibleRoutes.forEach((route) => {
        const techColor = route.technician.color;
        const coords = routeGeometries[route.technician.id] || [];

        if (coords.length >= 2) {
          L.polyline(coords, {
            color: techColor,
            weight: 5,
            opacity: 0.85,
            lineJoin: 'round',
          }).addTo(group);
        }

        route.stops.forEach((stop) => {
          const { clinic } = stop;
          const urgentClass = clinic.priority === 'Urgente' ? 'clinic-pin--urgent' : '';
          const pinIcon = L.divIcon({
            className: '',
            html: `<div class="clinic-pin ${urgentClass}" style="background:${techColor}">${stop.order}</div>`,
            iconSize: [30, 30],
            iconAnchor: [15, 15],
          });

          L.marker([clinic.lat, clinic.lng], { icon: pinIcon })
            .bindPopup(
              `<div style="font-size:12px; min-width:180px">
                <div style="font-weight:700; color:${techColor}">${route.technician.name} · Parada #${stop.order}</div>
                <div style="font-weight:700; margin-top:2px">${clinic.name}</div>
                ${clinic.priority === 'Urgente' ? '<div style="color:#dc2626;font-weight:700">🚨 Prioridad URGENTE</div>' : ''}
                <div style="margin-top:4px; color:#334155">
                  🕒 Llegada est.: <strong>${stop.etaHHMM}</strong><br/>
                  🛠️ Reparación: ${stop.repairMinutes} min
                </div>
                <div style="margin-top:3px; color:#64748b; font-size:11px">${clinic.address || ''}</div>
              </div>`
            )
            .addTo(group);

          boundsPoints.push([clinic.lat, clinic.lng]);
        });
      });
    } else {
      // Sin rutas aún: mostrar pines neutros para todas las clínicas cargadas
      clinics.forEach((clinic, idx) => {
        const urgentClass = clinic.priority === 'Urgente' ? 'clinic-pin--urgent' : '';
        const pinIcon = L.divIcon({
          className: '',
          html: `<div class="clinic-pin ${urgentClass}" style="background:#475569">${idx + 1}</div>`,
          iconSize: [30, 30],
          iconAnchor: [15, 15],
        });

        L.marker([clinic.lat, clinic.lng], { icon: pinIcon })
          .bindPopup(
            `<div style="font-size:12px">
              <strong>${clinic.name}</strong><br/>
              <span>🛠️ ${clinic.repairMinutes} min · ${clinic.priority}</span><br/>
              <span style="color:#64748b">${clinic.address || ''}</span>
            </div>`
          )
          .addTo(group);

        boundsPoints.push([clinic.lat, clinic.lng]);
      });
    }

    if (boundsPoints.length === 1) {
      map.setView(boundsPoints[0], 13);
    } else if (boundsPoints.length > 1) {
      map.fitBounds(boundsPoints, { padding: [45, 45], maxZoom: 15 });
    }
  }, [depot, clinics, routes, routeGeometries, selectedTechId]);

  return html`
    <div class="relative w-full h-full min-h-[380px] lg:min-h-[540px] rounded-xl overflow-hidden border border-slate-200 bg-slate-100 shadow-sm">
      <div ref=${containerRef} class="w-full h-full min-h-[380px] lg:min-h-[540px]"></div>

      ${mapPickMode && html`
        <div class="absolute top-3 left-1/2 -translate-x-1/2 z-[400] bg-blue-600 text-white text-xs font-semibold px-3.5 py-2 rounded-full shadow-lg flex items-center gap-2">
          <span>📍 Haz clic en el mapa para ubicar ${mapPickMode === 'depot' ? 'el punto de partida' : 'la clínica'}</span>
        </div>
      `}

      ${routes && routes.length > 0 && html`
        <div class="absolute bottom-3 left-3 z-[400] bg-white/95 backdrop-blur px-3 py-2 rounded-lg border border-slate-200 shadow-md flex flex-wrap gap-3 text-xs">
          ${routes.map((r) => html`
            <div key=${r.technician.id} class="flex items-center gap-1.5">
              <span
                class="w-3 h-3 rounded-full"
                style=${{ backgroundColor: r.technician.color }}
              ></span>
              <span class="font-medium text-slate-700">${r.technician.name} (${r.stops.length})</span>
            </div>
          `)}
        </div>
      `}
    </div>
  `;
}
