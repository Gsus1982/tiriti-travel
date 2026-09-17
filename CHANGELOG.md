# Changelog

Todas las fechas en hora local de España (CEST/CET), con hora cuando esta disponible desde la sesion que hizo el cambio. Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/).

## [0.14.0] - 2026-09-17 (sesion 4) - secciones colapsables + quitada tira decorativa

El usuario senalo que en movil la app se hace larga de desplazar, y que la tira
"Origen ---- Destino" de arriba (`FlightPathStrip`) no tenia ninguna funcion real
("creo que es adorno").

### Eliminado
- `components/FlightPathStrip.tsx`: quitada por completo (sin rastro en el codigo).
  Aunque se hizo clicable en una sesion anterior (bajaba hasta el formulario), ya solo
  repetia informacion que el propio formulario de abajo muestra con mas claridad --
  redundante, y anadia scroll sin aportar nada propio.

### Cambiado
- **"Filtros y ajustes", "Explorar destinos (gratis)" y "Busquedas recientes" ahora
  colapsan** (mismo patron `<details>`/`<summary>` que ya usaban los sub-filtros
  dentro de "Filtros y ajustes"): reduce bastante el scroll en movil, sobre todo con
  varias busquedas guardadas en el historial.

El usuario confirmo con captura real que Travelpayouts funciona (destinos y precios
reales), pero senalo 3 problemas: "Buscar este" no daba ninguna senal de haber hecho
algo, el limite dinamico de combinaciones no se explicaba en ningun sitio, y pidio una
seccion de ayuda para saber que hace cada cosa.

