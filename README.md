# DentalRoute VRP — Optimización de Rutas para Servicio Técnico Dental

Aplicación web para planificar y optimizar las rutas diarias de técnicos de campo que atienden reportes de mantenimiento y reparación en clínicas dentales (Vehicle Routing Problem - VRP).

## Características principales

- **Punto de partida y política de cierre:** Define oficina/almacén central (autocompletado, coordenadas o clic en mapa) y si los técnicos regresan al origen o finalizan en la última clínica.
- **Gestión de técnicos:** Configura el número de técnicos disponibles (1–10), sus nombres y la hora de inicio de jornada.
- **Entrada de clínicas dentales:** Alta individual con autocompletado de direcciones o coordenadas, tiempo estimado de reparación, prioridad (`Normal` / `Urgente`) y carga masiva pegando texto o subiendo un archivo `.csv`.
- **Motor VRP + OSRM:** Calcula la matriz de tiempos/distancias reales por carretera usando **OSRM** (con fallback automático a estimación urbana Haversine si no hay conexión) y optimiza el reparto equilibrado entre técnicos con prioridad para urgencias y búsqueda local 2-Opt / Relocate / Swap.
- **Mapa interactivo y exportación:** Visualiza rutas diferenciadas por color en **Leaflet**, muestra el itinerario paso a paso con hora estimada de llegada (ETA) y permite copiar el parte listo para **WhatsApp** o abrir la ruta en **Google Maps** / **Waze**.

## Ejecución local

No requiere API Keys ni compilación previa:

```bash
cd web
python3 -m http.server 8080
```

Después abre en el navegador: `http://localhost:8080`.

## Despliegue en Vercel

El archivo `vercel.json` configura `web/` como directorio de salida estático, listo para desplegar directamente desde GitHub.
