/**
 * Motor de optimización de rutas multi-técnico (Vehicle Routing Problem - VRP).
 *
 * Estrategia en 3 fases:
 * 1. Construcción equilibrada con prioridad (Urgente primero + farthest-first seeding + inserción mínima).
 * 2. Optimización intra-ruta con 2-Opt respetando vuelta al depósito o fin en última clínica.
 * 3. Búsqueda local inter-rutas (Relocate y Swap) para balancear carga total (conducción + reparación)
 *    y minimizar el tiempo total de conducción del equipo.
 */

const URGENT_INVERSION_PENALTY_SEC = 1800; // Penaliza colocar una parada Normal antes que una Urgente
const URGENT_ETA_WEIGHT = 0.15;            // Favorece atender antes las clínicas urgentes
const BALANCE_SPREAD_WEIGHT = 0.45;        // Penaliza desequilibrio entre la jornada más larga y la más corta

/**
 * Convierte "HH:MM" a minutos desde medianoche.
 */
export function parseTimeToMinutes(hhmm) {
  const match = String(hhmm || '08:30').match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return 8 * 60 + 30;
  const h = Math.min(23, Math.max(0, Number(match[1])));
  const m = Math.min(59, Math.max(0, Number(match[2])));
  return h * 60 + m;
}

/**
 * Convierte minutos desde medianoche a "HH:MM" (soporta jornadas > 24h con +1d implícito).
 */
