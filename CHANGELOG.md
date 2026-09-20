# Changelog

Todas las fechas en hora local de España (CEST/CET), con hora cuando esta disponible desde la sesion que hizo el cambio. Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/).

## [0.28.8] - 2026-09-17 (sesion 28) - FIX del diagnostico: buscaba la 'rez' equivocada (una URL, no el titulo real)

El usuario probo el diagnostico de codigos de caracter de la sesion anterior:
`alrededor_de_rez` devolvio literalmente `"fo-suarez"` con codigos ASCII puros (0066
006f 002d 0073 0075 0061 0072 0065 007a) -- sin ningun acento ni mojibake.

### La pista real: el diagnostico buscaba en el sitio equivocado, no el arreglo estaba mal
`rawHtml.indexOf('rez')` encontro la PRIMERA ocurrencia de esas 3 letras en todo el
HTML -- y resulta que Aena tiene una URL interna tipo
"adolfo-suarez-madrid-barajas" (en minusculas, sin tilde, formato de slug de URL
normal) que aparece en el `<head>` de la pagina (probablemente un `<link
rel="canonical">` o similar) ANTES que el titulo visible con el problema real. El
diagnostico se engancho a esa ocurrencia inocente en vez de a la del titulo, dando la
falsa impresion de que no habia ningun caracter mal codificado cerca -- cuando en
realidad simplemente se estaba mirando en el sitio equivocado del documento.

### Corregido
Buscar directamente el caracter mojibake `\u00c3` en si (que solo puede aparecer en
una ocurrencia REAL del problema, nunca en una URL/slug ASCII normal como
"adolfo-suarez"), en vez de buscar la secuencia de letras "rez" que puede aparecer en
muchos sitios inocentes de una pagina real. Campos de diagnostico renombrados
(`alrededor_del_caracter_problematico`, `codigos_de_caracter_hex_ahi`) para reflejar
lo que buscan de verdad.

## [0.28.7] - 2026-09-17 (sesion 27) - diagnostico de codigos de caracter exactos (Unicode hex)

El usuario probo el diagnostico "antes de guardar"/"leido de vuelta" de la sesion
anterior: ambos salieron IDENTICOS (con el mismo galimatias) -- descarta por completo
que el problema este en la base de datos, y confirma que `fixDoubleEncodedUtf8()` no
esta corrigiendo nada, ni siquiera antes de guardar, pese a funcionar en todas las
pruebas locales de esta sesion con datos simulados.

### Anadido
Diagnostico de precision: en vez de fiarse de como se VE el texto en la respuesta JSON
(que puede ocultar detalles de representacion Unicode), `fetchAndStoreRawPage()` ahora
extrae los codigos de caracter EXACTOS (numero Unicode en hexadecimal, via
`charCodeAt`) de los caracteres alrededor de "rez" (de "Suarez"/"SuArez") -- asi se
sabra con total certeza, sin ninguna ambiguedad de representacion visual, exactamente
que caracteres hay ahi de verdad en el texto real de produccion, para poder comparar
con precision contra lo que se ha estado simulando en las pruebas locales.

## [0.28.6] - 2026-09-17 (sesion 26) - metodo algoritmico + diagnostico antes/despues de guardar (localizar el fallo con certeza)

El usuario repitio descarga+analisis por CUARTA vez, confirmando incluso que la URL
estaba bien escrita (fallo previo por URL cortada descartado), y el mismo galimatias
exacto seguia apareciendo -- pese a que una prueba directa confirmo que el texto real
SI contenia el patron que el fix de la sesion 25 buscaba.

### Cambiado
- **`fixDoubleEncodedUtf8()` reescrito de lista fija a metodo ALGORITMICO**: en vez de
  16 pares exactos, reconoce el patron ESTRUCTURAL de cualquier secuencia UTF-8 de 2
  bytes (todo el bloque Latin-1 Supplement, no solo las letras españolas) mal
  interpretada como latin1, y la decodifica correctamente byte a byte -- mas general y
  robusto frente a cualquier diferencia sutil no contemplada en la lista fija anterior.
  Sigue con salvaguarda POR COINCIDENCIA INDIVIDUAL (no global): una coincidencia que
  no decodifique a un unico caracter valido se deja intacta, sin afectar al resto.

### Anadido -- diagnostico para localizar el fallo con certeza
Dado que 2 metodos distintos (reinterpretacion global, reemplazo quirurgico) no han
resuelto el problema en produccion pese a funcionar en pruebas locales, se añadio
diagnostico directo en `fetchAndStoreRawPage()`: ahora la respuesta de
`/api/cron/refresh-aena/[origin]` incluye un extracto del texto justo ANTES de
guardarlo en la base de datos, y otro leyendolo DE VUELTA inmediatamente despues de
guardarlo. Esto permite, con un solo intento mas, distinguir con certeza entre 2
posibilidades: (a) el arreglo de codificacion no se esta aplicando de verdad en
produccion (en cuyo caso "antes de guardar" ya saldria con el galimatias), o (b) el
arreglo funciona pero algo en el guardado o la lectura de la base de datos (el driver
HTTP de Neon, la codificacion de la columna) esta corrompiendo el texto por el camino
(en cuyo caso "antes de guardar" saldria bien pero "leido de vuelta" saldria mal).

## [0.28.5] - 2026-09-17 (sesion 25) - FIX real: reemplazo quirurgico en vez de reinterpretacion global (la salvaguarda del fix anterior se autodescartaba)

El usuario repitio descarga+analisis desde cero y el mismo galimatias exacto seguia
apareciendo -- el fix de la sesion 24 (deshacer la doble codificacion reinterpretando
TODO el texto como latin1) tenia la causa correcta pero una salvaguarda que lo
invalidaba en la practica.

### Causa del fallo del fix anterior
`fixDoubleEncodedUtf8()` reinterpretaba el texto ENTERO (457 KB reales) como latin1 y
lo volvia a decodificar como UTF-8, con una salvaguarda: si el resultado contenia algun
caracter de reemplazo (U+FFFD, señal de bytes UTF-8 invalidos), se descartaba el
arreglo COMPLETO y se devolvia el texto original sin tocar. En una pagina real tan
grande, es muy probable que exista al menos un fragmento (un script residual no
eliminado del todo, una entidad rara, algun simbolo) que NO este doblemente codificado
-- y reinterpretarlo como latin1 SI generaria bytes UTF-8 invalidos al decodificar de
nuevo, disparando la salvaguarda y anulando el arreglo para TODA la pagina de golpe,
incluida la tabla de destinos que si estaba bien identificada.

