# Estado del proyecto TiritiTravel

> **Que es este archivo (y en que se diferencia de `CHANGELOG.md`)**
>
> - **`CHANGELOG.md`** es la version corta, de cara al usuario: que cambio, en que
>   version, listado por categorias (Anadido/Corregido/Cambiado). Es lo que miras tu
>   para saber "que hizo Claude en la ultima sesion" de un vistazo.
> - **`docs/STATUS.md`** (este archivo) es el diario de sesion, mucho mas detallado y
>   tecnico -- pensado para que la PROXIMA sesion de Claude (que no tiene memoria de
>   esta conversacion) pueda retomar el trabajo sin tener que releer todo el chat.
>   Incluye: el contexto de por que se pidio algo, decisiones tomadas y por que,
>   diagnosticos de bugs con la causa raiz, cosas probadas y descartadas, avisos
>   pendientes de verificar, y tareas explicitamente aparcadas. Cada sesion nueva anade
>   su entrada AL PRINCIPIO (orden cronologico inverso), sin borrar las anteriores.
>
> En resumen: `CHANGELOG.md` para ti, `docs/STATUS.md` para que Claude no tenga que
> adivinar el historial cada vez que abres una sesion nueva. Si este archivo llega a
> hacerse demasiado largo para ser util, dimelo y lo resumimos/archivamos las entradas
> mas antiguas -- de momento se mantienen todas.

## 🧭 ESTADO ACTUAL / HANDOFF (leer esto primero, sea cual sea la IA que continue)

**En produccion (rama `main`) ahora mismo**: v0.25.1. Incluye TODO lo de v0.12.0 (IA
real, destinos curados eliminados, comparador, alertas por email, contador real de
cuota de Ignav con limite de combinaciones dinamico, explorar destinos gratis via
Travelpayouts -- **confirmado funcionando en vivo por el usuario con datos reales**,
tendencia de precio sobre historial propio, cron de alertas cada 3 dias) MAS: feedback
visual al anadir un destino desde "Explorar", el limite dinamico de combinaciones
ahora es visible en la interfaz (no solo un numero fijo escrito a mano), y una seccion
de ayuda dentro de la app (boton "?" en la barra superior). **El usuario ya aplico la
migracion de las 2 tablas nuevas en Neon y configuro `TRAVELPAYOUTS_TOKEN` en Vercel --
ya no hay nada pendiente de configurar por su parte.** Ver entrada fechada de esta
sesion mas abajo para el detalle completo.

**No hay ningun PR abierto pendiente de mergear.** Toda esta sesion se trabajo con
commits directos a `main` (sin pasar por rama intermedia), tras encontrar que la rama
`revisar-por-claude` (creada para agrupar las mejoras) quedaba con conflictos reales
cada vez que se intentaba mergear por encima del fix de origenes -- se opto por
reconstruir el contenido directamente sobre `main` ya arreglado, verificando cada
archivo contra el contenido real pegado por el usuario antes de sobrescribirlo (nunca
a ciegas por fragmentos de busqueda). La rama `revisar-por-claude` quedo obsoleta y se
borro manualmente por el usuario (esta sesion no tiene una herramienta para borrar
ramas de GitHub, solo crear/actualizar/mergear).

**`OPENAI_API_KEY`, las 3 variables de Resend (`RESEND_API_KEY`, `RESEND_FROM_EMAIL`) y
`TRAVELPAYOUTS_TOKEN` ya estan configuradas en Vercel.**