export function formatMinutesToHHMM(totalMinutes) {
  const rounded = Math.round(totalMinutes);
  const normalized = ((rounded % 1440) + 1440) % 1440;
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Evalúa una ruta (array de índices de clínica 0..K-1) usando la matriz (0 = depot, c+1 = clínica c).
 */
function evaluateSingleRoute(routeClinicIndices, clinics, matrix, returnToDepot) {
  if (routeClinicIndices.length === 0) {
    return {
      driveSeconds: 0,
      distanceMeters: 0,
      repairSeconds: 0,
      totalShiftSeconds: 0,
      priorityPenalty: 0,
    };
  }

  const { durations, distances } = matrix;
  let driveSeconds = 0;
  let distanceMeters = 0;
  let repairSeconds = 0;
  let priorityPenalty = 0;
  let elapsedSeconds = 0;
  let normalSeen = 0;

  let prevMatrixIdx = 0; // Depot

  for (let i = 0; i < routeClinicIndices.length; i += 1) {
    const clinicIdx = routeClinicIndices[i];
    const clinic = clinics[clinicIdx];
    const currMatrixIdx = clinicIdx + 1;

    const legDur = durations[prevMatrixIdx][currMatrixIdx];
    const legDist = distances[prevMatrixIdx][currMatrixIdx];

    driveSeconds += legDur;
    distanceMeters += legDist;
    elapsedSeconds += legDur;

    if (clinic.priority === 'Urgente') {
      priorityPenalty += normalSeen * URGENT_INVERSION_PENALTY_SEC;
      priorityPenalty += elapsedSeconds * URGENT_ETA_WEIGHT;
    } else {
      normalSeen += 1;
    }

    const repSec = (clinic.repairMinutes || 30) * 60;
    repairSeconds += repSec;
    elapsedSeconds += repSec;
    prevMatrixIdx = currMatrixIdx;
  }

  if (returnToDepot) {
    driveSeconds += durations[prevMatrixIdx][0];
    distanceMeters += distances[prevMatrixIdx][0];
  }

  return {
    driveSeconds,
    distanceMeters,
    repairSeconds,
    totalShiftSeconds: driveSeconds + repairSeconds,
    priorityPenalty,
  };
}

/**
 * Función objetivo global para comparar soluciones multi-técnico.
 */
function evaluateSolution(routes, clinics, matrix, returnToDepot) {
  const stats = routes.map((r) => evaluateSingleRoute(r, clinics, matrix, returnToDepot));
  let totalDriveSeconds = 0;
  let totalPriorityPenalty = 0;
  let maxShift = 0;
  let minShift = Infinity;

  for (const s of stats) {
    totalDriveSeconds += s.driveSeconds;
    totalPriorityPenalty += s.priorityPenalty;
    if (s.totalShiftSeconds > maxShift) maxShift = s.totalShiftSeconds;
    if (s.totalShiftSeconds < minShift) minShift = s.totalShiftSeconds;
  }

  if (minShift === Infinity) minShift = 0;
  const spread = maxShift - minShift;
  const cost = totalDriveSeconds + BALANCE_SPREAD_WEIGHT * spread + totalPriorityPenalty;

  return { cost, stats, totalDriveSeconds, maxShift, minShift };
}

/**
 * Costo de una ruta individual incluyendo penalización por prioridad.
 */
function routeScore(route, clinics, matrix, returnToDepot) {
  const s = evaluateSingleRoute(route, clinics, matrix, returnToDepot);
  return s.driveSeconds + s.priorityPenalty;
}

/**
 * Optimización intra-ruta con 2-Opt.
 */
function twoOptRoute(route, clinics, matrix, returnToDepot) {
  if (route.length < 3) return route.slice();

  let best = route.slice();
  let bestScore = routeScore(best, clinics, matrix, returnToDepot);
  let improved = true;

  while (improved) {
    improved = false;
    for (let i = 0; i < best.length - 1; i += 1) {
      for (let j = i + 1; j < best.length; j += 1) {
        const candidate = [
          ...best.slice(0, i),
          ...best.slice(i, j + 1).reverse(),
          ...best.slice(j + 1),
        ];
        const candScore = routeScore(candidate, clinics, matrix, returnToDepot);
        if (candScore + 1e-6 < bestScore) {
          best = candidate;
          bestScore = candScore;
          improved = true;
        }
      }
    }
  }
  return best;
}

/**
 * Resuelve el VRP y devuelve itinerarios detallados para todos los técnicos.
 *
 * @param {object} params
 * @param {{ name: string, address: string, lat: number, lng: number }} params.depot
 * @param {Array} params.clinics
 * @param {Array} params.technicians
 * @param {{ durations: number[][], distances: number[][] }} params.matrix
 * @param {{ returnToDepot: boolean, startTime: string }} params.options
 */
export function solveVRP({ depot, clinics, technicians, matrix, options }) {
  const { returnToDepot = true, startTime = '08:30' } = options || {};
  const startMinutes = parseTimeToMinutes(startTime);

  if (!clinics.length || !technicians.length) {
    return {
      routes: technicians.map((tech) => ({
        technician: tech,
        stops: [],
        returnLeg: null,
        orderedPoints: [depot],
        summary: {
          stopCount: 0,
          urgentCount: 0,
          driveSeconds: 0,
          repairSeconds: 0,
          totalShiftSeconds: 0,
          distanceMeters: 0,
          startTimeHHMM: formatMinutesToHHMM(startMinutes),
          endTimeHHMM: formatMinutesToHHMM(startMinutes),
        },
      })),
      globalSummary: {
        totalStops: 0,
        totalDriveSeconds: 0,
        totalRepairSeconds: 0,
        totalDistanceMeters: 0,
        maxShiftSeconds: 0,
        minShiftSeconds: 0,
      },
    };
  }

  const numActive = Math.min(technicians.length, clinics.length);
  const rawRoutes = Array.from({ length: numActive }, () => []);

  // Ordenar clínicas para fase constructiva: Urgentes primero, luego mayor distancia al depot
  const sortedIndices = clinics
    .map((c, idx) => ({
      idx,
      urgent: c.priority === 'Urgente' ? 1 : 0,
      distFromDepot: matrix.durations[0][idx + 1],
    }))
    .sort((a, b) => {
      if (b.urgent !== a.urgent) return b.urgent - a.urgent;
      return b.distFromDepot - a.distFromDepot;
    })
    .map((item) => item.idx);

  // Fase 1A: Sembrar 1 clínica inicial por cada técnico activo (dispersión inicial)
  for (let t = 0; t < numActive; t += 1) {
    rawRoutes[t].push(sortedIndices[t]);
  }

  // Fase 1B: Inserción equilibrada para el resto de clínicas
  for (let idxPos = numActive; idxPos < sortedIndices.length; idxPos += 1) {
    const clinicIdx = sortedIndices[idxPos];
    let bestChoice = null;

    for (let t = 0; t < numActive; t += 1) {
      const route = rawRoutes[t];
      for (let insertAt = 0; insertAt <= route.length; insertAt += 1) {
        const candidateRoutes = rawRoutes.map((r, rIdx) => {
          if (rIdx !== t) return r;
          const copy = r.slice();
          copy.splice(insertAt, 0, clinicIdx);
          return copy;
        });

        const evaluation = evaluateSolution(candidateRoutes, clinics, matrix, returnToDepot);
        if (!bestChoice || evaluation.cost < bestChoice.cost) {
          bestChoice = { t, insertAt, cost: evaluation.cost };
        }
      }
    }

    rawRoutes[bestChoice.t].splice(bestChoice.insertAt, 0, clinicIdx);
  }

  // Fase 2: 2-Opt intra-ruta inicial
  let optimizedRoutes = rawRoutes.map((r) => twoOptRoute(r, clinics, matrix, returnToDepot));

  // Fase 3: Búsqueda local inter-rutas (Relocate + Swap)
  if (numActive > 1) {
    let bestEval = evaluateSolution(optimizedRoutes, clinics, matrix, returnToDepot);
    let improved = true;
    let guard = 0;

    while (improved && guard < 40) {
      improved = false;
      guard += 1;

      // 3A. Relocate: mover 1 clínica de ruta A a ruta B
      for (let a = 0; a < numActive; a += 1) {
        if (optimizedRoutes[a].length <= 1) continue;
        for (let posA = 0; posA < optimizedRoutes[a].length; posA += 1) {
          const moving = optimizedRoutes[a][posA];
          for (let b = 0; b < numActive; b += 1) {
            if (a === b) continue;
            for (let posB = 0; posB <= optimizedRoutes[b].length; posB += 1) {
              const cand = optimizedRoutes.map((r) => r.slice());
              cand[a].splice(posA, 1);
              cand[b].splice(posB, 0, moving);
              cand[a] = twoOptRoute(cand[a], clinics, matrix, returnToDepot);
              cand[b] = twoOptRoute(cand[b], clinics, matrix, returnToDepot);

              const candEval = evaluateSolution(cand, clinics, matrix, returnToDepot);
              if (candEval.cost + 1 < bestEval.cost) {
                optimizedRoutes = cand;
                bestEval = candEval;
                improved = true;
                break;
              }
            }
            if (improved) break;
          }
          if (improved) break;
        }
        if (improved) break;
      }

      if (improved) continue;

      // 3B. Swap: intercambiar 1 clínica entre ruta A y ruta B
      for (let a = 0; a < numActive; a += 1) {
        for (let b = a + 1; b < numActive; b += 1) {
          for (let posA = 0; posA < optimizedRoutes[a].length; posA += 1) {
            for (let posB = 0; posB < optimizedRoutes[b].length; posB += 1) {
              const cand = optimizedRoutes.map((r) => r.slice());
              const temp = cand[a][posA];
              cand[a][posA] = cand[b][posB];
              cand[b][posB] = temp;
              cand[a] = twoOptRoute(cand[a], clinics, matrix, returnToDepot);
              cand[b] = twoOptRoute(cand[b], clinics, matrix, returnToDepot);

              const candEval = evaluateSolution(cand, clinics, matrix, returnToDepot);
              if (candEval.cost + 1 < bestEval.cost) {
                optimizedRoutes = cand;
                bestEval = candEval;
                improved = true;
                break;
              }
            }
            if (improved) break;
          }
          if (improved) break;
        }
        if (improved) break;
      }
    }
  }

  // Construir itinerario detallado paso a paso para cada técnico
  const finalRoutes = technicians.map((tech, techIdx) => {
    const clinicIndices = techIdx < optimizedRoutes.length ? optimizedRoutes[techIdx] : [];
    const stops = [];
    let currentTimeMin = startMinutes;
    let prevMatrixIdx = 0;
    let totalDriveSeconds = 0;
    let totalRepairSeconds = 0;
    let totalDistanceMeters = 0;
    let urgentCount = 0;

    clinicIndices.forEach((clinicIdx, orderIdx) => {
      const clinic = clinics[clinicIdx];
      const currMatrixIdx = clinicIdx + 1;
      const legSeconds = matrix.durations[prevMatrixIdx][currMatrixIdx];
      const legMeters = matrix.distances[prevMatrixIdx][currMatrixIdx];

      totalDriveSeconds += legSeconds;
      totalDistanceMeters += legMeters;
      currentTimeMin += legSeconds / 60;

      const etaHHMM = formatMinutesToHHMM(currentTimeMin);
      const repairMin = clinic.repairMinutes || 30;
      totalRepairSeconds += repairMin * 60;
      currentTimeMin += repairMin;
      const departureHHMM = formatMinutesToHHMM(currentTimeMin);

      if (clinic.priority === 'Urgente') urgentCount += 1;

      stops.push({
        order: orderIdx + 1,
        clinic,
        etaHHMM,
        departureHHMM,
        travelSecondsFromPrev: legSeconds,
        distanceMetersFromPrev: legMeters,
        repairMinutes: repairMin,
      });

      prevMatrixIdx = currMatrixIdx;
    });

    let returnLeg = null;
    if (returnToDepot && stops.length > 0) {
      const backSeconds = matrix.durations[prevMatrixIdx][0];
      const backMeters = matrix.distances[prevMatrixIdx][0];
      totalDriveSeconds += backSeconds;
      totalDistanceMeters += backMeters;
      currentTimeMin += backSeconds / 60;
      returnLeg = {
        etaHHMM: formatMinutesToHHMM(currentTimeMin),
        travelSeconds: backSeconds,
        distanceMeters: backMeters,
      };
    }

    const orderedPoints = [depot, ...stops.map((s) => s.clinic)];
    if (returnToDepot && stops.length > 0) {
      orderedPoints.push(depot);
    }

    return {
      technician: tech,
      stops,
      returnLeg,
      orderedPoints,
      summary: {
        stopCount: stops.length,
        urgentCount,
        driveSeconds: totalDriveSeconds,
        repairSeconds: totalRepairSeconds,
        totalShiftSeconds: totalDriveSeconds + totalRepairSeconds,
        distanceMeters: totalDistanceMeters,
        startTimeHHMM: formatMinutesToHHMM(startMinutes),
        endTimeHHMM: formatMinutesToHHMM(currentTimeMin),
      },
    };
  });

  const activeSummaries = finalRoutes.filter((r) => r.stops.length > 0).map((r) => r.summary);
  const maxShiftSeconds = activeSummaries.length
    ? Math.max(...activeSummaries.map((s) => s.totalShiftSeconds))
    : 0;
  const minShiftSeconds = activeSummaries.length
    ? Math.min(...activeSummaries.map((s) => s.totalShiftSeconds))
    : 0;

  return {
    routes: finalRoutes,
    globalSummary: {
      totalStops: clinics.length,
      totalDriveSeconds: finalRoutes.reduce((acc, r) => acc + r.summary.driveSeconds, 0),
      totalRepairSeconds: finalRoutes.reduce((acc, r) => acc + r.summary.repairSeconds, 0),
      totalDistanceMeters: finalRoutes.reduce((acc, r) => acc + r.summary.distanceMeters, 0),
      maxShiftSeconds,
      minShiftSeconds,
    },
  };
}
