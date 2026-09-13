# TiritiTravel

Metabuscador **personal** de vuelos directos (uso exclusivo de Jesús), pensado para sustituir búsquedas manuales en Skyscanner/Kayak/Kiwi para viajes concretos.

## Qué hace hoy (v0.1)

- Motor de búsqueda propio sobre una base de datos Postgres (Neon) con:
  - Filtro **no negociable** de vuelos directos (`is_direct = TRUE`) en ambos tramos.
  - **Origen fijo** en España (mismo aeropuerto en ida y vuelta).
  - **Open-jaw en destino**: si el grupo de destino tiene varios aeropuertos/ciudades (p. ej. Polonia: KRK/WRO/WAW/WMI), el motor evalúa TODAS las combinaciones de entrada/salida y calcula si compensa un open-jaw, indicando el traslado interno estimado (tren/bus) cuando lo conoce.
  - Filtros de hora mínima de salida (ida) y hora mínima de salida (vuelta), equipaje de mano incluido, aerolíneas incluidas/excluidas, precio máximo total.
  - Cálculo automático de la **hora de salida del hotel** el día de regreso: `hora del vuelo de vuelta − 2h de aeropuerto − traslado hotel→aeropuerto`.
  - Ranking configurable: por hora de salida del hotel (criterio decisivo del proyecto), por precio total, o por duración.

## Importante: datos actuales son de ejemplo (mock)

La base de datos está poblada con vuelos de **ejemplo** (`source = 'mock_seed_2026-09'`) construidos a partir de la investigación previa (rutas, aerolíneas y horarios orientativos reales), pero **los precios y horarios exactos NO están verificados en vivo**. Cuando se conecte una API de tarifas reales (Ignav, FlightAPI, etc.), se sustituirá esta fuente por datos verificados, marcados con `source = 'ignav'` o similar.

## Stack

- **Next.js 14 (App Router) + TypeScript + Tailwind** — frontend y API routes.
- **Neon (Postgres serverless)** — base de datos de aeropuertos, grupos de destino, vuelos y traslados.
- **Vercel** — despliegue.

## Estructura

```
app/
  page.tsx            -> UI de búsqueda y resultados
  api/search/route.ts -> POST: ejecuta el motor de búsqueda
  api/meta/route.ts   -> GET: orígenes y grupos de destino disponibles
lib/
  search-engine.ts    -> lógica de búsqueda, open-jaw y ranking
  db.ts               -> conexión a Neon
  types.ts            -> tipos compartidos
scripts/schema.sql    -> esquema documentado (ya aplicado en Neon)
```

## Próximos pasos

1. Conectar una API de tarifas reales (Ignav / FlightAPI) para sustituir los datos mock por precios verificados.
2. Añadir buscador de hoteles (fuera de alcance del MVP actual, por decisión explícita).
3. Añadir más grupos de destino y aeropuertos de origen si se necesitan.