### Corregido
- **"Buscar este" en Explorar destinos no daba feedback** (reportado como "el enlace no
  funciona"): anadia el destino en silencio, sin confirmacion ni desplazamiento --
  parecia roto porque el efecto quedaba fuera de la vista. Ahora confirma con un
  mensaje ("Anadido X a tu busqueda") y baja automaticamente hasta el formulario.

### Anadido
- **Limite de combinaciones dinamico ahora es VISIBLE, no solo un numero fijo escrito a
  mano**: el contador "Combinaciones origen x destino" muestra el maximo REAL actual
  (no un "6" hardcodeado), y el aviso explica el criterio completo (sube a 10 con mucha
  cuota, baja a 3 con poca) remitiendo a "Cuota de Ignav" en el panel de herramientas
  para decidir con datos antes de elegir origenes/destinos. `/api/ignav-usage` ahora
  tambien devuelve `comboLimit` calculado, para que servidor y cliente muestren siempre
  el mismo numero.
- **Seccion de ayuda dentro de la app** (`components/HelpModal.tsx`, boton "?" en la
  barra superior): explica en lenguaje llano que hace cada funcion -- destinos reales,
  limite dinamico, Sorprendeme, lenguaje natural con IA, explorar destinos, tendencia
  de precio, filtros, calendario de precios, alertas, comparador/vista lista,
  recomendacion de la IA, historial y compartir.

## [0.12.0] - 2026-09-17 (contador de cuota, limite dinamico, explorar gratis, tendencia de precio)

A peticion del usuario tras quejarse del limite de 6 combinaciones: "empieza por el
contador de cuota y despues con las dos mejoras propuestas, la de explorar y la
tendencia historica de precio. Reduce tambien la frecuencia de alertas".

### Anadido
- **Contador real de cuota de Ignav** (`lib/ignav-usage.ts`, tabla `ignav_usage_log`):
  cada peticion real a Ignav se registra desde el unico punto de salida
  (`ignavPost` en `lib/ignav.ts`), contando cualquier respuesta HTTP recibida (no solo
  200 -- Ignav factura la peticion aunque devuelva error). Visible en el panel de
  herramientas: peticiones restantes de las 1000 de por vida, con barra de color y uso
  de los ultimos 7 dias.
- **Limite de combinaciones DINAMICO** (`dynamicComboLimit` en `lib/ignav-usage.ts`),
  sustituyendo el fijo de 6 de siempre: hasta 10 si queda mas de la mitad de la cuota,
  6 si queda mas de un 20%, 4 si queda mas de un 5%, 3 en el resto -- mas generoso
  cuando sobra cuota, mas conservador cuando escasea. Cae al fijo de 6 si el contador
  no esta disponible todavia (migracion pendiente).
- **Explorar destinos sin gastar cuota** (`lib/travelpayouts.ts`, `/api/explore`,
  `components/ExploreDestinations.tsx`): usa la API de datos de Travelpayouts
  (Aviasales), gratuita, con precios orientativos de otros viajeros (no en tiempo
  real, cacheados hasta 7 dias) para dar ideas de destino ANTES de gastar la cuota de
  verdad. Cruza los resultados contra los destinos reales verificados por Aena para
  marcar cuales tienen un boton directo "Buscar este". Requiere registrarse gratis en
  travelpayouts.com y anadir `TRAVELPAYOUTS_TOKEN` en Vercel -- sin configurar, se
  muestra un aviso claro en vez de rompers. **No verificado contra la API real en esta
  sesion** (sin token de prueba disponible).
- **Tendencia de precio sobre historial propio** (`lib/price-history.ts`, tabla
  `price_history`): cada precio real visto en una busqueda se registra; a partir de 3
  observaciones para una misma ruta, cada resultado nuevo se marca "precio bajo/normal/
  alto para esta ruta" comparando contra el promedio historico -- sin llamar a ninguna
  API nueva, solo con datos propios ya acumulados. Tarda en dar sus primeros frutos
  (necesita busquedas repetidas de las mismas rutas para acumular muestra).

### Cambiado
- **Frecuencia del cron de alertas de precio** reducida de diaria a cada 3 dias
  (`vercel.json`). Motivo: cada alerta guardada gasta varias peticiones reales de Ignav
  en cada ejecucion (dias de rango x origenes x 2 sentidos); con varias alertas activas
  y ejecucion diaria, el consumo de fondo puede sumar decenas de peticiones al mes sin
  que se note -- una de las causas reales de que el limite de 6 combos se sintiera
  estrecho.

### Migracion pendiente (ejecutar en Neon, ver `scripts/schema.sql`)
Las tablas `ignav_usage_log` y `price_history` son nuevas -- sin aplicar la migracion,
el contador de cuota y la tendencia de precio simplemente no aparecen (fallan en
silencio), sin romper ninguna busqueda.

## [0.11.5] - 2026-09-17 (FIX: 424 persistente en enlaces de reserva + mensajes crudos de Ignav)

El usuario probo el fix de la v0.11.4 (ida/vuelta en paralelo) con una captura real:
ALC -> KTW, Wizz Air de ida + Ryanair de vuelta. El enlace de Ryanair (vuelta) aparecio
bien, pero el de Wizz Air (ida) mostro el error crudo de Ignav sin traducir:
`Ignav API error 424 en /booking-links: {"error":{"type":"upstream_error",...}}`.

### Corregido
- **Causa raiz**: `lib/ignav.ts` ya trataba `424` como reintentable (`RETRYABLE_STATUSES`),
  pero `MAX_RETRIES = 1` es un limite pensado para `/one-way`, que lanza hasta 60
  peticiones en paralelo durante una busqueda y necesita fallar rapido para no agotar
  el timeout de funcion de Vercel (10s en el plan Hobby). Ese mismo limite se aplicaba
  tambien a `/booking-links`, que es UNA sola llamada por tramo (no un fan-out masivo) --
  no hay ninguna razon para limitarla a 1 solo reintento. Anadida una constante separada
  `BOOKING_LINKS_MAX_RETRIES = 3` que solo afecta a `getBookingLinksByIgnavId`;
  `MAX_RETRIES` (para `/one-way`) queda intacto.
- **`components/FlightResultCard.tsx`**: cuando un tramo fallaba tras agotar los
  reintentos, se mostraba el mensaje de error tal cual venia de Ignav (JSON crudo con
  `upstream_error`, `unable_to_complete_request`, etc.), poco legible para un usuario
  normal. Anadida `friendlyLegError()` que detecta ese patron y muestra en su lugar:
  "Ignav no pudo recuperar los enlaces de ida/vuelta tras varios intentos. Puede ser un
  problema temporal del proveedor -- vuelve a pulsar 'Ver enlaces' en unos segundos."
  Para otros errores (no reconocidos como fallo de upstream) se sigue mostrando el
  mensaje real, por transparencia.
- Los avisos de error de cada tramo se muestran ahora como una lista (uno por tramo
  fallido) en vez de un unico string concatenado, para que cada aviso sea independiente
  y no se mezclen ida y vuelta en la misma frase.

### Aviso
El aumento a 3 reintentos en `/booking-links` no elimina el riesgo si Ignav esta
genuinamente caido para una ruta concreta -- solo lo reduce, dando mas margen ante fallos
transitorios de caracter puntual como el reportado. No se ha podido reproducir el 424
original contra la API real desde esta sesion (sin acceso de red a ignav.com desde este
entorno); el fix esta verificado por revision de codigo contra el patron de error exacto
de la captura del usuario, no contra una respuesta 424 real.

## [0.11.4] - 2026-09-17 (FIX: enlaces de reserva de ida y vuelta)

### Corregido
- **Los itinerarios con compañías distintas en cada tramo solo mostraban el enlace de reserva de ida**. La interfaz solicitaba `/api/booking-link` únicamente con `result.outbound.ignav_id`, por lo que el identificador de vuelta (`result.inbound.ignav_id`) nunca se consultaba. Ejemplo real reportado: Alicante (ALC) → Katowice (KTW) con Wizz Air en la ida y Ryanair en la vuelta; la interfaz enseñaba solo Wizz Air.
- `components/FlightResultCard.tsx`: consulta ahora ambos identificadores de Ignav en paralelo mediante `Promise.allSettled` y agrupa los enlaces bajo **Ida** y **Vuelta**. De este modo se muestran los dos tramos aunque usen compañías diferentes, o incluso cuando la compañía sea la misma.
- La recuperación es tolerante a fallos parciales: si falla la consulta de un tramo, se conservan los enlaces del otro y el aviso identifica expresamente si el problema corresponde a la ida o a la vuelta.
- No se modifica el contrato de `POST /api/booking-link`: sigue recibiendo un único `{ ignavId }` y devolviendo la respuesta de Ignav. La corrección se hace en la tarjeta de resultados, que ejecuta una llamada por cada tramo.

## [0.11.3] - 2026-09-16 (fix real: la misma busqueda encontraba vuelos unas veces y otras no)

El usuario reporto que el mismo prompt exacto de lenguaje natural ("Vuelo a Polonia,
preferiblemente Cracovia, Katowice, o Wroclaw desde Alicante, Valencia o Madrid...")
encontraba resultados unas veces y otras no, sin ningun cambio de por medio. No era
aleatoriedad de Ignav: con 3 origenes x 3 destinos pedidos (9 combinaciones, por encima
del maximo de 6), el recorte de `lib/ai-parse.ts` cortaba la lista de destinos en el
ORDEN en que la IA los devolvia -- orden que varia entre llamadas identicas por
`temperature: 0.2` (no 0). Cada ejecucion podia descartar un destino distinto de los 3
pedidos, cambiando que rutas se buscaban de verdad.

### Corregido
- `lib/ai-parse.ts`: el recorte por cuota ahora ordena los destinos alfabeticamente por
  IATA ANTES de cortar, asi la misma frase descarta siempre el mismo destino en vez de
  uno aleatorio. Anadido un campo `warnings: string[]` explicito (antes el aviso solo
  se pegaba al final de la `explanation` en prosa) que indica exactamente que
  destino(s) se descartaron y sugiere cuantos origenes reducir si se quieren todos.
- `app/page.tsx`: `handleInterpret` ignoraba cualquier aviso de la IA en la rama de
  exito (`setNlpWarnings([])` fijo) -- ahora propaga `ai.warnings` al cuadro amarillo.

## [0.11.2] - 2026-09-16 (historial de alertas + comparador responsive)

### Anadido
- **Historial de alertas de precio visible** en `ToolsPanel` (antes `GET /api/alerts`
  existia pero no se mostraba en ningun sitio de la UI): lista con ruta, fechas, limite
  de precio, minimo visto, si hubo match y email asociado, con boton "Borrar" por
  alerta (`DELETE /api/alerts?id=`, nuevo).
- **Aviso al llegar al limite de 3 comparaciones**: antes marcar una 4a tarjeta no
  hacia nada sin explicacion; ahora aparece un aviso ambar temporal.
- **Comparador responsive**: en movil (pantalla estrecha) la tabla de 12 columnas pasa
  a tarjetas apiladas con los mismos datos, en vez de forzar scroll horizontal.

## [0.11.1] - 2026-09-16 (fix real: no habia campo de precio para la alerta + comparador pobre)

El usuario reporto 2 problemas reales probando el PR anterior: al guardar una alerta,
el mensaje pedia un precio maximo pero no habia ningun campo visible para introducirlo
(vivia en otro panel, el de filtros de busqueda); y el comparador de vuelos era "muy
pobre", sin horas de llegada/salida ni mas variables para comparar.

### Corregido
- `ToolsPanel.tsx`: nuevo campo propio "Precio maximo total (EUR)" dentro del propio
  formulario de "Guardar alerta de precio" (antes solo existia en el panel lateral de
  filtros de busqueda, lo que causaba la confusion). Se precarga con el filtro de
  busqueda actual si hay uno, pero es independiente.

### Cambiado
- **Comparador ampliado de 5 a 12 columnas**: anadidas horas de salida/llegada de ida y
  vuelta, duracion total, aerolinea de vuelta y fuente (Ignav/Sky Scrapper). Resalta en
  verde el mejor valor de cada fila (precio, duracion, hora de salida del hotel) entre
  las opciones comparadas.

## [0.11.0] - 2026-09-16 (comparador, vista lista, alertas por email, y mas)

Sesion de continuacion sobre el PR de mejoras (`revisar-por-claude`) que quedo con
conflictos reales tras el merge del fix de origenes (ver 0.10.1 mas abajo, mismos
archivos tocados por ambos). Reconstruido desde cero sobre el `main` ya arreglado, en
vez de mergear la rama antigua.

### Anadido
- **Comparador de hasta 3 resultados lado a lado** (`components/ResultsSection.tsx`
  nuevo): checkbox "Comparar" en cada tarjeta, tabla comparativa aparte.
- **Vista Tarjetas / Lista**: toggle para busquedas con muchos resultados.
- **Aviso de alternativa "casi igual pero mas barata"**: cada tarjeta calcula si hay
  otra opcion >=15 EUR mas barata que sale del hotel <=3h antes.
- **Estado vacio con personalidad**: mensaje con el mismo tono del resto de la app
  cuando no hay resultados, en vez de un aviso tecnico plano.
- **Animacion al recomendar**: anillo que se desvanece en 1.4s en la tarjeta que la IA
  recomienda, para dirigir la vista.
- **Alertas de precio por email real** (`lib/email.ts` nuevo, via Resend): campo de
  email en `ToolsPanel`, envio real desde el cron diario `check-alerts` cuando el
  precio baja del limite (sin repetir el aviso mientras siga bajo).

## [0.10.1] - 2026-09-16 (fix real: origenes rotos + aviso de busqueda mal ubicado + selector de orden)

El usuario reporto 3 problemas probando produccion: solo aparecia Alicante en el
selector de origenes (Valencia/Madrid/Murcia habian desaparecido), el aviso amarillo de
la busqueda aparecia antes de los resultados y siempre desplegado, y el selector de
"Ordenar por" no parecia reordenar nada.

### Corregido
- **Causa raiz de "solo Alicante"**: `/api/meta` fallaba entero porque
  `listDestinationGroups()` consultaba `destination_groups`, tabla que ya no existia en
  la BD real (borrada por una sesion anterior sin actualizar el codigo -- ver PR #22,
  mergeado en esta misma sesion tras encontrarlo abandonado). Al fallar esa consulta
  dentro de un `Promise.all`, toda la respuesta fallaba y el frontend caia al fallback
  de emergencia de un solo origen.
- `app/page.tsx`: el aviso de la busqueda se movio de dentro del formulario a DESPUES
  de los resultados, y ahora usa `<details>` (colapsado por defecto) en vez de estar
  siempre desplegado.
- El selector de "Ordenar por" se separo en 2 instancias de `<select>` totalmente
  independientes (antes compartian el mismo elemento React en 2 sitios del arbol) para
  eliminar cualquier ambiguedad de reconciliacion.

## [0.10.0] - 2026-09-15 (ELIMINADOS los destinos curados por completo)

A peticion explicita del usuario ("elimina los destinos curados de una vez por todas y
no dejes rastro de ellos"), tras 2 fallos sistematicos confirmados en sesiones
independientes (Sorprendeme y la interpretacion con IA eligiendo grupos con timeout al
100% en Ignav).

### Eliminado
- Concepto completo de "destinos curados" (`destination_groups`, elegidos a mano por
  tema/evento: Polonia, Riga, Estocolmo, Helsinki, Oslo, Atenas, Sofia, Belgrado) --
  quitado de todo el codigo: `lib/live-engine.ts` (resolucion de destinos, tipos),
  `lib/meta-queries.ts`, `app/api/meta/route.ts`, `app/api/search-live/route.ts`,
  `lib/ai-parse.ts` (prompt e IA), `lib/nlp-search.ts` (parser de respaldo),
  `lib/share-link.ts`, `lib/skyscanner-adapter.ts`, `lib/types.ts`,
  `components/FlightResultCard.tsx` (quitado el badge "Destino suelto", ya sin sentido),
  `components/ToolsPanel.tsx`, `app/api/alerts/route.ts`,
  `app/api/cron/check-alerts/route.ts`.
- Campos renombrados en `LiveItinerary` (`destinationGroupId`/`Name` ->
  `destinationId`/`Name`) para que no quede ni el nombre del concepto eliminado.
