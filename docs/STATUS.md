# Estado del proyecto TiritiTravel

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

### Diseno visual -- pendiente de feedback especifico
El usuario ha expresado repetidamente insatisfaccion ("feisimo", "apesta a IA", "incoherente", "el mapa es cutre") pero la IA de esta sesion NO tiene ninguna via de ver capturas de la app renderizada salvo que el usuario las adjunte directamente en el chat como imagen. Se hicieron 3 iteraciones de diseno (PR #2, #10, mas ajustes de paleta) sin verificacion visual real entre iteraciones, lo cual es la causa raiz de por que "no avanza" segun el usuario. NO se debe seguir iterando el CSS a ciegas sin que el usuario adjunte una captura de pantalla real tras cada cambio.

Componentes de diseno actuales:
- app/layout.tsx: layout minimo, sin header propio (se elimino el que tenia el emoji duplicado)
- app/page.tsx: hero con imagen de fondo (Pexels) + gradiente oscuro, selector de destinos reales como bloque principal, grupos curados colapsados
- components/RouteMap.tsx: mapa SVG dibujado a mano con proyeccion equirectangular simple (sin libreria externa, para no arriesgar el build sin poder probarlo). El usuario lo describe como "cutre" -- pendiente de sustituir por algo mejor, posiblemente con una libreria real (react-simple-maps o similar) SI se puede verificar el build primero.
- components/Icons.tsx: iconos SVG propios dibujados a mano (avion, calendario, campana, pin, sliders, maleta) para evitar emojis
- components/ToolsPanel.tsx: calendario de precios + formulario de alertas

### Archivos clave del proyecto (inventario completo al cierre)
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
1. Verificar primero si PR #13 (timeout 5s) resuelve el 504. Si no, asumir bloqueo de red de Aena hacia Vercel y saltar directo a la alternativa de GitHub Actions o ejecucion manual.
2. NO tocar mas CSS/diseno sin que el usuario adjunte una captura de pantalla real en el chat primero. Pedir explicitamente 2-3 cambios concretos y verificables por captura, no ajustes genericos.
3. Considerar borrar lib/search-engine.ts y app/api/search/route.ts (motor mock huerfano) si se confirma que no rompe app/api/meta/route.ts (que importa listDestinationGroups/listOriginAirports desde ese mismo archivo -- habria que mover esas 2 funciones a otro sitio primero).
