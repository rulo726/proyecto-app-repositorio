import React, { useState, useEffect, useRef } from 'react';
import htm from 'htm';
import {
  searchAddresses,
  geocodeSingle,
  parseBulkInput,
  generateSampleCsv,
} from '../services/geocoder.js';

const html = htm.bind(React.createElement);

export function ClinicManager({
  clinics,
  onAddClinic,
  onAddClinicsBulk,
  onRemoveClinic,
  onUpdateClinic,
  assignmentsByClinicId,
  mapPickMode,
  onSetMapPickMode,
  pickedClinicLocation,
  onClearPickedClinicLocation,
}) {
  const [tab, setTab] = useState('single'); // 'single' | 'bulk'
  const [name, setName] = useState('');
  const [query, setQuery] = useState('');
  const [selectedLoc, setSelectedLoc] = useState(null);
  const [repairMinutes, setRepairMinutes] = useState(45);
  const [priority, setPriority] = useState('Normal');
  const [suggestions, setSuggestions] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [formError, setFormError] = useState('');

  // Carga masiva / CSV
  const [bulkText, setBulkText] = useState('');
  const [bulkStatus, setBulkStatus] = useState(null);
  const [isImporting, setIsImporting] = useState(false);

  const abortRef = useRef(null);

  // Recibir coordenadas cuando el usuario hace clic en el mapa
  useEffect(() => {
    if (pickedClinicLocation) {
      setSelectedLoc(pickedClinicLocation);
      setQuery(`${pickedClinicLocation.lat.toFixed(5)}, ${pickedClinicLocation.lng.toFixed(5)}`);
      setShowDropdown(false);
      setFormError('');
      onClearPickedClinicLocation();
    }
  }, [pickedClinicLocation]);

  // Autocompletado de direcciones
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
    setSelectedLoc({ address: item.address, lat: item.lat, lng: item.lng });
    setQuery(item.address);
    setShowDropdown(false);
    setFormError('');
  };

  const handleSubmitSingle = async (e) => {
    e.preventDefault();
    setFormError('');

    let loc = selectedLoc;
    if (!loc && query.trim()) {
      setIsSearching(true);
      loc = await geocodeSingle(query.trim());
      setIsSearching(false);
    }

    if (!loc) {
      setFormError('Selecciona una dirección válida, pega coordenadas (lat, lng) o márcala en el mapa.');
      return;
    }

    onAddClinic({
      name: name.trim() || `Clínica ${clinics.length + 1}`,
      address: loc.address,
      lat: loc.lat,
      lng: loc.lng,
      repairMinutes: Math.max(5, Number(repairMinutes) || 45),
      priority,
    });

    setName('');
    setQuery('');
    setSelectedLoc(null);
    setRepairMinutes(45);
    setPriority('Normal');
  };

  const handleImportBulk = async () => {
    const items = parseBulkInput(bulkText);
    if (items.length === 0) {
      setBulkStatus({ type: 'error', message: 'No se detectaron líneas válidas para importar.' });
      return;
    }

    setIsImporting(true);
    setBulkStatus({ type: 'info', message: `Procesando ${items.length} paradas...` });

    const resolved = [];
    let failedCount = 0;

    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      if (item.lat != null && item.lng != null) {
        resolved.push({
          name: item.name,
          address: item.query,
          lat: item.lat,
          lng: item.lng,
          repairMinutes: item.repairMinutes,
          priority: item.priority,
        });
      } else {
        const geo = await geocodeSingle(item.query);
        if (geo) {
          resolved.push({
            name: item.name,
            address: geo.address,
            lat: geo.lat,
            lng: geo.lng,
            repairMinutes: item.repairMinutes,
            priority: item.priority,
          });
        } else {
          failedCount += 1;
        }
        // Pausa breve para respetar límites de geocodificadores gratuitos
        await new Promise((r) => setTimeout(r, 250));
      }
    }

    if (resolved.length > 0) {
      onAddClinicsBulk(resolved);
    }

    setIsImporting(false);
    setBulkStatus({
      type: failedCount > 0 ? 'warn' : 'success',
      message:
        failedCount > 0
          ? `Se agregaron ${resolved.length} clínicas. No se pudieron geocodificar ${failedCount} líneas.`
          : `Se agregaron ${resolved.length} clínicas correctamente.`,
    });
    if (failedCount === 0) setBulkText('');
  };

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setBulkText(String(ev.target?.result || ''));
      setBulkStatus(null);
    };
    reader.readAsText(file, 'UTF-8');
    e.target.value = '';
  };

  const handleDownloadTemplate = () => {
    const csv = generateSampleCsv();
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'plantilla_clinicas_dentales.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return html`
    <section class="bg-white rounded-xl border border-slate-200 p-4 space-y-4 shadow-sm">
      <div class="flex items-center justify-between">
        <h2 class="text-sm font-bold text-slate-800 flex items-center gap-2">
          🏥 Clínicas Dentales (${clinics.length})
        </h2>
        <div class="inline-flex rounded-lg bg-slate-100 p-0.5 text-xs">
          <button
            type="button"
            onClick=${() => setTab('single')}
            class=${`px-2.5 py-1 rounded-md font-semibold transition ${
              tab === 'single' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Agregar una
          </button>
          <button
            type="button"
            onClick=${() => setTab('bulk')}
            class=${`px-2.5 py-1 rounded-md font-semibold transition ${
              tab === 'bulk' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Masiva / CSV
          </button>
        </div>
      </div>

      ${tab === 'single'
        ? html`
            <form onSubmit=${handleSubmitSingle} class="space-y-3">
              <div>
                <label class="block text-xs font-semibold text-slate-600 mb-1">
                  Nombre de la clínica
                </label>
                <input
                  type="text"
                  value=${name}
                  onChange=${(e) => setName(e.target.value)}
                  placeholder="Ej. Clínica Dental Sonrisa"
                  class="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div class="relative">
                <div class="flex items-center justify-between mb-1">
                  <label class="block text-xs font-semibold text-slate-600">
                    Dirección o coordenadas
                  </label>
                  <button
                    type="button"
                    onClick=${() => onSetMapPickMode(mapPickMode === 'clinic' ? null : 'clinic')}
                    class=${`text-[11px] font-semibold px-2 py-0.5 rounded border transition ${
                      mapPickMode === 'clinic'
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-slate-50 text-blue-700 border-slate-200 hover:bg-blue-50'
                    }`}
                  >
                    ${mapPickMode === 'clinic' ? 'Haz clic en el mapa...' : '📍 Pin en mapa'}
                  </button>
                </div>

                <input
                  type="text"
                  value=${query}
                  onFocus=${() => setShowDropdown(true)}
                  onChange=${(e) => {
                    setQuery(e.target.value);
                    setSelectedLoc(null);
                    setShowDropdown(true);
                  }}
                  placeholder="Ej. Gran Vía 45, Madrid o 40.4203, -3.7058"
                  class="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />

                ${showDropdown && (isSearching || suggestions.length > 0) && html`
                  <div class="absolute left-0 right-0 top-16 bg-white border border-slate-200 rounded-lg shadow-lg z-30 max-h-48 overflow-y-auto">
                    ${isSearching && html`
                      <div class="px-3 py-2 text-xs text-slate-500">Buscando ubicaciones...</div>
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

              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="block text-xs font-semibold text-slate-600 mb-1">
                    Reparación (min)
                  </label>
                  <select
                    value=${repairMinutes}
                    onChange=${(e) => setRepairMinutes(Number(e.target.value))}
                    class="w-full px-2.5 py-1.5 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="15">15 min</option>
                    <option value="30">30 min</option>
                    <option value="45">45 min</option>
                    <option value="60">1 hora (60 min)</option>
                    <option value="90">1.5 horas (90 min)</option>
                    <option value="120">2 horas (120 min)</option>
                  </select>
                </div>

                <div>
                  <label class="block text-xs font-semibold text-slate-600 mb-1">
                    Prioridad
                  </label>
                  <select
                    value=${priority}
                    onChange=${(e) => setPriority(e.target.value)}
                    class="w-full px-2.5 py-1.5 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="Normal">Normal</option>
                    <option value="Urgente">🚨 Urgente</option>
                  </select>
                </div>
              </div>

              ${formError && html`
                <p class="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-2.5 py-1.5">
                  ${formError}
                </p>
              `}

              <button
                type="submit"
                disabled=${isSearching}
                class="w-full py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition"
              >
                + Agregar parada a la jornada
              </button>
            </form>
          `
        : html`
            <div class="space-y-3">
              <div class="flex items-center justify-between gap-2">
                <label class="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg border border-slate-200 cursor-pointer transition">
                  📄 Subir archivo CSV
                  <input
                    type="file"
                    accept=".csv,.txt"
                    onChange=${handleFileUpload}
                    class="hidden"
                  />
                </label>

                <button
                  type="button"
                  onClick=${handleDownloadTemplate}
                  class="text-xs font-semibold text-blue-600 hover:text-blue-700 underline"
                >
                  Descargar plantilla CSV
                </button>
              </div>

              <textarea
                rows="5"
                value=${bulkText}
                onChange=${(e) => setBulkText(e.target.value)}
                placeholder="Pega una clínica por línea:&#10;Clínica Centro | Gran Vía 45, Madrid | 45 | Urgente&#10;Dental Norte | 40.4567, -3.6901 | 30 | Normal"
                class="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              ></textarea>

              ${bulkStatus && html`
                <div
                  class=${`text-xs px-3 py-2 rounded-lg border ${
                    bulkStatus.type === 'error'
                      ? 'bg-rose-50 text-rose-700 border-rose-200'
                      : bulkStatus.type === 'warn'
                      ? 'bg-amber-50 text-amber-700 border-amber-200'
                      : bulkStatus.type === 'success'
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-blue-50 text-blue-700 border-blue-200'
                  }`}
                >
                  ${bulkStatus.message}
                </div>
              `}

              <button
                type="button"
                onClick=${handleImportBulk}
                disabled=${isImporting || !bulkText.trim()}
                class="w-full py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 rounded-lg transition"
              >
                ${isImporting ? 'Geocodificando lista...' : 'Importar paradas'}
              </button>
            </div>
          `}

      <!-- Lista de clínicas cargadas -->
      <div class="border-t border-slate-100 pt-3">
        ${clinics.length === 0
          ? html`
              <p class="text-xs text-slate-400 text-center py-4">
                Aún no hay clínicas agregadas. Usa el formulario o pulsa "Cargar demo (Madrid)".
              </p>
            `
          : html`
              <div class="space-y-2 max-h-72 overflow-y-auto thin-scroll pr-1">
                ${clinics.map((clinic) => {
                  const assignment = assignmentsByClinicId[clinic.id];
                  return html`
                    <div
                      key=${clinic.id}
                      class="p-2.5 rounded-lg border border-slate-200 bg-slate-50/70 hover:bg-white transition flex items-start justify-between gap-2"
                    >
                      <div class="min-w-0 flex-1">
                        <div class="flex items-center gap-1.5 flex-wrap">
                          ${assignment && html`
                            <span
                              class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold text-white"
                              style=${{ backgroundColor: assignment.color }}
                            >
                              #${assignment.order} · ${assignment.techName}
                            </span>
                          `}
                          <span class="text-xs font-bold text-slate-800 truncate">
                            ${clinic.name}
                          </span>
                          <button
                            type="button"
                            onClick=${() =>
                              onUpdateClinic(clinic.id, {
                                priority: clinic.priority === 'Urgente' ? 'Normal' : 'Urgente',
                              })}
                            title="Clic para cambiar prioridad"
                            class=${`px-1.5 py-0.5 rounded text-[10px] font-semibold border transition ${
                              clinic.priority === 'Urgente'
                                ? 'bg-rose-100 text-rose-700 border-rose-200'
                                : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                            }`}
                          >
                            ${clinic.priority === 'Urgente' ? '🚨 Urgente' : 'Normal'}
                          </button>
                        </div>

                        <p class="text-[11px] text-slate-500 truncate mt-0.5">
                          ${clinic.address}
                        </p>

                        <div class="flex items-center gap-3 mt-1 text-[11px] text-slate-500">
                          <span>🛠️ ${clinic.repairMinutes} min</span>
                          <span>📍 ${clinic.lat.toFixed(4)}, ${clinic.lng.toFixed(4)}</span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick=${() => onRemoveClinic(clinic.id)}
                        class="text-slate-400 hover:text-rose-600 p-1 text-xs font-bold"
                        title="Eliminar parada"
                      >
                        ✕
                      </button>
                    </div>
                  `;
                })}
              </div>
            `}
      </div>
    </section>
  `;
}
