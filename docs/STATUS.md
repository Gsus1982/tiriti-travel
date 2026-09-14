# Estado del proyecto TiritiTravel

## Estado al 14 de septiembre de 2026, 15:34 CEST — Sesion 2: rediseno + fix + filtros nuevos + Sky Scrapper

### Resumen ejecutivo de esta sesion
- Se identifico y corrigio la causa exacta del error "Faltan campos obligatorios" que aparecia al buscar destinos sueltos (ej. Londres/Heathrow) sin usar un grupo curado con evento.
- Se hizo un rediseno visual completo de `app/page.tsx` inspirado en https://dribbble.com/shots/26617634-Private-Jet-Booking-Luxury-Travel-Flight-Booking-App-UI (fondo oscuro #0a0c10/#12151b, acentos dorados #c9a24a).
- Se anadio un filtro nuevo "Ciudades a descartar" (excludeIatas) y una agrupacion "(todos)" para ciudades con varios aeropuertos (Londres, y cualquier otra que aparezca en el listado real de Aena).
- Se quito la lista fija de destinos curados con evento/temporada del selector, sustituida por una sugerencia de usar el cuadro de busqueda en lenguaje natural.
- Se investigo la API "Sky Scrapper" de RapidAPI como fuente de datos alternativa a Ignav y se creo un cliente nuevo `lib/skyscanner.ts`, sin integrarlo aun en el motor de busqueda principal (paso deliberadamente aislado para no arriesgar el motor que ya funciona).
- Todo esto esta en el **PR #15** (rama `feat/luxury-ui-exclude-filter-fix`), **sin mergear todavia**, a la espera de que el usuario revise el preview visual de Vercel.

### Aviso de seguridad critico de esta sesion
El usuario pego en el chat una API key real de RapidAPI en texto plano (`x-rapidapi-key: 7a60fa...`). **Esa key NUNCA se ha escrito en ningun archivo ni commit del repositorio.** Instrucciones detalladas paso a paso para el usuario, pendientes de ejecutar:

**Paso 1 — Regenerar la key filtrada en RapidAPI:**
1. Entra en https://rapidapi.com y haz login con la cuenta que usaste para suscribirte a "Sky Scrapper" / "Air Scraper".
2. Ve a tu perfil (icono arriba a la derecha) → "My Apps" (o "Apps").
3. Selecciona la app que tiene asociada esa API (normalmente se llama "default-application_...").
4. Dentro de la app, busca la seccion "Security" o el propio listado de la key.
5. Hay un boton para regenerar/rotar la key (a veces aparece como un icono de refresco junto a la key). Al pulsarlo se invalida la key vieja (la que se compartio en el chat) y se genera una nueva.
6. Copia la key nueva, la necesitaras para el paso 2.

**Paso 2 — Anadir la key nueva como variable de entorno en Vercel:**
1. Entra en https://vercel.com y abre el proyecto `tiriti-travel`.
2. Ve a la pestana "Settings" del proyecto (arriba).
3. En el menu lateral izquierdo, pulsa "Environment Variables".
4. En el campo "Key" escribe exactamente: `RAPIDAPI_SKY_SCRAPPER_KEY`
5. En el campo "Value" pega la key nueva (la del paso 1, nunca la vieja).
6. En "Environments" marca al menos "Production"; si tambien quieres probarlo en los despliegues de PRs, marca tambien "Preview".
7. Pulsa "Save".
8. Importante: anadir una variable de entorno nueva NO redespliega automaticamente los despliegues ya existentes. Si quieres que el codigo la vea de inmediato, ve a la pestana "Deployments", abre el despliegue de `main` mas reciente y pulsa el menu de tres puntos → "Redeploy".

Mientras esos 2 pasos no se completen, cualquier codigo que intente usar `lib/skyscanner.ts` lanzara un error explicito y controlado (`RAPIDAPI_SKY_SCRAPPER_KEY no esta configurada...`) en vez de fallar en silencio. Ese cliente todavia no se llama desde ningun endpoint de la app, asi que su ausencia no rompe nada de lo que ya funciona.

