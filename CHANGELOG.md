# Changelog

Todas las fechas en hora local de España (CEST/CET). Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/).

## [0.3.0] - 2026-09-14

### Anadido
- **Buscador en lenguaje natural (beta)** (`lib/nlp-search.ts`, `parseSearchQuery`): cuadro de texto en la UI que interpreta frases en espanol (origenes, destino, dias, horas) y precarga el formulario de filtros. Basado en reglas (regex + diccionario), no en un LLM.
- Deteccion de destinos mencionados que aun no estan en la base de datos (p. ej. "Londres"), con aviso explicito en vez de fallo silencioso.
- Documentacion explicita de la limitacion de logica condicional compleja ("dia A si es despues de hora X, si no dia B a partir de hora Y"): se aproxima con rango de fechas + hora mas permisiva, avisando siempre al usuario.

### Corregido
- Bug de TypeScript (`sortBy` no incluido en `SharedParams`) que rompio 2 builds consecutivos en `lib/live-engine.ts` y `lib/search-engine.ts` tras el cambio a multibusqueda; solucionado pasando el objeto `filters` completo a las funciones internas en lugar de una copia parcial.
- Bug propio detectado antes de publicar: variable `parsedResult` referenciada antes de su declaracion en el primer borrador de `lib/nlp-search.ts`; corregido usando variables `let` inicializadas correctamente antes de construir el objeto de retorno.

### Infraestructura
- Multiples deployments de prueba y error durante el desarrollo de la multibusqueda (visibles en el historial de Vercel): 3 builds con `ERROR` por el bug de tipos, resueltos en el commit `683427c`.

## [0.2.1] - 2026-09-14

### Anadido
- **Multibusqueda**: los motores mock y live aceptan ahora `originIatas: string[]` y `destinationGroupIds: string[]` (antes `originIata`/`destinationGroupId` singulares). Se generan todas las combinaciones origen x destino, se buscan en paralelo y se mezclan en una sola lista de resultados ordenada globalmente.
- Limite de seguridad `MAX_ORIGIN_GROUP_COMBOS = 6` en el motor live, para no disparar el consumo de la cuota gratuita de Ignav sin darse cuenta.
- Campos `originIata`, `destinationGroupId`, `destinationGroupName` anadidos a `LiveItinerary` para poder mostrar de que combinacion viene cada resultado en la tabla (columna "Ruta").
- UI: selectores de origen y destino convertidos de dropdown unico a chips seleccionables multiples (checkboxes visuales), con contador de combinaciones en tiempo real.

### Corregido
- Bug de conector: un `push_files` con 6 archivos a la vez descarto silenciosamente `app/page.tsx` del commit sin dar error; desde entonces se verifica cada commit con `get_commit` antes de darlo por bueno, y se prefiere subir la UI en commits separados de 1 archivo.

## [0.2.0] - 2026-09-14

### Anadido
- **Integracion con Ignav** (`lib/ignav.ts`, `lib/live-engine.ts`): motor de busqueda en vivo alternativo al motor mock, usando la API real de Ignav (`POST /api/fares/one-way`, `POST /api/fares/booking-links`).
- Nuevos endpoints: `POST /api/search-live` (busqueda en vivo) y `POST /api/booking-link` (enlaces de reserva reales por proveedor).
- Selector Mock / Ignav en la UI, con tabla de resultados separada para cada modo y boton "Ver enlaces ida" que consulta booking-links en directo.
- **Rango de fechas**: `outboundDateFrom/To` e `inboundDateFrom/To` sustituyen a las fechas unicas; el motor explora todas las fechas del rango (funcion `datesBetween` en `lib/types.ts`).
- **Reintentos automaticos** ante errores 424/429/502/503/504 de Ignav (hasta 2 reintentos con backoff de 400ms, 800ms).
- **Warnings explicitos**: en vez de devolver "0 resultados" en silencio ante un fallo de la API, el motor live captura y expone el mensaje de error real de Ignav por cada llamada fallida.