### Corregido
Sustituida la reinterpretacion global por un reemplazo QUIRURGICO: una lista de 16
pares mojibake -> caracter correcto, generados programaticamente (no adivinados a
mano) a partir de los bytes UTF-8 reales de cada vocal acentuada, la Ñ/ñ, la ü/Ü y los
signos ¿¡ reinterpretados como latin1. Se sustituye SOLO esos pares exactos en el
texto, dejando absolutamente todo lo demas intacto -- sin ninguna salvaguarda global
que pueda descartar el arreglo por un problema en una parte de la pagina que no tiene
nada que ver con la tabla de destinos.

### Verificado
Simulado el peor caso deliberadamente: una pagina con la tabla de destinos
correctamente doblemente codificada (como hace Aena) MAS un fragmento con emoji y
comillas tipograficas tambien mal codificado (para representar cualquier parte de la
pagina real que no siga el mismo patron exacto) -- el reemplazo quirurgico arreglo
correctamente los nombres de destino y pais, encontrando los 2 destinos de prueba con
sus datos exactos, sin verse afectado en absoluto por el fragmento de emoji/comillas
que quedo sin corregir (y que no importa, porque nunca forma parte de la tabla de
destinos que se analiza).

## [0.28.4] - 2026-09-17 (sesion 24) - FIX real, verificado end-to-end: Aena envia el contenido DOBLEMENTE codificado en UTF-8

El usuario, siguiendo la indicacion de repetir descarga+analisis desde cero, confirmo
que el fix de la sesion 23 (forzar TextDecoder utf-8) no era suficiente: exactamente el
mismo galimatias ("SuÃ¡rez", "CORUÃ‘A") seguia apareciendo.

### Causa real (verdadera esta vez, confirmada con una prueba exacta)
El fix anterior no estaba mal -- decodificar como UTF-8 es lo correcto -- pero era
insuficiente porque el problema esta en el lado de Aena: su servidor envia el
contenido con **doble codificacion UTF-8** (un fallo tipico de mezclar una base de
datos en latin1/windows-1252 con una salida en UTF-8 sin convertir bien en algun punto
intermedio de su propia infraestructura). Decodificar bien como UTF-8 (lo que ya se
hacia) da CORRECTAMENTE "Ã¡" para lo que deberia ser "á", porque esos son literalmente
los bytes reales que Aena manda por la red.

### Corregido
Nueva funcion `fixDoubleEncodedUtf8()`: reinterpreta el texto ya decodificado como si
sus caracteres fueran bytes latin1, y decodifica esos bytes como UTF-8 otra vez --
deshaciendo la doble codificacion. Con salvaguarda: si el resultado contiene
caracteres de reemplazo (U+FFFD, señal de una transformacion invalida para ese texto),
se descarta y se devuelve el texto original sin tocar, para no arriesgarse a corromper
contenido que no estuviera realmente doblemente codificado.

### Verificacion end-to-end completa (la mas rigurosa de toda esta cadena de fixes)
Se reprodujo el pipeline completo: una pagina de ejemplo con acentos correctos, se
codifico a UTF-8, se le aplico la MISMA doble codificacion que hace Aena (simulando sus
bytes reales por la red), se decodifico con `TextDecoder('utf-8')`, se le aplico
`fixDoubleEncodedUtf8()`, y se analizo con `parseDestinationsHtml()` -- resultado:
destinos encontrados correctamente, con nombres y paises exactos. Ademas, se probo la
funcion de arreglo directamente contra el TEXTO EXACTO que el usuario pego del
diagnostico real ("SuÃ¡rez" -> "Suárez", confirmado caracter por caracter).

## [0.28.3] - 2026-09-17 (sesion 23) - FIX real, confirmado: decodificacion UTF-8 forzada (Madrid ya sin timeout, causa de "0 destinos" encontrada)

El usuario probo el fix de la sesion anterior: el 504 de Madrid **desaparecio** (el
metodo lineal de analisis funciono), pero ahora daba "0 destinos" con un extracto de
diagnostico muy revelador: "SuÃ¡rez" en vez de "Suárez", "CORUÃ‘A" en vez de "CORUÑA".

### Causa real, confirmada con una prueba exacta
Ese patron ("Ã¡" en vez de "á", "Ã‘" en vez de "Ñ") es la firma exacta de bytes UTF-8
genuinos decodificados como si fueran latin1/windows-1252. Confirmado con Node: los
bytes UTF-8 reales de "á" (0xC3 0xA1) decodificados como latin1 dan literalmente "Ã¡"
-- identico a lo que aparecio en el diagnostico real. La causa: `res.text()` dejaba
que `fetch()` adivinara la codificacion de caracteres (probablemente a partir de una
cabecera Content-Type de Aena con un charset incorrecto o ausente), y la adivinaba
mal, aunque el contenido real es UTF-8 genuino (ya confirmado por busqueda web en
sesiones anteriores).

### Corregido
`res.text()` sustituido por lectura de bytes crudos (`res.arrayBuffer()`) + decodificacion
EXPLICITA forzada a UTF-8 (`new TextDecoder('utf-8').decode(...)`), sin dejarle a
`fetch()` ninguna oportunidad de adivinar mal. Aplicado tanto en la funcion de
produccion (`fetchAndStoreRawPage`) como en la version original mantenida para pruebas
locales (`fetchAenaDestinations`).

### Verificado con una prueba end-to-end completa
Se reprodujo el bug exacto: un texto real con "Suárez"/"País"/"Aerolíneas" (UTF-8
genuino) codificado a bytes UTF-8 y luego decodificado mal como latin1 -- al pasar ese
texto mal decodificado por `parseDestinationsHtml`, el resultado fue **0 destinos
encontrados, reproduciendo el bug real reportado con precision**. Con la decodificacion
correcta (`TextDecoder('utf-8')`) sobre los mismos bytes, el analisis encontro los 2
destinos de prueba correctamente. Esta es la primera vez en esta cadena de fixes que se
reproduce el bug exacto reportado por el usuario en un entorno controlado, no solo una
hipotesis razonable.

## [0.28.2] - 2026-09-17 (sesion 22) - Murcia: pagina de Aena en mantenimiento (no arreglable); Madrid: analisis reescrito sin regex de riesgo

El usuario probo el diagnostico de la sesion anterior con datos reales muy utiles.