### Bug real encontrado y arreglado esta sesion: el recorte de destinos por cuota no era determinista
`lib/ai-parse.ts` recorta los destinos que la IA propone si `origenes x destinos > 6`
(proteccion de cuota de Ignav, existe desde la sesion "FIX real de la IA superando la
cuota" mas abajo). El bug: el recorte usaba `.slice()` sobre el ORDEN que devolvia la
IA, orden que cambia entre llamadas identicas porque `temperature: 0.2` no es 0. Con la
misma frase exacta pidiendo mas destinos de los que caben, cada ejecucion podia
descartar un destino distinto -- cambiando que rutas se buscaban de verdad, y por tanto
si se encontraban vuelos reales (rutas low-cost no operan a diario). Fix: ordenar
alfabeticamente por IATA antes de cortar (deterministico), y exponer un array
`warnings` explicito en vez de solo una nota pegada a la `explanation` en prosa.

### Bug real encontrado y arreglado esta sesion: el fix de destinos curados de otra sesion nunca se aplico en produccion
Existia un PR (#22, rama `feat/eliminar-destinos-curados`) de una sesion anterior que
ya eliminaba destinos curados de TODO el codigo, pero nunca se mergeo -- su base
apuntaba a una rama intermedia ya fusionada, quedando invisible en el flujo normal de
review. Mientras tanto, otra sesion habia borrado la tabla `destination_groups` de la
BD real (Neon) sin actualizar el codigo que la consultaba, rompiendo `/api/meta` por
completo (fallaba dentro de un `Promise.all`, sin aviso claro) y dejando el selector de
origenes solo con el fallback de emergencia (Alicante). Se reapunto la base del PR #22
a `main` y se mergeo; luego se ejecuto la migracion SQL pendiente en Neon (borrar
`destination_groups`, `group_id`, `destination_group_id`) que llevaba documentada desde
esa sesion sin que nadie la aplicara.

### Arquitectura rapida (actualizada, reemplaza cualquier mapa anterior de este archivo)
- **3 fuentes de datos de vuelos**: Ignav (principal), Sky Scrapper/RapidAPI (opcional),
  combinadas en `lib/live-engine.ts`.
- **Destinos**: solo `aena_destinations` (sincronizada a diario desde Aena). Los grupos
  curados YA NO EXISTEN en codigo ni en BD -- si algo menciona `destination_groups` en
  el futuro, es un resto sin limpiar, no una funcionalidad activa.
- **3 endpoints de IA** (mismo patron: `gpt-4o-mini`, `response_format: json_schema`,
  fallback si falla): `/api/ai-parse` (interpretar lenguaje natural, recorte de cuota
  ahora deterministico), `/api/ai-surprise` (Sorprendeme), `/api/ai-recommend`
  (recomendar un resultado).
- **Alertas de precio** (`price_alerts` en Neon, columnas `email`/`notified_at`
  anadidas esta sesion): `GET/POST/DELETE /api/alerts` + cron diario
  `/api/cron/check-alerts` que envia email real via Resend (`lib/email.ts`) la primera
  vez que detecta un match, sin repetir mientras el precio siga bajo.
- **`app/page.tsx`** sigue siendo el orquestador principal, pero el bloque de
  resultados se extrajo a `components/ResultsSection.tsx` (comparador, vista
  lista/tarjetas, aviso de alternativa mas barata) para no seguir creciendo un unico
  archivo gigante.

### Limitacion de red de estas sesiones (se mantiene, ver entradas anteriores para el detalle completo)
Sigue sin haber acceso de red a APIs externas ni credenciales de BD real desde el
sandbox de la sesion. Esta sesion en concreto SI tuvo, por primera vez, conectores
directos (GitHub, Neon, Vercel) que permitieron leer/escribir la BD real y el
repositorio real sin depender de que el usuario pegara cada archivo a mano -- aun asi,
para archivos largos (como este) la lectura vino truncada a fragmentos de busqueda de
codigo, sin una forma fiable de obtener el 100% del contenido exacto; se le pidio al
usuario que pegara el contenido cuando la reconstruccion por fragmentos no era
suficientemente fiable, en vez de arriesgarse a sobrescribir con huecos.

---

## Estado al 17 de septiembre de 2026 (sesion 16) — Sesion: FIX de regresion propia en "Sorprendeme"

### Contexto y leccion importante para sesiones futuras
El usuario reporto que "Sorprendeme" seguia proponiendo ciudades que tenia en
"Ciudades a descartar". **Esto era una regresion introducida por esta misma serie de
sesiones, en el commit anterior (v0.25.0)**, no un bug preexistente: al cambiar
`filteredRealDestinations` para que YA NO quitara las ciudades descartadas de la lista
(a proposito, para poder mostrarlas en rojo/tachadas en el selector en vez de
ocultarlas del todo), no se revisaron TODOS los sitios que usaban esa variable dando
por hecho que ya venia filtrada. `handleSurpriseMe` era uno de esos sitios: construia
su `pool` de candidatos a partir de `filteredRealDestinations` asumiendo que las
descartadas ya no estarian ahi -- al dejar de ser cierto, volvieron a colarse.

**Leccion**: cuando se cambia el comportamiento de una variable/funcion compartida
(quitar un filtro implicito, por ejemplo), hay que repasar TODOS sus usos con
`grep`, no solo el sitio donde se origino el cambio -- se hizo a medias en la sesion
anterior (se reviso el render de la lista y el conteo, pero no `handleSurpriseMe`).

### Fix
- `handleSurpriseMe`: añadido `&& !excludeIatas.includes(d.dest_iata)` al filtro del
  `pool`, junto al de destinos visitados que ya tenia.
- De paso, corregido tambien el contador "(N vuelos directos reales)" del titulo de la
  seccion "Destinos", que por el mismo motivo estaba incluyendo las descartadas en la
  cuenta.

### Verificado
`npx tsc --noEmit` y `npm run build` limpios.

---

## Estado al 17 de septiembre de 2026 (sesion 15) — Sesion: FIX real de "Ciudades a descartar"

### Contexto
El usuario reporto que su iPhone corregia "Berlin" a "Berlín" (con tilde) al escribir
en "Ciudades a descartar", y que independientemente de eso, Berlín seguia apareciendo
en destinos. Tambien pidio que las descartadas se vieran en rojo/desactivadas en vez
de desaparecer, y que el campo se recordara entre sesiones.

### El bug real (no era solo la tilde)
`app/page.tsx`: el campo se llama "Ciudades a descartar" en la interfaz, pero por
dentro (`excludeIatas`, ahora `excludeTerms`) SOLO comparaba el texto introducido
contra `d.dest_iata` -- un codigo IATA de 3 letras EXACTO. El propio placeholder
("Ej: LHR, CDG, FCO") delataba que estaba pensado para codigos, no para nombres de
ciudad, pero la etiqueta visible decia "ciudades". Escribir "Berlin" o "Berlín" -- con
o sin tilde, daba exactamente igual -- NUNCA podia coincidir con un codigo de 3 letras
como "TXL" o "BER": el filtro simplemente no hacia nada para nombres de ciudad, desde
que existe este campo.

### Los 4 cambios
1. **Coincidencia por nombre de ciudad (normalizado) O codigo IATA**: nueva funcion
   `normalizeText()` (quita tildes via `.normalize('NFD')` + regex, minusculas) --
   compara el termino introducido contra `dest_name` normalizado (substring) Y contra
   `dest_iata` (coincidencia exacta), asi que "Berlin", "Berlín", "BERLIN" o "TXL"
   funcionan todos igual.
2. **Los destinos descartados ya no se quitan de `filteredRealDestinations`** --
   se mantienen visibles, con estilo rojo/tachado/desactivado
   (`isExcludedDestination(d)` calculado en el render), en vez de desaparecer del
   todo (que el usuario podia confundir con un fallo de carga en vez de un filtro
   intencionado).
3. **Nuevo `useEffect` que limpia `selectedDestIatas`** de cualquier IATA que pase a
   estar descartado -- evita el caso "fantasma" (desactivado visualmente pero
   seleccionado por dentro, y por tanto buscado igualmente).
4. **Persistencia entre sesiones**: nuevo campo opcional `excludeCitiesText` en
   `lib/travel-profile.ts` (backward-compatible, un perfil guardado sin ese campo
   simplemente lo trata como vacio), cargado al iniciar y guardado en el mismo
   `useEffect` que ya persiste origenes/pasajeros.

### Verificado
`npx tsc --noEmit` y `npm run build` limpios. `next start` + `curl` confirmando que el
texto nuevo de ayuda del campo aparece en el HTML.

---

## Estado al 17 de septiembre de 2026 (sesion 14) — Sesion: Wikipedia y destinos visitados, hechos mas visibles

### Contexto
El usuario dijo "no veo las opciones que implementaste en algun momento: destinos
descartados... ni la informacion de Wikipedia". Antes de asumir un bug, se comprobo
directamente en el codigo si algo se habia roto o borrado por accidente en alguna
sesion posterior -- **no era el caso**: `lib/visited-destinations.ts`,
`lib/wikipedia.ts`, `app/api/destination-info/route.ts` y su uso en
`ExploreDestinations.tsx`/`DestinationTipsButton.tsx` seguian intactos y funcionando.
El problema real era de descubribilidad: ambas funciones estaban escondidas dentro de
desplegables anidados (2-3 niveles: encontrar la tarjeta -> abrir "Mas detalles del
destino" -> ver Wikipedia; o encontrar "Ideas de destino" -> pulsar "Ver ideas" -> ver
el boton de marcar visitado), sin ningun sitio mas directo para verlas o gestionarlas.

### Cambios (solo de disposicion en la interfaz, sin tocar la logica de ninguna de las 2 funciones)
- **Wikipedia + ficha de pais, sacados del desplegable "Mas detalles del destino"**
  en `components/FlightResultCard.tsx`: `DestinationTipsButton` (que contiene el
  resumen de Wikipedia, la ficha de pais, y el boton de consejo de la IA) se movio
  FUERA del `<details>`, quedando siempre visible en la tarjeta sin necesidad de tocar
  nada -- se carga solo via `useEffect`, como siempre. Lo que sigue dentro del
  desplegable (CO2, clima, tipo de cambio, grafico de precio historico) es informacion
  mas secundaria, tiene sentido que siga opcional/colapsada.
- **Seccion propia para destinos visitados** en `components/ToolsPanel.tsx`: nueva
  seccion "Destinos marcados como visitados (N)" (solo visible si hay al menos uno
  marcado), con boton para quitar cada uno directamente -- antes solo se podian ver/
  quitar entrando en "Ideas de destino" y buscando las tarjetas atenuadas.
- `components/HelpModal.tsx`: nuevo tema dedicado a ambas funciones, que no tenian
  ninguno propio (se explicaban de pasada dentro de otros temas, sin ser faciles de
  encontrar tampoco ahi).

### Leccion para sesiones futuras
Cuando el usuario reporte "no veo la funcion X que hiciste", el primer paso deberia
ser SIEMPRE comprobar en el codigo si sigue ahi (grep de las funciones/componentes
clave) antes de asumir que se rompio algo -- en este caso no habia ningun bug de
codigo, solo un problema de donde se colocan las cosas en la interfaz.

### Verificado
`npx tsc --noEmit` y `npm run build` limpios.

---

## Estado al 17 de septiembre de 2026 (sesion 13) — Sesion: Sorpréndeme en 2 fases, FIX destinos inventados, orden de campos

### Contexto
Feedback de la esposa del usuario tras probar la app: (1) esperaba que "Sorpréndeme"
fuera como el "a cualquier parte" de Skyscanner (muchas opciones, ordenables), no una
busqueda real inmediata de 1-2 destinos; (2) probo la busqueda en lenguaje natural con
"viaje para 3 personas... mercadillo navideño" y la IA propuso 2 destinos en Alemania
sin vuelo directo real, sin encontrar nada; (3) pidio mover adultos/niños antes del
calendario. El usuario tambien pidio forzar la sincronizacion de Aena ahora mismo.

### 1. Sincronizacion de Aena forzada -- no se pudo hacer desde aqui
Explicado honestamente: la app tiene "Vercel Authentication (SSO) activada para todos
los entornos" (confirmado por busqueda web del propio README del repo) -- cualquier
peticion desde este sandbox se queda bloqueada en esa capa antes de llegar al codigo,
sin forma de autenticarse desde aqui. Se le dieron al usuario las 4 URLs exactas de los
crons (`/api/cron/refresh-aena/<ORIGEN>`) para que las visite el mismo desde su propio
navegador (ya autenticado), con la indicacion de añadir `?secret=...` si tiene
`AENA_SYNC_SECRET` configurado.

### 2. Sorpréndeme rediseñado en 2 fases
Diagnostico: `handleSurpriseMe` elegia EXACTAMENTE `Math.floor(6 / origenes)` destinos
(tipicamente 1-2 con un solo origen) y llamaba a `runSearch` de inmediato -- ningun
"explorar" real, solo una busqueda con destino ya decidido por la IA. Rediseño:
- `lib/ai-surprise.ts`: ya no recibe `maxDestinations` (ligado al limite de
  combinaciones de Ignav) -- ahora SIEMPRE pide hasta 6 candidatos (constante
  `MAX_CANDIDATES`), cada uno con una `reason` (razon breve) ademas del `destIata`.
  Esta llamada NO gasta cuota de Ignav (es solo texto de la IA), asi que desacoplarla
  del limite de combinaciones es seguro.
- `app/page.tsx`: `handleSurpriseMe` ahora solo llama a la IA y guarda los candidatos
  en `surpriseCandidates` (fase 1, gratis) -- ya NO llama a `runSearch`. Nueva funcion
  `handlePickSurpriseCandidate(destIata)` (fase 2): se dispara cuando el usuario elige
  UNA tarjeta, y ahi SI se lanza la busqueda real para esa unica ruta.
- UI: las tarjetas de candidatos se muestran justo debajo del boton "Sorprendeme",
  mismo patron visual que "Ideas de destino" (Travelpayouts) -- consistencia entre las
  2 funciones de exploracion gratuita que tiene la app.
- Fallback sin IA: en vez de elegir aleatoriamente solo `maxDestinations` (1-2), ahora
  elige 6 al azar de la lista real -- mismo numero que con IA, solo sin razonamiento.

### 3. FIX real: la IA de lenguaje natural podia inventar destinos
Diagnostico exacto: el `RESPONSE_SCHEMA` de `lib/ai-parse.ts` (json_schema de OpenAI)
define `destinationIatas` como `{ type: 'array', items: { type: 'string' } }` -- esto
SOLO obliga a que sea un array de texto, nunca a que esos textos sean, en concreto, los
IATA de la lista de destinos reales que se le pasa en el prompt. El prompt SI incluye
la instruccion ("No inventes destinos que no estén en la lista..."), pero un modelo
puede ignorar una instruccion de texto libre aunque el schema la deje pasar sin
problema -- el schema no la hace cumplir. `lib/ai-surprise.ts` YA tenia el filtro
correcto tras la respuesta (`validIatas`/`filtered`, ver commit de la sesion de
"Sorprendeme con criterio"); a `ai-parse.ts` (usado por la busqueda en lenguaje natural
completa, no solo Sorprendeme) le faltaba ese mismo filtro -- ahi estaba el bug real
que vio la esposa del usuario. Añadido: cualquier `destinationIata` fuera de
`context.realDestinations` se descarta tras la respuesta, con un aviso añadido a
`parsed.warnings` (que ya se mostraba en la interfaz via `nlpWarnings`, sin cambios
necesarios ahi).

### 4. Adultos/Niños movidos antes del calendario
Simple reordenacion de bloques JSX en `app/page.tsx`, sin cambios de logica.

### Verificado
`npx tsc --noEmit` y `npm run build` limpios. `next start` + `curl` confirmando que el
texto nuevo de Sorpréndeme aparece en el HTML.

### Aviso
Como siempre con las llamadas a OpenAI, no se ha podido verificar el nuevo
`ai-surprise.ts` (esquema con `reason` por candidato) contra la API real desde esta
sesion.

---

## Estado al 17 de septiembre de 2026 (sesion 12) — Sesion: FIX real del scraping de Aena para Madrid y Murcia (0 destinos)

### Contexto -- IMPORTANTE para cualquier IA futura
El usuario reporto un bug real: seleccionando Madrid o Murcia como origen, la app
mostraba **0 destinos**, cuando Madrid deberia tener MUCHOS mas que Alicante (es el
aeropuerto mas grande de España, no menos). Pidio literalmente "agrega los aeropuertos
que falte añadir... centrandote en Europa, norte de Africa, Caucaso, Chipre, Georgia".

**Se decidio NO seguir esa instruccion al pie de la letra**, y se explico por que antes
de actuar: esta app NUNCA ha usado listas de destinos curadas a mano -- se eliminaron
por completo hace muchas sesiones (PR #22, "ELIMINADOS los destinos curados") porque
quedaban desactualizadas y no reflejaban vuelos reales. Los destinos de
`aena_destinations` vienen SIEMPRE de un scraping diario automatico de la web publica
de Aena (`lib/aena-sync.ts`, cron `refresh-aena/<ORIGEN>`). Anadir aeropuertos a mano
para "arreglar" el 0 de Madrid habria sido reintroducir exactamente el problema que se
elimino antes, y ademas habria escondido el bug real en vez de arreglarlo. **Cualquier
IA futura que reciba una peticion parecida ("faltan destinos, añadelos a mano") deberia
sospechar primero de un fallo en el scraping, no asumir que hace falta una lista
curada** -- esa es la lección de esta sesion.

### Los 2 bugs reales encontrados (investigados por busqueda web contra la pagina real de Aena, sin acceso de red directo desde el sandbox a aena.es)
1. **Murcia (RMU): ruta de URL mal escrita, causaba 404 silencioso.**
   `DEST_PATH_BY_ORIGIN.RMU` en `lib/aena-sync.ts` tenia
   `'aerolineas-y-destinos/destinos-DEL-aeropuerto.html'` -- un "del" de mas que no
   existe en la URL real. Verificado buscando la pagina real de Aena para Murcia
   (`aena.es/en/internacional-region-de-murcia/airlines-and-destinations/airport-destinations.html`,
   20 destinos reales segun esa misma pagina), cuyo equivalente en español es
   `aerolineas-y-destinos/destinos-aeropuerto.html`, exactamente igual que ALC y MAD.
   Con la ruta mal escrita desde que se escribio este archivo, RMU nunca tuvo NINGUN
   destino sincronizado -- no es que faltaran algunos, es que fallaba desde el primer
   dia.
2. **Madrid (MAD): timeout de peticion insuficiente para el tamaño real de la
   pagina.** Verificado que Madrid-Barajas tiene 226 destinos reales (segun la propia
   pagina de Aena), frente a los ~110 que muestra Alicante -- una pagina mucho mas
   pesada de descargar y que el regex tiene que analizar. El timeout de
   `fetchAenaDestinations` pasado desde el cron era de 5000ms, claramente insuficiente
   para una pagina el doble de grande. Subido a 8000ms en
   `app/api/cron/refresh-aena/[origin]/route.ts`. El limite duro de la funcion en el
   plan Hobby de Vercel (`maxDuration = 10`) NO se puede subir, asi que se dejo un
   margen de ~1.5s (con el `withHardTimeout` interno de +500ms) para el resto del
   trabajo (el upsert en base de datos, que es una sola consulta UNNEST, deberia ser
   rapida).
3. Se comprobo tambien Valencia (VLC), que daba 60 de sus ~103 destinos reales -- su
   ruta de URL SI es correcta (verificado igual que las otras), asi que lo mas
   probable es que sufra el mismo problema de timeout (pagina mas grande que
   Alicante, aunque menor que Madrid) -- el aumento a 8000ms deberia beneficiarla
   tambien, aunque no se puede confirmar sin ver el resultado real del proximo sync.

### Aviso importante sobre cuando se ve el efecto
Estos 2 fixes de codigo estan ya en `main` y desplegados, pero **solo tienen efecto la
proxima vez que se ejecute cada cron de sincronizacion** (`refresh-aena/MAD` a las
04:05 hora de España, `refresh-aena/RMU` a las 04:15, segun `vercel.json`) -- no
rellenan datos retroactivamente ni corrigen lo que ya haya en la tabla ahora mismo. El
usuario vera los destinos correctos de Madrid y Murcia a partir de la proxima
madrugada, o puede disparar el cron el mismo antes si quiere verlo confirmado ya
(necesita el valor de `AENA_SYNC_SECRET`, que esta sesion no conoce ni ha visto nunca).

### Verificado
`npx tsc --noEmit` y `npm run build` limpios. No se ha podido verificar en vivo que el
proximo sync real de Madrid/Murcia funcione (sin acceso de red a aena.es ni a la BD
real desde este entorno) -- el usuario debera confirmarlo mañana.

---

## Estado al 17 de septiembre de 2026 (sesion 11) — Sesion: quitado panel de horarios duplicado, medidas de equipaje, "Explorar" renombrado

### Contexto
El usuario reporto 3 cosas de claridad tras usar la app: por que "Filtros y ajustes" >
"Horarios" mostraba de nuevo la hora si ya se veia por dia en el calendario; pidio
medidas y peso del equipaje de mano por aerolinea; y dijo no entender que era
"Explorar destinos" (veia un desplegable de aeropuertos y un listado, sin contexto).

### 1. Panel de Horarios duplicado -- por que existia y por que se quito
No era un duplicado literal: el panel general (`outboundNotBeforeHour`,
`outboundNotAfterHour`, etc.) es el valor de RESPALDO que usa cada dia sin hora propia,
y ademas es lo que rellena la IA cuando interpreta una frase tipo "salida despues de
las 18h" (ver `app/page.tsx`, puntos de restauracion de IA/enlaces/historial). Pero
tener 2 sitios con el mismo aspecto (4 campos de hora) sin explicar la relacion entre
ambos era confuso de verdad. Se quito el panel visible de "Filtros y ajustes", pero
para no perder la utilidad real del respaldo (sobre todo el de la IA), se añadieron 2
`useEffect` que, cuando el valor general cambia, lo copian automaticamente a cada dia
seleccionado que TODAVIA no tenga su propia hora -- asi el calendario sigue siendo el
UNICO sitio visible, pero nunca se pierde una hora que venga de fuera (IA, enlace
compartido, historial).

### 2. Medidas de equipaje de mano gratis
`lib/airline-baggage-notes.ts` ampliado con medidas y peso reales del bolso que SI va
gratis (no solo el aviso generico de antes). Investigado por busqueda web en esta
sesion, cruzando varias fuentes de comparativas de equipaje de 2026 (algunas cifras
variaban ligeramente entre fuentes segun la fecha de publicacion, señal de que estos
datos cambian con cierta frecuencia): Ryanair 40x20x25cm sin limite de peso indicado,
Wizz Air 40x30x20cm hasta 10kg, EasyJet 45x36x20cm, Vueling 40x30x20cm, Volotea y
Norwegian 40x30x20cm. Se marca explicitamente como "aproximado, comprueba antes de
viajar" en la propia interfaz, dado que estas cifras no son estables a largo plazo.

### 3. "Explorar destinos" renombrado y explicado
Renombrado a "Ideas de destino (gratis, no es una busqueda real)", con una frase en
negrita justo al principio ("Esto no busca vuelos de verdad") antes de cualquier otra
cosa, cada precio ahora dice explicitamente "(orientativo)", y el boton de cada
tarjeta paso de "Buscar este" a "Buscar vuelos reales" -- para dejar claro cual es el
paso que de verdad lanza una busqueda con datos en firme. Mismo cambio reflejado en el
tema correspondiente de `HelpModal.tsx`.

### Verificado
`npx tsc --noEmit` y `npm run build` limpios. `next start` + `curl` confirmando que el
texto "Esto no busca vuelos de verdad" aparece y que "Ida no antes de (h)" (el panel
duplicado que se quito) ya no aparece en el HTML.

### Pendiente (usuario)
Nada nuevo que configurar.

---

## Estado al 17 de septiembre de 2026 (sesion 10) — Sesion: calendario gratis, IA con clima real, ficha de pais, Wikipedia, 3 ajustes de usabilidad

### Contexto
El usuario pregunto que pasaria cuando se agote la cuota de Ignav (se le explico: la
app no se rompe, cada llamada fallida se captura una a una -- ver
`safeSearchOneWay` en `lib/live-engine.ts` -- pero sin Sky Scrapper configurado se
quedaria sin resultados reales; Sky Scrapper renueva 100/mes, a diferencia de la cuota
de por vida de Ignav). Luego pidio implementar 5 mejoras gratuitas propuestas, y
durante la prueba reporto 3 cosas mas: que Sorprendeme no explicaba que hacia falta
para usarlo, que las fotos de los resultados eran demasiado grandes, y que no se
indicaba que se pueden elegir varios aeropuertos ni que es open-jaw.

### Las 5 mejoras gratuitas
1. **Calendario de precios gratis previo** (`getFreePriceCalendar` en
   `lib/travelpayouts.ts`, endpoint `v1/prices/calendar` de Travelpayouts): un mes
   completo de precios orientativos SIN gastar cuota de Ignav, pensado como filtro
   previo antes de gastar cuota real en el calendario de verdad (que cuesta 1 peticion
   por dia). Aparece justo debajo del calendario real en el panel de herramientas.
2. **IA de destino con clima real**: antes solo se le pasaba el mes a la IA para el
   consejo de equipaje; ahora se le pasa el dato REAL de Open-Meteo ya calculado para
   esa busqueda (mismo coste de tokens, mejor precision). Tambien se le pasa cuantos
   niños viajan para un angulo familiar.
3. **Ficha de pais gratis** (REST Countries, `lib/country-info.ts`): idioma, capital,
   lado de conduccion, y una nota fija de tipo de enchufe (mapa editorial pequeño,
   REST Countries no da esa informacion). Se carga sola sin boton -- es gratis e
   instantanea, a diferencia del consejo de la IA.
4. **Resumen de Wikipedia** (`lib/wikipedia.ts`): funciona incluso sin
   `OPENAI_API_KEY` configurada, alternativa gratuita de contexto sobre el destino.
5. El codigo ISO2 del pais del destino, ya resuelto en el servidor para clima/CO2/
   cambio, se expuso tambien en `LiveItinerary.destinationCountryIso2` para que el
   cliente no tuviera que volver a resolverlo (evita duplicar logica cliente/servidor).

### Los 3 ajustes de usabilidad
- **Fotos de resultado, mucho mas pequeñas**: en movil eran un banner de ancho
  completo y 144px de alto (`sm:w-40 h-36 sm:h-auto`) -- con muchos resultados eso
  significaba mucho scroll solo para pasar las fotos. Cambiado a una miniatura fija
  (`w-16 h-16 sm:w-24 sm:h-24`), siempre lateral, en movil y escritorio por igual (se
  quito el `flex-col` que apilaba la foto arriba en movil).
- **Nota de requisitos minimos en Sorprendeme**: el boton ya estaba `disabled` sin
  origen elegido, pero no se explicaba en ningun sitio -- añadida una frase justo
  debajo indicando que solo hace falta un origen, y que usa lo que haya en el
  formulario (fechas/horas/pasajeros) en ese momento.
- **Multi-seleccion y open-jaw mas visibles**: los titulos de "Origenes" y "Destinos"
  ahora dicen explicitamente "puedes elegir varios" (siempre fue posible, pero no era
  obvio sin probarlo); el checkbox de open-jaw ahora tiene un ejemplo concreto
  (Londres-Gatwick de ida, Londres-Stansted de vuelta) en vez de solo el nombre
  tecnico entre parentesis. Tambien se actualizo el primer tema de `HelpModal.tsx`,
  que aun describia el antiguo modelo de "rango de fechas" ya sustituido por el
  calendario de dias sueltos de la sesion anterior.

### Verificado
`npx tsc --noEmit` y `npm run build` limpios. `next start` + `curl` confirmando la
presencia de los 3 textos nuevos de usabilidad y de "Vista previa gratis" en el HTML.

### Pendiente (usuario)
Nada nuevo que configurar -- las 3 APIs nuevas (Travelpayouts calendario, REST
Countries, Wikipedia) usan credenciales que ya existian (`TRAVELPAYOUTS_TOKEN`) o no
necesitan ninguna (REST Countries, Wikipedia son publicas y sin clave).

---

## Estado al 17 de septiembre de 2026 (sesion 9) — Sesion: detector de chollos, insignia, aviso de equipaje, calendario a 30 dias

### Contexto
El usuario pidio inspirarse en Dollar Flight Club (detector de chollos automatico) y
"el resto" de ideas propuestas: insignia de chollo en las tarjetas, aviso de politica
de equipaje, y calendario de precios ampliado.

### Detector de chollos: por que es una version REALISTA de DFC, no una copia
Dollar Flight Club tiene un equipo humano buscando activamente tarifas de error en
cientos de rutas al dia. Copiar eso literalmente aqui significaria buscar activamente
sin parar, lo cual gastaria la cuota de 1000 peticiones DE POR VIDA de Ignav en dias,
no en años. En vez de eso, se diseño un detector PASIVO: se apoya en `price_history`
(la tabla que ya registra cada precio real visto, sea por busquedas normales del
usuario o por el cron de alertas) -- CERO peticiones nuevas a Ignav. Logica
(`lib/deal-detector.ts`): cada vez que se ejecuta (al final del cron de alertas, cada 3
dias -- no se creo un cron nuevo para no arriesgar el limite de crons del plan de
Vercel), agrupa los precios vistos en las ultimas 24h por ruta, calcula el promedio
historico de esa ruta EXCLUYENDO esa ventana reciente (para que el propio chollo no
infle su propia referencia), y si el precio reciente es un 35% o mas barato que ese
promedio (con al menos 5 observaciones previas para que el promedio sea fiable), manda
una notificacion push real -- sin que haga falta tener una alerta guardada para esa
ruta en concreto. Deduplicacion: no vuelve a avisar de la misma ruta (con un precio
igual o peor) si ya lo hizo en los ultimos 3 dias (tabla `detected_deals`).

**Limitacion honesta, explicada tambien al usuario**: solo puede detectar chollos en
rutas que la app YA ha visto antes (hace falta historial para calcular un promedio de
referencia) -- no es un rastreador universal como DFC, es un "aviso inteligente" sobre
las rutas que de verdad le interesan al usuario, construido sobre datos que la propia
app ya recopila por su uso normal.

### Insignia "🔥 Chollo" en las tarjetas
Mismo umbral (35%+ por debajo del promedio) que el detector, pero calculado en el
propio navegador a partir de `priceTrend` (que ya se enviaba en cada resultado desde
hace varias sesiones) -- cero peticiones nuevas, es solo una comparacion aritmetica
mas visible que el texto "precio bajo/normal/alto" que ya existia.

### Aviso de equipaje
`lib/airline-baggage-notes.ts`: contenido editorial fijo (no una API) para las
aerolineas de bajo coste habituales en estas rutas, conocidas por cobrar aparte la
maleta de cabina grande. Se muestra una sola vez por tarjeta (deduplicado si ida y
vuelta son la misma aerolinea).

### Calendario de precios: 14 -> 30 dias, pero dinamico
Igual que se hizo con el limite de combinaciones en una sesion anterior
(`dynamicComboLimit`), se anadio `dynamicCalendarDaysLimit` en `lib/ignav-usage.ts`:
sube el techo absoluto de 14 a 30 dias (peticion del usuario), pero el maximo REAL
aplicado en cada consulta depende de cuanta cuota quede -- 30 con mucha cuota, bajando
hasta 7 si queda poca. Cada dia del calendario gasta 1 peticion real, asi que subir el
techo sin este ajuste habria sido irresponsable con la cuota de por vida.

### FIX proactivo (no reportado, encontrado al tocar el archivo)
`lib/price-calendar.ts` tenia el MISMO patron fragil de fechas que causo el bug real
de la sesion anterior: mezclar `Date.prototype.getDate()`/`setDate()` (metodos locales)
con `toISOString()` (que siempre trabaja en UTC). Aqui, al ser codigo de SERVIDOR
ejecutandose en Vercel (que corre en UTC por defecto), el bug no llegaba a manifestarse
en la practica -- pero corregirlo evita depender de una asuncion implicita sobre el
entorno de ejecucion que podria dejar de ser cierta en el futuro (por ejemplo, si
Vercel cambiara su comportamiento por defecto, o si el codigo se ejecutara alguna vez
en otro entorno). Reescrito con metodos UTC explicitos de principio a fin.

### Verificado
`npx tsc --noEmit` y `npm run build` limpios. `next start` + `curl` confirmando HTTP
200 en la home.

### Pendiente (usuario)
Aplicar en Neon la migracion de la tabla `detected_deals` (ver `scripts/schema.sql`,
bloque "MIGRACION: detector de chollos") -- sin ella, el detector simplemente no hace
nada (falla en silencio), sin afectar al resto de la app.

---

## Estado al 17 de septiembre de 2026 (sesion 8) — Sesion: calendario propio, dias sueltos independientes, hora por dia

### Contexto y diagnostico del bug real
El usuario probo el selector "dia + flexibilidad" (sesion 7) con una captura: tocar un
dia en el picker nativo no hacia nada visible. Causa raiz identificada: `applyFlexDay`
usaba `Date.prototype.toISOString().slice(0,10)` para formatear la fecha calculada --
`toISOString()` SIEMPRE convierte a UTC, y España en invierno es UTC+1, asi que la
medianoche local de un dia puede caer en las 23h UTC del dia anterior, desplazando la
fecha un dia hacia atras. Combinado con el hecho de que HABIA 2 `<input type="date">`
nativos controlando la MISMA variable de estado (`outboundDateFrom`): el picker nativo
de iOS (que internamente es una rueda con su propio estado efimero) se desincronizaba
al re-renderizar por el OTRO input observando el mismo valor, dando la sensacion de que
"no hacia caso".

### Decision de diseño: eliminar la clase de bug, no solo el sintoma
En vez de parchear el calculo de fechas (que habria dejado el problema de fondo de 2
inputs nativos compartiendo estado), se sustituyo el `<input type="date">` nativo por
un calendario propio 100% en React (`components/DayPicker.tsx`) que nunca pasa por
`toISOString()` ni depende de ningun picker del sistema operativo -- construye el ISO
directamente desde año/mes/dia locales (`toIso()`). Esto ademas encajaba con lo que el
usuario pedia a continuacion: mas potencia (dias sueltos independientes + hora por
dia), algo que un simple `<input type="date">` con rango simetrico nunca podria dar.

### Diseño elegido para "dias sueltos independientes + hora por dia"
Se penso en reescribir todo el modelo de fechas (quitar el concepto de rango por
completo), pero eso habria roto MUCHAS integraciones que dependen de un rango
`outboundDateFrom`/`outboundDateTo` simple: interpretacion con IA, enlaces para
compartir, historial de busquedas, y el cron de alertas. En vez de eso, diseño hibrido
de bajo riesgo:
- **Dato canonico nuevo**: `outboundSelectedDays`/`inboundSelectedDays` (arrays de
  fechas sueltas, no necesariamente contiguas) + `outboundDayHours`/`inboundDayHours`
  (mapa fecha -> {before, after} opcional).
- **Compatibilidad**: `outboundDateFrom`/`outboundDateTo` se siguen manteniendo,
  derivados como min/max de los dias seleccionados, para que TODO lo que ya lee esas 2
  variables (IA, enlaces, historial, cron) siga funcionando sin tocarlas. Al RESTAURAR
  desde cualquiera de esas fuentes (que dan un rango, no una lista), se expande
  automaticamente a `datesBetween(from, to)` para poblar el calendario -- funciones
  nuevas `syncOutboundRangeToDays`/`syncInboundRangeToDays`, aplicadas en los 4 puntos
  de restauracion (URL al cargar, respuesta de la IA, parser de respaldo, historial).
- **Backend**: `lib/live-engine.ts` recibe los campos nuevos opcionales
  `outboundDates`/`inboundDates` (lista explicita) y usa esa lista EN VEZ de
  `datesBetween(dateFrom, dateTo)` cuando se proporciona -- asi soporta dias NO
  contiguos de verdad. Mismo patron para `outboundDayHours`/`inboundDayHours`: si el
  dia concreto tiene una hora propia, se usa esa; si no, cae a la franja general
  (`outboundNotBeforeHour`/`outboundNotAfterHour`) que ya existia. El limite de 5 dias
  (`MAX_DATE_RANGE_DAYS`) tambien se corrigio para contar sobre la lista real de dias
  elegidos, no sobre el rango envolvente (que podria ser mas largo si los dias no son
  contiguos).
- **UI**: quitados del todo los inputs "Ida desde/hasta"/"Vuelta desde/hasta" en bruto,
  tal como pidio el usuario una vez el calendario nuevo estuviera funcionando.

### Verificado
`npx tsc --noEmit` y `npm run build` limpios. `next start` + `curl` confirmando que
"Dias de ida"/"Dias de vuelta" (calendario nuevo) aparecen y "Ida desde"/"Ida hasta"
(inputs viejos) ya NO aparecen en el HTML.

### Aviso
El campo `latest_hour` (franja horaria completa, sesion 7) y ahora tambien las horas
POR DIA concreto siguen sin poder verificarse contra la API real de Ignav desde esta
sesion.

---

## Estado al 17 de septiembre de 2026 (sesion 7) — Sesion: orden por defecto, destinos visibles, dia+flexibilidad, franja horaria

### Contexto
El usuario pidio 4 cosas: confirmar que todo estaba en GitHub (si, confirmado), que los
destinos seleccionados se vean sin desplazarse por el listado, un selector de fecha
estilo Kiwi (dia + flexibilidad + franja horaria), y reportar un vuelo que "consta
disponible" pero no salia en resultados, sospechando del orden de seleccion de
aeropuertos -- ademas de pedir que el orden por defecto de resultados sea precio.

### Investigacion del vuelo que no aparecia (sin cambio de codigo)
Revisada de arriba a abajo la logica de `lib/live-engine.ts`: el bucle
`originIatas.flatMap((originIata) => allTargets.map((target) => searchLiveForTarget(...)))`
lanza TODAS las combinaciones origen x destino en paralelo via `Promise.all`, de forma
simetrica -- ningun origen o destino se procesa "primero" ni "ultimo" de forma que
pueda perderse por el orden de seleccion. Tampoco hay ningun `slice`/corte que dependa
del orden. Las 2 unicas comprobaciones que SI pueden hacer fallar una busqueda entera
(`comboLimit` dinamico y `MAX_IGNAV_REQUESTS_PER_SEARCH`) lanzan un ERROR VISIBLE, no
recortan resultados en silencio -- si hubieran saltado, el usuario habria visto un
aviso, no un simple "falta un vuelo". **Conclusion honesta, sin poder verificarlo
contra la API real**: lo mas probable es que Ignav (proveedor de datos externo) no
tenga ese vuelo concreto indexado -- no cubre el 100% de las aerolineas/rutas, es una
limitacion conocida de depender de un unico agregador, no un bug de esta app. Si el
usuario puede reproducirlo con datos concretos (origen, destino, fecha exacta, y
aerolinea del vuelo que "consta disponible"), séria la unica forma de investigar mas a
fondo -- de momento no hay suficiente informacion para ir mas alla de esto.

### Cambios de codigo
1. **Orden por defecto: precio** (antes "hora de salida del hotel") -- cambiado en
   `app/page.tsx` (estado inicial) y `app/api/search-live/route.ts` (fallback del
   backend cuando no se manda `sortBy`).
2. **Destinos seleccionados visibles sin scroll**: chips con boton de quitar, justo
   encima del filtro y el listado completo de destinos.
3. **Selector "dia + flexibilidad" estilo Kiwi**: un `<input type="date">` (calendario
   nativo del movil) para el dia central de ida/vuelta, mas 3 botones de flexibilidad
   (Exacto / ±1 dia / ±2 dias) que calculan automaticamente
   `outboundDateFrom/To`/`inboundDateFrom/To` -- sin sustituir los inputs de rango
   originales (se dejan debajo, editables a mano, para quien prefiera un rango no
   simetrico). Con ±2 dias el rango resultante es de 5 dias, justo el maximo permitido
   (`MAX_DATE_RANGE_DAYS`), asi que no hace falta un limite adicional.
4. **Franja horaria completa** (no solo "no antes de"): anadidos
   `outboundNotAfterHour`/`inboundNotAfterHour`, usando el campo `latest_hour` que la
   API de Ignav ya soportaba en el tipo (`lib/ignav.ts`) pero que no estaba expuesto en
   ningun sitio de la interfaz -- hilo completo: estado en `page.tsx` -> payload ->
   `app/api/search-live/route.ts` -> `LiveFilters` -> `departure_time_range` en
   `searchLiveForTarget`.

### Verificado
`npx tsc --noEmit` y `npm run build` limpios. `next start` + `curl` confirmando HTTP
200 y presencia de los textos nuevos ("Elige un dia y cuanta flexibilidad", "Ida no
despues de", "Vuelta no despues de").

### Aviso
La franja horaria completa (`latest_hour`) no se ha podido verificar contra la API real
de Ignav en esta sesion -- se confia en que la API la respeta igual que `earliest_hour`
(que ya llevaba tiempo en produccion sin problemas reportados), pero no hay una
confirmacion directa para el campo nuevo.

---

## Estado al 17 de septiembre de 2026 (sesion 6) — Sesion: 8 mejoras de golpe (push, historial visual, offline, IA de destino...)

### Contexto
El usuario pidio implantar TODO lo sugerido en la sesion anterior (dia mas barato/CO2/
clima/festivos ya hechos) excepto accesibilidad: precio por persona, WhatsApp, "ya he
estado aqui", calendario en mapa de calor, grafico de precio historico, consejo de la
IA sobre el destino, modo sin conexion, y notificaciones push reales -- 8 piezas.

### Las 8 piezas (resumen, detalle completo en CHANGELOG.md)
1. Interruptor precio total/por persona en resultados.
2. Boton directo de WhatsApp para compartir.
3. "Ya he estado aqui": destinos visitados (localStorage) excluidos de Sorprendeme, y
   atenuados en Explorar con opcion de mostrar/ocultar.
4. Calendario de precios: mapa de calor real (gradiente verde-rojo por precio, no solo
   destacar el minimo).
5. Grafico de precio historico por ruta (SVG propio, sin libreria de graficos nueva) en
   "Mas detalles del destino" de cada tarjeta, alimentado por `price_history` (la misma
   tabla que ya usa la tendencia "bajo/normal/alto").
6. Consejo de la IA sobre el destino (que ver, que llevar), BAJO DEMANDA (boton, no
   automatico) para no gastar tokens en cada resultado sin que el usuario lo pida.
7. Modo sin conexion basico: si una busqueda falla por red, se muestra la ultima
   busqueda guardada en el telefono. No es una PWA offline completa (no hay cache de
   assets/paginas), solo el ultimo resultado de busqueda.
8. **Notificaciones push reales** -- la pieza grande. Ver detalle abajo.

### Notificaciones push: lo que se monto y lo que falta configurar
- `web-push` instalado como dependencia real (+ `@types/web-push` para que compile).
- Claves VAPID generadas EN ESTA SESION con `webpush.generateVAPIDKeys()` (no
  reutilizadas de ningun sitio, propias de este despliegue). **La clave privada se le
  dio al usuario directamente en el chat, nunca se comitea a este repositorio publico**
  -- si hace falta regenerarlas, ejecutar `node -e "console.log(require('web-push').generateVAPIDKeys())"`
  y pegar el resultado directamente en las variables de entorno de Vercel.
  **El usuario tiene que anadir estas 2 (o 3) variables en Vercel** para que funcionen
  -- sin ellas, el boton de activar muestra un aviso claro (503), no rompe nada.
- Tabla nueva `push_subscriptions` (ver bloque de migracion en `scripts/schema.sql`) --
  misma mecanica que las migraciones anteriores, el usuario la aplica a mano en Neon.
- Service worker minimo en `public/sw.js`: SOLO recibe push y los muestra, no cachea
  nada (no es el service worker de una PWA completa).
- `components/PushNotificationSetup.tsx`: boton en el panel de herramientas que
  registra el service worker, pide permiso, se suscribe, y manda la suscripcion a
  `/api/push/subscribe`. **Detecta si es iPhone sin la app anadida a inicio** y avisa
  claramente en vez de fallar en silencio -- las push de Apple en Safari/PWA solo
  funcionan asi, es una limitacion de iOS, no de esta app.
- El cron de alertas (`app/api/cron/check-alerts/route.ts`) manda la push real junto al
  email cuando encuentra una bajada de precio, via `sendPushToAll()` en `lib/push.ts`
  (limpia automaticamente suscripciones caducadas que el navegador devuelva como
  404/410).

### FIX de tipos encontrado durante la verificacion (antes de desplegar)
`urlBase64ToUint8Array` en `PushNotificationSetup.tsx` devolvia un `Uint8Array` que
TypeScript moderno no aceptaba como `BufferSource` para `applicationServerKey`
(distincion estricta `ArrayBuffer` vs `SharedArrayBuffer`) -- corregido construyendo el
buffer explicitamente como `ArrayBuffer`. Tambien hizo falta instalar
`@types/web-push` (el paquete no trae sus propios tipos).

### Verificado
`npx tsc --noEmit` y `npm run build` limpios (tras corregir los 2 errores de tipos de
arriba). `next start` + `curl` confirmando: home HTTP 200, `/api/push/vapid-public-key`
devuelve 503 controlado sin las claves configuradas, `sw.js` se sirve correctamente
(HTTP 200) desde `public/`.

### Pendiente (usuario)
- Anadir `VAPID_PUBLIC_KEY` y `VAPID_PRIVATE_KEY` (y opcionalmente `VAPID_SUBJECT`) en
  Vercel.
- Aplicar la migracion de `push_subscriptions` en Neon.
- Probar el boton de activar push en el movil (idealmente con la app anadida a la
  pantalla de inicio si es iPhone) y confirmar que llega una notificacion real cuando
  salte una alerta.

---

## Estado al 17 de septiembre de 2026 (sesion 5) — Sesion: CO2, clima, tipo de cambio, festivos y "sale mas barato otro dia"

### Contexto
El usuario pidio implementar de golpe las 3 mejoras propuestas (dia mas barato, CO2,
festivos) y las 3 APIs gratuitas sugeridas (Open-Meteo, Frankfurter, Nager.Date) -- en
realidad 5 piezas distintas, ya que festivos y Nager.Date eran lo mismo contado dos
veces en la propuesta original.

### El problema de fondo antes de empezar: Aena no da coordenadas
Para CO2 y clima hacia falta la posicion (lat/lon) de cada aeropuerto de destino, y para
festivos/tipo de cambio el codigo ISO-2 del pais -- ninguna de las 2 cosas esta en
`aena_destinations` (solo tiene `dest_iata, dest_name, country` en texto libre tipo
"REINO UNIDO", scrapeado de la web de Aena). En vez de inventar coordenadas de memoria
(riesgo real de errores), se descargo en esta sesion el dataset abierto
`github.com/mwgg/Airports` (raw.githubusercontent.com esta en la lista de dominios
permitidos para el sandbox), se filtro a los ~7900 aeropuertos con codigo IATA, y se
guardo como `lib/data/airports-geo.json` (554 KB, solo importado en codigo de servidor
-- verificado que el bundle del cliente no crecio). Esto resuelve coordenadas Y pais
ISO-2 a la vez con una sola fuente verificada, en vez de 2 mapeos distintos.

### Las 5 piezas
1. **"Sale mas barato otro dia"**: sin API nueva -- compara los resultados YA obtenidos
   en la misma busqueda (que ya prueba varias fechas dentro del rango) para la misma
   ruta, y avisa si hay un ahorro de 10€ o mas.
2. **CO2 estimado** (`lib/co2.ts`): formula de Haversine + factor estandar de 100 g CO2/
   km/pasajero (cifra intermedia, documentada como estimacion en el propio codigo y en
   la interfaz).
3. **Clima habitual** (`lib/weather.ts`, Open-Meteo `archive-api`, gratis sin clave):
   promedio de los ultimos 3 anos para las MISMAS fechas de calendario, no un
   pronostico -- decision deliberada, ya que esta app se usa para planear viajes con
   semanas/meses de antelacion y un pronostico normal solo cubre ~16 dias vista.
   Atribucion visible en la interfaz (la licencia CC BY 4.0 de los datos la exige).
4. **Tipo de cambio** (`lib/exchange-rate.ts`, Frankfurter.app, gratis sin clave, datos
   oficiales del BCE): mapa manual pais ISO-2 -> moneda para los destinos habituales
   fuera del euro; si el pais usa euro, no se muestra nada.
5. **Festivos** (`lib/holidays.ts`, Nager.Date, gratis sin clave): festivos de España Y
   del pais destino que caen dentro del rango de fechas de ida/vuelta.

Los 4 campos nuevos (co2Estimate, climate, exchangeRate, holidays) mas
cheaperOtherDay se calculan UNA VEZ por cada pareja origen-destino UNICA en el
resultado (no por cada itinerario individual, que podria repetir la misma pareja en
varias fechas), en paralelo entre si.

### FIX proactivo (antes de desplegar, no reportado por el usuario): riesgo real de timeout de funcion
Al revisar el propio diseño antes de dar la sesion por terminada, se detecto un riesgo
serio: este enriquecimiento se ejecuta DESPUES de la busqueda real a Ignav (que ya
puede tardar varios segundos en casos normales), sumando su propio tiempo encima. Con
el limite de funcion de Vercel (10s en el plan Hobby, ya documentado como problema real
en sesiones anteriores con el propio Ignav), esto podia hacer fallar busquedas que hoy
funcionan bien, solo por unos datos que son un plus, no algo critico. Corregido antes de
desplegar: timeouts individuales de las 3 APIs nuevas reducidos (8s/6s -> 4s/3s) y
anadido un tope duro global de 4.5s sobre TODO el bloque de enriquecimiento
(`Promise.race` contra un timeout) -- si no da tiempo, las parejas origen-destino que no
hayan terminado se quedan simplemente sin esos campos (todos opcionales en el tipo), sin
afectar a la busqueda en si.

### AVISO (se repite, importante)
Ninguna de las 3 APIs nuevas (Open-Meteo, Frankfurter, Nager.Date) se ha podido
verificar contra su servicio real en esta sesion -- sin acceso de red desde este
entorno a esos dominios. Escritas contra su documentacion oficial. Probar con una
busqueda real (idealmente a un destino fuera de España y fuera de la zona euro, para
ver las 5 piezas a la vez) y revisar si el formato de respuesta de cada una encaja.

### Verificado
`npx tsc --noEmit` y `npm run build` limpios (varias veces, incluida la verificacion
final tras el fix de timeout). Confirmado que `First Load JS` no crecio pese al nuevo
archivo de datos de 554 KB (solo se importa en codigo de servidor).

---

## Estado al 17 de septiembre de 2026 (sesion 4) — Sesion: secciones colapsables + quitada tira decorativa

El usuario senalo que en movil la app se hace larga de desplazar, y que la tira
"Origen ---- Destino" (`FlightPathStrip.tsx`, mostrada justo bajo el titulo) no tenia
ninguna funcion real -- "creo que es adorno, salvo que digas lo contrario". No llego
captura en el mensaje, se infirio por contexto (todo lo demas del formulario se
confirmaba abajo) y se acepto la valoracion: el componente se elimino por completo (sin
dejar rastro en el codigo, mismo criterio que la eliminacion de destinos curados).

"Filtros y ajustes", "Explorar destinos" y "Busquedas recientes" ahora colapsan
(`<details>`/`<summary>`, mismo patron que ya usaban los sub-filtros de Horarios/
Precio y orden/Extras). Reduce el scroll en movil notablemente, sobre todo con varias
entradas en el historial de busquedas.

Verificado con `npx tsc --noEmit` y `npm run build` limpios.

En el mismo turno se propusieron (sin implementar, a la espera de que el usuario elija
por donde seguir) varias APIs gratuitas nuevas -- ver la conversacion o pedirle al
usuario el detalle si hace falta retomarlo: Open-Meteo (clima, sin key), Frankfurter.app
(tipo de cambio, sin key), Nager.Date (festivos publicos, sin key), y calculo de CO2 por
trayecto sin API (solo distancia entre coordenadas + factor de emision estandar).

---

## Estado al 17 de septiembre de 2026 (sesion 3) — Sesion: feedback visual, limite visible, ayuda en la app

### Contexto
El usuario probo "Explorar destinos" con una captura real: **el token de Travelpayouts
funciona perfectamente** (Ibiza 29€, Bilbao 46€, Asturias 56€... todo real). Pero
reporto 3 cosas:
1. "El enlace no funciona" al pulsar "Buscar este".
2. No entendia con que criterio el limite de combinaciones sube o baja -- pregunta
   directa: "Como sabe el usuario a que atenerse?".
3. Pidio una seccion de ayuda dentro de la app explicando que hace cada cosa.

### 1. FIX real: "Buscar este" no daba ninguna senal (no estaba roto, era mudo)
`ExploreDestinations.tsx` anadia el destino a la seleccion en silencio (sin scroll, sin
confirmacion) -- el destino se anadia de verdad, pero como el efecto quedaba fuera de
la vista (mas abajo, en el formulario), parecia que el boton no hacia nada. Fix: al
pulsar, se confirma con un mensaje ("Anadido X a tu busqueda") y se hace scroll
automatico hasta `#search-form`.

### 2. El limite dinamico ahora es visible, no solo aplicado en silencio
Antes, el limite dinamico (implementado en la sesion anterior) solo se veia si lo
superabas -- el mensaje de error, y un "maximo 6" hardcodeado en el texto normal del
formulario que ni siquiera reflejaba el numero real. Fix:
- `/api/ignav-usage` ahora devuelve tambien `comboLimit` (el mismo calculo que usa el
  servidor al validar, `dynamicComboLimit`), para que cliente y servidor muestren
  siempre el mismo numero.
- El contador "Combinaciones origen x destino" en el formulario principal muestra el
  maximo REAL actual, no un numero fijo escrito a mano.
- El aviso justo debajo explica el criterio completo en una frase (sube a 10 con mucha
  cuota, baja a 3 con poca) y remite a "Cuota de Ignav" en el panel de herramientas.
- El propio indicador de cuota en `ToolsPanel.tsx` ahora tambien menciona el limite de
  combinaciones vigente, ligando las 2 piezas de informacion que antes vivian
  separadas.

### 3. Seccion de ayuda dentro de la app (`components/HelpModal.tsx`)
Boton "?" en la barra superior (junto al de tema oscuro) que abre un panel con 12
temas explicados en lenguaje llano (destinos reales, limite dinamico, Sorprendeme,
lenguaje natural con IA, explorar destinos, tendencia de precio, filtros, calendario de
precios, alertas, comparador/vista lista, recomendacion de la IA, historial/compartir).

### Verificado
`npx tsc --noEmit` y `npm run build` limpios. `next start` + `curl` confirmando HTTP
200 y presencia del texto "permitidas ahora mismo" (confirma que el limite dinamico ya
no esta hardcodeado en el HTML).

---

## Estado al 17 de septiembre de 2026 (sesion 2) — Sesion: contador de cuota + limite dinamico + explorar gratis + tendencia de precio

### Contexto
El usuario, tras usar la app un tiempo, se quejo de que el limite de 6 combinaciones
"limita mucho". Se le propusieron 4 mejoras concretas (contador de cuota visible,
explorar destinos sin gastar cuota, tendencia historica de precio, reducir frecuencia
del cron de alertas) y pidio implementarlas todas, en ese orden de prioridad.

### Hallazgo real antes de programar nada: el cron de alertas gastaba cuota en silencio
Se investigo el codigo real antes de proponer soluciones (no se asumio nada a ciegas):
el cron `check-alerts` corria A DIARIO, y cada alerta guardada activa dispara una
busqueda completa (dias de rango x origenes x 2 sentidos) contra Ignav en cada
ejecucion. Con varias alertas guardadas y rangos de fechas amplios, esto puede sumar
decenas de peticiones reales al mes sin que el usuario lo vea -- una causa real (no
solo el limite de 6 en si) de por que la cuota se sentia escasa.

### 1. Contador real de cuota (`lib/ignav-usage.ts`, tabla `ignav_usage_log`)
Se registra cada peticion real desde el UNICO punto de salida a Ignav (`ignavPost` en
`lib/ignav.ts`), justo tras recibir cualquier respuesta HTTP -- no solo 200, ya que
Ignav factura la peticion en cuanto su servidor la procesa, devuelva lo que devuelva.
Las peticiones que fallan ANTES de llegar a Ignav (timeout de red, DNS) no cuentan, con
razon. Escritura best-effort (nunca rompe una busqueda real si falla el contador).
Expuesto via `/api/ignav-usage` y mostrado en `ToolsPanel.tsx`: peticiones restantes de
las 1000 de por vida, barra de color (verde/ambar/rojo segun lo que quede), uso de los
ultimos 7 dias.

### 2. Limite de combinaciones DINAMICO (sustituye el fijo de 6 de siempre)
`dynamicComboLimit()` en `lib/ignav-usage.ts`: 10 si queda mas del 50% de la cuota, 6
si queda mas del 20%, 4 si queda mas del 5%, 3 en el resto. Aplicado en
`searchLiveItineraries` (`lib/live-engine.ts`), con fallback al fijo de 6 si el
contador no esta disponible todavia (tabla sin migrar). Responde directamente a la
queja del usuario: el limite deja de ser un numero arbitrario fijo para siempre y pasa
a reflejar cuanta cuota queda de verdad.

### 3. Explorar destinos sin gastar cuota (`lib/travelpayouts.ts`, `/api/explore`)
Investigado por busqueda web en esta sesion (nunca se habia usado Travelpayouts antes,
solo se habia mencionado como posibilidad en una sesion anterior): la Aviasales Data
API de Travelpayouts (`v1/city-directions`) da una lista de destinos baratos desde un
origen, con precios basados en busquedas reales de otros viajeros cacheadas hasta 7
dias -- gratis, solo hace falta un token de registro (sin tarjeta). No son precios en
firme, son orientativos para decidir QUE destinos merece la pena buscar de verdad antes
de gastar la cuota real de Ignav en ellos. El endpoint cruza los resultados contra
`aena_destinations` (destinos reales verificados) para marcar cuales tienen boton
directo "Buscar este" -- los demas se muestran igual, como pura inspiracion.
**AVISO: no se ha podido probar contra la API real** (sin token de prueba disponible en
esta sesion) -- escrito contra la documentacion oficial
(https://travelpayouts.github.io/slate/). Si falla o no esta configurado
(`TRAVELPAYOUTS_TOKEN` sin definir), se muestra un aviso claro con enlace de registro,
nunca rompe nada.

### 4. Tendencia de precio sobre historial propio (`lib/price-history.ts`, tabla `price_history`)
Cada precio real visto en una busqueda en vivo se registra (`logPriceObservation`,
fire-and-forget, no anade latencia a la busqueda actual). A partir de 3 observaciones
previas para una misma ruta (origen-destino, cualquier fecha -- exigir la misma fecha
dejaria casi siempre sin datos con el volumen de un uso personal), cada resultado nuevo
se compara contra el promedio historico y se etiqueta "precio bajo/normal/alto para
esta ruta" en `FlightResultCard.tsx`. No llama a ninguna API nueva, solo usa datos ya
observados. Empieza vacio -- tarda en dar sus primeros frutos segun se repitan
busquedas de las mismas rutas.

### 5. Cron de alertas: de diario a cada 3 dias (`vercel.json`)
`"0 6 * * *"` -> `"0 6 */3 * *"`. Reduce a un tercio el consumo de fondo de cuota por
las alertas guardadas, sin perder demasiada capacidad de reaccion (una bajada de precio
se sigue detectando dentro de un margen razonable para viajes planeados con semanas/
meses de antelacion).

### Verificado
`npx tsc --noEmit` y `npm run build` limpios contra el `main` real (clonado en esta
sesion, no reconstruido de fragmentos). Los 3 endpoints nuevos (`/api/ignav-usage`,
`/api/explore`, y el limite dinamico en `/api/search-live`) probados localmente SIN la
migracion aplicada ni `TRAVELPAYOUTS_TOKEN` configurado: fallan con errores claros (503,
aviso en la interfaz) en vez de romper nada, tal como estaba pensado.

### Pendiente (usuario)
- **Ejecutar en Neon** la migracion de las 2 tablas nuevas (`ignav_usage_log`,
  `price_history`) -- SQL exacto en `scripts/schema.sql`, bloque "MIGRACION: contador
  de cuota + historial de precios". Sin esto, el contador y la tendencia simplemente no
  aparecen (no rompen nada).
- **Si se quiere activar "explorar destinos"**: registrarse gratis en
  travelpayouts.com (sin tarjeta) y anadir `TRAVELPAYOUTS_TOKEN` en Vercel.
- Confirmar en vivo que Travelpayouts responde como se espera (unica pieza de esta
  sesion sin verificar contra su API real).

---

## Estado al 16 de septiembre de 2026 — Sesion: fixes reales de produccion + reconstruccion de mejoras + fix de IA no-deterministica

### Contexto
El usuario reporto, en el orden en que ocurrieron: (1) solo aparecia Alicante en
origenes, el aviso de busqueda mal ubicado, y el selector de orden roto; (2) probando
el PR de mejoras (comparador, alertas por email, etc.) resulto que ese PR tenia
conflictos de fusion reales contra el fix de (1), por tocar los mismos archivos; (3)
tras reconstruir y desplegar las mejoras, el comparador resulto "muy pobre" (sin horas
de llegada) y no habia campo de precio visible para guardar una alerta; (4) el mismo
prompt de lenguaje natural encontraba vuelos unas veces y otras no.

### Diagnostico y fix de (1): causa raiz real, no un sintoma superficial
Ver seccion HANDOFF de arriba ("el fix de destinos curados de otra sesion nunca se
aplico en produccion"). Se investigo con `search_code` en GitHub hasta encontrar el PR
#22 abandonado, se reapunto su base y se mergeo, y se ejecuto la migracion SQL
pendiente directamente en Neon via el conector.

### Reconstruccion de (2): por que no se mergeo la rama existente
La rama `revisar-por-claude` (PR #23) quedo con `mergeable_state: dirty` tras el merge
del PR #22 (ambos PRs modificaban `app/page.tsx`, `ToolsPanel.tsx`,
`FlightResultCard.tsx`, `alerts/route.ts`, `check-alerts/route.ts`). En vez de intentar
una resolucion de conflictos a ciegas (arriesgado con logica de negocio real como el
open-jaw o la cuota de Ignav de por medio), se reconstruyeron las 6 mejoras desde cero
como archivos nuevos sobre el `main` ya arreglado, verificando primero el contenido
REAL de cada archivo afectado (pedido al usuario cuando la lectura por fragmentos no
era suficientemente fiable) antes de sobrescribirlo. El PR #23 se cerro sin mergear
(contenido superado). Commits directos a `main`, sin rama intermedia para el resto de
la sesion.

### Fix de (3): mejoras basadas en feedback especifico, no genericas
Campo de precio propio en el formulario de alertas (antes vivia en otro panel).
Comparador ampliado de 5 a 12 columnas (horas de ida/vuelta, duracion, ambas
aerolineas, fuente), con resaltado en verde del mejor valor por fila. Se anadieron
tambien 3 mejoras no pedidas explicitamente pero identificadas como necesarias:
historial de alertas guardadas con borrado (antes invisible en la UI aunque el
endpoint ya existia), aviso al llegar al limite de 3 comparaciones, y version
responsive del comparador para movil.

### Fix de (4): la causa real de la inconsistencia con el mismo prompt
Ver seccion HANDOFF de arriba ("el recorte de destinos por cuota no era
determinista"). Diagnostico confirmado leyendo el codigo real de `lib/ai-parse.ts`
(pedido al usuario, ya que reconstruirlo por fragmentos de busqueda era demasiado
arriesgado para un archivo que llama a una API externa y parsea JSON): `temperature:
0.2` en la llamada a OpenAI + `.slice()` sobre un array en orden variable = recorte no
reproducible. Fix: ordenar alfabeticamente antes de cortar, y exponer los avisos de
recorte en un campo `warnings` estructurado que ademas se propaga correctamente hasta
la UI (se encontro de paso que `app/page.tsx` los descartaba con
`setNlpWarnings([])` fijo en la rama de exito).

### Leccion para futuras sesiones
Cuando una respuesta de un LLM alimenta una decision que debe ser reproducible (aqui:
que destino se descarta por cuota), el ORDEN de la respuesta del modelo no se puede
asumir estable entre llamadas identicas si `temperature > 0` -- hay que imponer un
orden propio (alfabetico, por ejemplo) antes de aplicar cualquier `.slice()`/`.filter()`
que dependa de la posicion. Esto es distinto y complementario a la leccion ya
documentada mas abajo ("el limite tiene que aplicarse en codigo, no solo pedirse en el
prompt") -- aqui el limite SI se aplicaba en codigo, pero sobre datos en un orden no
reproducible.

### Verificado
Cada archivo se subio verificando antes el SHA actual contra GitHub (para detectar si
algo habia cambiado entre lectura y escritura) y comprobando, cuando fue posible via
`search_code`, que campos nuevos usados (como `outbound.arrival_at` en el comparador
ampliado) existian de verdad en el tipo real (`lib/live-engine.ts`) antes de escribir
codigo que los asumiera. No se pudo ejecutar `npx tsc --noEmit` ni `npm run build` en
esta sesion (sin acceso al proyecto completo localmente) -- revisar el build de Vercel
tras cada push si aparece algun error de tipos.

### Pendiente
- Confirmar visualmente en movil que el comparador responsive se ve bien de verdad
  (se escribio el CSS con Tailwind estandar `hidden sm:block` / `sm:hidden`, sin poder
  verificarlo en un dispositivo real desde esta sesion).
- El usuario menciono que con 3 origenes pedidos, la cuota de 6 solo permite 2 destinos
  a la vez -- si quiere los 3 destinos de Polonia a la vez sin que se recorte nada,
  tendria que reducir a 1 origen por busqueda. Esto es una limitacion de diseño
  conocida, no un bug.

---

## Estado al 17 de septiembre de 2026 — Sesion: enlaces de reserva de ida y vuelta (v0.11.4, v0.11.5)

### Contexto
El usuario probo un itinerario real (Alicante -> Katowice, Wizz Air de ida + Ryanair de
vuelta) y solo veia el enlace de reserva de la ida. Tras el primer fix, volvio a probar
y el enlace de vuelta (Wizz Air) aparecia con el JSON de error crudo de Ignav sin
traducir.

### Fix (v0.11.4): faltaba pedir el enlace del tramo de vuelta
`components/FlightResultCard.tsx` pedia `/api/booking-link` solo con
`result.outbound.ignav_id`, nunca con `result.inbound.ignav_id` -- por eso itinerarios
con aerolineas distintas en cada tramo (o incluso la misma) solo mostraban un enlace.
Fix: pide ambos en paralelo con `Promise.allSettled`, agrupados bajo "Ida" y "Vuelta",
tolerante a fallo parcial (si un tramo falla, se conserva el enlace del otro).

### Fix (v0.11.5): el reintento de /booking-links compartia limite con /one-way
Causa raiz real, no un parche: `lib/ignav.ts` ya trataba 424 como reintentable, pero
`MAX_RETRIES = 1` esta pensado para `/one-way` (hasta 60 peticiones en paralelo por
busqueda, necesita fallar rapido para no agotar el timeout de funcion de Vercel). Ese
mismo limite se aplicaba tambien a `/booking-links`, que es UNA sola llamada por tramo,
sin ninguna razon para compartir el limite agresivo. Fix: constante separada
`BOOKING_LINKS_MAX_RETRIES = 3` solo para `getBookingLinksByIgnavId`; `MAX_RETRIES`
para `/one-way` intacto. Ademas, cuando los reintentos se agotan de verdad,
`FlightResultCard.tsx` ahora muestra un mensaje legible (`friendlyLegError()`) en vez
del JSON crudo de Ignav, y los avisos de error se muestran uno por tramo en vez de un
unico string concatenado.

### Verificado
Documentado en `CHANGELOG.md` por la sesion que lo hizo. Esta sesion (analisis +
handoff) no ha tocado codigo, solo ha completado la actualizacion de este archivo que
otra sesion dejo a medias (ver archivo `docs/STATUS_NEW_HEAD.md`, ahora eliminado tras
fusionarlo aqui).

---

## Estado al 15 de septiembre de 2026 (hora exacta no disponible) — Sesion: ELIMINADOS los destinos curados por completo

### Contexto
Tras el segundo fallo confirmado de los grupos curados (ver entrada siguiente: la IA
eligiendo Atenas/Belgrado/Dublin con timeout al 100% en Ignav), el usuario pidio
explicitamente: "Elimina los destinos curados de una vez por todas y no dejes rastro de
ellos y actualiza la info en GitHub".

### Que se hizo
Busqueda exhaustiva de "destinationGroup", "destination_groups", "grupos curados",
"isSingleIataTarget" en todo el repositorio (16 archivos encontrados) y limpieza
completa, uno a uno:
- `lib/live-engine.ts`: quitados `resolveGroupTargets`, el tipo `DestinationTarget`
  simplificado (sin `isSingleIataTarget`), `LiveFilters`/`LiveItinerary` sin
  `destinationGroupIds`. **Nueva funcion `resolveDestinationTargets`** que sustituye a
  las 2 anteriores (`resolveGroupTargets` + `resolveIataTargets`): agrupa los destinos
  reales elegidos por CIUDAD (mismo criterio que el selector "ciudad (todos)" de la
  interfaz) para preservar el open-jaw entre aeropuertos de una misma ciudad SIN
  depender de ninguna tabla curada -- era la unica funcionalidad real que dependia de
  los grupos. Campos renombrados: `destinationGroupId`/`Name` -> `destinationId`/`Name`.
- `lib/meta-queries.ts` / `app/api/meta/route.ts`: quitado `listDestinationGroups`, el
  endpoint ya no devuelve `groups`.
- `app/api/search-live/route.ts`: ya no acepta `destinationGroupIds`/`destinationGroupId`.
- `lib/ai-parse.ts`: reescrito sin grupos -- la IA trabaja solo con `destinationIatas`
  (destinos reales), prompt y esquema simplificados, la logica de recorte de cuota
  tambien simplificada (ya no hay que repartir entre 2 arrays).
- `lib/nlp-search.ts` (parser de respaldo sin IA): ya no intenta detectar destinos --
  nunca fue razonable hacer fuzzy-matching por regex contra cientos de destinos reales
  (a diferencia de la IA, que si puede razonar sobre nombres/paises). Avisa
  honestamente al usuario para que elija en el selector.
- `lib/share-link.ts`, `lib/skyscanner-adapter.ts`, `lib/types.ts`: limpiados.
- `components/FlightResultCard.tsx`: usa el campo renombrado, quitado el badge "Destino
  suelto" (ya no existe la distincion, todos los destinos son del mismo tipo ahora).
- `components/ToolsPanel.tsx`, `app/api/alerts/route.ts`,
  `app/api/cron/check-alerts/route.ts`: ya no leen/escriben `destination_group_id`.
- `app/page.tsx`: quitado el estado `destinationGroupIds` y sus ~15 referencias
  (calculo de combos, `destinationLabels`, payload de `runSearch`, ambas ramas de
  `handleInterpret`, `currentShareFilters`, 2 botones `disabled`, prop de
  `ToolsPanel`). `runSearch` simplificada de 3 a 2 parametros
  (`iataOverride, sortOverride`, ya no hace falta `groupIdsOverride`).
- `scripts/schema.sql`: quitada la tabla `destination_groups` y la columna `group_id`
  de `airports` del esquema documentado. **Anadido un bloque de migracion SQL al final
  del archivo** para que el usuario lo ejecute a mano en el SQL Editor de Neon (esta
  sesion no tiene credenciales de conexion a su base de datos real):
  ```sql
  ALTER TABLE airports DROP COLUMN IF EXISTS group_id;
  DROP TABLE IF EXISTS destination_groups;
  ALTER TABLE price_alerts DROP COLUMN IF EXISTS destination_group_id;
  ```
  El codigo funciona igual sin ejecutar esto (son columnas/tabla huerfanas que ya no se
  usan desde ningun sitio) -- es solo para tener la BD coherente con el codigo.
- `README.md`: actualizado el modelo de datos y los pasos de instalacion.
- **Esta seccion de HANDOFF** (arriba del todo en este archivo): reescrita para dejar
  claro que el problema de los grupos curados esta CERRADO (eliminados), no pendiente
  de decidir -- para que ninguna sesion futura pierda tiempo releyendo el debate de las
  2 entradas siguientes pensando que sigue abierto.

### Verificacion final (busqueda en todo el repo)
Tras todos los cambios, unica referencia restante a "destination_groups" en todo el
repositorio: las menciones EXPLICATIVAS en `README.md` y `scripts/schema.sql` (contando
la historia de por que se elimino / la migracion a ejecutar) -- cero codigo funcional
haciendo referencia al concepto eliminado.

### Verificado
`npx tsc --noEmit` y `npm run build` limpios tras cada tanda de cambios (varias veces
durante la sesion, no solo al final). `next start` + `curl` confirmando HTTP 200. El
endpoint `/api/meta` probado localmente sin `DATABASE_URL` (falla con el error esperado
y claro de "falta configurar", no un crash -- confirma que el codigo esta
estructuralmente correcto, aunque el comportamiento real contra datos solo se pueda
verificar cuando el usuario lo despliegue).

### Pendiente
- Abrir el PR de la rama `feat/eliminar-destinos-curados` contra `fix/ai-parse-combo-limit`
  (PR #21) y esperar el build de Vercel.
- El usuario tiene que ejecutar la migracion SQL de arriba en Neon cuando pueda (no
  urgente, no bloquea nada).
- Sigue pendiente confirmar en vivo si Sorprendeme-con-IA y la recomendacion de
  resultados (PR #20) funcionan -- esta sesion no lo ha tocado, solo la eliminacion de
  grupos curados.

---

## Estado al 15 de septiembre de 2026 (hora exacta no disponible) — Sesion: FIX real de la IA superando la cuota de combinaciones

### Contexto
El usuario probo en el preview del PR #20: escribio "Busco un viaje entre el 5 y el 8
de diciembre partiendo de Alicante o Valencia al lugar mas atractivo para esas fechas"
(sin destino concreto). La IA interpreto bien origenes/fechas pero, al no tener destino
explicito, eligio **9 destinos sueltos** como candidatos "interesantes". Con 2 origenes
detectados (ALC, VLC), eso da 2x9=18 combinaciones -- muy por encima del maximo de 6
que la propia app impone para proteger la cuota gratuita de Ignav. Al pulsar "Buscar
con esta interpretacion" (o el boton de busqueda normal), saltaba el aviso de limite y
no se ejecutaba ninguna busqueda -- el usuario lo describio como "no me ha devuelto
esto, es un desastre".

### Causa raiz
`lib/ai-parse.ts` nunca le decia al modelo cual era el limite real de combinaciones, y
aunque se lo hubiera dicho, **pedirlo solo en el prompt no es suficiente** -- los
modelos de lenguaje no garantizan obedecer un limite numerico exacto de forma fiable
(esto ya se sabia conceptualmente por la experiencia con `lib/ai-surprise.ts`, que SI
tenia un tope duro via `.slice()` tras la respuesta -- `ai-parse.ts` se quedo sin esa
misma proteccion al escribirlo en la sesion anterior).

### Fix
Anadido un recorte DURO en `lib/ai-parse.ts`, tras recibir la respuesta de la IA y
antes de devolverla: si `origenes x (grupos + destinos sueltos) > 6`, se recorta el
array de destinos (empezando por los sueltos, ya que representan una suposicion mas
libre que un grupo curado explicito) hasta que quepa, y se anade una nota a la
`explanation` que ve el usuario para que sea transparente sobre el recorte, no
silencioso. Tambien se reforzo el prompt para que el modelo intente por su cuenta
proponer pocos destinos de calidad en vez de muchos "por si acaso", como primera linea
de defensa (aunque el tope duro es la garantia real).

**Verificado con pruebas aisladas** (no contra la API real, que sigue sin acceso desde
esta sesion) replicando el caso EXACTO reportado (2 origenes, 9 destinos -> se recorta
a 2x3=6) y 2 escenarios mas (1 origen: cabe hasta 6; 4 origenes: solo cabe 1).

### Leccion para futuras sesiones
Cuando una respuesta de IA alimenta un limite operativo estricto (como la cuota de
Ignav), **el limite tiene que aplicarse en codigo despues de la respuesta, nunca solo
pedirse en el prompt** -- esto ya se hizo bien en `ai-surprise.ts` pero se paso por
alto en `ai-parse.ts` al escribirlo. Revisar si `ai-recommend.ts` necesita una
proteccion similar (ahi el riesgo es menor: como mucho recomienda un indice fuera de
rango, y eso ya esta cubierto con una validacion que lanza error y cae al fallback).

### Verificado
`npx tsc --noEmit` y `npm run build` limpios. Prueba aislada de la logica de recorte
con 3 escenarios (incluido el caso exacto reportado).

---

## Estado al 15 de septiembre de 2026 (hora exacta no disponible) — Sesion: buscar tras interpretar, Sorprendeme con criterio, recomendacion de la IA

### Contexto
El usuario probo la integracion de OpenAI en el preview del PR #19 (rama
`feat/openai-nlp-siri-ui`) y confirmo con una captura que interpreta bien las frases
complejas (una interpretacion de ida/vuelta con condiciones de hora, bien razonada).
Pero senalo 3 cosas: (1) tras interpretar, no pasaba nada mas, habia que ir a buscar el
boton de busqueda por su cuenta; (2) "Sorprendeme" seguia sin criterio real, solo un
sorteo entre destinos reales; (3) sensacion general de que la app sigue "limitadisima,
poco usable" y pidio usar mas el potencial de la IA.

### Cambios (rama `feat/ai-search-and-recommendation`, sobre `feat/openai-nlp-siri-ui`)
1. **Boton "Buscar con esta interpretacion"** justo bajo la explicacion de la IA, para
   no obligar a bajar hasta el formulario.
2. **"Sorprendeme" con criterio real** (`lib/ai-surprise.ts` + `/api/ai-surprise`): la
   IA elige los destinos entre los reales disponibles razonando sobre popularidad de
   ruta, distancia y epoca del ano, en vez de un sorteo. Explica el criterio. Si falla,
   cae al sorteo aleatorio (mismo comportamiento de antes, nunca se rompe). Se anadio un
   estado de carga separado ("Pensando..." mientras la IA elige, "Buscando..." mientras
   se consulta Ignav) para que quede claro que son 2 fases distintas.
3. **Recomendacion de la IA sobre resultados** (`lib/ai-recommend.ts` +
   `/api/ai-recommend`): tras cada busqueda con resultados, se manda un resumen
   compacto de los primeros 12 a la IA, que elige UNO considerando precio Y la hora de
   salida del hotel (el criterio propio de la app), con una explicacion de 1-2 frases.
   Se llama en segundo plano (no bloquea que se vean los resultados) y falla en
   silencio si no hay IA configurada -- es un plus, no algo critico. El resultado
   elegido se marca con una insignia "Recomendado por la IA" en `FlightResultCard`.
   Esta es la pieza que responde directamente a "usa tu potencial para hacerlo mas
   potente y util": convierte la app de listado a asesor que analiza y explica.

### AVISO (se repite, importante)
Las 3 funciones de IA (interpretar, Sorprendeme, recomendar) usan el mismo patron
(`gpt-4o-mini`, `response_format: json_schema`) pero **solo la interpretacion se ha
confirmado funcionando de verdad** (captura del usuario). Sorprendeme y la
recomendacion usan la misma infraestructura pero con prompts/esquemas distintos --
logicamente deberian funcionar igual, pero no se han visto en accion todavia. Probar
ambas con datos reales antes de dar el PR por bueno.

### Verificado
`npx tsc --noEmit` y `npm run build` limpios. Confirmado que `/api/ai-surprise` y
`/api/ai-recommend` fallan con 503 controlado sin key configurada (mismo patron que
`/api/ai-parse`), y que la app sigue funcionando (sorteo aleatorio / sin recomendacion)
en ese caso.

### Pendiente
- Confirmar con una busqueda real que Sorprendeme con criterio y la recomendacion de
  resultados funcionan como se espera.
- Sigue sin mergearse a produccion: este PR se apila sobre el PR #19 (interpretacion de
  lenguaje natural), que tampoco esta mergeado todavia.

---

## Estado al 15 de septiembre de 2026 (hora exacta no disponible) — Sesion: HOTFIX critico + integracion real de OpenAI

### Hotfix critico desplegado de inmediato (antes que el resto de esta sesion)
El usuario reporto una busqueda de prueba real que devolvia solo errores 400 de Ignav
(`empty_airline_filter`) y ningun resultado, en TODAS las combinaciones probadas.
Diagnostico: desde que se desplego el filtro de aerolineas (sesion anterior, v0.6.0),
`airlinesInclude`/`airlinesExclude` llegaban como array VACIO `[]` (no `undefined`)
cuando el usuario no rellenaba esos campos -- y se mandaban igual a Ignav dentro del
objeto de la peticion. Ignav rechaza un array vacio explicito con un error de
validacion ("debe incluir al menos un codigo si se proporciona"), asi que **TODAS las
busquedas fallaban desde entonces**, no solo las que usaban el filtro de aerolineas --
un regresion grave que paso desapercibida porque no se probo una busqueda real de punta
a punta tras desplegar ese cambio (solo se verifico con `tsc`/`build`, que no detectan
esto porque es un problema de VALORES en tiempo de ejecucion, no de tipos).
Corregido en `lib/live-engine.ts`: se omite el campo entero (`undefined`, que
`JSON.stringify` elimina de la peticion) en vez de mandar `[]`. Verificado con una
prueba aislada de `JSON.stringify` confirmando que la clave desaparece del JSON.
Desplegado a produccion en su propio PR (#18), antes de continuar con el resto.

**Leccion para futuras sesiones**: cuando se anade un filtro opcional que se manda a
una API externa, probar explicitamente el caso "campo vacio/sin usar" contra la forma
real de la peticion (no solo que compile), porque `tsc`/`build` no detectan que un
array vacio se sirva donde deberia ir `undefined`.

### Integracion real de OpenAI
Implementado `lib/ai-parse.ts` + `app/api/ai-parse/route.ts`: llamada a la API de
OpenAI (Chat Completions, `response_format: json_schema` para salida estructurada) que
sustituye al parser de regex como primera opcion para interpretar la busqueda en
lenguaje natural. Contexto que recibe la IA: fecha de referencia, origenes disponibles,
grupos curados, y los destinos REALES con vuelo directo confirmado desde los origenes
ya elegidos (recortado a 220 para controlar coste) -- asi puede razonar sobre pistas
como "un pais nordico" eligiendo entre los paises nordicos realmente conectados, algo
que el regex nunca podria hacer.

**Modelo usado**: `gpt-4o-mini` por defecto, configurable via `OPENAI_MODEL` (variable
de entorno en Vercel, sin tocar codigo). Se eligio deliberadamente NO usar un nombre de
modelo mas nuevo (se investigaron gpt-5-mini, gpt-5-nano, gpt-5.4/5.6-*) porque las
fuentes encontradas por busqueda web eran contradictorias entre si sobre el nombre y
precio exacto vigente ahora mismo -- probablemente contenido de blogs de baja calidad
desactualizado o inventado. `gpt-4o-mini` es el nombre que se puede verificar con mas
confianza que sigue siendo valido (confirmado con salida estructurada soportada, $0.15/
$0.60 por millon de tokens de entrada/salida). Si se quiere el modelo mas barato
disponible ahora mismo, revisar la pagina oficial de precios de OpenAI y cambiar la
variable de entorno.

**AVISO IMPORTANTE**: esta sesion no tiene acceso de red a `api.openai.com`, asi que
la integracion **no se ha podido probar contra la API real**. Escrita con la mejor
informacion disponible (formato de peticion/respuesta verificado por busqueda web).
Si al probarla con una consulta real algo no encaja (formato de respuesta distinto,
error de autenticacion, etc.), el error aparecera en la consola del servidor
(`console.error` en la ruta) y la busqueda cae automaticamente al parser de regex local
-- nunca se rompe la funcion de interpretar, en el peor caso se pierde la mejora de la
IA para esa consulta.

### Cuadro de NLP destacado de nuevo, con marco neon animado
A peticion del usuario ("dale mas protagonismo... marco neon coherente en colores que
se enciende y circule, tipo Siri"): quitado el plegado por `<details>` de la sesion
anterior (ahora que va a estar potenciado por IA de verdad, merece estar siempre
visible), y anadido un marco animado (degradado conico rotando, recortado solo al
borde via CSS `mask`, tecnica estandar) con los mismos 3 colores del boton
"Sorprendeme" (indigo/violeta/fucsia) para que la paleta sea coherente. Respeta
`prefers-reduced-motion`.

### Verificado
`npx tsc --noEmit` y `npm run build` limpios. `next start` + `curl` confirmando HTTP
200, y una llamada de prueba a `/api/ai-parse` SIN key configurada confirmando que
devuelve un error 503 controlado (tal como esta disenado) en vez de romper.

### Pendiente
- Probar la integracion de OpenAI con una consulta real (la key ya esta en Vercel) y
  confirmar que el formato de respuesta encaja.
- El PR de esta sesion (rama `feat/openai-nlp-siri-ui`) **no se ha mergeado a
  produccion todavia** -- a diferencia del hotfix critico, esto es funcionalidad nueva
  sin verificar en vivo, mejor que el usuario la pruebe en el preview primero.

---

## Estado al 15 de septiembre de 2026 (hora exacta no disponible -- ver nota) — Sesion: produccion + revision de otros hilos + reorganizacion + identidad

> Nota sobre la hora: el usuario pidio incluir la hora ademas de la fecha en estas
> entradas. Esta sesion no tiene una herramienta fiable para consultar la hora actual
> (fallo al intentarlo), asi que esta entrada solo lleva fecha para no inventarsela. A
> partir de que haya una forma fiable de consultarla, se incluira.

### Puesta en produccion
Mergeado a `main` el PR #17 (rama `design/luxury-theme-fix`), con todo lo acumulado
desde el tema claro/indigo hasta esta sesion. La `OPENAI_API_KEY` que el usuario anadio
a Vercel queda guardada y lista, pero **todavia no hay ningun codigo que la use** -- la
integracion de IA (parseo NLP real, recomendaciones) se pidio pero se aparco en la
sesion anterior por alcance, y no se ha construido en esta tampoco por el volumen de
otras peticiones. Sigue pendiente, sin ningun coste mientras tanto (una key guardada en
Vercel sin usar no genera gasto).

### Revision de otros hilos del proyecto (peticion explicita: "es util y exportable?")
Leido `/areas/travel-search-app.md` (el hilo de `buscador_viajes.py`) y buscado en el
historial de conversaciones del proyecto. Hallazgos:
- Las decisiones de API de ese hilo ya estan reflejadas en Tiriti Travel: Sky Scrapper
  (RapidAPI) para vuelos ya integrado; Amadeus Self-Service (cerrado 17 jul 2026), Kiwi
  Tequila (ahora solo por invitacion) y Skyscanner oficial (sin tier gratuito) ya
  estaban descartados alli y se confirma que siguen sin ser opciones viables.
  Reconfirmado por busqueda web en esta sesion.
- Las partes de HOTELES de ese hilo (Hotelbeds, Makcorps, DirectBooker) no aplican --
  el usuario confirmo que Tiriti Travel es solo de vuelos.
- No se encontro ningun hilo de "vigilancias" especifico; se interpreta como el propio
  sistema de alertas de precio que ya tiene Tiriti Travel (`ToolsPanel` + cron
  `check-alerts`).
- Ningun otro proyecto del usuario (CostaMed, RentManager, etc.) tiene codigo
  directamente reutilizable para un buscador de vuelos -- son dominios distintos
  (inmobiliario, no viajes).

### Otras APIs gratuitas de vuelos (peticion explicita) -- busqueda web en esta sesion
Sin alternativa gratuita mejor que Ignav+Sky Scrapper para busqueda de vuelos en vivo.
Duffel cobra por reserva creada (no es gratis para simple busqueda). Amadeus Enterprise
requiere acreditacion IATA/ARC. Travelpayouts (datos de Aviasales) tiene una API de
datos agregados gratuita que podria valer especificamente para una futura funcion de
"mejor mes para viajar" (no para busqueda en vivo) -- anotado como posible pista futura,
no implementado.

### Edad de los ninos en el formulario (pregunta del usuario, no implementado)
Comprobado en `lib/ignav.ts`: la API de Ignav solo acepta un NUMERO de ninos, no fecha
de nacimiento ni edad -- anadir el campo no cambiaria ningun resultado. Ademas, en las
aerolineas low-cost que cubren las rutas de origen del usuario (Ryanair, Vueling,
EasyJet...) el descuento infantil real solo aplica a bebes en brazos (<2 anos, gestion
distinta en estos buscadores); a partir de 2 anos pagan como adulto. Decision: no
anadir el campo.

### Cambios de codigo de esta sesion
1. **FIX real: tema oscuro se activaba solo automatico segun el sistema.** Si el
   telefono/navegador del usuario tenia el modo oscuro del sistema activado y nunca
   habia tocado el interruptor de la app, la app arrancaba oscura sin que el usuario lo
   pidiera -- por eso "no veo el fondo de nubes" en la ultima rama. Corregido: el tema
   oscuro ahora es SOLO por eleccion explicita guardada (el boton sol/luna del nav),
   nunca automatico por preferencia del sistema. El claro/nubes es el por defecto real
   de la identidad de la app.
2. **Boton "Sorprendeme" con mucho mas protagonismo**: sacado de dentro del formulario
   (donde estaba al final, pequeno) a su propia tarjeta destacada de ancho completo,
   justo debajo de la tira de ruta -- degradado indigo-violeta-fucsia, texto mas
   grande, la primera accion que se ve tras el titulo.
3. **Logo e identidad propios** (peticion: "hippie, bohemio, disfrutón, que no
   desentone"): golondrina estilizada (2 paths SVG, verificada visualmente con
   `cairosvg` antes de aplicarla -- el primer intento salio irreconocible) sustituyendo
   al icono de avion generico reutilizado. Tipografia "Pacifico" (script retro de
   branding de surf/viajes) SOLO para el logotipo "Tiriti Travel", instalada via
   `@fontsource/pacifico` (npm, autoalojada, sin depender de Google Fonts que no se
   puede verificar desde este entorno). Aplicado tambien a los iconos de "Anadir a
   inicio" en iPhone.
4. **Insignias de aerolinea** (peticion: "busca los iconos de las aerolineas"): en vez
   de logos reales (serian marca registrada de terceros, y las APIs de logos que
   existen piden todas su propia clave), insignias con iniciales en un circulo de color
   propio de cada aerolinea (`lib/airline-badge.ts`, ~18 aerolineas conocidas + fallback
   con color estable por hash para cualquier otra).
5. **Reorganizacion**: el cuadro de "busqueda en lenguaje natural" (antes su propia
   tarjeta grande, separada) se movio DENTRO de la tarjeta principal de busqueda, como
   un desplegable plegado por defecto ("O describelo con tus palabras") -- agrupacion
   mas logica (interpretar la frase rellena los mismos campos que estan justo debajo) y
   menos tarjetas grandes apiladas, mas cerca en espiritu de como se ve la referencia.
6. **FIX real: cajas de fecha solapadas en iOS**: `input type="date"` sin
   `min-width: 0` dentro de un grid de 2 columnas -- corregido con `min-w-0` +
   apilamiento en 1 columna en las pantallas mas estrechas.
7. **FIX real: filtro de aerolineas "invisible"**: no era un bug, estaba dentro del
   acordeon "Extras" plegado por defecto. Ahora viene abierto.
8. **La tira "Origen ---- Destino" sin funcion**: ahora es un boton real que baja hasta
   el formulario de busqueda.

### Pendiente / aparcado (explicado al usuario)
- Integracion de IA con OpenAI (parseo NLP real + recomendaciones razonadas). Key ya en
  Vercel, sin codigo todavia -- siguiente sesion.
- "La app apesta a IA, mas organico" -- se abordo parcialmente con el logo/tipografia y
  la tarjeta de Sorprendeme, pero es un ajuste de sensibilidad que probablemente
  necesite iteracion continua, no un cambio unico.
- Archivar/resumir las entradas mas antiguas de este archivo si llega a ser demasiado
  largo (705+ lineas a fecha de esta sesion) -- pendiente de que el usuario lo pida.

### Verificado
`npx tsc --noEmit` y `npm run build` limpios. `next start` + `curl` confirmando HTTP 200
y presencia de los textos/clases nuevos. Insignias de aerolinea y logo verificados
visualmente (renderizados a PNG con `cairosvg`/`fonttools` y revisados con el visor de
imagenes) antes de darlos por buenos, no solo supuestos correctos a ciegas.

---

## Estado al 14 de septiembre de 2026 — Sesion: fixes de UI reportados en iOS + logo/tipografia propios

### Contexto
El usuario probo en su iPhone y mando 2 capturas: una de la propia app (mostrando la
tira de ruta "Origen/Destino") y otra volviendo a mandar la referencia "aeroluxe" para
insistir en que el parecido sigue sin ser suficiente. Reporto 3 problemas concretos de
UI + peticion de logo/tipografia con caracter propio + pregunta de como pasar la key de
OpenAI de forma segura.

### Aclarado: como dar una API key de forma segura (pregunta directa del usuario)
Explicado que NO debe pegarla en el chat ni en ningun sitio del codigo. La forma
correcta: anadirla directamente como variable de entorno en Vercel (Settings ->
Environment Variables), nunca dandosela a Claude. Motivo adicional dado: esta sesion de
sandbox tampoco podria probarla aunque se le diera, porque `api.openai.com` no esta en
la lista de dominios con acceso de red desde este entorno (mismo tipo de limitacion ya
documentada para Ignav y Sky Scrapper).

### Bugs reales corregidos
1. **Cajas de fecha solapadas en iOS**: `input type="date"` sin `min-width: 0` dentro
   de un grid de 2 columnas -- el ancho intrinseco del control nativo de iOS forzaba la
   celda mas alla de su espacio, solapando con la de al lado. Fix: `min-w-0` en todos
   los campos del bloque + las parejas de fecha se apilan en 1 columna en las pantallas
   mas estrechas.
2. **Filtro de aerolineas "no se ve"**: no era un bug de renderizado -- estaba dentro
   del acordeon "Extras" del panel lateral, plegado por defecto. El usuario nunca lo
   habia desplegado. Fix: "Extras" abierto por defecto.
3. **Tira "Origen ---- Destino" sin ninguna funcion**: el usuario no entendia para que
   servia si no se podia tocar nada. Fix: ahora es un boton real que baja hasta el
   formulario de busqueda (`document.getElementById('search-form').scrollIntoView`),
   con un icono de flecha para que se note que es tocable.

### Identidad visual (a peticion explicita: "hippie, bohemio, disfrutón, que no
desentone")
- **Logo nuevo**: golondrina estilizada (2 paths SVG simples: alas en forma de M +
  cola en horquilla), dibujada y verificada visualmente en esta sesion con `cairosvg`
  (renderizado a PNG y revisado con el visor de imagenes antes de dar el diseño por
  bueno -- el primer intento de path a mano salio irreconocible, parecia una flor).
  Sustituye al icono de avion generico que ya se reutilizaba en el resto de la interfaz
  como icono de tabla de resultados. Aplicado tambien en `app/icon.tsx` y
  `app/apple-icon.tsx` para consistencia entre el nav y el icono de "Anadir a inicio".
- **Tipografia del logotipo**: "Pacifico" (script retro de branding de surf/viajes),
  SOLO para el texto "Tiriti Travel", nunca en el resto de la UI. Instalada via
  `@fontsource/pacifico` (paquete npm con los archivos de fuente empaquetados) en vez
  de `next/font/google`, porque esta sesion no tiene acceso de red a
  `fonts.googleapis.com` para verificar que ese build funcione (mismo problema ya
  documentado en la sesion del primer rediseno oscuro). Verificado en esta sesion: la
  fuente SI se sirve correctamente (`Pacifico` aparece en el CSS del build de
  produccion) y se renderizo una prueba con la fuente real convertida de woff2 a ttf
  (`fonttools` + `brotli`) para confirmar visualmente el resultado antes de darlo por
  bueno.

### Pendiente, explicado al usuario (no resuelto en esta sesion)
- El parecido con la referencia visual sigue sin ser suficiente para el usuario. Causa
  de fondo explicada: la referencia tiene un modelo de busqueda mucho mas simple (1
  origen, 1 destino, 1 fecha) que cabe en una sola fila; esta app hace mas cosas de
  verdad (multi-origen, destinos reales, lenguaje natural, Sky Scrapper, aerolineas)
  que no caben sin perder funcionalidad. Propuesta pendiente de aprobacion: plegar el
  cuadro de "busqueda en lenguaje natural" por defecto para que el formulario de
  origen/destino/fechas sea lo primero visible tras el hero.
- Integracion de IA con OpenAI: pendiente de que el usuario anada `OPENAI_API_KEY` a
  Vercel.

### Verificado
`npx tsc --noEmit` y `npm run build` limpios. `next start` + `curl` confirmando HTTP
200. Icono nuevo verificado visualmente como PNG real generado por la app (no solo
supuesto).

---

## Estado al 14 de septiembre de 2026 — Sesion: vision estrategica ("por que esto y no Skyscanner") + filtro de aerolineas + perfil de viaje

### Contexto: la pregunta importante de esta sesion
El usuario probo la app funcionando y planteo la pregunta correcta: "no termino de ver
su utilidad respecto a Skyscanner u otros, mas bien como ejercicio o anecdota... en mi
cabeza lo habia pensado como sustituto de esos grandes buscadores". Pidio propuestas
reales de mejora, de cualquier aspecto, con la condicion de no gastar dinero (salvo
tokens de IA que ya tenga comprados, y solo si aporta valor real).

### Diagnostico y plan de diferenciacion (respuesta dada, para no repetirla)
Un proyecto personal no puede competir en AMPLITUD con Skyscanner (cobertura mundial,
escala). Puede competir en PROFUNDIDAD para la vida real del usuario, algo que a un
buscador generico no le compensa hacer:
1. **Hora de salida del hotel como criterio central** (ya existe, pero esta enterrada
   como una columna mas -- deberia ser el titular de cada resultado).
2. **Comparacion multi-origen real** (buscar a la vez desde ALC/MAD/VLC/RMU y comparar
   cual compensa) -- Skyscanner obliga a hacer busquedas sueltas y comparar a mano.
3. **Sin sesgo comercial** (no hay comision por destacar una OTA u otra).
4. **Personalizacion real a la vida concreta del usuario** (familia de 2+1, 4
   aeropuertos fijos, interes en mercados navidenos/eventos) en vez de tratar a todos
   los usuarios igual.
5. **Apoyo de IA real** (no un parser de regex) como pieza que de verdad cambia lo que
   es la app: de "formulario de busqueda" a "asesor que razona y explica". Esto es lo
   unico de la lista que cuesta dinero, y es minimo -- ver mas abajo.

### Aclarado: facturacion de IA (pregunta directa del usuario)
Verificado por busqueda web (fuente: Claude Help Center, articulo oficial de Anthropic):
la suscripcion Claude Pro (20€/mes) **NO incluye ni un token de la API** -- son 2
sistemas de facturacion completamente separados, hace falta cuenta aparte en
console.anthropic.com con su propia tarjeta. Cancelar una no afecta a la otra. Mismo
patron es de esperar en OpenAI (ChatGPT Plus vs. API de platform.openai.com son
productos distintos) -- si el credito que tiene comprado el usuario es especificamente
saldo de API en platform.openai.com (no ChatGPT Plus), SI serviria directamente para
esto, sin limitacion tecnica. Precio real verificado de Claude Haiku 4.5 en esta sesion:
1$/millon tokens entrada, 5$/millon salida -- una consulta tipica de interpretar/
recomendar cuesta bastante menos de medio centimo. Dado que el usuario ya tiene credito
de OpenAI sin gastar, la recomendacion es usar ESE (gpt-4o-mini o similar) para la pieza
de IA cuando se monte, en vez de abrir facturacion nueva en Anthropic.

### Implementado en esta sesion (los 2 primeros pasos, sin IA todavia)
1. **Filtro de aerolineas conectado a la interfaz**: `airlinesInclude`/`airlinesExclude`
   ya estaban soportados en el backend (se mandaban a Ignav) pero no habia ninguna
   forma de usarlos desde la UI -- era codigo muerto en la practica. Anadidos 2 campos
   de texto en el panel lateral + re-comprobacion en `live-engine.ts` sobre el
   resultado final (por nombre o codigo de 2-3 letras) como red de seguridad, ya que no
   se ha podido verificar contra la API real si Ignav aplica el filtro tal cual se
   espera.
2. **Perfil de viaje guardado** (`lib/travel-profile.ts`): origenes, adultos, ninos,
   equipaje de mano y open-jaw se recuerdan en `localStorage` entre sesiones. Aviso
   documentado en el propio codigo: como es un solo usuario, el perfil se sobreescribe
   tambien al restaurar desde un enlace compartido o el historial -- aceptable aqui,
   pero si esto se usara entre varias personas habria que cambiar el diseño para
   guardar solo en cambios manuales directos.

### Pendiente de la conversacion (no implementado, a la espera de decision del usuario)
- La pieza de IA real (parseo de lenguaje natural + recomendaciones razonadas) --
  pendiente de que el usuario confirme que usar OpenAI y proporcione una
  `OPENAI_API_KEY` con el credito que ya tiene comprado.
- "Mejor fin de semana del mes" (escanear un mes entero de calendario de precios y
  sacar un ranking, en vez de que el usuario elija fechas a ciegas).
- Filtros en panel lateral para origenes/destinos (la referencia visual los pone alli;
  se dejaron a ancho completo en sesiones anteriores para no acumular mas cambios
  estructurales de golpe).

### Verificado
`npx tsc --noEmit` y `npm run build` limpios. `next start` + `curl` confirmando HTTP 200
y presencia de los campos nuevos en el HTML.

---

## Estado al 14 de septiembre de 2026 — Sesion: Sorprendeme sobre destinos reales + boton estable

### Contexto: el usuario probo y reporto 2 problemas + 2 preguntas
Probando "Sorprendeme" con Alicante como origen: los botones "crecian y encogian" sin
control durante la busqueda, y la busqueda en si devolvio una lista larga de avisos
(timeouts de Ignav + "no devolvio vuelos directos") para los 6 destinos sorteados, sin
ningun resultado. Ademas pregunto que significa el aviso de limites de Ignav y que son
los "destinos curados" -- quedan explicados aqui para que cualquier sesion futura sepa
que ya se le explico esto al usuario y como esta resuelto.

### Que es el aviso "Maximo 5 dias por tramo y 6 combinaciones origen x destino"
Ignav (el proveedor de datos de vuelos en vivo) da una cuota gratuita de 1000
peticiones **de por vida** (no al mes). Cada dia del rango de fechas y cada combinacion
origen-destino que se busca consume peticiones reales contra esa cuota. Estos 2 limites
existen solo para que una busqueda de un usuario no se coma un porcentaje grande de esa
cuota de golpe -- no es un limite de Ignav en si, es una proteccion propia de la app.

### Que son los "destinos curados" (y por que NO son lo mismo que "destinos reales")
Hay 2 listas de destinos completamente distintas en la app:
- **Destinos curados** (`destination_groups` en la BD): una lista fija elegida a mano
  por tema/evento (Polonia, Riga, Estocolmo, Helsinki, Oslo, Atenas, Sofia, Belgrado --
  pensados originalmente para cosas como mercados navidenos). **No estan verificados
  contra ningun origen concreto** -- pueden no tener ningun vuelo directo real desde
  Alicante, por ejemplo, aunque si lo tengan desde Madrid.
- **Destinos reales** (tabla `aena_destinations`, sincronizada a diario desde datos
  publicos de Aena): estos SI estan verificados por origen -- son exactamente los que
  aparecen en el selector "Destinos" del formulario, con conteo real de vuelos directos
  desde los origenes que tengas elegidos.

Esta distincion es la causa raiz del bug de esta sesion (ver abajo).

### Fixes de esta sesion
1. **"Sorprendeme" elegia de los destinos CURADOS**, no de los reales -- con Alicante
   como origen, ninguno de los 6 sorteados tenia conectividad real, de ahi la lista de
   avisos sin ningun resultado. Corregido para elegir de `filteredRealDestinations` (los
   destinos reales ya filtrados por origen, la misma lista que ve el usuario en el
   selector), que si tienen vuelo directo confirmado. Los destinos curados se dejan tal
   cual para el buscador en lenguaje natural, donde el tema SI importa mas que la
   certeza de conectividad (ej. "mercado navideno en un pais nordico").
2. **Boton inestable (crecia/encogia)**: el mensaje de progreso cambiante vivia dentro
   del texto del boton; longitudes muy distintas ("Buscando..." vs "Calculando
   traslados y horas de salida del hotel...") hacian que el boton cambiara de tamano
   con cada ciclo. Separado en una linea aparte con altura minima fija y `truncate`.
3. **`lib/ignav.ts` MAX_RETRIES bajado de 2 a 1**: con 8s de timeout por intento, 2
   reintentos podian hacer que una sola ruta lenta tardara ~25s en total -- arriesgando
   que Vercel matara la funcion entera (10s en Hobby) antes de que el resto de rutas,
   mas rapidas, devolvieran su resultado. Mitiga el riesgo, no lo elimina del todo: si
   Ignav esta genuinamente lento para muchas rutas a la vez (no se puede verificar sin
   una key real y acceso de red, que esta sesion no tiene), seguira habiendo timeouts.

### Verificado
`npx tsc --noEmit` y `npm run build` limpios. `next start` + `curl` confirmando HTTP 200
y presencia del nuevo texto/clases en el HTML.

---

## Estado al 14 de septiembre de 2026 — Sesion: fix real de "Sorprendeme" (antes "ideas por precio")

El usuario probo la funcion en el movil con Alicante como unico origen y siempre daba
error de limite de combinaciones. Era un bug real preexistente (de antes de esta
sesion, no introducido por la sesion anterior que solo le anadio el sort por precio):
`handleTravelIdeas` multiplicaba origenes x TODOS los grupos curados (8) sin comprobar
el limite de 6 combos de Ignav -- con 1 solo origen ya fallaba siempre (1x8=8>6). La
funcion era, en la practica, inutilizable.

**Fix**: `handleSurpriseMe` calcula cuantos grupos caben para los origenes elegidos
(`Math.floor(6 / originIatas.length)`, minimo 1) y coge solo esos, mezclados al azar en
cada pulsacion para que salgan destinos distintos cada vez.

**Rediseno** (a peticion del usuario): quitado el checkbox "Quiero viajar, propon ideas
por precio" (escondido dentro de los filtros, cambiaba el boton principal de forma poco
clara). Ahora es su propio boton "Sorprendeme", siempre visible, con icono de chispas y
degradado indigo-fucsia para distinguirlo de "Buscar vuelos". Solo necesita origen
elegido, no destino (ese es el caso de uso: "no se a donde ir").

Verificado con `npx tsc --noEmit` y `npm run build` limpios, y la formula del limite de
combos comprobada a mano para 1-4 origenes (nunca supera 6).

---

## Estado al 14 de septiembre de 2026 — Sesion: mejoras generales (modo oscuro, ideas por precio, compartir, historial, cache Sky Scrapper, iconos iPhone)

### Resumen
Implementadas todas las mejoras propuestas en la sesion anterior salvo las 2 que
requerian la API de Anthropic (sustituir el parser NLP por IA real, e "ideas por
eventos"), que el usuario pidio dejar aparcadas por ahora.

### Cambios
1. **Modo oscuro real** con boton en el nav, persistente en `localStorage`, respeta
   `prefers-color-scheme` la primera vez.
2. **"Ideas por precio"**: `handleTravelIdeas` fuerza `sortBy = 'price'` explicitamente.
3. **Compartir busqueda** por enlace (`lib/share-link.ts`) usando el share sheet nativo
   de iPhone.
4. **Historial de busquedas** en `localStorage` (`lib/search-history.ts` +
   `SearchHistoryPanel.tsx`).
5. **Mensajes de progreso** honestos durante la busqueda (no es progreso real medido).
6. **Cache persistente de Sky Scrapper en BD** -- tabla nueva en `scripts/schema.sql`,
   **hay que aplicarla manualmente contra Neon** (esta sesion no tiene credenciales de
   conexion a tu base de datos).
7. **Icono propio + manifest** para "Añadir a inicio" en iPhone, generados con
   `next/og` (sin archivos de imagen binarios).

### Incidente durante la sesion (para que quede constancia)
Al aplicar las variantes de modo oscuro con `sed` encadenado se produjo un bug de
sustitucion en cascada: pares reciprocos de color (`text-slate-400` <-> `text-slate-500`,
etc.) se iban reinsertando unos a otros, dejando clases duplicadas
(`text-slate-400 dark:text-slate-500 dark:text-slate-400`). Al corregirlo con
`git checkout` sobre los archivos afectados, se perdio sin querer **2 veces seguidas**
el trabajo de compartir/historial/progreso en `app/page.tsx` que aun no estaba
comiteado, porque `git checkout` revierte el archivo COMPLETO a su ultima version
comiteada, no solo el cambio que se queria deshacer. Hubo que rehacer esa parte de
`page.tsx` a mano 3 veces hasta que salio bien. Leccion para el futuro (propia y de
cualquier otra sesion de IA que trabaje en este repo): **nunca usar `git checkout` sobre
un archivo con cambios sin comitear que se quieran conservar** -- comitear primero lo
que este bien, aunque sea en un commit intermedio, antes de deshacer nada.

El bug de fondo (sustitucion en cascada de `sed`) se corrigio con un script Python que
procesa cada `className` una sola vez comparando solo contra el conjunto original de
clases, sin releer lo que el propio script ya ha insertado. Ver nota tecnica en
CHANGELOG.md si hace falta reutilizar el enfoque.

### Verificado
`npx tsc --noEmit` y `npm run build` limpios. `next start` + `curl` en local confirmando
HTTP 200 y presencia de los textos clave de las funciones nuevas.

---

## Estado al 14 de septiembre de 2026 — Sesion: panel lateral + revision de logica + propuestas

### Cambios de diseno aplicados
- Filtros en panel lateral (ver CHANGELOG). Split: "Quien, cuando y a donde" (origenes,
  destinos, fechas, pax, boton de busqueda) a ancho completo; refinamientos (horarios,
  precio/orden, extras) en `FilterAccordion.tsx` a la derecha.
- Fondo de nubes con la app enmarcada en el medio en pantallas medianas/grandes; en movil
  ocupa toda la pantalla (uso principal: web-app de iPhone anadida a inicio).
- Version visible en el nav (`lib/version.ts`, sincronizar a mano con `package.json` y el
  changelog en cada sesion). Metadatos `appleWebApp` + `viewport-fit=cover` +
  `safe-area-inset` para que se comporte bien como web-app de iPhone (pantalla completa,
  respeta notch/isla dinamica y barra de home).
- Renombrados 2 elementos de UI que eran poco claros (ver revision de nombres abajo).

---

### REVISION DE LOGICA Y UX (a peticion explicita del usuario)

#### 1. Nombres de filtros -- cambios ya aplicados
- "Filtros de busqueda" -> **"Quien, cuando y a donde"**: el nombre viejo no decia nada
  (toda la app son "filtros de busqueda"); el nuevo describe lo que hay dentro.
- "Permitir open-jaw en destino" -> **"Permitir llegar y salir por aeropuertos distintos
  (open-jaw)"**: "open-jaw" es jerga del sector que un usuario normal no tiene por que
  conocer; ahora se explica en lenguaje llano y se deja el termino tecnico entre
  parentesis para quien si lo conozca.

#### 2. Nombres que se quedan igual pero podrian mejorar (no tocados, para no acumular
mas cambios de golpe -- decidir si merece la pena)
- "Ida no antes de (h)" / "Vuelta no antes de (h)": funcionan pero son ambiguos sobre si
  se refieren a la fecha o a la hora. Alternativa: "Salida no antes de las 18h" con un
  selector de hora en vez de un numero suelto de 0-23.
- "Precio max. total": correcto, pero no aclara si es por persona o para todo el grupo
  (es total del grupo, ver `pax.adults + pax.children` en `live-engine.ts`). Podria decir
  "Precio maximo total (grupo completo)".
- El checkbox "Incluir Sky Scrapper (cuota mensual limitada)" podria llevar un icono de
  info con el numero exacto de peticiones restantes si en el futuro se guarda un contador
  en BD (ver seccion Sky Scrapper de la sesion anterior).

#### 3. Busqueda en lenguaje natural: limitacion de fondo, no solo de nombres
Lo que la interfaz llama "busqueda en lenguaje natural" **no usa ningun modelo de IA**:
es un parser hecho a mano con expresiones regulares (`lib/nlp-search.ts`) que busca
palabras clave como "el", "dia", "despues de las", etc. Funciona bien para frases
sencillas y ya se le corrigieron 2 bugs reales de atribucion dia/hora en una sesion
anterior, pero tiene un techo estructural: cualquier frase que no encaje con esos
patrones concretos (sinonimos, un orden de palabras distinto, una condicion mas compleja)
simplemente no se interpreta bien, y el usuario solo se entera revisando manualmente los
avisos antes de buscar.

**Propuesta**: sustituir (o complementar) el parser de regex por una llamada real a un
modelo de lenguaje (API de Anthropic) que reciba la frase del usuario + la lista de
origenes/grupos/paises disponibles, y devuelva la misma estructura de filtros
(origenes, destino, fechas, horas) en JSON. Esto:
- Entiende variaciones de redaccion que el regex nunca cubrira ("salgo el finde que
  viene", "algo economico a mediados de diciembre", sinonimos, errores tipograficos).
- Puede explicar en lenguaje natural POR QUE ha interpretado algo de una forma (en vez de
  los avisos genericos actuales).
- Requiere: una `ANTHROPIC_API_KEY` en Vercel, un endpoint nuevo (`/api/nlp-parse`) que
  llame a la API de Anthropic server-side (nunca desde el cliente, para no exponer la
  key), y tiene un coste por peticion (pequeño con un modelo economico, pero no cero,
  a diferencia del parser de regex actual que es gratis). No implementado en esta sesion
  -- requiere que decidas si quieres asumir ese coste y darme la key.

#### 4. "Quiero viajar, propon ideas": lo que hace hoy es mas limitado de lo que suena
El checkbox actual (`handleTravelIdeas` en `page.tsx`) simplemente selecciona TODOS los
grupos de destino curados y lanza la misma busqueda de siempre (con el limite de 6
combinaciones origen x destino de Ignav). No "propone ideas" de forma inteligente: solo
amplia el destino a "todos los que ya tenemos curados" y ordena por el criterio de
`sortBy` que ya estuviera elegido (por defecto, hora de salida del hotel). Si `sortBy` no
esta en "precio", ni siquiera prioriza lo barato.

**Propuesta del usuario, que comparto**: desdoblar en 2 modos claramente distintos:

**A) "Ideas por precio"** -- viable ahora mismo, sin APIs nuevas:
- Mismo mecanismo actual (buscar en todos los grupos curados + destinos reales
  disponibles) pero forzando `sortBy = 'price'` y mostrando explicitamente "mas barato
  primero" en vez de dejarlo al azar del sort ya elegido.
- Mejora barata: en vez de limitarse a los 8 grupos curados, usar tambien un muestreo de
  los destinos REALES de Aena (los mismos que ya se listan en el selector de destinos),
  no solo los curados, para dar mas variedad -- respetando siempre el limite de 6 combos.

**B) "Ideas por eventos/actividades"** -- necesita una fuente de datos nueva:
Ahora mismo la app NO tiene ninguna base de datos ni API de eventos conectada (se quito
la lista fija de eventos en una sesion anterior a favor del cuadro de lenguaje natural).
Para que este modo funcione de verdad hacen falta datos reales de que esta pasando en
cada ciudad en las fechas elegidas. Opciones evaluadas (ninguna implementada, todas
requieren decidir y dar de alta una cuenta/API key):

| Opcion | Que ofrece | Pega principal |
|---|---|---|
| **PredictHQ** | Agregador de eventos (conciertos, festivales, deportivos, culturales) de muchas fuentes, con "rank" de relevancia/afluencia por evento. Cobertura europea solida. | Verificado en esta sesion (web): es un producto orientado a cuentas B2B grandes (retail, hosteleria, logistica) con prueba gratuita de 14 dias y despues un "Free Plan" cuyos limites no se publican en la web -- hay que hablar con ventas para saber que incluye de verdad. No es una API de autoservicio con tier gratuito claro para un desarrollador individual. |
| **Ticketmaster Discovery API** | Gratis hasta 5000 peticiones/dia. Buena cobertura de conciertos y grandes eventos. | Cobertura floja en cosas no-Ticketmaster (mercados navideños, festivales pequeños, eventos culturales gratuitos -- justo el tipo de cosas que ya buscas a mano en las sesiones de "mercados navideños"). |
| **Eventbrite API** | Cubre eventos mas pequeños/locales que Ticketmaster. | Verificado en esta sesion (web): el endpoint publico de busqueda de eventos (`/v3/events/search/`) esta cerrado desde diciembre de 2019/febrero de 2020 para desarrolladores nuevos sin acuerdo comercial, y sigue asi -- confirmado en el propio repositorio de incidencias de Eventbrite. No es una opcion viable sin ese acuerdo. |
| **Apoyo de IA en vez de una API de eventos** | En lugar de una base de datos de eventos, usar una llamada a un modelo de lenguaje que, dada una ciudad y un rango de fechas, sugiera que suele haber (mercados navideños tipicos de esas fechas, festivales conocidos, temporada alta/baja) basandose en su conocimiento general -- similar a como se investigo a mano la Fete des Lumieres de Lyon en una sesion de chat anterior. | No son datos en tiempo real ni verificados (un modelo puede equivocarse en fechas exactas de un evento de un año concreto); hay que dejarle claro al usuario en la propia interfaz que son sugerencias a verificar, no una agenda oficial. |

**Mi recomendacion**: empezar por la opcion de apoyo de IA (mismo mecanismo que ya se
usa para el "apoyo de IA" del punto 3, una sola integracion sirve para las dos cosas) en
vez de contratar una API de eventos de pago sin haber validado antes si el modo "ideas
por eventos" se usa de verdad. Si con el tiempo se ve que hace falta precision real de
fechas/aforo, entonces plantear PredictHQ.

### Ideas de mejora generales (a peticion explicita, sin implementar)
1. **Cache persistente de resoluciones IATA de Sky Scrapper** en BD (ver sesion
   anterior) -- ahorra cuota mensual tan ajustada.
2. **Historial de busquedas guardadas**: dado que ya existe "guardar alerta de precio",
   seria poco trabajo anadir "repetir esta busqueda" con un clic desde un historial
   reciente (guardado en localStorage del navegador, sin necesidad de cuenta de usuario).
3. **Indicador de progreso durante la busqueda**: con hasta 60 peticiones a Ignav en
   paralelo, una busqueda puede tardar varios segundos sin ningun feedback intermedio
   mas alla del texto "Buscando...". Un contador simple ("consultando aeropuerto 3 de
   6...") mejoraria la percepcion de velocidad.
4. **Compartir un resultado por enlace**: generar una URL con los filtros de la busqueda
   codificados en la query string, para poder mandarsela a otra persona o guardarla en
   Notas del iPhone sin tener que rehacer la busqueda.
5. **Modo oscuro real como preferencia, no como tema fijo**: ahora que el tema base es
   claro, se podria anadir un toggle claro/oscuro que respete `prefers-color-scheme`,
   en vez de forzar un unico tema para todo el mundo.
6. **Service worker minimo para "anadir a inicio" en iPhone**: los metadatos
   `appleWebApp` de esta sesion ya dan pantalla completa, pero sin un manifest.json +
   icono propio, el icono en la pantalla de inicio sera una captura generica de la pagina.
   Vale la pena anadir un `app/manifest.ts` (soportado nativamente por Next.js 14) con un
   icono propio de 180x180 al menos para Apple.

---

## Estado al 14 de septiembre de 2026 — Sesion: integracion Sky Scrapper (RapidAPI)

### Resumen ejecutivo
El usuario pidio explicitamente mezclar Sky Scrapper con Ignav ("mezclar resultados de
ambas y marcar de donde viene cada uno"). Implementado en `lib/skyscanner-adapter.ts` +
cambios en `live-engine.ts`, `search-live/route.ts`, `page.tsx` y `FlightResultCard.tsx`.

### Como funciona
- Casilla nueva "Incluir Sky Scrapper" en el formulario, **desactivada por defecto**. Sin
  marcarla, cero cambios de comportamiento respecto a antes.
- Si esta marcada y `RAPIDAPI_SKY_SCRAPPER_KEY` esta configurada en Vercel: se consulta
  Sky Scrapper para cada combinacion origen x aeropuerto de destino, usando SOLO la
  primera fecha de ida y la primera de vuelta del rango elegido (no el rango completo).
  Tope propio de 6 llamadas por busqueda.
- Los resultados se mezclan con los de Ignav en la misma lista y cada tarjeta muestra una
  etiqueta ("Ignav" / "Sky Scrapper") indicando la fuente.
- Si la variable de entorno no esta configurada, la casilla no tiene ningun efecto
  (silencioso, no rompe la busqueda).

### AVISO IMPORTANTE: sin verificar contra la API real
Esta sesion no tiene acceso de red a `sky-scrapper.p.rapidapi.com` ni una
`RAPIDAPI_SKY_SCRAPPER_KEY` configurada, asi que el parseo de la respuesta de **ida+vuelta**
de Sky Scrapper no se ha podido probar contra datos reales. Lo que SI esta verificado:
- La forma de una respuesta de SOLO IDA de esta misma API, contra tu propio script
  `buscador_viajes.py` (que ya usas y funciona): `legs[0].stopCount`,
  `legs[0].durationInMinutes`, `legs[0].carriers.marketing[0].name`, `price.raw`.
- El parseo se ha probado con datos SIMULADOS plausibles (ver commit) que siguen la
  convencion habitual de esta familia de APIs para ida+vuelta (`legs[0]` = ida, `legs[1]`
  = vuelta), incluyendo el caso de campos anidados en formas ligeramente distintas.

**Cuando pruebes esto con una key real, revisa especialmente:**
1. Que `legs[1]` sea de verdad el tramo de VUELTA (y no algo distinto, como un segundo
   segmento de la misma ida con escala).
2. Que `origin.displayCode` / `destination.displayCode` traigan el codigo IATA (si vienen
   vacios, hay un fallback a `.id` pero conviene confirmarlo).
3. Los avisos de la busqueda («warnings») mostraran cualquier error de Sky Scrapper sin
   romper el resto de la busqueda (Ignav sigue funcionando aparte) -- si algo no encaja,
   apareceran ahi con el mensaje de error real de la API.

### Bug adicional corregido de paso
`lib/skyscanner.ts`: `searchAirport` no extraia `skyId`/`entityId` cuando la API los
devolvia anidados bajo `navigation.relevantFlightParams` en vez de en la raiz del item
-- tu propio script ya maneja este mismo fallback. Sin el, `searchFlights` habria recibido
`skyId`/`entityId` `undefined` y fallado en silencio.

### Cuota: ojo si compartes la key con tu script personal
Si `RAPIDAPI_SKY_SCRAPPER_KEY` en Vercel es la MISMA key que usas en tu
`buscador_viajes.py` local, ambos consumen de la misma bolsa de ~100 peticiones/mes de
RapidAPI. Si quieres usarlos independientemente sin que se pisen la cuota, hace falta una
key de RapidAPI distinta para cada uno.

### Pendiente / mejoras futuras (no implementadas en esta sesion)
- Cache persistente en BD de resoluciones IATA -> skyId/entityId (tabla nueva, ej.
  `skyscanner_airport_cache(iata TEXT PRIMARY KEY, sky_id TEXT, entity_id TEXT)`) para no
  gastar cuota re-resolviendo los mismos aeropuertos (ALC, MAD, VLC, RMU, destinos
  habituales) en cada busqueda -- ahora mismo la cache es solo en memoria y dura lo que
  dura una invocacion de la funcion serverless.
- Filtros en panel lateral (pendiente de la sesion de diseno anterior).

---

## Estado al 14 de septiembre de 2026 — Sesion: tema claro real + fotos de ciudad + fixes de logica


### Resumen ejecutivo
El usuario mando una captura de la referencia real (app "aeroluxe"): tema CLARO con acento
indigo/morado, tarjetas de resultado con foto (no icono), filtros en lateral, top nav
oscuro. El rediseno de la sesion anterior se habia ido a un tema oscuro/dorado que no se
parecia a esa referencia. Este pase corrige el rumbo del tema (claro/indigo, confirmado
con el usuario antes de empezar) y sustituye la tabla de resultados por tarjetas con foto
real de la ciudad de destino.

### Cambios de diseno
- Tema oscuro/dorado -> claro/indigo en toda la app (`tailwind.config.ts`, `globals.css`,
  `TopNav.tsx` nuevo, `FlightPathStrip.tsx`, `ToolsPanel.tsx`, `page.tsx`).
- Resultados: tabla -> tarjetas (`FlightResultCard.tsx` nuevo) con foto real de la ciudad
  de destino en vez de un icono de avion, usando `lib/city-images.ts` nuevo: banco de 11
  fotos de Pexels verificadas una a una (busqueda + confirmacion de la URL real del CDN
  antes de incluir cada una) para las ciudades destino mas habituales, con una foto
  generica de reserva (vista aerea del Mediterraneo desde ventanilla) para cualquier otro
  destino real de Aena no cubierto.
- Se quito el hero de foto grande de la sesion anterior (la referencia real no lo tiene).
- **No implementado en este pase**: la disposicion de filtros en panel lateral de la
  referencia. Nuestros filtros reales (origenes/destinos/fechas/pax) siguen a ancho
  completo encima de los resultados en vez de en una barra lateral, para no arriesgar mas
  cambios estructurales en la misma sesion. Pendiente si el usuario lo pide expresamente.

### Fixes de logica (a peticion explicita de "revisa la logica")
1. Inconsistencia entre el sort "duracion" del servidor (suma de duracion de vuelo) y el
   del cliente al re-ordenar (duracion total del viaje) -- mismo filtro, dos formulas
   distintas. Unificado a duracion total del viaje.
2. Filtro de itinerarios invalidos comparaba la salida de vuelta contra la SALIDA de ida
   en vez de la LLEGADA -- podia colar un vuelo de vuelta que sale antes de aterrizar el
   de ida. Corregido.
3. `ignavPost` (lib/ignav.ts) no tenia timeout en el fetch y no reintentaba si fetch()
   lanzaba una excepcion (solo reintentaba status HTTP concretos) -- una incidencia de
   red podia abortar toda la busqueda de golpe. Anadido timeout de 8s + reintento en
   errores de red, mismo patron que ya usaba `lib/skyscanner.ts`.

### PENDIENTE -- Sky Scrapper (RapidAPI) sin integrar todavia
El usuario pidio explicitamente anadir la API Sky Scrapper (`lib/skyscanner.ts`, cliente
ya escrito en una sesion anterior pero nunca conectado al motor de busqueda). Antes de
tocar `live-engine.ts` para mezclar dos proveedores de vuelos con formatos de respuesta
distintos, hay decisiones de arquitectura que conviene confirmar con el usuario primero
(ver mensaje de chat de esta sesion): como mostrar la procedencia de cada resultado
cuando se mezclan dos fuentes, que pasa si un mismo vuelo aparece en ambas APIs
(deduplicacion), y si Sky Scrapper debe usarse siempre en paralelo con Ignav o solo como
respaldo cuando Ignav falle/se quede sin cuota. Esta sesion se ha centrado en el diseno y
la revision de logica pedidos primero.

### Verificado
`npx tsc --noEmit` y `npm run build` limpios tras cada cambio. `next start` + `curl` en
local confirmando HTTP 200 y contenido esperado en la home.

---

## Estado al 14 de septiembre de 2026 — Sesion de rediseno visual (Claude, a peticion del usuario)

### Resumen ejecutivo
El usuario reporto que el diseno "lujo oscuro/dorado" de la sesion anterior seguia viendose mal ("mucho espacio vacio", "mapa inservible que ocupa mucho sitio", "no hay imagenes SVG o de aeronautica"). Diagnostico real: **`components/RouteMap.tsx` y `components/ToolsPanel.tsx` nunca se retematizaron** en el rediseno del PR #15/#16 -- seguian enteros en el tema claro original (fondo blanco, paleta azul `brand-600` de `tailwind.config.ts`, sin relacion con el resto de la app), lo que producia dos bloques blancos/azules rotos en medio de una pagina oscura. Ademas, `app/page.tsx` tapaba un fondo claro heredado de `layout.tsx`/`globals.css` con un hack de margen negativo (`-m-6 p-6`) en vez de fijar el tema oscuro correctamente en la raiz.

### Cambios de esta sesion (rama `design/luxury-theme-fix`)
1. **Tema oscuro fijado en la raiz** (`app/globals.css` + `app/layout.tsx`): ya no depende del hack `-m-6` en `page.tsx`.
2. **`tailwind.config.ts`**: paleta `brand` azul (huerfana, sin relacion con el resto de la app) sustituida por tokens `ink` / `ink-panel` / `gold` / `gold-light`, usados de forma consistente en vez de hexadecimales sueltos repetidos.
3. **`components/RouteMap.tsx` eliminado** junto a `app/api/route-map/route.ts`: dibujaba un SVG de 420px de alto sobre "destinos curados", un listado que el resto de la app ya dejo de usar como fuente principal -- de ahi que se viera vacio/desactualizado la mayor parte del tiempo.
4. **`components/FlightPathStrip.tsx` nuevo**: sustituye al mapa. Compacto, en el tema correcto, y dirigido por el origen/destino que el usuario tiene REALMENTE seleccionado en el formulario (no un dataset aparte).
5. **`components/ToolsPanel.tsx` retematizado por completo** a dark/gold.
6. **Hero rediseñado**: menos padding, avion en filigrana, y la tarjeta `FlightPathStrip` flotando sobre el borde inferior del hero (tecnica "search bar sobre la foto", caracteristica del genero de apps de reserva de vuelos privados de lujo) en vez del hueco vacio que quedaba antes entre el hero y el mapa.
7. **Iconos SVG originales nuevos** (despegue, aterrizaje, compas, billete de embarque) en `components/Icons.tsx`, mas los `IconPlane`/`IconSuitcase` que ya existian pero no se usaban en ningun sitio -- ahora aplicados en el hero, la tira de ruta, la tabla de resultados y `ToolsPanel`.
8. **Tipografia**: titulares en pila serif del sistema (Georgia y similares) en vez del sans por defecto. Se probo `next/font/google` (Fraunces + Inter) primero pero se descarto porque no se pudo verificar el build sin acceso a `fonts.googleapis.com` en el entorno de esta sesion -- no se quiso arriesgar el build real de Vercel sin poder probarlo antes. Si en el futuro se quiere ese acabado mas editorial, probarlo directamente en un PR y revisar el preview de Vercel antes de mergear.

### Verificado
`npx tsc --noEmit` y `npm run build` limpios. Tambien se arranco `next start` en local y se confirmo con `curl` que la home responde 200 y contiene los textos esperados (sin poder ver capturas reales, ya que este entorno no tiene navegador).

### Pendiente de tu parte
- Revisar el preview de Vercel del PR de esta rama -- esta vez es un cambio visual/subjetivo, asi que no se ha mergeado solo (a diferencia de la sesion de bugs anterior); dime si te gusta o si quieres ajustes antes de aprobarlo.

---

## Estado al 14 de septiembre de 2026 — Sesion de auditoria (Claude, a peticion del usuario)

### Resumen ejecutivo
Auditoria completa del repo (clonado en local, historial y ramas incluidas) mas aplicacion directa de fixes sobre una rama nueva `fix/auditoria-completa` partiendo del PR #15. Verificado con `npx tsc --noEmit` y `npm run build` limpios tras todos los cambios. Nota: esta rama partia de un STATUS.md desactualizado (sin la seccion "Sesion 2" que ya existia en `main`); este archivo fusiona ambos historiales para no perder nada al mergear.

### Verificacion de seguridad independiente
Se escaneo TODO el historial de git (todas las ramas, todos los commits) buscando la key de RapidAPI que el usuario pego en el chat en la sesion anterior. Confirmado: nunca se comiteo, solo hay placeholders en `.env.example`. El aviso de seguridad de la sesion anterior era correcto.

### Fixes aplicados en `fix/auditoria-completa`
1. Mergeado el fix del PR #15 para `destinationIatas` sueltos (bug activo en `main`).
2. `lib/nlp-search.ts`: reescrita la extraccion de dias/horas para que se corte el texto en la primera palabra de vuelta (regreso/vuelta/retorno) y se extraigan dias/horas por separado en cada mitad. Antes, con el propio ejemplo de la home ("...el 4 despues de las 18h o si no el 5 a partir de las 8h, regreso no antes de las 12h"), el parser asumia que el dia 5 era la vuelta (cuando era una alternativa de ida) y aplicaba 18h como hora minima de vuelta (cuando el texto pedia 12h). Verificado con un test aislado en Node antes de tocar el archivo real.
3. `app/api/search-live/route.ts`: restauradas las 2 lineas (`dynamic`/`runtime`) que la reconstruccion "a ciegas" del PR #15 habia perdido; unica ruta del proyecto sin esas 2 lineas. Tambien alineado el manejo de errores y el `pax` por defecto con el resto del proyecto.
4. `lib/live-engine.ts`: eliminado el N+1 -- `transfer_times` y `hotel_transfer` se precargan en batch antes del doble bucle ida x vuelta en vez de consultarse uno a uno dentro de el.
5. `lib/live-engine.ts`: nuevo limite `MAX_IGNAV_REQUESTS_PER_SEARCH = 60` que calcula el numero REAL de peticiones (aeropuertos x dias x 2 x combos) antes de lanzar la busqueda, no solo el numero de combinaciones origen x destino. Ver CHANGELOG para el caso extremo (240 peticiones en una sola busqueda) que esto evita.
6. `lib/db.ts` y `lib/ignav.ts`: el saneador de caracteres invisibles ahora los ELIMINA en vez de sustituirlos por un espacio (que solo arreglaba el caso de borde en los extremos de la cadena).
7. Eliminados `app/api/debug/db-check` (endpoint temporal) y el motor mock huerfano (`lib/search-engine.ts` + `app/api/search/route.ts`); sus 2 funciones usadas por `app/api/meta/route.ts` se movieron a `lib/meta-queries.ts` nuevo.

### 2 hallazgos que NO se han tocado por codigo (documentar, no arreglar)
- **Los crons escalonados de `vercel.json` (04:00/04:05/04:10/04:15) no hacen lo que aparentan.** En el plan Hobby, Vercel solo garantiza que el cron se ejecute DENTRO de la hora indicada, no en el minuto exacto -- los 4 refresh-aena pueden dispararse en cualquier orden o casi a la vez dentro de las 04:00-04:59. El escalonado por minutos es cosmetico. (El limite de "solo 2 crons en Hobby" que aparece en blogs antiguos ya no aplica -- Vercel lo subio a 100/proyecto en enero 2026 -- pero la falta de precision de minuto en Hobby SI sigue vigente). No se ha cambiado `vercel.json` porque no hay ninguna configuracion que arregle esto en Hobby; si algun dia importa el orden/espaciado exacto, la solucion es un scheduler externo (ej. GitHub Actions con horas distintas de verdad, o un cron externo tipo cron-job.org) llamando a estos mismos endpoints con el secreto `AENA_SYNC_SECRET`.
- **Ojo con la alternativa de GitHub Actions propuesta para el 504 de Aena**: si la hipotesis del bloqueo por IP de datacenter es correcta, GitHub Actions probablemente tenga EL MISMO problema (sus runners tambien son IPs de datacenter, de Azure). Antes de invertir tiempo montando ese pipeline, probar el fetch a Aena una vez desde una IP residencial (tu propio ordenador) para confirmar o descartar la hipotesis.

### Pendiente de tu parte
- Revisar el diff de la rama `fix/auditoria-completa` (o el PR que se abra desde ella) y aprobar el merge a `main`.
- Cuando termines de revisar: revocar el token de GitHub que diste para esta sesion y volver a poner el repo en privado.

---


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
