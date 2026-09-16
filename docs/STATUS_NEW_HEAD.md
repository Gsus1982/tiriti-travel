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

**En produccion (rama `main`) ahora mismo**: v0.11.3. Incluye TODO: IA real (OpenAI,
las 3 funciones: interpretar/Sorprendeme/recomendar), destinos curados eliminados,
comparador de vuelos, vista lista, alertas de precio por email real (Resend) con
historial y borrado, y el fix del recorte no-determinista de destinos en `ai-parse.ts`.

**No hay ningun PR abierto pendiente de mergear.** Toda esta sesion se trabajo con
commits directos a `main` (sin pasar por rama intermedia), tras encontrar que la rama
`revisar-por-claude` (creada para agrupar las mejoras) quedaba con conflictos reales
cada vez que se intentaba mergear por encima del fix de origenes -- se opto por
reconstruir el contenido directamente sobre `main` ya arreglado, verificando cada
archivo contra el contenido real pegado por el usuario antes de sobrescribirlo (nunca
a ciegas por fragmentos de busqueda). La rama `revisar-por-claude` quedo obsoleta y se
borro manualmente por el usuario (esta sesion no tiene una herramienta para borrar
ramas de GitHub, solo crear/actualizar/mergear).

**`OPENAI_API_KEY` y las 3 variables de Resend (`RESEND_API_KEY`, `RESEND_FROM_EMAIL`)
ya estan configuradas en Vercel.**

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
