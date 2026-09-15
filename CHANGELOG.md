# Changelog

Todas las fechas en hora local de España (CEST/CET). Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/).

## [0.6.0] - 2026-09-14 (filtro de aerolineas + perfil de viaje guardado)

Primeros 2 pasos de la conversacion sobre "por que usar esto en vez de Skyscanner":
funcionalidad basica que faltaba (filtro de aerolinea) + personalizacion (recordar quien
viaja habitualmente).

### Anadido
- **Filtro de aerolineas preferidas/a evitar**: el backend ya soportaba
  `airlinesInclude`/`airlinesExclude` (se mandaban a Ignav) pero no habia ninguna forma
  de usarlo desde la interfaz -- anadidos 2 campos de texto en el panel lateral
  ("Extras"). Ademas de mandarse a Ignav, se re-comprueba en `lib/live-engine.ts` sobre
  el resultado final (por nombre o por codigo de 2-3 letras), como red de seguridad
  igual que ya se hace con "solo directos" -- no se ha podido verificar contra la API
  real si Ignav aplica el filtro exactamente como se espera.
- **Perfil de viaje guardado** (`lib/travel-profile.ts`): origenes habituales, adultos,
  ninos, equipaje de mano y open-jaw se recuerdan en `localStorage` y se precargan la
  proxima vez que abras la app -- ya no hay que rellenarlos cada vez. Distinto del
  historial de busquedas (que guarda busquedas concretas ya hechas): esto es tu
  configuracion de fondo, la parte que casi nunca cambia entre una busqueda y la
  siguiente.
- Los 2 filtros de aerolinea tambien se guardan y restauran en el enlace para compartir
  y en el historial de busquedas (`lib/share-link.ts` actualizado).

## [0.5.2] - 2026-09-14 (Sorprendeme sobre destinos reales + boton estable + menos reintentos)

El usuario probo "Sorprendeme" en el movil: los botones cambiaban de tamano sin parar
durante la busqueda, y la busqueda en si devolvia solo avisos de timeout / "Ignav no
devolvio vuelos directos" para los 6 destinos probados, sin ningun resultado.