### Murcia: causa real encontrada, no arreglable desde el codigo
El extracto de diagnostico mostro literalmente: "Pagina en mantenimiento ... Esta
pagina esta en mantenimiento. En estos momentos estamos trabajando en nuestra web." --
es la propia Aena la que tiene esa pagina concreta caida ahora mismo, no un bloqueo ni
un fallo de analisis. Nada que corregir en el codigo; se resolvera solo cuando Aena
restaure esa pagina. El codigo ya se comporto correctamente: detecto que algo no
cuadraba (0 destinos) y NO borro ningun dato existente de Murcia.

### Madrid: nueva causa real -- el ANALISIS timeaba, no la descarga
Esta vez la descarga tuvo exito (457.202 bytes reales) pero el 504 aparecio en la fase
de analisis, que no toca la red en absoluto -- señal de un problema de CPU, no de red.
Sustituido el regex monolitico anterior (con cuantificadores perezosos anidados,
riesgo real de coste alto en paginas grandes) por un metodo LINEAL linea a linea, sin
ese riesgo. Probado contra el caso real conocido (funciona igual) y contra una prueba
de estres de 5000 lineas (8ms). Añadido tambien cronometraje real (respuesta JSON +
logs de consola en cada paso) para tener datos concretos si algo vuelve a fallar, en
vez de tener que adivinar otra vez.

## [0.28.1] - 2026-09-17 (sesion 21) - diagnostico para Murcia (0 destinos) + segundo intento de fix para Madrid

El usuario probo la separacion en 2 fases de la sesion anterior: Murcia dio "0
destinos" en la fase de analisis, y Madrid **seguia dando 504 incluso en la fase de
descarga sola**.

### Murcia: 0 destinos -- anadido diagnostico, no un fix a ciegas
Investigada la pagina real de Murcia por busqueda web: usa exactamente la misma
estructura ("País ESPAÑA · Aerolíneas · VOLOTEA...") que ya se arreglo para el problema
de tildes -- la URL y el patron deberian funcionar. Sin poder investigar mas sin
acceso de red propio a Aena, se añadio diagnostico real en vez de otro parche a
ciegas: `parseStoredPage()` ahora incluye, cuando encuentra sospechosamente pocos
destinos, un extracto de los primeros 400 caracteres de texto (sin etiquetas) de lo
que se descargo de verdad -- para saber si Aena esta devolviendo una pagina de bloqueo/
verificacion (que daria "200 OK" pero no el contenido real) o algo distinto,
directamente desde la respuesta del endpoint, sin depender de que esta sesion tenga
acceso de red a Aena (que no lo tiene, confirmado en la sesion anterior).

### Madrid: segundo intento de fix del timeout
Diagnostico revisado: el timeout anterior (8000ms) solo cubria la DESCARGA, no la
escritura posterior en la base de datos -- si Madrid tarda cerca de 8s en descargar Y
ademas hay que escribir varios MB de HTML en Postgres, el total seguia superando los
10s duros de Vercel, matando la funcion ANTES de que el propio codigo pudiera devolver
un error limpio (de ahi el 504 en bruto, sin JSON). Cambios en
`fetchAndStoreRawPage()`:
- Timeout de descarga reducido de 8000 a 6000ms, dejando mas margen.
- **Limpieza del HTML antes de guardar** (scripts, estilos, comentarios,
  header/footer/nav quitados): reduce el tamaño a escribir en base de datos, y de paso
  adelanta trabajo que la fase de analisis tendria que hacer de todas formas.
- **Toda la funcion (descarga + limpieza + escritura), no solo la descarga, envuelta
  en un unico limite duro de 9000ms** -- deja 1s de margen bajo el limite de Vercel
  para que el codigo pueda devolver un error diagnosticable en vez de que Vercel mate
  la funcion en crudo.

### Aviso honesto
Si Madrid sigue fallando tras este segundo intento, seria una señal fuerte de que el
cuello de botella real es el propio TIEMPO DE RESPUESTA de Aena para esa pagina
(genuinamente lenta, o un "tarpit" anti-bot deliberado) y no algo que se pueda arreglar
solo optimizando el codigo de este lado -- en ese caso, el siguiente paso razonable
seria investigar un servicio de terceros que haga la descarga por nosotros.

## [0.28.0] - 2026-09-17 (sesion 20) - FIX real: sincronizacion de Aena separada en 2 fases (504 confirmado)

El usuario disparo el cron de Madrid a mano y obtuvo un error real y concreto: `504
FUNCTION_INVOCATION_TIMEOUT`, "Task timed out after 10 seconds" -- confirmando que el
fix anterior (subir el timeout de 5000 a 8000ms) no era suficiente. Investigado: el
limite de 10s de funcion en el plan Hobby de Vercel es un techo DURO, no se puede subir
de ninguna forma en ese plan (confirmado contra la documentacion oficial de Vercel).

### Diagnostico
Una sola invocacion tenia que DESCARGAR la pagina de Aena (mas grande para Madrid, 226
destinos) Y analizarla Y escribir en la base de datos, todo dentro del mismo
presupuesto de 10s. Aumentar el timeout de descarga (sesion 12) dejaba menos margen
para el resto, y en la practica seguia sin caber.

### Corregido: separacion real en 2 fases, cada una con sus propios 10s completos
- **`lib/aena-sync.ts`**: nuevas funciones `fetchAndStoreRawPage()` (SOLO descarga y
  guarda el HTML en bruto, sin analizar nada) y `parseStoredPage()` (SOLO lee el HTML
  ya guardado y lo analiza -- trabajo de CPU puro, sin red de por medio, mucho mas
  rapido). La funcion original que hacia ambas cosas juntas se mantiene por
  compatibilidad (pruebas locales), pero los crons reales ya no la usan.
- **Tabla nueva `aena_raw_pages`**: guarda el HTML descargado en la fase 1 para que la
  fase 2 lo lea despues, sin volver a descargar nada.
- **`/api/cron/refresh-aena/[origin]`** (modificado): ahora es SOLO la fase 1
  (descarga).
- **`/api/cron/parse-aena/[origin]`** (nuevo): SOLO la fase 2 (analisis + guardado en
  `aena_destinations`).
- **`vercel.json`**: 4 crons nuevos de analisis, programados 1 HORA despues de los de
  descarga (05:xx vs 04:xx) -- no 5-10 minutos, para garantizar el orden sin depender
  de la precision "en algun momento dentro de la hora" que tiene el plan Hobby de
  Vercel para sus crons. Investigado y confirmado que el limite de crons por proyecto
  en Hobby subio a 100 en enero de 2026 (antes eran solo 2) -- asi que anadir 4 crons
  mas no tiene ningun coste ni riesgo de limite.

