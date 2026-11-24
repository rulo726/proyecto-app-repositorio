import React from 'react';
import htm from 'htm';

const html = htm.bind(React.createElement);

export function HeaderBar({
  clinicsCount,
  techCount,
  isOptimizing,
  matrixSource,
  onLoadSample,
  onOptimize,
  onClearAll,
}) {
  return html`
    <header class="bg-white border-b border-slate-200 px-4 lg:px-6 py-3 flex flex-wrap items-center justify-between gap-3 sticky top-0 z-30 shadow-sm">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold text-lg shadow-sm">
          🦷
        </div>
        <div>
          <div class="flex items-center gap-2">
            <h1 class="text-base lg:text-lg font-bold text-slate-900 tracking-tight">
              DentalRoute VRP
            </h1>
            <span class="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
              Servicio Técnico Dental
            </span>
          </div>
          <p class="text-xs text-slate-500">
            Planificación inteligente de rutas para ${techCount} ${techCount === 1 ? 'técnico' : 'técnicos'} · ${clinicsCount} ${clinicsCount === 1 ? 'clínica' : 'clínicas'}
          </p>
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        ${matrixSource && html`
          <span
            class=${`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${
              matrixSource === 'osrm'
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-amber-50 text-amber-700 border-amber-200'
            }`}
            title="Motor de cálculo de distancias y rutas"
          >
            <span class=${`w-2 h-2 rounded-full ${matrixSource === 'osrm' ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
            ${matrixSource === 'osrm' ? 'Rutas reales (OSRM)' : 'Modo estimado (Offline)'}
          </span>
        `}

        <button
          type="button"
          onClick=${onLoadSample}
          class="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg border border-slate-200 transition"
        >
          Cargar demo (Madrid)
        </button>

        ${clinicsCount > 0 && html`
          <button
            type="button"
            onClick=${onClearAll}
            class="px-3 py-1.5 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-lg border border-rose-200 transition"
          >
            Limpiar
          </button>
        `}

        <button
          type="button"
          onClick=${onOptimize}
          disabled=${isOptimizing || clinicsCount === 0}
          class="px-4 py-2 text-xs sm:text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed rounded-lg shadow-sm transition flex items-center gap-2"
        >
          ${isOptimizing
            ? html`<span class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span> Calculando rutas...`
            : html`⚡ Calcular Rutas Óptimas`}
        </button>
      </div>
    </header>
  `;
}