### Corregido
- Bug critico: `IGNAV_API_KEY` no se recogia en el build porque Vercel no aplica automaticamente cambios de variables de entorno a un deployment ya existente; se necesita un nuevo deploy (documentado en el README).
- Se detecto que la primera version del motor live silenciaba los errores de la API dentro de un `.catch()` que devolvia una respuesta vacia sin registrar el motivo; corregido con la funcion `safeSearchOneWay` que acumula los errores en un array `warnings`.

### Seguridad
- Aviso al usuario para rotar la API key de Ignav tras haberla compartido en el chat, por higiene de seguridad (no por compromiso detectado).

## [0.1.2] - 2026-09-14

### Corregido
- `lib/db.ts`: se anade `sanitizeConnectionString()` (normaliza espacios Unicode especiales — thin space U+2009, non-breaking space U+00A0, etc. — a espacio ASCII) y `assertAscii()` (valida caracter a caracter con mensaje de error descriptivo). Causa raiz: al copiar `DATABASE_URL` desde el chat a Vercel se colo un caracter U+2009, produciendo el error `Cannot convert argument to a ByteString...`.

### Verificado
- Verificacion end-to-end completada por el usuario: busqueda real ALC -> Polonia, 04/12/2026 -> 08/12/2026, 2 adultos + 1 nino, open-jaw activado. Resultado: 6 itinerarios devueltos correctamente desde Neon.

## [0.1.1] - 2026-09-14

### Corregido
- `lib/db.ts`: inicializacion perezosa del cliente de Neon (`getSql()`), evitando que `npm run build` fallara en Vercel cuando `DATABASE_URL` aun no estaba configurada.
- `app/api/search/route.ts` y `app/api/meta/route.ts`: `export const dynamic = 'force-dynamic'` y `export const runtime = 'nodejs'` para evitar pre-renderizado en build time.

### Infraestructura
- Proyecto Neon `tiriti-travel` creado (region `aws-us-west-2`, Postgres 18, plan gratuito).
- Proyecto Vercel `tiriti-travel` creado y enlazado al repositorio GitHub, despliegue automatico en cada push a `main`.
- Proteccion de despliegue (Vercel Authentication / SSO) activada para mantener la app de acceso exclusivamente personal.

## [0.1.0] - 2026-09-14

### Anadido
- Scaffold inicial de la aplicacion Next.js 14 (App Router) + TypeScript + Tailwind CSS.
- Modelo de datos en Postgres (Neon): `destination_groups`, `airports`, `legs`, `transfer_times`, `hotel_transfer`.
- Motor de busqueda mock inicial con: filtro no negociable de vuelos directos, origen fijo, open-jaw en destino, calculo de traslado interno, calculo de hora de salida del hotel, filtros de hora/equipaje/aerolinea/precio, ranking configurable.
- Endpoints iniciales: `POST /api/search`, `GET /api/meta`.
- UI de busqueda inicial (`app/page.tsx`) con formulario de filtros y tabla de resultados.
- Datos de ejemplo (`source = 'mock_seed_2026-09'`) para 10 rutas iniciales.
- Repositorio GitHub privado `Gsus1982/tiriti-travel` creado.

### Decisiones de diseno registradas
- Se descarta Supabase como base de datos principal por preferencia explicita del usuario; se elige Neon por su plan gratuito real y driver serverless optimizado para Vercel.
- No se incluye busqueda de hoteles en esta fase (decision explicita del usuario).
- No se incluye sistema de autenticacion propio; la privacidad se gestiona con la proteccion de despliegue de Vercel.
- El open-jaw se permite entre ciudades distintas del mismo pais (no solo entre aeropuertos de la misma ciudad).
- El aeropuerto de origen en Espana nunca cambia entre ida y vuelta dentro de una misma combinacion de busqueda.
