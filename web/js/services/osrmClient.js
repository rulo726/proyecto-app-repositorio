/**
 * Cliente para OSRM (Open Source Routing Machine) con fallback Haversine automático.
 * - Table API: calcula la matriz real de tiempos y distancias por carretera en 1 petición.
 * - Route API: obtiene las polilíneas reales calle por calle para dibujar el mapa.
 */

export const TECHNICIAN_COLORS = [
  '#2563eb', // Azul
  '#dc2626', // Rojo
  '#059669', // Esmeralda
  '#d97706', // Ámbar
  '#7c3aed', // Violeta
  '#0891b2', // Cian
  '#db2777', // Rosa
  '#4f46e5', // Índigo
  '#65a30d', // Lima
  '#ea580c', // Naranja
];

const OSRM_BASE = 'https://router.project-osrm.org';
const URBAN_DETOUR_FACTOR = 1.32;
const FALLBACK_SPEED_MPS = 32 / 3.6; // ~32 km/h promedio urbano

/**
 * Distancia geodésica Haversine en metros entre dos coordenadas.
 */
export function haversineDistanceMeters(a, b) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h =
    sinLat * sinLat +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLng * sinLng;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function fallbackPair(a, b) {
  const distance = Math.round(haversineDistanceMeters(a, b) * URBAN_DETOUR_FACTOR);
  const duration = Math.round(distance / FALLBACK_SPEED_MPS);
  return { distance, duration };
}

/**
 * Construye una matriz estimada local si OSRM no responde.
 */
export function buildFallbackMatrix(points) {
  const n = points.length;
  const durations = Array.from({ length: n }, () => Array(n).fill(0));
  const distances = Array.from({ length: n }, () => Array(n).fill(0));

  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) {
      if (i === j) continue;
      const { distance, duration } = fallbackPair(points[i], points[j]);
      distances[i][j] = distance;
      durations[i][j] = duration;
    }
  }

  return {
    durations,
    distances,
    source: 'fallback',
    warning: 'OSRM no disponible temporalmente; usando matriz estimada por distancia urbana.',
  };
}

/**
 * Obtiene la matriz N x N de duraciones (segundos) y distancias (metros) entre todos los puntos.
 * El índice 0 corresponde siempre al punto de partida (depot).
 * @param {Array<{ lat: number, lng: number }>} points
 */
export async function fetchDistanceTimeMatrix(points) {
  if (!Array.isArray(points) || points.length < 2) {
    return { durations: [[0]], distances: [[0]], source: 'osrm', warning: null };
  }

  const coords = points.map((p) => `${p.lng},${p.lat}`).join(';');
  const url = `${OSRM_BASE}/table/v1/driving/${coords}?annotations=duration,distance`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);

  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    if (data.code !== 'Ok' || !Array.isArray(data.durations) || !Array.isArray(data.distances)) {
      throw new Error('Respuesta OSRM Table inválida');
    }

    // Rellenar posibles celdas nulas con estimación Haversine
    const n = points.length;
    const durations = data.durations.map((row, i) =>
      row.map((val, j) => (val == null ? fallbackPair(points[i], points[j]).duration : Math.round(val)))
    );
    const distances = data.distances.map((row, i) =>
      row.map((val, j) => (val == null ? fallbackPair(points[i], points[j]).distance : Math.round(val)))
    );

    if (durations.length !== n) throw new Error('Dimensión de matriz inconsistente');

    return { durations, distances, source: 'osrm', warning: null };
  } catch (err) {
    clearTimeout(timer);
    return buildFallbackMatrix(points);
  }
}

/**
 * Obtiene la polilínea exacta por carretera para la secuencia ordenada de puntos de un técnico.
 * @param {Array<{ lat: number, lng: number }>} orderedPoints
 */
export async function fetchRouteGeometry(orderedPoints) {
  if (!orderedPoints || orderedPoints.length < 2) {
    return {
      coordinates: orderedPoints ? orderedPoints.map((p) => [p.lat, p.lng]) : [],
      source: 'fallback',
    };
  }

  const coords = orderedPoints.map((p) => `${p.lng},${p.lat}`).join(';');
  const url = `${OSRM_BASE}/route/v1/driving/${coords}?overview=full&geometries=geojson`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);

  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    if (data.code !== 'Ok' || !data.routes?.[0]?.geometry?.coordinates) {
      throw new Error('Geometría OSRM no disponible');
    }

    // GeoJSON usa [lng, lat]; Leaflet espera [lat, lng]
    const coordinates = data.routes[0].geometry.coordinates.map(([lng, lat]) => [lat, lng]);
    return {
      coordinates,
      source: 'osrm',
    };
  } catch {
    clearTimeout(timer);
    return {
      coordinates: orderedPoints.map((p) => [p.lat, p.lng]),
      source: 'fallback',
    };
  }
}
