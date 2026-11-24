import React, { useState } from 'react';
import htm from 'htm';
import {
  formatDuration,
  formatDistance,
  buildGoogleMapsRouteUrl,
  buildGoogleMapsStopUrl,
  buildWazeStopUrl,
  buildWhatsAppItineraryText,
} from '../services/exportUtils.js';

const html = htm.bind(React.createElement);

export function ItineraryPanel({
  solution,
  depot,
  returnToDepot,
  selectedTechId,
  onSelectTechId,
  warning,
}) {
  const [copiedTechId, setCopiedTechId] = useState(null);

  if (!solution) {
    return html`
      <div class="bg-white rounded-xl border border-slate-200 p-6 text-center space-y-2 shadow-sm">
        <div class="text-3xl">🗺️</div>
        <h3 class="text-sm font-bold text-slate-800">
          Listo para optimizar las rutas del día
        </h3>
        <p class="text-xs text-slate-500 max-w-md mx-auto">
          Configura el punto de partida, el número de técnicos y agrega las clínicas dentales. Luego pulsa <strong>“Calcular Rutas Óptimas”</strong> para generar el orden de visitas y los itinerarios.
        </p>
      </div>
    `;
  }

  const { routes, globalSummary } = solution;
  const visibleRoutes =
    selectedTechId === 'all'
      ? routes
      : routes.filter((r) => r.technician.id === selectedTechId);

  const handleCopyWhatsApp = async (route) => {
    const text = buildWhatsAppItineraryText(route, depot, returnToDepot);
    try {
      await navigator.clipboard.writeText(text);
      setCopiedTechId(route.technician.id);
      setTimeout(() => setCopiedTechId(null), 2500);
    } catch {
      // Fallback si el navegador bloquea clipboard API
      window.prompt('Copia el itinerario para WhatsApp:', text);
    }
  };

  return html`
    <div class="space-y-4">
      ${warning && html`
        <div class="bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-xl px-3.5 py-2.5">
          ⚠️ ${warning}
        </div>
      `}

      <!-- KPIs globales -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div class="bg-white rounded-xl border border-slate-200 p-3 shadow-sm">
          <div class="text-[11px] font-medium text-slate-500">Clínicas cubiertas</div>
          <div class="text-lg font-bold text-slate-900 mt-0.5">${globalSummary.totalStops}</div>
        </div>
        <div class="bg-white rounded-xl border border-slate-200 p-3 shadow-sm">
          <div class="text-[11px] font-medium text-slate-500">Distancia total equipo</div>
          <div class="text-lg font-bold text-slate-900 mt-0.5">
            ${formatDistance(globalSummary.totalDistanceMeters)}
          </div>
        </div>
        <div class="bg-white rounded-xl border border-slate-200 p-3 shadow-sm">
          <div class="text-[11px] font-medium text-slate-500">Conducción total</div>
          <div class="text-lg font-bold text-blue-600 mt-0.5">
            ${formatDuration(globalSummary.totalDriveSeconds)}
          </div>
        </div>
        <div class="bg-white rounded-xl border border-slate-200 p-3 shadow-sm">
          <div class="text-[11px] font-medium text-slate-500">Jornada mín / máx</div>
          <div class="text-sm font-bold text-slate-900 mt-1">
            ${formatDuration(globalSummary.minShiftSeconds)} – ${formatDuration(globalSummary.maxShiftSeconds)}
          </div>
        </div>
      </div>

      <!-- Filtro por técnico -->
      <div class="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick=${() => onSelectTechId('all')}
          class=${`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
            selectedTechId === 'all'
              ? 'bg-slate-900 text-white border-slate-900'
              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
          }`}
        >
          Todos (${routes.length})
        </button>

        ${routes.map((r) => html`
          <button
            key=${r.technician.id}
            type="button"
            onClick=${() => onSelectTechId(r.technician.id)}
            class=${`px-3 py-1.5 rounded-lg text-xs font-semibold border transition flex items-center gap-1.5 ${
              selectedTechId === r.technician.id
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
            }`}
          >
            <span
              class="w-2.5 h-2.5 rounded-full"
              style=${{ backgroundColor: r.technician.color }}
            ></span>
            ${r.technician.name} (${r.stops.length})
          </button>
        `)}
      </div>

      <!-- Tarjetas de itinerario por técnico -->
      <div class="space-y-4">
        ${visibleRoutes.map((route) => {
          const mapsRouteUrl = buildGoogleMapsRouteUrl(depot, route.stops, returnToDepot);
          const isCopied = copiedTechId === route.technician.id;

          return html`
            <article
              key=${route.technician.id}
              class="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm"
            >
              <!-- Cabecera de tarjeta -->
              <div
                class="px-4 py-3 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2"
                style=${{ borderLeft: `5px solid ${route.technician.color}` }}
              >
                <div>
                  <div class="flex items-center gap-2">
                    <h3 class="text-sm font-bold text-slate-900">${route.technician.name}</h3>
                    <span class="px-2 py-0.5 text-[11px] font-semibold rounded-full bg-slate-100 text-slate-700">
                      ${route.summary.stopCount} ${route.summary.stopCount === 1 ? 'parada' : 'paradas'}
                    </span>
                    ${route.summary.urgentCount > 0 && html`
                      <span class="px-2 py-0.5 text-[11px] font-semibold rounded-full bg-rose-100 text-rose-700">
                        ${route.summary.urgentCount} urgente${route.summary.urgentCount > 1 ? 's' : ''}
                      </span>
                    `}
                  </div>
                  <p class="text-xs text-slate-500 mt-0.5">
                    Jornada: <strong>${route.summary.startTimeHHMM} → ${route.summary.endTimeHHMM}</strong> ·
                    Total ${formatDuration(route.summary.totalShiftSeconds)}
                    (🚗 ${formatDuration(route.summary.driveSeconds)} / 🛠️ ${formatDuration(route.summary.repairSeconds)} ·
                    ${formatDistance(route.summary.distanceMeters)})
                  </p>
                </div>

                ${route.stops.length > 0 && html`
                  <div class="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick=${() => handleCopyWhatsApp(route)}
                      class=${`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition ${
                        isCopied
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                      }`}
                    >
                      ${isCopied ? '✓ Copiado para WhatsApp' : '💬 Copiar WhatsApp'}
                    </button>

                    ${mapsRouteUrl && html`
                      <a
                        href=${mapsRouteUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        class="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition"
                      >
                        🗺️ Google Maps
                      </a>
                    `}
                  </div>
                `}
              </div>

              <!-- Línea de tiempo paso a paso -->
              <div class="p-4 space-y-3">
                ${route.stops.length === 0
                  ? html`
                      <p class="text-xs text-slate-400">
                        Este técnico no tiene paradas asignadas porque hay menos clínicas que técnicos disponibles.
                      </p>
                    `
                  : html`
                      <!-- Salida de base -->
                      <div class="flex items-start gap-3 text-xs">
                        <div class="w-6 h-6 rounded-md bg-slate-900 text-white flex items-center justify-center shrink-0 text-[11px]">
                          🏢
                        </div>
                        <div>
                          <span class="font-bold text-slate-800">Salida: ${depot.name}</span>
                          <span class="ml-2 text-slate-500 font-medium">${route.summary.startTimeHHMM}</span>
                          <div class="text-[11px] text-slate-400">${depot.address}</div>
                        </div>
                      </div>

                      ${route.stops.map((stop) => html`
                        <div key=${stop.clinic.id} class="flex items-start gap-3 text-xs border-l-2 border-slate-200 ml-3 pl-4 py-1">
                          <div
                            class="w-6 h-6 rounded-full text-white font-bold flex items-center justify-center shrink-0 -ml-7 border-2 border-white shadow-sm text-[11px]"
                            style=${{ backgroundColor: route.technician.color }}
                          >
                            ${stop.order}
                          </div>

                          <div class="flex-1 min-w-0">
                            <div class="flex flex-wrap items-center justify-between gap-2">
                              <div class="flex items-center gap-1.5 flex-wrap">
                                <span class="font-bold text-slate-900">${stop.clinic.name}</span>
                                ${stop.clinic.priority === 'Urgente' && html`
                                  <span class="px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 text-[10px] font-bold">
                                    URGENTE
                                  </span>
                                `}
                              </div>
                              <span class="font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
                                Llega ${stop.etaHHMM} · Sale ${stop.departureHHMM}
                              </span>
                            </div>

                            <p class="text-[11px] text-slate-500 mt-0.5">${stop.clinic.address}</p>

                            <div class="flex flex-wrap items-center justify-between gap-2 mt-1.5">
                              <div class="text-[11px] text-slate-600 flex items-center gap-3">
                                <span>🚗 Traslado: <strong>${formatDuration(stop.travelSecondsFromPrev)}</strong> (${formatDistance(stop.distanceMetersFromPrev)})</span>
                                <span>🛠️ Reparación: <strong>${stop.repairMinutes} min</strong></span>
                              </div>

                              <div class="flex items-center gap-2 text-[11px] font-semibold">
                                <a
                                  href=${buildGoogleMapsStopUrl(stop.clinic.lat, stop.clinic.lng)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  class="text-blue-600 hover:underline"
                                >
                                  Maps ↗
                                </a>
                                <a
                                  href=${buildWazeStopUrl(stop.clinic.lat, stop.clinic.lng)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  class="text-cyan-600 hover:underline"
                                >
                                  Waze ↗
                                </a>
                              </div>
                            </div>
                          </div>
                        </div>
                      `)}

                      <!-- Cierre de jornada -->
                      ${route.returnLeg
                        ? html`
                            <div class="flex items-start gap-3 text-xs pt-1">
                              <div class="w-6 h-6 rounded-md bg-slate-700 text-white flex items-center justify-center shrink-0 text-[11px]">
                                🏁
                              </div>
                              <div>
                                <span class="font-bold text-slate-800">Regreso a ${depot.name}</span>
                                <span class="ml-2 font-bold text-slate-700">${route.returnLeg.etaHHMM}</span>
                                <div class="text-[11px] text-slate-500">
                                  🚗 ${formatDuration(route.returnLeg.travelSeconds)} (${formatDistance(route.returnLeg.distanceMeters)})
                                </div>
                              </div>
                            </div>
                          `
                        : html`
                            <div class="flex items-center gap-2 text-[11px] text-slate-500 pt-1">
                              <span>🏁 Fin de jornada en la última clínica (${route.summary.endTimeHHMM})</span>
                            </div>
                          `}
                    `}
              </div>
            </article>
          `;
        })}
      </div>
    </div>
  `;
}
