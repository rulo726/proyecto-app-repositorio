/**
 * Servicio de geocodificación y carga masiva de direcciones/coordenadas.
 * Utiliza Photon (Komoot / OpenStreetMap) como fuente primaria sin API Key,
 * con fallback automático a Nominatim (OpenStreetMap).
 */

/**
 * Detecta si el texto contiene coordenadas válidas ("lat, lng" o "lat lng").
 * @param {string} raw
 * @returns {{ lat: number, lng: number } | null}
 */
export function parseCoordinates(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const cleaned = raw.trim();
  const match = cleaned.match(/^(-?\d{1,3}(?:\.\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:\.\d+)?)$/);
  if (!match) return null;

  const lat = Number(match[1]);
  const lng = Number(match[2]);
  if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

/**
 * Busca sugerencias de direcciones para autocompletado.
 * @param {string} query
 * @param {AbortSignal} [signal]
 * @returns {Promise<Array<{ label: string, address: string, lat: number, lng: number, isCoordinate?: boolean }>>}
 */
export async function searchAddresses(query, signal) {
  const trimmed = (query || '').trim();
  if (trimmed.length < 3) return [];

  const coords = parseCoordinates(trimmed);
  if (coords) {
    return [
      {
        label: `Coordenadas (${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)})`,
        address: `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`,
        lat: coords.lat,
        lng: coords.lng,
        isCoordinate: true,
      },
    ];
  }

  // 1. Intento principal con Photon (rápido, sin key y compatible con CORS)
  try {
    const photonUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(trimmed)}&limit=5&lang=es`;
    const res = await fetch(photonUrl, { signal });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.features) && data.features.length > 0) {
        return data.features.map((f) => {
          const p = f.properties || {};
          const [lng, lat] = f.geometry.coordinates;
          const parts = [p.name, p.street && p.housenumber ? `${p.street} ${p.housenumber}` : p.street, p.city || p.town || p.village, p.country]
            .filter(Boolean);
          const address = [...new Set(parts)].join(', ') || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
          return {
            label: address,
            address,
            lat,
            lng,
          };
        });
      }
    }
  } catch (err) {
    if (err.name === 'AbortError') throw err;
  }

  // 2. Fallback con Nominatim
  try {
    const nomUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(trimmed)}&limit=5&accept-language=es`;
    const res = await fetch(nomUrl, { signal });
    if (res.ok) {
      const items = await res.json();
      return items.map((item) => ({
        label: item.display_name,
        address: item.display_name,
        lat: Number(item.lat),
        lng: Number(item.lon),
      }));
    }
  } catch (err) {
    if (err.name === 'AbortError') throw err;
  }

  return [];
}

/**
 * Geocodifica una sola línea (coordenadas o dirección textual).
 * @param {string} text
 * @returns {Promise<{ address: string, lat: number, lng: number } | null>}
 */
export async function geocodeSingle(text) {
  const coords = parseCoordinates(text);
  if (coords) {
    return {
      address: `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`,
      lat: coords.lat,
      lng: coords.lng,
    };
  }
  const results = await searchAddresses(text);
  return results.length > 0 ? results[0] : null;
}

/**
 * Divide una línea CSV respetando comillas dobles.
 */
function splitCsvLine(line, delimiter) {
  const cells = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === delimiter && !inQuotes) {
      cells.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  cells.push(current.trim());
  return cells;
}

/**
 * Detecta el delimitador predominante de un texto CSV o lista pegada.
 */
function detectDelimiter(lines) {
  const sample = lines.slice(0, 5).join('\n');
  const counts = {
    '|': (sample.match(/\|/g) || []).length,
    ';': (sample.match(/;/g) || []).length,
    '\t': (sample.match(/\t/g) || []).length,
    ',': (sample.match(/,/g) || []).length,
  };
  let best = '|';
  let max = 0;
  for (const [delim, count] of Object.entries(counts)) {
    if (count > max) {
      max = count;
      best = delim;
    }
  }
  return max > 0 ? best : null;
}

/**
 * Parsea texto pegado o contenido CSV a paradas pendientes de geocodificar (si no traen lat/lng).
 * Formatos soportados por línea:
 * - Nombre | Dirección o "lat,lng" | Minutos | Prioridad
 * - Nombre;Dirección;Minutos;Prioridad
 * - Nombre,Dirección,Lat,Lng,Minutos,Prioridad
 * - Dirección sola (o lat, lng)
 *
 * @param {string} rawText
 */