### Investigado pero sin resultado util (transparencia)
Se intento reproducir el 403/lentitud directamente contra Aena desde el entorno de
esta sesion, con varias combinaciones de cabeceras -- la IP de este entorno esta
bloqueada por completo por Aena (403 incluso en la portada y en Alicante, que funciona
bien en produccion), asi que no representa lo que le pasa realmente a la IP de Vercel.
No se pudo confirmar empiricamente la causa exacta de la lentitud de Aena para Madrid
(pagina genuinamente pesada, o un posible "tarpit" anti-bot deliberado), pero el fix de
separar en 2 fases no depende de conocer esa causa -- resuelve el problema real
(presupuesto de tiempo compartido insuficiente) sea cual sea el motivo de fondo.

### Verificado
`npx tsc --noEmit` y `npm run build` limpios. `next start` + `curl` confirmando que
ambos endpoints nuevos responden con errores controlados y con el campo `phase`
identificando cual de las 2 fases fallo.

## [0.27.1] - 2026-09-17 (sesion 19) - FIX real: el scraper de Aena no reconocia tildes reales ("País")

El usuario reporto que Madrid y Murcia seguian en 0 destinos pese a los fixes
anteriores (ruta de URL de Murcia, timeout de Madrid). Investigado de nuevo por
busqueda web, esta vez contra el texto real devuelto por la pagina de Madrid.

### Encontrado (bug real, credible como causa de fondo)
La pagina real de Aena para Madrid devuelve literalmente "... (LCG) País ESPAÑA ·
Aerolíneas · IBERIA..." -- con el caracter UTF-8 real "í" (no una entidad HTML como
`&iacute;`). El patron de `lib/aena-sync.ts` esperaba "Pais"/"Aerolineas" en ASCII
puro (`Pa[i]s`, donde `[i]` es solo una letra "i" normal, nunca "í") y solo convertia a
ASCII una lista fija de ENTIDADES HTML concretas (`&iacute;` etc.) -- nunca el
caracter UTF-8 literal. Si la plantilla de la pagina de Madrid/Murcia sirve el acento
como caracter real (mientras que la de Alicante, mas antigua o distinta, podria
servirlo como entidad), esto explica EXACTAMENTE el patron visto: Alicante funciona,
Madrid y Murcia dan 0 -- no por falta de destinos ni por el timeout, sino porque el
patron nunca reconocia ninguna fila en esas 2 paginas.

### Corregido
En vez de añadir mas entidades sueltas a la lista (un parche fragil, por caracter),
se aplica `stripAccents()` (ya existente, antes solo se usaba para limpiar la salida)
al TEXTO ENTERO antes de analizar el patron -- asi da igual si Aena sirve el acento
como entidad HTML o como caracter UTF-8 literal, en esta pagina o en cualquier otra
futura. Probado con un caso simulado que reproduce el texto real encontrado ("País",
"Aerolíneas" con tildes UTF-8 literales): el analizador ahora los reconoce
correctamente.

## [0.27.0] - 2026-09-17 (sesion 18) - circuito de varias ciudades

A peticion del usuario, inspirado en Kiwi Nomad: planear un viaje por varias ciudades
seguidas (ej. Alicante → Cracovia → Viena → Alicante), cada tramo un vuelo directo
independiente.

### Anadido
- **`lib/circuit-search.ts`**: dado un origen y una lista de tramos, busca cada uno
  como una peticion de SOLO IDA independiente a Ignav (una fecha concreta, sin rango),
  usando el mismo motor de siempre (`searchOneWay`). Limite duro de 5 tramos por
  circuito (`MAX_CIRCUIT_LEGS`), para que el coste maximo de un circuito completo sea
  predecible (1 peticion real por tramo). Cada precio encontrado se registra en
  `price_history`, igual que las busquedas normales.
- **`/api/circuit-search`**: comprueba antes de buscar si queda cuota suficiente para
  todos los tramos (usando el contador ya existente), y avisa en vez de gastarla a
  medias.
- **`components/CircuitPlanner.tsx`**: nueva seccion colapsable en el formulario
  principal para construir el circuito (origen + tramos con destino y fecha cada uno,
  con opcion de volver al origen al final) y ver los resultados por tramo mas el
  total.

### Aviso importante (limitacion real, explicada tambien en la propia interfaz)
Solo el primer y el ultimo tramo (desde/hacia el origen español elegido) se pueden
verificar de antemano contra datos reales de Aena, igual que en el resto de la app.
Los tramos INTERMEDIOS (entre 2 ciudades que no son el origen, ej. Cracovia → Viena)
no tienen ninguna fuente de datos que confirme si existe vuelo directo -- Aena solo
publica rutas desde aeropuertos españoles. Esos tramos se buscan directamente sin
verificacion previa; si no hay vuelo directo, el tramo sale marcado en rojo con un
aviso claro, en vez de fallar en silencio o dar un total incorrecto.

## [0.26.0] - 2026-09-17 (sesion 17) - pastilla de duracion en destino

A peticion del usuario: cada resultado de vuelo ahora muestra una pastilla con los
dias y horas en destino (desde que aterrizas hasta que sale el vuelo de vuelta),
calculado a partir de `outbound.arrival_at` e `inbound.departure_at` (datos que ya
tenia cada resultado, sin ninguna peticion nueva). Formato "Xd Yh" (o solo "Xh" si es
menos de un dia); tooltip con las horas exactas de llegada y salida. Anadida tambien
en la vista compacta/lista, integrada en la linea de fechas para no romper el diseño
denso de esa vista.

## [0.25.1] - 2026-09-17 (sesion 16) - FIX: regresion propia, "Sorprendeme" seguia proponiendo ciudades descartadas

El usuario reporto que, con ciudades excluidas, "Sorprendeme" las seguia proponiendo.

### Corregido (regresion introducida en la sesion anterior, no reportada hasta ahora)
En la sesion anterior, `filteredRealDestinations` dejo de quitar las ciudades
descartadas de la lista (a proposito, para poder mostrarlas en rojo/tachadas en vez de
ocultarlas del todo) -- pero `handleSurpriseMe` seguia usando esa misma variable
asumiendo que ya venia sin las descartadas, como hacia antes. Al dejar de filtrarlas
ahi, "Sorprendeme" volvio a poder proponerlas. Añadido el filtro de `excludeIatas`
explicitamente en `handleSurpriseMe`, junto al de destinos visitados que ya tenia.
Tambien corregido, de paso, el contador "N vuelos directos reales" del titulo de la
seccion de destinos, que por el mismo motivo estaba contando las descartadas como si
fueran elegibles.