### PR #15 (abierto, sin mergear) — feat/luxury-ui-exclude-filter-fix
Contenido del PR:
- `app/api/search-live/route.ts`: FIX del bug de validacion. Antes: `if (!destinationGroupIds?.length || ...)` rechazaba busquedas validas que usaban solo `destinationIatas`. Ahora: `if ((!destinationGroupIds?.length && !destinationIatas?.length) || ...)`. Tambien anade el filtrado por `excludeIatas` sobre el resultado ya devuelto por `searchLiveItineraries`.
- `lib/skyscanner.ts` (nuevo): cliente para la API Sky Scrapper (RapidAPI, host `sky-scrapper.p.rapidapi.com`), con funciones `searchAirport` y `searchFlights`. Lee la key SIEMPRE desde `process.env.RAPIDAPI_SKY_SCRAPPER_KEY`. No integrado aun en `lib/live-engine.ts`.
- `app/page.tsx`: rediseno completo. Fondo oscuro (#0a0c10 tarjetas, #12151b secciones), acentos dorados (#c9a24a), hero editorial con imagen de fondo (Pexels) y texto "Vuelos directos, sin escalas.". Nuevo campo "Ciudades a descartar" (input de texto con IATAs separados por coma, filtra tanto el selector como -via el payload `excludeIatas`- los resultados). Nueva funcion `groupByCity()` que agrupa aeropuertos que comparten el mismo nombre de ciudad base (ej. "LONDRES /HEATHROW", "LONDRES /GATWICK", "LONDRES /LUTON", "LONDRES /STANSTED" → chip extra "LONDRES (todos)" que selecciona los 4 a la vez). Se elimino el bloque de chips fijos de "grupos curados con evento/temporada"; en su lugar hay una nota sugiriendo usar el cuadro de NLP para describir el evento buscado.

### Aviso de transparencia sobre la reconstruccion de app/api/search-live/route.ts
Las herramientas de GitHub disponibles en esta sesion (`get_file_contents`) devolvieron solo un mensaje de confirmacion de descarga, sin el contenido real del archivo, para archivos de cualquier tamano probado (se confirmo el mismo comportamiento con archivos de 182 bytes y de 2296 bytes). Tampoco funciono leer el archivo via las URLs raw de GitHub con `fetch_url` (fallo silenciosamente). El archivo se reconstruyo con alta confianza combinando:
- Multiples fragmentos exactos obtenidos con `search_code` (import, definicion de `Body`, la linea de validacion original completa con el mensaje de error exacto, el bloque `try { const body = (await req.json()) as Body; }`, y el bloque completo de construccion de `filters` con todos los campos, que es identico al de `app/api/search/route.ts` verificado por separado).
- El contrato de la peticion tal y como lo envia `app/page.tsx` (que si se pudo leer integro porque esta IA lo habia escrito en un push anterior de esta misma conversacion).

Se recomienda revisar el diff del PR #15 para ese archivo concreto con atencion antes de aprobar el merge, y probar en el preview de Vercel una busqueda con destinos sueltos (sin grupo curado) para confirmar que el fix funciona como se espera.

### Como probar el PR #15 antes de aprobarlo
1. Entra al PR #15 en GitHub: buscar el comentario del bot de Vercel con el enlace de preview (normalmente aparece 1-2 minutos despues de crear el PR).
2. Abre esa URL de preview.
3. Revisa visualmente el rediseno (fondo oscuro, acentos dorados) y confirma si va en la direccion correcta o si quieres ajustes.
4. Prueba una busqueda seleccionando SOLO destinos sueltos (ej. "Londres /Heathrow" sin marcar ningun grupo curado) y confirma que YA NO aparece el error "Faltan campos obligatorios".
5. Prueba el chip "(todos)" en una ciudad con varios aeropuertos.
6. Prueba el campo "Ciudades a descartar" escribiendo un IATA y comprobando que desaparece del selector.
7. Si todo funciona bien, se puede mergear el PR #15 a `main` (pedir a la IA que lo haga, o hacerlo manualmente desde GitHub).

---

## Estado al 14 de septiembre de 2026, 14:00 CEST — Sesion extensa de correcciones

### Resumen ejecutivo
App funcional en su nucleo (busqueda live via Ignav, NLP, open-jaw) pero con 3 frentes abiertos:
1. Sincronizacion automatica con Aena (cron) sigue devolviendo 504 en produccion.
2. Diseno visual insatisfactorio para el usuario, pendiente de feedback visual concreto (capturas).
3. Verificacion pendiente de PRs #13 y #14 en produccion.

### PRs mergeados en esta sesion (por orden cronologico)
- #1 feat: cron automatico de sincronizacion con Aena (primera version, con bug ByteString sin detectar)
- #2 feat(ui): modo "Quiero viajar" + ordenar resultados + panel destinos reales + rediseno hero (v1)
- #4 feat: buscar itinerarios completos sobre cualquier destino real (lib/live-engine.ts acepta destinationIatas sueltos, no solo grupos curados) -- IMPORTANTE, es el cambio funcional mas valioso de la sesion
- #8 fix: causa raiz del error ByteString (los endpoints nuevos no reutilizaban lib/db.ts, que sanea el caracter U+2009 invisible en DATABASE_URL)
- #9 fix: timeout 504 por insertar destino a destino en vez de por lotes (UNNEST)
- #10 fix: quitar banner duplicado "TiritiTravel" de app/layout.tsx (nunca se habia leido ese archivo), destinos reales de Aena como selector PRINCIPAL (antes eran secundarios/ocultos), grupos curados con evento/temporada pasan a ser sugerencia opcional colapsada
- #11 fix: paralelizar las 4 descargas de Aena (Promise.all en vez de secuencial)
- #12 fix: dividir /api/cron/refresh-aena en 4 endpoints independientes por origen (/api/cron/refresh-aena/ALC|MAD|VLC|RMU) -- el combinado seguia superando el limite de 10s de Vercel Hobby
- #3 (cerrado sin mergear, redundante con #4)

### PRs abiertos, pendientes de merge/verificacion al cierre de esta sesion
- #13 fix/aggressive-timeout: timeout bajado a 5s + doble proteccion (withHardTimeout) + User-Agent tipo navegador, en lib/aena-sync.ts (nuevo, centraliza la logica que antes estaba duplicada entre el endpoint combinado y el endpoint por origen)
- #14 fix/hero-image-url: la imagen de fondo del hero usaba una URL de cache interno del chat (st.perplexity.ai) que NO es accesible fuera de la conversacion -- por eso no se veia ninguna imagen en produccion. Sustituida por URL publica real de Pexels (images.pexels.com/photos/35138044/...).
- #7 debug/db-check: endpoint temporal de diagnostico (GET /api/debug/db-check), dejar hasta confirmar que todo funciona, luego borrar.

### Problema sin resolver al cierre: 504 en /api/cron/refresh-aena/*
Diagnostico realizado:
- Confirmado que el build se despliega correctamente en Vercel ("Ready", visto en comentario del bot de Vercel en PR #12: projectId=prj_dRvq8Bh7LFTxJUUhZ1waU0nZFiDQ, teamId=team_bLU6ANXw3DsMZKT0sGeUhigR). NO es un error de compilacion/TypeScript.
- El conector de Vercel de esta sesion de IA no tiene permisos sobre el proyecto real del usuario (403 Forbidden en get_runtime_errors incluso con los IDs correctos), por lo que NO se pudieron ver logs de runtime reales en ningun momento de la sesion.
- Hipotesis mas probable sin confirmar: Aena.es bloquea o ralentiza extremadamente las peticiones HTTP desde rangos de IP de datacenter (Vercel), lo cual explicaria un cuelgue silencioso que ni AbortSignal.timeout() consigue cortar a tiempo dentro del limite de 10s del plan Vercel Hobby.
- Accion pendiente si PR #13 tampoco lo arregla: ejecutar el scraping desde fuera de Vercel. Opciones no probadas todavia: (a) GitHub Actions con un cron que llame a un endpoint de solo-escritura protegido por AENA_SYNC_SECRET, (b) ejecutar manualmente el script Python entregado en un mensaje anterior de esta conversacion (aena_destinos_scraper.py) desde el ordenador del usuario y despues insertar los resultados via Neon MCP.

### Estado real de la cache aena_destinations en Neon (verificado por SQL directo, NO por el cron)
- ALC: 110 de 143 reales (semilla manual parcial, insertada a mano en una sesion anterior)
- VLC: 60 de 104 reales (semilla manual parcial)
- MAD: 0 (nunca se ha podido ejecutar el cron con exito)
- RMU: 0 (nunca se ha podido ejecutar el cron con exito)

### Diseno visual -- pendiente de feedback especifico (ACTUALIZADO: ver PR #15 arriba, ya se hizo un rediseno completo basado en referencia de Dribbble)

### Archivos clave del proyecto (inventario, ver tambien lib/skyscanner.ts nuevo en PR #15)
```
app/
  layout.tsx
  page.tsx
  globals.css
  api/
    meta/route.ts
    search/route.ts (mock, huerfano, ya no se usa desde la UI pero sigue existiendo)
    search-live/route.ts
    booking-link/route.ts
    destinations/route.ts
    route-map/route.ts
    price-calendar/route.ts
    alerts/route.ts
    debug/db-check/route.ts (TEMPORAL, borrar cuando se resuelva el 504)
    cron/
      refresh-aena/route.ts (ahora solo informativo)
      refresh-aena/[origin]/route.ts (el que hace el trabajo real, por origen)
      check-alerts/route.ts
components/
  RouteMap.tsx
  ToolsPanel.tsx
  Icons.tsx
lib/
  db.ts (conexion saneada -- SIEMPRE importar sql desde aqui, nunca instanciar neon() directamente)
  types.ts
  search-engine.ts (motor mock, huerfano)
  live-engine.ts (motor live, acepta destinationGroupIds Y destinationIatas)
  ignav.ts (cliente API Ignav)
  nlp-search.ts
  price-calendar.ts
  aena-sync.ts (logica de scraping/parseo/guardado de Aena, compartida)
  skyscanner.ts (NUEVO en PR #15, cliente Sky Scrapper de RapidAPI, no integrado aun en live-engine.ts)
vercel.json (5 crons: 4 de refresh-aena por origen + 1 de check-alerts)
```

### Base de datos Neon (tablas relevantes)
- airports (27 filas, con lat/lon reales cargadas manualmente para el mapa)
- destination_groups (grupos curados con evento/temporada)
- legs, hotel_transfer, transfer_times (datos del motor mock, ya no usado en UI)
- aena_destinations (cache real de Aena, VER estado parcial arriba)
- aena_sync_log (historial de sincronizaciones)
- price_alerts (alertas de precio guardadas por el usuario)

### Recomendacion para la siguiente sesion/IA
1. Verificar primero si PR #13 (timeout 5s) resuelve el 504 en el cron de Aena. Si no, asumir bloqueo de red de Aena hacia Vercel y saltar directo a la alternativa de GitHub Actions o ejecucion manual.
2. Revisar y aprobar/ajustar el PR #15 (rediseno + fix + filtros nuevos) tras ver el preview de Vercel.
3. Completar los 2 pasos manuales pendientes (regenerar key de RapidAPI + anadirla en Vercel) para poder usar lib/skyscanner.ts en el futuro.
4. Considerar borrar lib/search-engine.ts y app/api/search/route.ts (motor mock huerfano) si se confirma que no rompe app/api/meta/route.ts (que importa listDestinationGroups/listOriginAirports desde ese mismo archivo -- habria que mover esas 2 funciones a otro sitio primero).
