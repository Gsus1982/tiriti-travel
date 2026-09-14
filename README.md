# TiritiTravel ❄️

Metabuscador **personal** de vuelos directos (uso exclusivo de Jesús), pensado para sustituir búsquedas manuales en Skyscanner/Kayak/Kiwi para viajes concretos, con filtros y lógica de negocio a medida (open-jaw en destino, multibúsqueda de orígenes/destinos, rango de fechas, ranking por hora de salida del hotel).

> Repositorio **privado**. Proyecto personal, sin fines comerciales ni redistribución.

---

## Indice

1. [Que hace la app](#que-hace-la-app)
2. [Arquitectura y stack tecnologico](#arquitectura-y-stack-tecnologico)
3. [Modelo de datos](#modelo-de-datos)
4. [Motores de busqueda](#motores-de-busqueda)
5. [Buscador en lenguaje natural (beta)](#buscador-en-lenguaje-natural-beta)
6. [Integracion con Ignav (datos reales)](#integracion-con-ignav-datos-reales)
7. [Como replicar el proyecto desde cero](#como-replicar-el-proyecto-desde-cero)
8. [Desarrollo local](#desarrollo-local)
9. [Despliegue en Vercel](#despliegue-en-vercel)
10. [Variables de entorno](#variables-de-entorno)
11. [Limitaciones conocidas](#limitaciones-conocidas)
12. [Historial de cambios](#historial-de-cambios)

---

## Que hace la app

- Busqueda de vuelos **siempre directos** (sin escalas) en ambos tramos, ida y vuelta — condicion no negociable del proyecto, verificada tanto por filtro de API como por revision manual de segmentos.
- **Multibusqueda**: puedes seleccionar varios aeropuertos de origen (ALC/MAD/VLC/RMU) y varios destinos a la vez; el motor calcula TODAS las combinaciones origen x destino y las mezcla en una sola tabla comparable, ordenada por el criterio que elijas.
- **Rango de fechas**: en vez de una fecha fija, defines un rango "desde/hasta" tanto para la ida como para la vuelta; el motor explora todas las fechas del rango (maximo 5 dias por tramo en modo Ignav, para proteger la cuota gratuita).
- **Open-jaw en destino**: si un destino tiene varios aeropuertos/ciudades del mismo pais (p. ej. Polonia: Cracovia/Wroclaw/Varsovia-Chopin/Varsovia-Modlin), el motor evalua automaticamente todas las combinaciones de entrada/salida y muestra el traslado interno estimado cuando aplica open-jaw.
- **Datos en vivo (Ignav)**: modo alternativo al mock, que llama a la API real de Ignav para precios y horarios actualizados, con reintentos automaticos ante errores temporales (424/429/502/503/504) y enlaces de reserva reales.
- **Buscador en lenguaje natural (beta)**: cuadro de texto donde describes la busqueda en una frase; un parser basado en reglas interpreta origen(es), destino, fechas y horas, y precarga el formulario para que lo revises antes de buscar.
- Filtros: hora minima de salida (ida/vuelta), equipaje de mano incluido, aerolineas incluidas/excluidas, precio maximo total.
- Calculo automatico de la **hora de salida del hotel** el dia de regreso: `hora del vuelo de vuelta - 2h de margen de aeropuerto - traslado hotel->aeropuerto`.
- Ranking configurable: por hora de salida del hotel (criterio decisivo por defecto), por precio total, o por duracion.

---

## Arquitectura y stack tecnologico

| Capa | Tecnologia | Motivo de la eleccion |
|---|---|---|
| Frontend + backend | **Next.js 14 (App Router) + TypeScript** | Un solo repositorio para UI y API routes; despliegue nativo en Vercel. |
| Estilos | **Tailwind CSS** | Desarrollo rapido de UI sin CSS a medida. |
| Base de datos | **Neon (Postgres serverless)** | Plan gratuito real (no sandbox), compatible con `@neondatabase/serverless` optimizado para Vercel Functions. |
| Datos en vivo | **Ignav Flight Prices API** | API de precios de vuelos en tiempo real con free tier real (1.000 peticiones), filtros nativos (stops, equipaje, horario) y enlaces de reserva. |
| Hosting / CI-CD | **Vercel** | Despliegue automatico en cada `push` a `main`. |
| Control de versiones | **GitHub** (repo privado) | Historial completo, automatizado via API. |

---

## Modelo de datos

Esquema aplicado en Neon (ver tambien [`scripts/schema.sql`](./scripts/schema.sql)):

```
destination_groups   -- Agrupaciones de destino (por pais), permiten open-jaw entre sus aeropuertos
airports              -- Aeropuertos de origen (Espana) y de destino, enlazados a un destination_group
legs                  -- Tramos de vuelo mock (para el modo "datos de ejemplo")
transfer_times        -- Tiempos/precios de traslado entre aeropuertos/ciudades del mismo grupo (open-jaw)
hotel_transfer        -- Tiempo estimado aeropuerto->centro por ciudad (calculo de hora de salida del hotel)
```

Grupos de destino actuales: Polonia (KRK/WRO/WAW/WMI), Riga, Estocolmo, Helsinki, Oslo, Atenas, Sofia, Belgrado.
Origenes actuales: Alicante (ALC), Madrid (MAD), Valencia (VLC), Murcia (RMU).

---

## Motores de busqueda

Hay dos motores paralelos con la MISMA logica de open-jaw, multibusqueda y ranking, pero fuentes de datos distintas:

### Motor mock (`lib/search-engine.ts`)

- Lee de la tabla `legs` de Neon (datos de ejemplo, `source = 'mock_seed_2026-09'`).
- Para cada combinacion origen x destino seleccionada, busca legs de ida/vuelta dentro del rango de fechas y aplica los mismos filtros que el motor live.
- Gratis e ilimitado (no consume cuota de ninguna API externa).

### Motor live (`lib/live-engine.ts`)

- Llama a la API de Ignav (`searchOneWay`) una vez por cada combinacion (aeropuerto de destino dentro del grupo) x (fecha dentro del rango) x (sentido ida/vuelta).
- Reintenta automaticamente hasta 2 veces con backoff ante errores 424/429/502/503/504 (`lib/ignav.ts`).
- Filtra doblemente los vuelos directos: por parametro `max_stops:0` en la API Y revisando que cada tramo tenga exactamente 1 segmento.
- Expone `warnings` en la respuesta con el motivo exacto de cualquier fallo de la API (nunca silencia errores como "0 resultados" sin explicacion).
- Limite de seguridad: maximo 5 dias por rango de fechas y maximo 6 combinaciones origen x destino por busqueda, para no agotar la cuota gratuita de Ignav.

### Logica de open-jaw y ranking (comun a ambos motores)

1. Se obtienen los aeropuertos del(los) `destination_group_id` seleccionado(s).
2. Se buscan tramos de ida y vuelta directos dentro de los rangos de fecha.
3. Se generan todas las combinaciones ida x vuelta; se marca `isOpenJaw = true` si el aeropuerto de llegada de la ida es distinto del aeropuerto de salida de la vuelta.
4. Si hay open-jaw, se consulta `transfer_times` para mostrar el traslado interno estimado.
5. Se calcula el precio total, la hora de salida del hotel, y se aplican los filtros de hora/equipaje/aerolinea/precio maximo.
6. Se mezclan los resultados de TODAS las combinaciones origen x destino seleccionadas y se ordenan juntos por el criterio elegido.

---

## Buscador en lenguaje natural (beta)

Implementado en `lib/nlp-search.ts` (`parseSearchQuery`). Es un **parser basado en reglas** (regex + diccionario), no un LLM ni una IA generativa:

- Detecta aeropuertos de origen y destinos comparando el texto contra los nombres/paises ya cargados en la base de datos.
- Detecta numeros de dia ("el 4", "dia 5") y los combina con el mes/ano de referencia (tomado del formulario) para construir fechas completas.
- Detecta condiciones de hora ("despues de las Xh", "a partir de las Xh", "no antes de las Xh").
- **Limitacion conocida y documentada**: NO soporta logica condicional exacta del tipo "dia A si es despues de la hora X, si no dia B a partir de la hora Y". En ese caso, amplia el rango de fechas y aplica la hora MAS PERMISIVA, mostrando un aviso explicito para que el usuario revise o lance dos busquedas separadas (una por cada combinacion dia+hora) si necesita precision exacta.
- Si detecta un destino mencionado que no esta en la base de datos (p. ej. "Londres", "Paris"), lo indica explicitamente en vez de fallar en silencio.
- El resultado del parser SIEMPRE se muestra al usuario como una lista de avisos antes de lanzar la busqueda real; nunca busca automaticamente sin revision.

---

## Integracion con Ignav (datos reales)

- **Endpoint usado**: `POST https://ignav.com/api/fares/one-way`, autenticado con header `X-Api-Key`.
- **Autenticacion**: variable de entorno `IGNAV_API_KEY` (no se guarda en el repositorio; se configura en Vercel > Project Settings > Environment Variables).
- **Filtros nativos usados**: `max_stops: 0`, `min_carry_on_bags` (cuando se exige equipaje de mano), `airlines_include`/`airlines_exclude`, `departure_time_range.earliest_hour`, `market: 'ES'` (para precios en EUR).
- **Booking links**: `POST /api/booking-links` con el `ignav_id` de cada itinerario, para obtener enlaces de reserva reales por proveedor.
- **Cuota**: 1.000 peticiones gratuitas de por vida (no mensuales), luego 2 USD por cada 1.000. Cada busqueda multiplica: `aeropuertos_del_grupo x dias_del_rango x 2 (ida+vuelta) x combinaciones_origen_destino`.

---

## Como replicar el proyecto desde cero

### 1. Crear el repositorio GitHub

```bash
gh repo create tiriti-travel --private --add-readme
```

### 2. Crear el proyecto Neon (base de datos)

1. Crear cuenta/proyecto en [Neon](https://neon.tech) (plan gratuito).
2. Ejecutar el esquema en [`scripts/schema.sql`](./scripts/schema.sql).
3. Poblar `destination_groups`, `airports`, `hotel_transfer`, `transfer_times` (ver historial de commits para los inserts exactos usados).
4. Obtener la cadena de conexion desde el dashboard de Neon (boton **Connect**), NO copiarla de un chat o documento (riesgo de caracteres invisibles al copiar/pegar).

### 3. Crear cuenta en Ignav (opcional, para datos reales)

1. Registrarse en [ignav.com](https://ignav.com) (1.000 peticiones gratis, sin tarjeta).
2. Obtener la API key desde el dashboard.

### 4. Clonar y configurar el proyecto localmente

```bash
git clone https://github.com/<tu-usuario>/tiriti-travel.git
cd tiriti-travel
npm install
cp .env.example .env.local
# Edita .env.local: DATABASE_URL (Neon) e IGNAV_API_KEY (Ignav)
npm run dev
```

### 5. Crear el proyecto en Vercel enlazado al repositorio

1. Importar el repositorio en [vercel.com/new](https://vercel.com/new).
2. **Antes del primer deploy con exito**, anadir en `Project Settings > Environment Variables`:
   - `DATABASE_URL` (Production + Preview + Development)
   - `IGNAV_API_KEY` (Production + Preview + Development)
3. Lanzar/relanzar el deploy.

> Importante: si cambias variables de entorno DESPUES de un deploy existente, Vercel NO recoge el cambio automaticamente en el deployment ya desplegado; hace falta un nuevo deploy (push o redeploy manual) para que las funciones lean los valores actualizados.

### 6. Proteger el despliegue

Como es una app de uso exclusivamente personal, se recomienda mantener activada "Vercel Authentication" (SSO) en `Project Settings > Deployment Protection`, para que solo el propietario autenticado pueda acceder.

---

## Desarrollo local

```bash
npm install
npm run dev
# abrir http://localhost:3000
```

Requiere `DATABASE_URL` (y opcionalmente `IGNAV_API_KEY` para el modo en vivo) en `.env.local`.

---

## Despliegue en Vercel

- **Proyecto**: `tiriti-travel` (cuenta personal `gsus1982`).
- **Integracion**: Git nativa con `Gsus1982/tiriti-travel`, rama `main` = produccion.
- **Despliegue automatico**: cada `git push` a `main` dispara un nuevo build y deploy.
- **Protection**: Vercel Authentication (SSO) activada para todos los entornos.

---

## Variables de entorno

| Variable | Obligatoria | Descripcion |
|---|---|---|
| `DATABASE_URL` | Si | Cadena de conexion Postgres de Neon. |
| `IGNAV_API_KEY` | Solo para modo en vivo | Clave de la API de Ignav. Sin ella, el modo "Datos en vivo" devuelve un error claro; el modo mock sigue funcionando. |

Ver [`.env.example`](./.env.example).

---

## Limitaciones conocidas

- **Buscador en lenguaje natural**: es un parser de reglas, no una IA; no entiende matices ni logica condicional compleja ("dia A con hora X, si no dia B con hora Y"). Siempre revisar los avisos antes de lanzar la busqueda.
- **Datos mock**: precios y horarios de ejemplo, no verificados en vivo salvo que se use el modo Ignav.
- **Sin busqueda de hoteles**: fuera de alcance actual, decision explicita del usuario.
- **Sin autenticacion propia**: privacidad gestionada via Vercel Authentication (SSO), no login propio.
- **Open-jaw solo dentro de un `destination_group`**: no hay combinaciones entre paises distintos.
- **Origen sin flexibilidad por busqueda individual**: cada combinacion origen->destino usa el MISMO aeropuerto de origen en ida y vuelta (aunque la multibusqueda permite comparar varios origenes en paralelo).
- **Limite de combinaciones en modo Ignav**: maximo 6 combinaciones origen x destino y 5 dias por rango de fechas, para proteger la cuota gratuita.

---

## Historial de cambios

Ver [`CHANGELOG.md`](./CHANGELOG.md).
