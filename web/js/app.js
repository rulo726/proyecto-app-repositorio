import React, { useState, useMemo, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import htm from 'htm';

import { HeaderBar } from './components/HeaderBar.js';
import { ConfigPanel } from './components/ConfigPanel.js';
import { ClinicManager } from './components/ClinicManager.js';
import { MapView } from './components/MapView.js';
import { ItineraryPanel } from './components/ItineraryPanel.js';

import { SAMPLE_SCENARIO } from './services/geocoder.js';
import {
  TECHNICIAN_COLORS,
  fetchDistanceTimeMatrix,
  fetchRouteGeometry,
} from './services/osrmClient.js';
import { solveVRP } from './services/vrpSolver.js';

const html = htm.bind(React.createElement);

function buildTechnicians(count, existing = []) {
  const safeCount = Math.max(1, Math.min(10, count || 1));
  return Array.from({ length: safeCount }, (_, idx) => ({
    id: existing[idx]?.id || `tech-${idx + 1}`,
    name: existing[idx]?.name || `Técnico ${idx + 1}`,
    color: TECHNICIAN_COLORS[idx % TECHNICIAN_COLORS.length],
  }));
}

function App() {
  const [depot, setDepot] = useState(SAMPLE_SCENARIO.depot);
  const [returnToDepot, setReturnToDepot] = useState(true);
  const [startTime, setStartTime] = useState('08:30');
  const [technicians, setTechnicians] = useState(() =>
    SAMPLE_SCENARIO.technicians.map((t, idx) => ({
      ...t,
      color: TECHNICIAN_COLORS[idx % TECHNICIAN_COLORS.length],
    }))
  );
  const [clinics, setClinics] = useState(SAMPLE_SCENARIO.clinics);

  const [solution, setSolution] = useState(null);
  const [routeGeometries, setRouteGeometries] = useState({});
  const [matrixSource, setMatrixSource] = useState(null);
  const [warning, setWarning] = useState(null);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [selectedTechId, setSelectedTechId] = useState('all');

  const [mapPickMode, setMapPickMode] = useState(null); // null | 'depot' | 'clinic'
  const [pickedClinicLocation, setPickedClinicLocation] = useState(null);

  const handleChangeTechCount = (newCount) => {
    setTechnicians((prev) => buildTechnicians(newCount, prev));
    setSolution(null);
    setRouteGeometries({});
  };

  const handleRenameTechnician = (id, newName) => {
    setTechnicians((prev) =>
      prev.map((t) => (t.id === id ? { ...t, name: newName } : t))
    );
  };

  const handleAddClinic = (clinicData) => {
    const newClinic = {
      ...clinicData,
      id: `c-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    };
    setClinics((prev) => [...prev, newClinic]);
    setSolution(null);
    setRouteGeometries({});
  };

  const handleAddClinicsBulk = (items) => {
    const stamped = items.map((item, idx) => ({
      ...item,
      id: `c-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 5)}`,
    }));
    setClinics((prev) => [...prev, ...stamped]);
    setSolution(null);
    setRouteGeometries({});
  };

  const handleRemoveClinic = (id) => {
    setClinics((prev) => prev.filter((c) => c.id !== id));
    setSolution(null);
    setRouteGeometries({});
  };

  const handleUpdateClinic = (id, patch) => {
    setClinics((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...patch } : c))
    );
    setSolution(null);
    setRouteGeometries({});
  };

  const handleLoadSample = () => {
    setDepot(SAMPLE_SCENARIO.depot);
    setTechnicians(
      SAMPLE_SCENARIO.technicians.map((t, idx) => ({
        ...t,
        color: TECHNICIAN_COLORS[idx % TECHNICIAN_COLORS.length],
      }))
    );
    setClinics(SAMPLE_SCENARIO.clinics);
    setSolution(null);
    setRouteGeometries({});
    setMatrixSource(null);
    setWarning(null);
    setSelectedTechId('all');
  };

  const handleClearAll = () => {
    setClinics([]);
    setSolution(null);
    setRouteGeometries({});
    setMatrixSource(null);
    setWarning(null);
  };

  const handleMapClickLocation = useCallback(
    (loc) => {
      if (mapPickMode === 'depot') {
        setDepot((prev) => ({
          ...prev,
          address: loc.address,
          lat: loc.lat,
          lng: loc.lng,
        }));
        setSolution(null);
        setRouteGeometries({});
      } else if (mapPickMode === 'clinic') {
        setPickedClinicLocation(loc);
      }
      setMapPickMode(null);
    },
    [mapPickMode]
  );

  const handleOptimize = async () => {
    if (clinics.length === 0) return;
    setIsOptimizing(true);
    setWarning(null);
    setSelectedTechId('all');

    try {
      const points = [depot, ...clinics];
      const matrix = await fetchDistanceTimeMatrix(points);
      setMatrixSource(matrix.source);
      if (matrix.warning) setWarning(matrix.warning);

      const solved = solveVRP({
        depot,
        clinics,
        technicians,
        matrix,
        options: { returnToDepot, startTime },
      });

      setSolution(solved);

      // Obtener geometrías de calle por técnico en paralelo
      const geomEntries = await Promise.all(
        solved.routes.map(async (route) => {
          if (route.stops.length === 0) return [route.technician.id, []];
          const geom = await fetchRouteGeometry(route.orderedPoints);
          return [route.technician.id, geom.coordinates];
        })
      );

      setRouteGeometries(Object.fromEntries(geomEntries));
    } catch (err) {
      setWarning(`Ocurrió un error al optimizar las rutas: ${err.message}`);
    } finally {
      setIsOptimizing(false);
    }
  };

  // Mapa rápido clinicId -> { techName, color, order } para mostrar asignación en la lista
  const assignmentsByClinicId = useMemo(() => {
    const map = {};
    if (!solution) return map;
    solution.routes.forEach((route) => {
      route.stops.forEach((stop) => {
        map[stop.clinic.id] = {
          techName: route.technician.name,
          color: route.technician.color,
          order: stop.order,
        };
      });
    });
    return map;
  }, [solution]);

  return html`
    <div class="min-h-screen flex flex-col">
      <${HeaderBar}
        clinicsCount=${clinics.length}
        techCount=${technicians.length}
        isOptimizing=${isOptimizing}
        matrixSource=${matrixSource}
        onLoadSample=${handleLoadSample}
        onOptimize=${handleOptimize}
        onClearAll=${handleClearAll}
      />

      <main class="flex-1 max-w-[1600px] w-full mx-auto p-4 lg:p-6 grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        <!-- Columna izquierda: Configuración y clínicas -->
        <aside class="lg:col-span-4 space-y-4">
          <${ConfigPanel}
            depot=${depot}
            onChangeDepot=${(next) => {
              setDepot(next);
              setSolution(null);
            }}
            returnToDepot=${returnToDepot}
            onChangeReturnToDepot=${(val) => {
              setReturnToDepot(val);
              setSolution(null);
            }}
            startTime=${startTime}
            onChangeStartTime=${setStartTime}
            technicians=${technicians}
            onChangeTechCount=${handleChangeTechCount}
            onRenameTechnician=${handleRenameTechnician}
            mapPickMode=${mapPickMode}
            onSetMapPickMode=${setMapPickMode}
          />

          <${ClinicManager}
            clinics=${clinics}
            onAddClinic=${handleAddClinic}
            onAddClinicsBulk=${handleAddClinicsBulk}
            onRemoveClinic=${handleRemoveClinic}
            onUpdateClinic=${handleUpdateClinic}
            assignmentsByClinicId=${assignmentsByClinicId}
            mapPickMode=${mapPickMode}
            onSetMapPickMode=${setMapPickMode}
            pickedClinicLocation=${pickedClinicLocation}
            onClearPickedClinicLocation=${() => setPickedClinicLocation(null)}
          />
        </aside>

        <!-- Columna derecha: Mapa + Itinerarios -->
        <section class="lg:col-span-8 space-y-5">
          <div class="h-[420px] lg:h-[540px]">
            <${MapView}
              depot=${depot}
              clinics=${clinics}
              routes=${solution?.routes || []}
              routeGeometries=${routeGeometries}
              selectedTechId=${selectedTechId}
              mapPickMode=${mapPickMode}
              onMapClickLocation=${handleMapClickLocation}
            />
          </div>

          <${ItineraryPanel}
            solution=${solution}
            depot=${depot}
            returnToDepot=${returnToDepot}
            selectedTechId=${selectedTechId}
            onSelectTechId=${setSelectedTechId}
            warning=${warning}
          />
        </section>
      </main>
    </div>
  `;
}

createRoot(document.getElementById('root')).render(html`<${App} />`);