### Corregido
- **Boton inestable (bug real)**: el mensaje de progreso cambiante ("Buscando vuelos de
  ida...", "Calculando traslados...") vivia DENTRO del texto del boton; al tener
  longitudes muy distintas, el boton crecia y encogia con cada cambio de mensaje. Ahora
  el boton mantiene un texto corto y fijo ("Buscando...") mientras carga, y el mensaje
  de progreso se muestra en una linea aparte con altura minima fija y `truncate`, para
  que no mueva nada de su alrededor ni desborde el ancho de la pantalla.
- **"Sorprendeme" sobre destinos sin conectividad real (bug real)**: elegia al azar
  entre los destinos CURADOS por tema (Polonia, Riga, Zagreb/Split, Dublin, Belgrado...)
  sin comprobar si tenian vuelo directo real desde el origen elegido. Con Alicante como
  origen, ninguno de los 6 destinos sorteados tenia conexion directa real, de ahi que
  saliera una lista entera de avisos y ningun resultado. Ahora elige de los destinos
  REALES verificados por Aena (los mismos que ya usa el selector "Destinos"), filtrados
  por el origen actual, que si tienen conectividad directa confirmada. Los destinos
  curados se siguen usando para el buscador en lenguaje natural (donde el tema importa
  mas que la certeza de conectividad), no para un "sorprendeme" a ciegas.
- `lib/ignav.ts`: `MAX_RETRIES` bajado de 2 a 1. Con timeout de 8s por intento, 2
  reintentos podian hacer que una sola ruta lenta tardara hasta ~25s en total,
  arriesgando que Vercel matara la funcion entera (limite de 10s en el plan Hobby) antes
  de que el resto de rutas, mas rapidas, pudieran devolver su resultado. No elimina del
  todo el riesgo si Ignav esta especialmente lento, pero lo reduce.

## [0.5.1] - 2026-09-14 ("Sorprendeme": fix de bug real + rediseno)

El usuario probo "Quiero viajar, propon ideas por precio" con Alicante como unico
origen y siempre daba error de limite de combinaciones. No era un problema de nombre,
era un bug real preexistente (de antes de esta sesion).

### Corregido
- **Bug real**: `handleTravelIdeas` multiplicaba origenes x TODOS los grupos curados
  (8) sin comprobar si cabian en el limite de 6 combinaciones de Ignav. Con un solo
  origen ya fallaba siempre (1x8=8>6) -- la funcion era, en la practica, inutilizable
  para cualquier seleccion de origenes. Ahora (`handleSurpriseMe`) calcula cuantos
  grupos caben para los origenes elegidos y coge solo esos, **mezclados al azar** en
  cada pulsacion (asi salen destinos distintos cada vez, en vez de siempre los mismos).

### Cambiado (a peticion del usuario: "cambiale el nombre y dale mayor protagonismo")
- Renombrado de "Quiero viajar, propon ideas por precio" (checkbox escondido dentro de
  los filtros, cambiaba el comportamiento del boton principal de forma poco clara) a
  **"Sorprendeme"**: ahora es su propio boton, siempre visible, con icono y degradado
  distintivo (indigo a fucsia) para diferenciarlo visualmente de "Buscar vuelos".
  Solo necesita un origen elegido -- no hace falta seleccionar destino primero, que es
  precisamente el caso de uso ("no se a donde ir").

## [0.5.0] - 2026-09-14 (modo oscuro, ideas por precio, compartir, historial, iconos iPhone)

A peticion explicita del usuario: implementadas todas las mejoras propuestas en la sesion
anterior salvo las que requerian la API de Anthropic (pospuestas).

### Anadido
- **Modo oscuro real**, alternable con un boton (sol/luna) en el nav, no un tema fijo.
  Respeta `prefers-color-scheme` la primera vez y despues recuerda la eleccion en
  `localStorage`. `tailwind.config.ts` con `darkMode: 'class'`; un script inline en
  `app/layout.tsx` fija la clase antes de pintar para evitar el flash del tema
  equivocado. Variantes `dark:` aplicadas a los componentes principales.
- **"Ideas por precio"**: `handleTravelIdeas` ahora fuerza explicitamente ordenar por
  precio (antes usaba el criterio de orden que estuviera puesto, sin logica real de
  "ideas"). Boton y checkbox renombrados para reflejarlo.
- **Compartir una busqueda** (`lib/share-link.ts`): boton que usa el share sheet nativo
  de iPhone (o copia al portapapeles) con un enlace que codifica todos los filtros en la
  URL; al abrir ese enlace, la app restaura la busqueda automaticamente.
- **Historial de busquedas recientes** (`lib/search-history.ts` +
  `components/SearchHistoryPanel.tsx`): guardado en `localStorage` del navegador, sin
  cuenta ni backend, con chips para repetir una busqueda anterior con un toque.
- **Mensajes de progreso durante la busqueda**: en vez de un "Buscando..." fijo, van
  cambiando ("Consultando vuelos de ida...", etc.) mientras dura la peticion. No es
  progreso real medido (la API no lo expone), son mensajes honestos para que no parezca
  colgado.
- **Cache persistente de Sky Scrapper en BD** (tabla `skyscanner_airport_cache` nueva en
  `scripts/schema.sql`): las resoluciones IATA -> skyId/entityId ya no se repiten en cada
  busqueda -- relevante dado que su cuota es ~100/mes. **Requiere aplicar el schema.sql
  actualizado contra tu Neon DB manualmente.**
- **Icono propio y pantalla completa al añadir a inicio en iPhone**: `app/icon.tsx` y
  `app/apple-icon.tsx` (generados con `next/og`, sin archivos binarios) + `app/manifest.ts`.

### Nota tecnica (para futuras sesiones)
Al aplicar las variantes `dark:` se probo primero con `sed` encadenado, lo que produjo
clases duplicadas en pares reciprocos de color (ej. `text-slate-400 dark:text-slate-500
dark:text-slate-400`), porque el limite de palabra de `sed` no distingue una clase
original de una ya insertada por una regla anterior. Se corrigio con un script Python
(`apply_dark.py`, no versionado) que procesa cada `className` una sola vez comparando
solo contra el conjunto original de clases. Si en el futuro hace falta re-aplicar o
extender las variantes de tema, usar ese mismo enfoque (o anadirlas a mano), nunca `sed`
encadenado sobre pares de colores reciprocos.

## [0.4.0] - 2026-09-14 (panel lateral, marco con fondo de nubes, version visible, web-app iPhone)

### Anadido
- **Numero de version visible en la app** (`lib/version.ts`, junto al logo en `TopNav`).
  Mantener sincronizada a mano con `package.json` y la entrada mas reciente de este
  changelog -- no hay build step que las una automaticamente.
- **Metadatos de web-app para iPhone** (`app/layout.tsx`): `appleWebApp` (pantalla
  completa al anadir a inicio, sin barra de Safari), `viewport-fit: cover` +
  `env(safe-area-inset-*)` en `globals.css` para que el nav superior no quede debajo del
  notch/isla dinamica ni el contenido final debajo de la barra de home.

### Cambiado (diseno)
- **Fondo de nubes con el contenido enmarcado en el medio**, como en la captura de
  referencia: en pantallas medianas/grandes, la app entera es una tarjeta redondeada con
  sombra que flota sobre un fondo azul/indigo mas oscuro (visible alrededor). En movil
  (uso principal: "web-app de iPhone"), la tarjeta ocupa toda la pantalla sin marco ni
  esquinas redondeadas -- no tiene sentido gastar espacio en decoracion en una pantalla
  pequeña, y asi se siente como una app nativa al anadirla a inicio.
- **Filtros en panel lateral**, como en la referencia: la tarjeta principal ("Quien,
  cuando y a donde") con origenes/destinos/fechas/pax y el boton de busqueda se queda a
  ancho completo; los filtros de refinamiento (horarios, precio, orden, equipaje,
  open-jaw, Sky Scrapper, ciudades a descartar) pasan a un panel lateral fijo
  (`components/FilterAccordion.tsx`, acordeones nativos `<details>`, sin estado extra) a
  la derecha de los resultados, con el panel de calendario/alertas debajo.
- **Renombrada la seccion "Filtros de busqueda" a "Quien, cuando y a donde"** y el
  checkbox "Permitir open-jaw en destino" a "Permitir llegar y salir por aeropuertos
  distintos (open-jaw)" -- ver revision de nombres en docs/STATUS.md.

## [0.3.4] - 2026-09-14 (integracion Sky Scrapper)

A peticion explicita del usuario: mezclar resultados de Ignav y Sky Scrapper (RapidAPI) en
la misma lista, marcando de que fuente viene cada uno.

### Anadido
- `lib/skyscanner-adapter.ts` nuevo: adapta las respuestas de Sky Scrapper (ida+vuelta en
  una sola llamada, a diferencia de Ignav que necesita 2 busquedas de solo ida) al formato
  interno `LiveItinerary`. Solo admite tramos directos (`stopCount === 0`), igual que Ignav.
- Nuevo campo `source: 'ignav' | 'skyscanner'` en `LiveItinerary`. `FlightResultCard.tsx`
  muestra una etiqueta con la fuente de cada resultado.
- Nueva casilla "Incluir Sky Scrapper" en el formulario (desactivada por defecto). Sin
  marcar, el comportamiento no cambia nada respecto a antes.
- `lib/live-engine.ts`: si la casilla esta marcada Y `RAPIDAPI_SKY_SCRAPPER_KEY` esta
  configurada, se consulta Sky Scrapper para cada combinacion origen x aeropuerto de
  destino (tope propio de 6 llamadas) y se mezcla con los resultados de Ignav antes de
  ordenar. Sin la variable de entorno configurada, la casilla no tiene efecto (silencioso,
  no rompe nada).

### Importante -- cuota y verificacion
- **Cuota de Sky Scrapper: ~100 peticiones AL MES** (no de por vida como Ignav). Por eso
  solo se consulta 1 vez por combinacion (la primera fecha de cada rango, no el rango
  completo) y con un tope mucho mas bajo que el de Ignav. Si usas la MISMA key de RapidAPI
  que en tu script personal `buscador_viajes.py`, ambos consumen de la misma bolsa de
  cuota -- ver aviso en docs/STATUS.md.
- **El parseo de la respuesta de ida+vuelta de Sky Scrapper NO se ha podido verificar
  contra la API real** (sin key configurada ni acceso de red a
  sky-scrapper.p.rapidapi.com desde el entorno de esta sesion). Esta escrito con la mejor
  informacion disponible (verificada contra tu script `buscador_viajes.py`, que solo usa
  busquedas de solo ida) mas la convencion habitual de esta familia de APIs para
  ida+vuelta. Probado con datos simulados (ver docs/STATUS.md), no con una respuesta real.
  Corrige tambien un bug latente en `lib/skyscanner.ts`: `searchAirport` no extraia
  `skyId`/`entityId` cuando venian anidados bajo `navigation.relevantFlightParams` (la
  misma API a veces devuelve el campo asi, como ya maneja tu script con un fallback).

## [0.3.3] - 2026-09-14 (tema claro real + fotos de ciudad + fixes de logica)

El usuario mando una captura de la referencia real (tema CLARO con acento indigo, tarjetas
con foto de avion, filtros en lateral) -- el rediseno de la sesion anterior se habia ido a
un tema oscuro/dorado que no se parecia a la referencia real. Este pase corrige el rumbo.

### Cambiado (diseno)
- **Tema completo de oscuro/dorado a claro/indigo**, fiel a la captura real: fondo con
  degradado suave tipo cielo, tarjetas blancas, nav superior oscuro, acento indigo
  (`#6366f1`) en vez de dorado. `tailwind.config.ts` con tokens `ink`/`indigo` nuevos.
- **`components/TopNav.tsx` nuevo**: barra de navegacion oscura con logo, como en la
  referencia (sin inventar enlaces de navegacion falsos que no existen en la app).
- **Resultados: de tabla a tarjetas con foto real de la ciudad de destino** (no icono de
  avion): `components/FlightResultCard.tsx` nuevo + `lib/city-images.ts` nuevo con un
  banco de 11 fotos de Pexels verificadas una a una (Paris, Londres, Roma, Amsterdam,
  Lisboa, Praga, Viena, Atenas, Estocolmo, Cracovia, Budapest) y una foto generica de
  reserva para cualquier otro destino real de Aena no cubierto por el banco.
- `components/ToolsPanel.tsx` y `components/FlightPathStrip.tsx` retematizados a
  claro/indigo (se habian quedado en dark/dorado de la sesion anterior).
- Quitado el hero de foto grande de la sesion anterior: la referencia real no lo tiene,
  usa el fondo con degradado + la barra de busqueda directamente.

### Corregido (logica, a peticion explicita de revision)
- **Inconsistencia en "ordenar por duracion"**: el servidor (`lib/live-engine.ts`)
  ordenaba por la SUMA de duracion de vuelo (ida+vuelta); el cliente (`app/page.tsx`) al
  re-ordenar la misma lista usaba la duracion TOTAL del viaje (salida de ida a llegada de
  vuelta). Mismo filtro, dos formulas -- el orden podia cambiar solo por re-ordenar sin
  tocar los datos. Unificado a la duracion total del viaje en ambos sitios.
- **Itinerarios fisicamente imposibles**: el filtro que descarta combinaciones invalidas
  comparaba la salida de vuelta contra la SALIDA de ida en vez de la LLEGADA de ida --
  permitia colar un vuelo de vuelta que sale antes de que el de ida haya aterrizado.
  Corregido a comparar contra `outbound.arrival_at`.
- **`ignavPost` sin timeout y sin reintento en errores de red**: si `fetch()` lanzaba una
  excepcion (timeout, DNS, red caida) en vez de devolver un status HTTP, el error se
  propagaba directo sin pasar por la logica de reintento -- una sola incidencia de red
  abortaba toda la busqueda. Anadido timeout de 8s (mismo patron que `lib/skyscanner.ts`)
  y los errores de red ahora se reintentan igual que los status HTTP reintentables.

## [0.3.2] - 2026-09-14 (rediseno visual)

### Corregido
- **`components/RouteMap.tsx` y `components/ToolsPanel.tsx` seguian enteros en el tema claro original** (fondo blanco, azul `brand-600`) mientras el resto de la app paso al tema oscuro/dorado en la sesion anterior -- de ahi el aspecto roto/inconsistente. `ToolsPanel.tsx` retematizado por completo; `RouteMap.tsx` eliminado (ver mas abajo).
- **El tema oscuro se aplicaba con un hack** (`-m-6 p-6` en `app/page.tsx` para tapar el fondo claro heredado de `app/layout.tsx`/`globals.css`). Ahora el fondo oscuro se fija correctamente a nivel de `body`, sin hack de margen negativo.
- `tailwind.config.ts` tenia una paleta `brand` azul sin relacion con el resto de la app (solo la usaba el `RouteMap.tsx` roto). Sustituida por tokens con nombre (`ink`, `ink-panel`, `gold`, `gold-light`) usados de forma consistente en toda la UI en vez de hexadecimales sueltos repetidos por todo `page.tsx`.

### Cambiado
- **Mapa de rutas sustituido**: `components/RouteMap.tsx` (SVG de 420px de alto sobre un listado de "destinos curados" que el resto de la app ya no usa como fuente principal -- de ahi la queja de "mapa inservible que ocupa mucho sitio") se elimino junto a `app/api/route-map/route.ts`. En su lugar, `components/FlightPathStrip.tsx` nuevo: una tira compacta que muestra origen/destino REALMENTE seleccionados en el formulario (no un listado aparte desactualizado), con una linea de vuelo animada.
- **Hero rediseñado**: menos padding vertical, avion en filigrana de gran formato en la esquina, y la tarjeta `FlightPathStrip` flotando sobre el borde inferior del hero (tecnica de "search bar sobre la foto" tipica del genero de apps de vuelos privados de lujo) en vez de dejar un hueco vacio entre el hero y el resto del contenido.
- **Nuevos iconos SVG originales** en `components/Icons.tsx`: despegue, aterrizaje, compas, billete de embarque -- mas los `IconPlane`/`IconSuitcase` que ya existian pero no se usaban en ningun sitio. Aplicados en el hero, la tira de ruta, las cabeceras Ida/Vuelta de la tabla de resultados y `ToolsPanel`.
- **Tipografia deliberada**: titulares en una pila serif editorial (Georgia y similares) en vez del sans por defecto del navegador, para diferenciar el titular del resto de la UI. Se probo primero con `next/font/google` (Fraunces + Inter) pero se descarto: no se pudo verificar el build en el entorno de la sesion (sin acceso a `fonts.googleapis.com`) y no se queria arriesgar el build de Vercel sin poder comprobarlo antes.

## [0.3.1] - 2026-09-14 (sesion de auditoria)

### Corregido
- **Bug critico de produccion**: `app/api/search-live/route.ts` rechazaba busquedas con solo `destinationIatas` sueltos (sin grupo curado) con "Faltan campos obligatorios". Mergeado el fix ya existente en el PR #15.
- **Bug NLP demostrado con el propio ejemplo de la home**: `lib/nlp-search.ts` atribuia mal dias/horas a la clausula equivocada (ida/vuelta) cuando el texto tenia varias alternativas de ida ("el 4 despues de las 18h o si no el 5 a partir de las 8h, regreso no antes de las 12h"). Ahora se corta el texto en la primera palabra de vuelta (regreso/vuelta/retorno) y se extraen dias/horas por separado en cada mitad, en vez de una lista plana global.
- **Regresion de la reconstruccion "a ciegas" del PR #15**: faltaban `export const dynamic = 'force-dynamic'` y `export const runtime = 'nodejs'` en `search-live/route.ts` (las unicas rutas del proyecto sin esas 2 lineas). Restauradas. Tambien se alineo el manejo de errores con el patron `err instanceof Error` usado en el resto de rutas, y se corrigio el `pax` por defecto (2 adultos + 1 nino, como en main) que la reconstruccion habia cambiado sin querer a 1+0.
- **N+1 en `lib/live-engine.ts`**: el doble bucle ida x vuelta hacia 1-2 consultas SQL secuenciales POR CADA combinacion. Ahora se precargan `transfer_times` y `hotel_transfer` en batch (maximo 2 consultas por destino, antes del bucle) y se consultan en memoria dentro del bucle.
- **Caso de borde en `lib/db.ts` y `lib/ignav.ts`**: el saneador de caracteres invisibles los sustituia por un ESPACIO literal en vez de eliminarlos; si el caracter caia en medio de la cadena (no en un borde recortable con `.trim()`), la URL/API key seguia rota. Ahora se eliminan del todo.

### Anadido
- **Limite real de peticiones a Ignav por busqueda** (`MAX_IGNAV_REQUESTS_PER_SEARCH = 60` en `lib/live-engine.ts`): el limite anterior de 6 combinaciones origen x destino no protegia el multiplicador real de peticiones (aeropuertos del grupo x dias de rango x 2 x combos). Con un grupo de 4 aeropuertos y el maximo de dias/combos, una sola busqueda podia lanzar hasta 240 peticiones contra la cuota de 1000 de por vida. Ahora se calcula el numero real antes de lanzar nada y se corta con un mensaje explicito.

### Eliminado
- `app/api/debug/db-check` (endpoint temporal de diagnostico, ya no necesario).
- `lib/search-engine.ts` + `app/api/search/route.ts` (motor mock huerfano, sin uso desde la UI). Las 2 funciones que `app/api/meta/route.ts` seguia importando de ahi (`listDestinationGroups`, `listOriginAirports`) se movieron a `lib/meta-queries.ts` nuevo.

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
