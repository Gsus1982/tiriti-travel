# Changelog

Todas las fechas en hora local de España (CEST/CET). Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/).

## [0.1.1] - 2026-09-14

### Corregido
- `lib/db.ts`: inicialización perezosa del cliente de Neon (`getSql()`), en lugar de crear el cliente al importar el módulo. Evitaba que `npm run build` fallara en Vercel cuando `DATABASE_URL` aún no estaba configurada.
- `app/api/search/route.ts` y `app/api/meta/route.ts`: se añade `export const dynamic = 'force-dynamic'` y `export const runtime = 'nodejs'` para que Next.js no intente pre-renderizar/recolectar datos de estas rutas en tiempo de build, y para asegurar el runtime Node.js (necesario para el driver de Neon).
- Manejo de errores: las rutas API devuelven ahora el mensaje de error real (`err.message`) en la respuesta JSON en caso de fallo, para facilitar el diagnóstico.

### Infraestructura
- Proyecto Neon `tiriti-travel` creado (región `aws-us-west-2`, Postgres 18, plan gratuito).
- Proyecto Vercel `tiriti-travel` creado y enlazado al repositorio GitHub `Gsus1982/tiriti-travel` (despliegue automático en cada push a `main`).
- Variable de entorno `DATABASE_URL` configurada manualmente en Vercel (Production/Preview/Development) por el usuario, ya que el conector de Vercel disponible no expone una herramienta para gestionar variables de entorno por API.
- Deploy `dpl_Ed1PyuGMgNU9t3ZkghQFfaUNvaUY` marcado como `READY` tras el fix.
- Protección de despliegue (Vercel Authentication / SSO) verificada como activa (`deploymentType: all`) para mantener la app de acceso exclusivamente personal.

### Notas de verificación
- El build en Vercel completa correctamente (`state: READY`) usando el commit `8ed9e8e`.
- La comprobación de la respuesta HTTP de `/api/meta` y `/api/search` desde fuera de Vercel no pudo completarse mediante las herramientas automatizadas disponibles, debido a la protección de despliegue (SSO) y a una limitación de permisos (`403 Forbidden: Not authorized ... scope "gsus1982s-projects"`) en las herramientas de logs/runtime del conector de Vercel usado. Verificación manual pendiente: abrir la URL de producción en el navegador estando autenticado en Vercel y confirmar que la tabla de resultados carga con los datos de `legs`.

## [0.1.0] - 2026-09-14

### Añadido
- Scaffold inicial de la aplicación Next.js 14 (App Router) + TypeScript + Tailwind CSS.
- Modelo de datos en Postgres (Neon): `destination_groups`, `airports`, `legs`, `transfer_times`, `hotel_transfer`.
- Motor de búsqueda (`lib/search-engine.ts`) con:
  - Filtro no negociable de vuelos directos.
  - Origen fijo en España (mismo aeropuerto ida/vuelta).
  - Lógica de **open-jaw en destino**: evalúa todas las combinaciones de entrada/salida entre los aeropuertos de un mismo `destination_group` (incluye flexibilidad de ciudad dentro del mismo país, según lo acordado con el usuario).
  - Cálculo de traslado interno estimado (tren/bus) cuando hay open-jaw, vía tabla `transfer_times`.
  - Cálculo de la hora de salida del hotel el día de regreso (`hora_vuelo - 2h - traslado_aeropuerto`).
  - Filtros: hora mínima de salida ida/vuelta, equipaje de mano incluido, aerolíneas incluidas/excluidas, precio máximo total.
  - Ranking configurable: hora de salida del hotel (por defecto), precio total, duración total.
- Endpoints API: `POST /api/search` (búsqueda de itinerarios), `GET /api/meta` (orígenes y grupos de destino disponibles).
- UI de búsqueda (`app/page.tsx`) con formulario de filtros y tabla de resultados.
- Datos de ejemplo (`source = 'mock_seed_2026-09'`) para 10 rutas: Alicante–Cracovia, Alicante–Wroclaw, Valencia–Varsovia (Chopin y Modlin), Madrid–Riga, Madrid–Estocolmo, Madrid–Helsinki, Madrid–Oslo, Madrid–Atenas, Madrid–Sofia, Madrid–Belgrado.
- Repositorio GitHub privado `Gsus1982/tiriti-travel` creado.
- Proyecto Vercel creado y enlazado al repositorio para despliegue continuo.

### Decisiones de diseño registradas
- Se descarta Supabase como base de datos principal por preferencia explícita del usuario (uso gratuito ya agotado en su cuenta); se elige Neon por su plan gratuito real y su driver serverless optimizado para Vercel.
- No se incluye búsqueda de hoteles en esta fase (decisión explícita del usuario).
- No se incluye sistema de autenticación propio; la privacidad se gestiona con la protección de despliegue de Vercel, dado que la app es de uso exclusivamente personal.
- El open-jaw se permite entre ciudades distintas del mismo país (no solo entre aeropuertos de la misma ciudad), según confirmación explícita del usuario.
- El aeropuerto de origen en España nunca cambia entre ida y vuelta (sin flexibilidad de origen), también por confirmación explícita del usuario.
