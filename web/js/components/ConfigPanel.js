import React, { useState, useEffect, useRef } from 'react';
import htm from 'htm';
import { searchAddresses } from '../services/geocoder.js';

const html = htm.bind(React.createElement);

export function ConfigPanel({
  depot,
  onChangeDepot,
  returnToDepot,
  onChangeReturnToDepot,
  startTime,
  onChangeStartTime,
  technicians,
  onChangeTechCount,
  onRenameTechnician,
  mapPickMode,
  onSetMapPickMode,
}) {
  const [query, setQuery] = useState(depot?.address || '');
  const [suggestions, setSuggestions] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const abortRef = useRef(null);

  useEffect(() => {
    setQuery(depot?.address || '');
  }, [depot?.address]);

  useEffect(() => {
    const trimmed = query.trim();
    if (!showDropdown || trimmed.length < 3) {
      setSuggestions([]);
      return;
    }

    const timer = setTimeout(async () => {
      if (abortRef.current) abortRef.current.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setIsSearching(true);
      try {
        const res = await searchAddresses(trimmed, ctrl.signal);
        setSuggestions(res);
      } catch (e) {
        if (e.name !== 'AbortError') setSuggestions([]);
      } finally {
        setIsSearching(false);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [query, showDropdown]);

  const handleSelectSuggestion = (item) => {
    onChangeDepot({
      ...depot,
      address: item.address,
      lat: item.lat,
      lng: item.lng,
    });
    setQuery(item.address);
    setShowDropdown(false);
  };

  return html`
    <section class="bg-white rounded-xl border border-slate-200 p-4 space-y-4 shadow-sm">
      <div class="flex items-center justify-between">
        <h2 class="text-sm font-bold text-slate-800 flex items-center gap-2">
          🏢 Punto de Partida y Técnicos
        </h2>
        <span class="text-[11px] text-slate-400 font-medium">Paso 1</span>
      </div>

      <!-- Nombre de la base -->
      <div class="space-y-1">
        <label class="block text-xs font-semibold text-slate-600">
          Nombre de oficina / almacén central
        </label>
        <input
          type="text"
          value=${depot.name}
          onChange=${(e) => onChangeDepot({ ...depot, name: e.target.value })}
          placeholder="Ej. Almacén Central"
          class="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <!-- Autocompletado del punto de partida -->
      <div class="space-y-1 relative">
        <div class="flex items-center justify-between">
          <label class="block text-xs font-semibold text-slate-600">
            Dirección o coordenadas de salida
          </label>
          <button
            type="button"
            onClick=${() => onSetMapPickMode(mapPickMode === 'depot' ? null : 'depot')}
            class=${`text-[11px] font-semibold px-2 py-0.5 rounded border transition ${
              mapPickMode === 'depot'
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-slate-50 text-blue-700 border-slate-200 hover:bg-blue-50'
            }`}
          >
            ${mapPickMode === 'depot' ? 'Haz clic en el mapa...' : '📍 Elegir en mapa'}
          </button>
        </div>

        <input
          type="text"
          value=${query}
          onFocus=${() => setShowDropdown(true)}
          onChange=${(e) => {
            setQuery(e.target.value);
            setShowDropdown(true);
          }}
          placeholder="Buscar dirección o pegar lat, lng..."
          class="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <p class="text-[11px] text-slate-400">
          Actual: ${depot.lat.toFixed(4)}, ${depot.lng.toFixed(4)}
        </p>

        ${showDropdown && (isSearching || suggestions.length > 0) && html`
          <div class="absolute left-0 right-0 top-16 bg-white border border-slate-200 rounded-lg shadow-lg z-30 max-h-48 overflow-y-auto">
            ${isSearching && html`
              <div class="px-3 py-2 text-xs text-slate-500">Buscando dirección...</div>
            `}
            ${suggestions.map((s, idx) => html`
              <button
                key=${idx}
                type="button"
                onClick=${() => handleSelectSuggestion(s)}
                class="w-full text-left px-3 py-2 text-xs hover:bg-blue-50 border-b border-slate-100 last:border-0 text-slate-700"
              >
                ${s.label}
              </button>
            `)}
          </div>
        `}
      </div>

      <!-- Regreso al origen + Hora de salida -->
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
        <div class="space-y-1">
          <label class="block text-xs font-semibold text-slate-600">Hora de inicio</label>
          <input
            type="time"
            value=${startTime}
            onChange=${(e) => onChangeStartTime(e.target.value)}
            class="w-full px-2.5 py-1.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div class="space-y-1">
          <label class="block text-xs font-semibold text-slate-600">Nº de técnicos</label>
          <div class="flex items-center gap-2">
            <input
              type="number"
              min="1"
              max="10"
              value=${technicians.length}
              onChange=${(e) => onChangeTechCount(Number(e.target.value))}
              class="w-full px-2.5 py-1.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      <!-- Política de fin de jornada -->
      <div class="bg-slate-50 rounded-lg p-2.5 border border-slate-200">
        <label class="flex items-start gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked=${returnToDepot}
            onChange=${(e) => onChangeReturnToDepot(e.target.checked)}
            class="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
          />
          <div>
            <span class="block text-xs font-semibold text-slate-800">
              Regresar al punto de partida al finalizar
            </span>
            <span class="block text-[11px] text-slate-500">
              ${returnToDepot
                ? 'Ruta cerrada: incluye traslado de vuelta al almacén.'
                : 'Ruta abierta: cada técnico termina en su última clínica.'}
            </span>
          </div>
        </label>
      </div>

      <!-- Nombres de técnicos -->
      <div class="space-y-1.5">
        <label class="block text-xs font-semibold text-slate-600">
          Identificador de técnicos disponibles
        </label>
        <div class="grid grid-cols-1 gap-1.5 max-h-40 overflow-y-auto thin-scroll pr-1">
          ${technicians.map((tech) => html`
            <div key=${tech.id} class="flex items-center gap-2">
              <span
                class="w-3 h-3 rounded-full shrink-0 border border-white shadow-sm"
                style=${{ backgroundColor: tech.color }}
              ></span>
              <input
                type="text"
                value=${tech.name}
                onChange=${(e) => onRenameTechnician(tech.id, e.target.value)}
                class="w-full px-2.5 py-1 text-xs border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          `)}
        </div>
      </div>
    </section>
  `;
}