export function parseBulkInput(rawText) {
  const lines = (rawText || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length === 0) return [];

  const delimiter = detectDelimiter(lines);
  const parsed = [];

  lines.forEach((line, index) => {
    // Saltar cabecera típica
    if (index === 0 && /^(nombre|clinica|cl[ií]nica)\b/i.test(line)) {
      return;
    }

    if (!delimiter) {
      const coords = parseCoordinates(line);
      parsed.push({
        name: coords ? `Clínica (${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)})` : line,
        query: line,
        lat: coords?.lat ?? null,
        lng: coords?.lng ?? null,
        repairMinutes: 45,
        priority: 'Normal',
      });
      return;
    }

    const cols = splitCsvLine(line, delimiter);

    // Si es "lat, lng" con coma como único contenido de la línea
    if (delimiter === ',' && cols.length === 2 && parseCoordinates(line)) {
      const coords = parseCoordinates(line);
      parsed.push({
        name: `Clínica (${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)})`,
        query: line,
        lat: coords.lat,
        lng: coords.lng,
        repairMinutes: 45,
        priority: 'Normal',
      });
      return;
    }

    const name = cols[0] || `Clínica ${index + 1}`;
    let query = cols[1] || cols[0];
    let lat = null;
    let lng = null;
    let repairMinutes = 45;
    let priority = 'Normal';

    // Detectar formato con columnas separadas lat, lng (cols[2] y cols[3] numéricos)
    if (cols.length >= 4 && !Number.isNaN(Number(cols[2])) && !Number.isNaN(Number(cols[3]))) {
      const maybeLat = Number(cols[2]);
      const maybeLng = Number(cols[3]);
      if (maybeLat >= -90 && maybeLat <= 90 && maybeLng >= -180 && maybeLng <= 180) {
        lat = maybeLat;
        lng = maybeLng;
        if (cols[4] && !Number.isNaN(Number(cols[4]))) {
          repairMinutes = Math.max(5, Math.min(480, Number(cols[4])));
        }
        if (cols[5] && /urg/i.test(cols[5])) {
          priority = 'Urgente';
        }
      }
    } else {
      const coords = parseCoordinates(query);
      if (coords) {
        lat = coords.lat;
        lng = coords.lng;
      }
      if (cols[2] && !Number.isNaN(Number(cols[2]))) {
        repairMinutes = Math.max(5, Math.min(480, Number(cols[2])));
      }
      if (cols[3] && /urg/i.test(cols[3])) {
        priority = 'Urgente';
      }
    }

    parsed.push({
      name,
      query,
      lat,
      lng,
      repairMinutes,
      priority,
    });
  });

  return parsed;
}

/**
 * Escenario de demostración listo para probar en 1 clic.
 */
export const SAMPLE_SCENARIO = {
  depot: {
    name: 'Almacén Central DentalTech',
    address: 'Calle de Alcalá 211, Madrid',
    lat: 40.4278,
    lng: -3.6695,
  },
  technicians: [
    { id: 'tech-1', name: 'Carlos Mendoza' },
    { id: 'tech-2', name: 'Laura Sánchez' },
    { id: 'tech-3', name: 'Javier Ruiz' },
  ],
  clinics: [
    {
      id: 'c-1',
      name: 'Clínica Dental Chamberí',
      address: 'Calle de Santa Engracia 108, Madrid',
      lat: 40.4401,
      lng: -3.7009,
      repairMinutes: 45,
      priority: 'Urgente',
    },
    {
      id: 'c-2',
      name: 'Odontología Salamanca',
      address: 'Calle de Velázquez 75, Madrid',
      lat: 40.4316,
      lng: -3.6838,
      repairMinutes: 30,
      priority: 'Normal',
    },
    {
      id: 'c-3',
      name: 'Centro Dental Retiro',
      address: 'Av. de Menéndez Pelayo 44, Madrid',
      lat: 40.4142,
      lng: -3.6776,
      repairMinutes: 60,
      priority: 'Normal',
    },
    {
      id: 'c-4',
      name: 'Clínica Sonrisa Sur',
      address: 'Paseo de las Delicias 65, Madrid',
      lat: 40.3997,
      lng: -3.6946,
      repairMinutes: 45,
      priority: 'Urgente',
    },
    {
      id: 'c-5',
      name: 'Dental Pozuelo Norte',
      address: 'Av. de Europa 22, Pozuelo de Alarcón',
      lat: 40.4392,
      lng: -3.7966,
      repairMinutes: 60,
      priority: 'Normal',
    },
    {
      id: 'c-6',
      name: 'Instituto Dental Chamartín',
      address: 'Paseo de la Habana 142, Madrid',
      lat: 40.4596,
      lng: -3.6829,
      repairMinutes: 30,
      priority: 'Normal',
    },
    {
      id: 'c-7',
      name: 'Clínica Dental Hortaleza',
      address: 'Calle de Arturo Soria 240, Madrid',
      lat: 40.4638,
      lng: -3.6615,
      repairMinutes: 45,
      priority: 'Urgente',
    },
    {
      id: 'c-8',
      name: 'Clínica Vallecas Salud',
      address: 'Av. de la Albufera 112, Madrid',
      lat: 40.3932,
      lng: -3.6542,
      repairMinutes: 40,
      priority: 'Normal',
    },
  ],
};

export function generateSampleCsv() {
  return [
    'Nombre,Direccion,Lat,Lng,TiempoMin,Prioridad',
    'Clínica Dental Centro,Gran Vía 45 Madrid,40.4203,-3.7058,45,Urgente',
    'Odontología Norte,Paseo de la Castellana 180 Madrid,40.4567,-3.6901,30,Normal',
    'Clínica Dental Este,Calle de Alcalá 410 Madrid,40.4368,-3.6352,60,Normal',
    'Sonrisa Sur,Calle Marcelo Usera 70 Madrid,40.3865,-3.7064,45,Urgente',
  ].join('\n');
}