## [0.25.0] - 2026-09-17 (sesion 15) - FIX real: "Ciudades a descartar" no funcionaba con nombres de ciudad

El usuario reporto que escribiendo "Berlín" (con tilde, puesta por el autocorrector
del iPhone) en "Ciudades a descartar", Berlín seguia apareciendo en destinos.

### Corregido (bug real, no solo el problema de la tilde)
El campo se llama "Ciudades a descartar" pero por dentro SOLO comparaba contra codigos
IATA de 3 letras exactos (`d.dest_iata`) -- el propio placeholder decia "Ej: LHR, CDG,
FCO". Escribir un nombre de ciudad como "Berlin" (con o sin tilde, daba igual) nunca
podia coincidir con un codigo de aeropuerto como "TXL" o "BER" -- el filtro no hacia
nada en absoluto para nombres de ciudad, solo para codigos IATA exactos.

### Anadido
- **El campo ahora acepta nombre de ciudad (con o sin tildes) O codigo IATA**,
  indistintamente -- normaliza el texto (quita tildes, minusculas) antes de comparar,
  asi que "Berlin", "Berlín" o "BERLIN" dan el mismo resultado.
- **Los destinos descartados ya no desaparecen de la lista -- se quedan visibles,
  en rojo, tachados y desactivados**, con un aviso al pasar el cursor/dedo. Antes
  desaparecian del todo, lo que parecia un fallo de carga en vez de un filtro
  aplicado a proposito.
- **Si un destino ya seleccionado pasa a estar descartado, se quita automaticamente
  de la seleccion** (antes podia quedar "fantasma": desactivado en la lista pero
  seleccionado por dentro, y por tanto incluido en la busqueda real).
- **El campo ahora se recuerda entre sesiones** (`lib/travel-profile.ts`, campo nuevo
  `excludeCitiesText`), igual que origenes/pasajeros -- se mantiene hasta que el
  usuario lo vacie a mano.

## [0.24.0] - 2026-09-17 (sesion 14) - Wikipedia y destinos visitados, mas visibles

El usuario reporto no encontrar 2 funciones que ya estaban implementadas (destinos
visitados, resumen de Wikipedia) -- se comprobo que seguian en el codigo intactas, el
problema real era que estaban demasiado escondidas dentro de desplegables anidados.

### Cambiado
- **Resumen de Wikipedia y ficha de pais, sacados del desplegable "Mas detalles del
  destino"**: antes habia que encontrar la tarjeta de resultado Y ADEMAS abrir ese
  desplegable para verlo -- ahora aparece siempre visible en la tarjeta, sin tocar
  nada (se sigue cargando solo, sin boton). Lo que sigue dentro del desplegable
  (CO2, clima, tipo de cambio, grafico de precio historico) es informacion mas de
  detalle, tiene sentido que siga opcional.
- **Destinos visitados, con su propia seccion en el panel de herramientas**: antes
  solo se podian gestionar entrando en "Ideas de destino" y viendo las tarjetas
  atenuadas -- ahora hay una seccion "Destinos marcados como visitados (N)" en el
  panel de herramientas, visible en cuanto hay alguno marcado, con boton para
  quitarlos directamente.
- `HelpModal.tsx`: añadido un tema dedicado a ambas cosas, que no tenian ninguno
  propio hasta ahora.

## [0.23.0] - 2026-09-17 (sesion 13) - Sorpréndeme rediseñado en 2 fases, FIX destinos inventados por la IA, orden de campos

Feedback de la esposa del usuario tras probar la app.

### Cambiado
- **"Sorpréndeme" rediseñado como flujo en 2 fases** (`lib/ai-surprise.ts`,
  `handleSurpriseMe`/`handlePickSurpriseCandidate` en `app/page.tsx`): antes elegia
  EXACTAMENTE el numero de destinos que cabian en el limite de combinaciones (1-2 con
  un solo origen) y lanzaba una busqueda real de inmediato -- decepcionante frente al
  "a cualquier parte" de Skyscanner. Ahora, fase 1 (gratis, sin gastar cuota de Ignav):
  la IA propone hasta 6 ideas de destino DISTINTAS con una razon breve cada una,
  mostradas como tarjetas. Fase 2: el usuario elige UNA, y solo entonces se lanza la
  busqueda real de Ignav para esa ruta concreta.
- **Adultos/Niños movidos a antes del calendario** de fechas, orden mas logico
  (primero cuantos viajais, luego cuando).

### Corregido (bug real: la IA sugeria destinos sin vuelo directo)
La esposa del usuario probo la busqueda en lenguaje natural con "viaje para 3 personas
desde Alicante en tales fechas con mercadillo navideño" y la IA propuso 2 destinos en
Alemania sin vuelo directo real desde Alicante -- la busqueda no encontraba nada porque
esas rutas no existen. Causa raiz: el esquema JSON de `lib/ai-parse.ts` solo obliga a
que `destinationIatas` sea un array de textos, NUNCA a que esos textos pertenezcan a la
lista de destinos reales que se le pasa en el prompt -- un modelo puede ignorar esa
instruccion aunque este escrita claramente. `lib/ai-surprise.ts` YA tenia esta misma
red de seguridad (un filtro despues de la respuesta); a `ai-parse.ts` le faltaba.
Añadido el mismo filtro: cualquier destino que la IA proponga fuera de la lista real se
descarta automaticamente, con un aviso visible explicando que se ha descartado y por
que.

## [0.22.0] - 2026-09-17 (sesion 12) - FIX real: Madrid y Murcia con 0 destinos por bugs de scraping, no por falta de datos

