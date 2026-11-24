/**
 * Utilidades de formateo y exportación de itinerarios:
 * - Texto estructurado para WhatsApp
 * - Enlace de ruta completa para Google Maps
 * - Enlaces directos por parada para Waze
 */

export function formatDuration(seconds) {
  const totalMin = Math.max(0, Math.round(seconds / 60));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}

export function formatDistance(meters) {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

/**
 * Genera el enlace oficial multi-parada de Google Maps Directions.
 */
export function buildGoogleMapsRouteUrl(depot, stops, returnToDepot) {
  if (!stops || stops.length === 0) return null;

  const origin = `${depot.lat},${depot.lng}`;
  const lastStop = stops[stops.length - 1].clinic;
  const destination = returnToDepot ? origin : `${lastStop.lat},${lastStop.lng}`;

  const waypointList = returnToDepot
    ? stops.map((s) => `${s.clinic.lat},${s.clinic.lng}`)
    : stops.slice(0, -1).map((s) => `${s.clinic.lat},${s.clinic.lng}`);

  const params = new URLSearchParams({
    api: '1',
    origin,
    destination,
    travelmode: 'driving',
  });

  if (waypointList.length > 0) {
    // Google Maps soporta hasta 9 waypoints en enlaces web estándar sin clave
    params.set('waypoints', waypointList.slice(0, 9).join('|'));
  }

  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

/**
 * Enlace directo de navegación a una parada en Waze.
 */
export function buildWazeStopUrl(lat, lng) {
  return `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`;
}

/**
 * Enlace directo de navegación a una parada en Google Maps.
 */
export function buildGoogleMapsStopUrl(lat, lng) {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
}

/**
 * Genera el mensaje completo formateado para copiar y pegar en WhatsApp.
 */
export function buildWhatsAppItineraryText(route, depot, returnToDepot) {
  const { technician, stops, returnLeg, summary } = route;

  if (!stops || stops.length === 0) {
    return `🔧 *${technician.name}*\nSin clínicas asignadas para hoy.`;
  }

  const lines = [
    `🚐 *ITINERARIO DIARIO - ${technician.name.toUpperCase()}*`,
    `📍 *Salida:* ${depot.name || depot.address} (${summary.startTimeHHMM})`,
    `📊 *Resumen:* ${summary.stopCount} clínicas · ${formatDistance(summary.distanceMeters)} · Conducción ${formatDuration(summary.driveSeconds)} · Jornada total ${formatDuration(summary.totalShiftSeconds)}`,
    '',
  ];

  stops.forEach((stop) => {
    const urgentTag = stop.clinic.priority === 'Urgente' ? ' 🚨 *URGENTE*' : '';
    lines.push(`*${stop.order}. ${stop.clinic.name}*${urgentTag}`);
    lines.push(`   🕒 Llegada est.: *${stop.etaHHMM}* (Salida: ${stop.departureHHMM})`);
    lines.push(`   🚗 Traslado: ${formatDuration(stop.travelSecondsFromPrev)} (${formatDistance(stop.distanceMetersFromPrev)}) · 🛠️ Reparación: ${stop.repairMinutes} min`);
    if (stop.clinic.address) {
      lines.push(`   📌 ${stop.clinic.address}`);
    }
    lines.push(`   🧭 Waze: ${buildWazeStopUrl(stop.clinic.lat, stop.clinic.lng)}`);
    lines.push('');
  });

  if (returnToDepot && returnLeg) {
    lines.push(`🏁 *Regreso a Base:* ${depot.name || depot.address}`);
    lines.push(`   🕒 Llegada est.: *${returnLeg.etaHHMM}* (+${formatDuration(returnLeg.travelSeconds)} / ${formatDistance(returnLeg.distanceMeters)})`);
  } else {
    lines.push(`🏁 *Fin de jornada:* Última clínica (${summary.endTimeHHMM})`);
  }

  const fullMapsUrl = buildGoogleMapsRouteUrl(depot, stops, returnToDepot);
  if (fullMapsUrl) {
    lines.push('');
    lines.push(`🗺️ *Abrir ruta completa en Google Maps:*`);
    lines.push(fullMapsUrl);
  }

  return lines.join('\n');
}
