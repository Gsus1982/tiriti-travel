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

**En produccion (rama `main`) ahora mismo**: v0.7.1 -- panel lateral, tema claro/indigo,
logo/tipografia propios, filtro de aerolineas (con su bug critico ya arreglado).
**Todavia NO incluye nada de IA/OpenAI ni la eliminacion de destinos curados.**

**Cadena de PRs abiertos, sin mergear a `main` todavia** (cada uno se apila sobre el
anterior, en este orden -- mergear en ESTE orden si se aprueban):
1. **PR #19** (`feat/openai-nlp-siri-ui` -> `main`): integracion real de OpenAI para
   interpretar lenguaje natural + cuadro de NLP destacado con marco neon animado.
   **Confirmado funcionando** por el usuario con una captura real.
2. **PR #20** (`feat/ai-search-and-recommendation` -> rama del #19): boton "Buscar con
   esta interpretacion", Sorprendeme con criterio de IA, recomendacion de la IA sobre
   resultados. Sin confirmar en vivo todavia si Sorprendeme-con-IA y la recomendacion
   funcionan (solo la interpretacion del #19 esta confirmada).
3. **PR #21** (`fix/ai-parse-combo-limit` -> rama del #20): 2 fixes reales encontrados
   probando el #19/#20 en vivo (tope de combinaciones + preferir destinos reales).
4. **Rama `feat/eliminar-destinos-curados`** (sobre la del #21, PR todavia sin abrir a
   fecha de esta entrada -- abrirlo contra `fix/ai-parse-combo-limit` cuando se continue
   esta sesion): **ELIMINADO POR COMPLETO** el concepto de destinos curados. Ver debajo.

**`OPENAI_API_KEY` ya esta configurada en Vercel** por el usuario. El modelo usado es
`gpt-4o-mini` (configurable via variable de entorno `OPENAI_MODEL`, sin tocar codigo).

### Destinos curados: CERRADO -- eliminados por completo (ya no es un problema abierto)
Las 2 entradas de abajo (sesion "FIX real de la IA superando la cuota...") documentan 2
fallos sistematicos e independientes de los grupos curados (`destination_groups`:
Polonia, Riga, Estocolmo, Helsinki, Oslo, Atenas, Sofia, Belgrado) dando timeout al 100%
en Ignav. En la sesion siguiente, el usuario pidio explicitamente eliminarlos "de una vez
por todas, sin dejar rastro" -- hecho. **Si estas leyendo las secciones de abajo y ves
"pendiente de decidir si eliminar los grupos curados", esa decision YA SE TOMO y SE
EJECUTO: los grupos ya no existen en el codigo.** No hace falta releer ese debate,
solo saber que se resolvio eliminandolos.

Lo unico pendiente de esa eliminacion: **`scripts/schema.sql` documenta el esquema
deseado (ya sin `destination_groups` ni `group_id`), pero la base de datos REAL en Neon
todavia tiene esas columnas/tabla** -- esta sesion no tiene credenciales de conexion
para aplicar la migracion ella misma. El propio `scripts/schema.sql` trae al final el
bloque de SQL exacto a ejecutar a mano en el SQL Editor de Neon:
```sql
ALTER TABLE airports DROP COLUMN IF EXISTS group_id;
DROP TABLE IF EXISTS destination_groups;
ALTER TABLE price_alerts DROP COLUMN IF EXISTS destination_group_id;
```
El codigo funciona igual aunque no se ejecute (son columnas/tabla huerfanas que ya no
se leen ni escriben desde ningun sitio) -- es solo para tener la BD coherente.

El open-jaw (unica funcionalidad real que dependia de los grupos) ahora se basa en
agrupar por CIUDAD REAL los destinos elegidos de `aena_destinations` -- ver
`resolveDestinationTargets` en `lib/live-engine.ts`.

### Limitacion que se repite en todas las sesiones (importante para cualquier IA nueva)
El entorno de trabajo de estas sesiones **no tiene acceso de red a APIs externas**
(`api.openai.com`, `api.ignav.com`, `sky-scrapper.p.rapidapi.com`, etc. -- solo un
puñado de dominios de paquetes npm/GitHub estan permitidos) **ni credenciales de
conexion a la base de datos real de Neon del usuario**. Esto significa que NINGUNA
integracion de API externa ni cambio de esquema de BD se puede probar/aplicar en vivo
desde el sandbox de la sesion -- todo se escribe con la mejor informacion disponible y
se prueba de verdad solo cuando el USUARIO lo ejecuta en Vercel/Neon y reporta el
resultado. Cuando el usuario reporta un error real, es la unica senal fiable de que algo
no funciona como se penso.

### Arquitectura rapida (para orientarse sin leer todo el codigo)
- **3 fuentes de datos de vuelos**: Ignav (`lib/ignav.ts`, principal, cuota 1000 de por
  vida), Sky Scrapper/RapidAPI (`lib/skyscanner.ts` + `lib/skyscanner-adapter.ts`,
  opcional via checkbox, cuota ~100/mes, sin verificar en vivo), y el motor que las
  combina es `lib/live-engine.ts`.
- **Una unica lista de destinos**: `aena_destinations` en BD, verificada a diario
  contra datos publicos de Aena (los que cuenta el selector "Destinos" del formulario).
  Ya NO existen los grupos curados (ver seccion de arriba).
- **3 endpoints de IA**, todos con el mismo patron (OpenAI `gpt-4o-mini`,
  `response_format: json_schema`, fallback si falla): `/api/ai-parse` (interpretar
  lenguaje natural), `/api/ai-surprise` (elegir destinos para Sorprendeme),
  `/api/ai-recommend` (recomendar un resultado tras la busqueda).
- **`app/page.tsx`** es el componente principal (unico, grande) que orquesta todo el
  estado del formulario y las llamadas.

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