El usuario reporto que Madrid y Murcia daban 0 destinos (deberian tener MAS que
Alicante, no menos -- Madrid es el aeropuerto mas grande de España) y pidio "anadir
los aeropuertos que falten". Antes de tocar nada se investigo la causa real: la app
nunca ha usado listas de destinos curadas a mano (se eliminaron por completo en una
sesion muy anterior, PR #22, precisamente porque quedaban desactualizadas) -- anadir
aeropuertos a mano habria sido un paso atras real, no un arreglo. Investigado en su
lugar por que el scraping automatico de Aena fallaba para esos 2 origenes.

### Corregido (2 bugs reales encontrados por busqueda web contra la pagina real de Aena)
- **Murcia (RMU): ruta de URL mal escrita.** `lib/aena-sync.ts` tenia
  `aerolineas-y-destinos/destinos-DEL-aeropuerto.html` -- la pagina real de Aena es
  `aerolineas-y-destinos/destinos-aeropuerto.html` (sin "del"), igual que Alicante y
  Madrid. Con la ruta mal escrita, Aena devolvia 404 y el origen nunca tuvo NINGUN
  destino sincronizado desde que existe esta funcionalidad.
- **Madrid (MAD): timeout de peticion insuficiente para el tamano real de su
  pagina.** Madrid-Barajas tiene 226 destinos (frente a los ~110 de Alicante) -- una
  pagina mucho mas grande de descargar y analizar. El timeout de la peticion HTTP era
  de 5000ms; subido a 8000ms (`app/api/cron/refresh-aena/[origin]/route.ts`), dejando
  margen dentro del limite duro de 10s de la funcion en el plan Hobby de Vercel (que no
  se puede subir).
- Valencia (VLC), que daba 60 de sus ~103 destinos reales, usa una ruta de URL
  correcta (verificado) -- lo mas probable es que sea el mismo problema de timeout
  (pagina grande, aunque menor que Madrid), que el aumento a 8000ms deberia mejorar
  tambien.

### Aviso importante
Estos 2 fixes solo se aplican la PROXIMA VEZ que se ejecute el cron de sincronizacion
de cada origen (`refresh-aena/MAD` a las 04:05, `refresh-aena/RMU` a las 04:15, hora de
España, segun `vercel.json`) -- no rellenan datos retroactivamente. El usuario vera
los destinos correctos de Madrid y Murcia a partir de mañana por la mañana, o puede
disparar el cron manualmente el mismo si quiere verlo antes (necesita el valor de
`AENA_SYNC_SECRET`, que esta sesion no conoce).

## [0.21.0] - 2026-09-17 (sesion 11) - quitado panel de horarios duplicado, medidas de equipaje, "Explorar" renombrado y explicado

A peticion del usuario tras usar la app: 3 mejoras de claridad.

### Quitado
- **Panel "Horarios" duplicado en "Filtros y ajustes"**: desde la sesion 8, cada dia
  del calendario ya tiene su propia franja horaria -- tener ADEMAS un panel general
  con los mismos 4 campos (ida/vuelta, no antes/no despues) resultaba confuso, sin
  quedar claro cual mandaba. El valor general se sigue usando internamente como
  respaldo (por ejemplo cuando la IA interpreta una frase tipo "salida despues de las
  18h"), pero ahora, en vez de vivir solo en un panel aparte, se refleja
  automaticamente en cada dia seleccionado que no tenga ya su propia hora -- asi el
  calendario es el UNICO sitio donde se ve y se edita la hora, sin perder la
  informacion que pueda venir de la IA.

### Anadido
- **Medidas y peso del equipaje de mano gratis, por aerolinea**
  (`lib/airline-baggage-notes.ts`): ademas del aviso de "no incluye maleta grande" que
  ya habia, ahora se muestran las medidas exactas del bolso que SI va gratis (ej.
  Ryanair 40x20x25cm sin limite de peso indicado, Wizz Air 40x30x20cm hasta 10kg,
  EasyJet 45x36x20cm, Vueling 40x30x20cm) -- justo lo que hace falta comprobar antes
  de facturar por error en la puerta de embarque. Marcado como aproximado, con aviso
  de comprobar antes de viajar (son cifras que cambian con el tiempo).

### Cambiado
- **"Explorar destinos" renombrado y explicado mucho mas claro**: el usuario reporto
  que no entendia que era ("veo un desplegable de aeropuertos y un listado, pero no se
  que son"). Renombrado a "Ideas de destino (gratis, no es una busqueda real)", con una
  frase en negrita al principio dejando claro que NO busca vuelos de verdad, cada
  precio marcado explicitamente como "(orientativo)", y el boton de cada tarjeta
  renombrado de "Buscar este" a "Buscar vuelos reales" para que quede claro que ESE es
  el paso que lanza la busqueda de verdad.

## [0.20.0] - 2026-09-17 (sesion 10) - calendario gratis, IA con clima real, ficha de pais, Wikipedia, y 3 ajustes de usabilidad

A peticion del usuario: 5 mejoras gratuitas de golpe, mas 3 ajustes reportados tras
usar la app.

### Anadido
- **Calendario de precios GRATIS previo** (`lib/travelpayouts.ts::getFreePriceCalendar`,
  `/api/free-calendar`, `components/FreeCalendarPreview.tsx`): un mes completo de
  precios orientativos de Travelpayouts, sin gastar cuota de Ignav, para decidir que
  dias merece la pena consultar de verdad con el calendario real (que si cuesta 1
  peticion por dia). Aparece justo debajo del calendario real, en el panel de
  herramientas.
- **Consejo de la IA sobre el destino ahora usa el CLIMA REAL** (ya calculado por
  Open-Meteo para esa misma busqueda) en vez de que la IA lo adivine solo por el mes --
  mismo coste de tokens, consejo mas preciso. Tambien tiene en cuenta cuantos niños
  viajan para dar un angulo familiar cuando aplica.
- **Ficha rapida de pais gratis** (`lib/country-info.ts`, REST Countries, sin clave):
  idioma, capital, lado de conduccion, y una nota fija de tipo de enchufe para los
  paises donde cambia respecto a España. Se carga sola, sin boton, porque es gratis e
  instantanea (a diferencia del consejo de la IA, que si gasta tokens).
- **Resumen de Wikipedia** (`lib/wikipedia.ts`, gratis, sin clave): extracto sobre el
  destino, disponible incluso sin `OPENAI_API_KEY` configurada.

### Cambiado
- **Fotos de las tarjetas de resultado, mucho mas pequeñas**: antes eran un banner de
  ancho completo y 144px de alto en movil (con muchos resultados, mucho scroll
  innecesario) -- ahora son una miniatura pequeña siempre lateral, en movil y
  escritorio.
- **"Sorpréndeme" ahora indica lo minimo que hace falta** para usarlo (un origen
  elegido; las fechas/horas/pasajeros usan lo que haya puesto en el formulario, con
  valores por defecto si no se ha tocado nada).
- **Indicado que se pueden elegir varios orígenes y varios destinos** (no solo uno),
  en los propios títulos de esas secciones -- no era evidente sin haberlo probado.
- **Explicado que es open-jaw con un ejemplo concreto** (Londres-Gatwick de ida,
  Londres-Stansted de vuelta) en vez de solo el nombre técnico entre paréntesis.
- `docs`/`HelpModal.tsx`: actualizado el primer tema de ayuda, que aun describia el
  antiguo modelo de "rango de fechas" (ya sustituido por el calendario de dias
  sueltos de la sesion anterior).

## [0.19.0] - 2026-09-17 (sesion 9) - detector de chollos, insignia de chollo, aviso de equipaje, calendario a 30 dias

A peticion del usuario ("empieza con el detector de chollos y luego con el resto"),
inspirado en Dollar Flight Club.

### Anadido
- **Detector de chollos** (`lib/deal-detector.ts`, tabla `detected_deals`): version
  realista adaptada a la cuota de Ignav -- DFC busca activamente en cientos de rutas
  con un equipo humano; aqui eso supondria gastar cuota real sin limite, asi que el
  detector es PASIVO: se apoya en los precios que la propia app ya registra
  (`price_history`) por el uso normal y las alertas guardadas, sin gastar ni una
  peticion extra. Si un precio recien visto (ultimas 24h) esta un 35% o mas por debajo
  del promedio historico de esa ruta (con al menos 5 observaciones previas), manda una
  notificacion push directa -- sin que haga falta tener una alerta guardada para esa
  ruta. Con deduplicacion para no avisar 2 veces del mismo chollo. Se ejecuta al final
  del cron de alertas existente (no se creo un cron nuevo, para no arriesgar el limite
  de crons del plan de Vercel).
- **Insignia "🔥 Chollo"** en las tarjetas de resultado: mismo umbral que el detector
  (35%+ por debajo del promedio historico de la ruta), calculado en el propio
  navegador reutilizando `priceTrend` (ya se calculaba antes), sin ninguna peticion
  nueva.
- **Aviso de politica de equipaje** (`lib/airline-baggage-notes.ts`): nota fija para
  aerolineas conocidas por cobrar aparte hasta la maleta de cabina grande (Ryanair,
  Wizz Air, EasyJet, Vueling, Volotea, Norwegian). Contenido editorial, sin API.

### Cambiado
- **Calendario de precios: de 14 a 30 dias como techo**, pero con limite DINAMICO segun
  la cuota restante de Ignav (`dynamicCalendarDaysLimit` en `lib/ignav-usage.ts`, mismo
  criterio que ya se aplicaba al limite de combinaciones): 30 con mucha cuota, bajando
  hasta 7 si queda poca.

### Corregido (proactivo, no reportado)
`lib/price-calendar.ts` tenia el mismo patron fragil de fechas que el bug real de la
sesion anterior (mezclar metodos de fecha locales con `toISOString()`, que trabaja en
UTC) -- aqui no llegaba a manifestarse porque Vercel corre en UTC por defecto, pero se
corrigio igualmente para no depender de esa asuncion implicita del entorno de
ejecucion.

## [0.18.0] - 2026-09-17 (sesion 8) - calendario propio, dias sueltos independientes, hora por dia

El usuario probo el selector "dia + flexibilidad" de la sesion anterior y reporto que
no funcionaba (tocar un dia no hacia nada). Pidio ademas un enfoque mas potente: dias
sueltos elegibles de forma independiente (no un rango simetrico obligatorio), con hora
concreta por cada dia, usando un calendario visual en vez del picker nativo. Una vez
funcionando, pidio quitar los inputs de rango de fecha en bruto.

### Corregido (bug real)
- **`applyFlexDay` calculaba mal la fecha por un problema de zona horaria**:
  `Date.prototype.toISOString()` convierte a UTC, y España en invierno es UTC+1 -- la
  medianoche local de un dia podia caer en las 23h UTC del dia anterior, desplazando la
  fecha. Combinado con 2 `<input type="date">` nativos controlando la MISMA variable de
  estado (el picker nuevo y el input de rango de siempre), el picker de rueda nativo de
  iOS se desincronizaba y parecia "no hacer caso" al tocar un dia.

### Cambiado
- **Sustituido el `<input type="date">` nativo por un calendario propio**
  (`components/DayPicker.tsx`), 100% controlado por React, sin pasar nunca por
  `toISOString()` ni depender de ningun picker nativo -- elimina la clase entera de bug
  de raiz, no solo el sintoma.
- **Dias sueltos, elegibles de forma independiente** (no un rango simetrico
  obligatorio): se puede marcar, por ejemplo, el dia 3 y el dia 6 sin necesidad de
  incluir el 4 y el 5. Maximo 5 dias por sentido (protege la cuota de Ignav, igual que
  antes).
- **Hora especifica por cada dia elegido** (`components/DayHoursList.tsx`): cada dia
  seleccionado tiene su propia franja horaria opcional (desde-hasta), independiente de
  los demas dias -- si se deja vacia, usa la franja general del panel de "Horarios".
- **Quitados los inputs "Ida desde/hasta" y "Vuelta desde/hasta" en bruto**: el
  calendario nuevo es ahora la unica forma de elegir fechas en el formulario principal.
- Compatibilidad mantenida con IA, enlaces para compartir, historial y alertas: siguen
  guardando/restaurando un rango (`outboundDateFrom`/`To`), que ahora se traduce
  automaticamente a la lista de dias sueltos correspondiente al restaurarlo.
- Backend (`lib/live-engine.ts`): nuevos campos `outboundDates`/`inboundDates` (lista
  explicita de dias, no necesariamente contigua) y `outboundDayHours`/`inboundDayHours`
  (franja horaria por dia concreto), con fallback al comportamiento de rango anterior
  para quien siga sin mandarlos (cron de alertas).

## [0.17.0] - 2026-09-17 (sesion 7) - orden por defecto, destinos seleccionados visibles, dia+flexibilidad, franja horaria completa

### Corregido
- **Orden por defecto de los resultados cambiado a precio** (antes "hora de salida del
  hotel"), a peticion explicita del usuario.
- **Destinos seleccionados ahora se ven sin desplazarse por el listado completo**:
  aparecen como chips justo encima del buscador de destinos, con boton para quitarlos
  directamente.

### Investigado (sin cambio de codigo -- explicado honestamente)
El usuario reporto un vuelo que "consta disponible" pero no salia en los resultados,
sospechando del orden de seleccion de aeropuertos. Revisada la logica completa de
`lib/live-engine.ts` (bucle origen x destino, agrupacion por ciudad, filtros): ningun
punto del codigo depende del orden en que se seleccionan aeropuertos -- todas las
combinaciones se buscan en paralelo, de forma simetrica. La explicacion mas probable es
que Ignav (proveedor de datos externo) simplemente no tenga ese vuelo concreto en su
inventario -- no indexa el 100% de las aerolineas, es una limitacion real de depender
de un unico proveedor, no un bug de esta app.

### Anadido
- **Selector visual "dia + flexibilidad" estilo Kiwi**: eliges un dia de ida y uno de
  vuelta, y un boton de flexibilidad (exacto / ±1 dia / ±2 dias) calcula
  automaticamente el rango de fechas por ti. Los inputs de rango de fecha originales se
  mantienen debajo, editables a mano si se prefiere un rango no simetrico.
- **Franja horaria completa** (no solo "no antes de"): añadido "no despues de" para
  ida y vuelta, usando `latest_hour` de la API de Ignav (el tipo ya lo soportaba, pero
  no estaba expuesto en ningun sitio de la interfaz).

## [0.16.0] - 2026-09-17 (sesion 6) - 8 mejoras de golpe: push, historial visual, offline, IA de destino y mas

A peticion explicita del usuario ("implanta todo lo sugerido a excepcion de accesibilidad").

### Anadido
- **Notificaciones push reales** (`lib/push.ts`, `web-push`, service worker en
  `public/sw.js`): botón en el panel de herramientas para activarlas en el dispositivo;
  el cron de alertas las manda junto al email cuando encuentra una bajada de precio.
  Requiere generar claves VAPID y configurarlas en Vercel (ver `docs/STATUS.md`).
  **Aviso importante para iPhone**: solo funcionan si la app esta añadida a la pantalla
  de inicio, nunca en una pestaña normal de Safari -- el propio boton lo detecta y avisa.
- **"Ya he estado aquí"** (`lib/visited-destinations.ts`): marca destinos visitados en
  el propio telefono; se excluyen de Sorprendeme y aparecen atenuados en Explorar (con
  opcion de mostrarlos/ocultarlos).
- **Gráfico de precio histórico** por ruta (`components/PriceHistoryChart.tsx`, SVG
  simple sin librerias nuevas) + endpoint `/api/price-history`, dentro de "Más detalles
  del destino" en cada tarjeta.
- **Consejo de la IA sobre el destino** (`lib/ai-destination-tips.ts`,
  `/api/ai-destination-tips`): que ver y que llevar en la maleta, bajo demanda (boton,
  no automatico) para controlar el gasto de tokens.
- **Modo sin conexión básico** (`lib/offline-cache.ts`): si una busqueda falla por
  perdida de red, se muestra la ultima busqueda guardada en el telefono con un aviso
  claro. No es una PWA offline completa (no cachea assets), solo el ultimo resultado.
- **Precio por persona / total**: interruptor en los resultados junto al de vista
  Tarjetas/Lista.
- **Botón directo de WhatsApp** para compartir la busqueda.

### Cambiado
- **Calendario de precios como mapa de calor real**: gradiente de color verde (barato)
  a rojo (caro) segun el precio de cada dia, en vez de solo destacar el mas barato.

### Aviso
Notificaciones push, IA de destino y las 3 APIs de la sesion anterior siguen sin poder
verificarse contra sus servicios reales desde este entorno de trabajo.

## [0.15.0] - 2026-09-17 (sesion 5) - CO2, clima, tipo de cambio, festivos y "sale mas barato otro dia"

A peticion del usuario ("implementa las 3 mejoras y las 3 api"): las 3 mejoras
propuestas (dia mas barato, CO2, festivos) mas 3 APIs gratuitas (Open-Meteo, Frankfurter,
Nager.Date) -- 5 piezas distintas en total, ya que festivos y Nager.Date eran la misma.

### Anadido
- **"Sale mas barato otro dia"**: no gasta ninguna peticion nueva -- la propia busqueda
  ya prueba varias fechas dentro del rango elegido, asi que se comparan los resultados
  YA obtenidos entre si para la misma ruta. Solo avisa si el ahorro es de 10€ o mas.
- **CO2 estimado** (`lib/co2.ts`): sin ninguna API -- distancia real (formula de
  Haversine) entre coordenadas de aeropuertos x un factor de emision estandar (100 g/km/
  pasajero, cifra intermedia entre las que usan calculadoras publicas conocidas).
  Etiquetado siempre como estimacion, no medicion certificada.
- **Clima habitual en destino** (`lib/weather.ts`, Open-Meteo, gratis sin clave):
  promedio de los ultimos 3 anos para las MISMAS fechas de calendario -- se uso el
  archivo historico en vez del pronostico normal porque los viajes de esta app se
  planean con semanas/meses de antelacion (un pronostico solo cubre ~16 dias vista).
  Atribucion visible (CC BY 4.0, exigida por la licencia de los datos).
- **Tipo de cambio** (`lib/exchange-rate.ts`, Frankfurter.app, gratis sin clave, datos
  del BCE): solo se muestra para destinos fuera de la zona euro.
- **Aviso de festivos** (`lib/holidays.ts`, Nager.Date, gratis sin clave): si las fechas
  de ida/vuelta coinciden con un festivo publico en España o en el destino.
- **`lib/data/airports-geo.json`** (nuevo, ~7900 aeropuertos): dataset abierto
  (github.com/mwgg/Airports) descargado y filtrado en esta sesion, con coordenadas y
  pais ISO-2 -- Aena no da esa informacion, asi que hacia falta para CO2, clima y tipo
  de cambio. Solo se usa en el servidor (no aumenta el peso del bundle del cliente,
  verificado: First Load JS igual que antes).
- Los 3 topics nuevos anadidos a la ayuda dentro de la app (boton "?").

### Corregido (proactivo, antes de desplegar)
- El enriquecimiento nuevo se ejecuta DESPUES de la busqueda real a Ignav, sumando
  tiempo -- con el limite de funcion de Vercel (10s en el plan Hobby) esto podia hacer
  fallar busquedas que hoy funcionan bien, solo por datos que son un plus. Se redujeron
  los timeouts individuales de las 3 APIs nuevas (8s/6s -> 4s/3s) y se anadio un tope
  duro global de 4.5s sobre todo el bloque de enriquecimiento: si no da tiempo, las
  parejas origen-destino que no hayan terminado se quedan sin esos campos (todos
  opcionales), pero la busqueda en si nunca se ve afectada.

### Aviso
Open-Meteo, Frankfurter.app y Nager.Date no se han podido verificar contra sus APIs
reales en esta sesion (sin acceso de red desde este entorno) -- escritas contra su
documentacion oficial. Probar con una busqueda real y revisar si el formato de
respuesta encaja.

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
