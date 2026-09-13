# TiritiTravel ❄️

Metabuscador **personal** de vuelos directos, construido para uso exclusivo de Jesús, pensado como alternativa propia a Skyscanner/Kayak/Kiwi para viajes concretos, con filtros y lógica de negocio a medida (open-jaw en destino, ranking por hora de salida del hotel, etc.).

> Repositorio **privado**. Proyecto personal, sin fines comerciales ni redistribución.

---

## Índice

1. [Qué hace la app](#qué-hace-la-app)
2. [Arquitectura y stack tecnológico](#arquitectura-y-stack-tecnológico)
3. [Modelo de datos](#modelo-de-datos)
4. [Lógica de búsqueda (open-jaw, ranking, filtros)](#lógica-de-búsqueda-open-jaw-ranking-filtros)
5. [APIs externas: estado actual y plan de integración](#apis-externas-estado-actual-y-plan-de-integración)
6. [Cómo replicar el proyecto desde cero](#cómo-replicar-el-proyecto-desde-cero)
7. [Desarrollo local](#desarrollo-local)
8. [Despliegue en Vercel](#despliegue-en-vercel)
9. [Variables de entorno](#variables-de-entorno)
10. [Limitaciones conocidas](#limitaciones-conocidas)
11. [Historial de cambios](#historial-de-cambios)

---

## Qué hace la app

- Búsqueda de vuelos **siempre directos** (sin escalas) en ambos tramos — condición no negociable del proyecto.
- **Origen fijo** en España: el aeropuerto de salida es idéntico en ida y vuelta.
- **Open-jaw en destino**: si el destino tiene varios aeropuertos o ciudades cercanas del mismo país (p. ej. Polonia: Cracovia/Wroclaw/Varsovia-Chopin/Varsovia-Modlin), el motor evalúa automáticamente TODAS las combinaciones de entrada por un aeropuerto y salida por otro, y calcula si compensa, mostrando el traslado interno estimado (tren/bus) cuando se conoce.
- Filtros: hora mínima de salida (ida), hora mínima de salida (vuelta), equipaje de mano incluido, aerolíneas incluidas/excluidas, precio máximo total para el grupo familiar.
- Cálculo automático de la **hora de salida del hotel** el día de regreso: `hora del vuelo de vuelta − 2h de margen de aeropuerto − tiempo de traslado hotel→aeropuerto`.
- Ranking configurable: por hora de salida del hotel (criterio decisivo por defecto), por precio total o por duración total de vuelo.

---

## Arquitectura y stack tecnológico

| Capa | Tecnología | Motivo de la elección |
|---|---|---|
| Frontend + backend | **Next.js 14 (App Router) + TypeScript** | Un solo repositorio para UI y API routes; despliegue nativo en Vercel; el usuario ya lo usa en otros proyectos. |
| Estilos | **Tailwind CSS** | Desarrollo rápido de UI sin CSS a medida. |
| Base de datos | **Neon (Postgres serverless)** | Plan gratuito real (no sandbox), branching de bases de datos, compatible 100% con SQL estándar y con el driver `@neondatabase/serverless` optimizado para entornos edge/serverless de Vercel. |
| Cliente de base de datos | **`@neondatabase/serverless`** | Driver HTTP de Neon pensado para funciones serverless (evita pools de conexión persistentes, que no funcionan bien en Vercel Functions). |
| Hosting / CI-CD | **Vercel** | Despliegue automático en cada `push` a `main` mediante integración Git nativa. |
| Control de versiones | **GitHub** (repo privado) | Historial, `push_files` vía API para automatizar el scaffold inicial. |

### Por qué NO se eligió Supabase para este proyecto

En el momento de crear el proyecto, el usuario indicó no tener ya disponible un uso gratuito claro de Supabase. Neon ofrece un plan gratuito con Postgres serverless real y sin necesidad de las capas adicionales (Auth, Storage, Realtime) que aporta Supabase pero que este proyecto no necesita (no hay login: es una app de uso exclusivamente personal).

---

## Modelo de datos

Esquema aplicado en Neon (ver también [`scripts/schema.sql`](./scripts/schema.sql)):

```
destination_groups        -- Agrupaciones de destino (normalmente por país), permiten open-jaw entre sus aeropuertos
  id, name, country, excluded, notes

airports                   -- Aeropuertos de origen (España) y de destino, enlazados a un destination_group
  iata, city, country, group_id, lat, lon, is_origin_candidate

legs                       -- Tramos de vuelo individuales (uno por sentido); se combinan en el motor de búsqueda
  id, origin_iata, destination_iata, airline, flight_number,
  departure_at, arrival_at, duration_min, is_direct,
  price_eur, cabin_baggage_included, checked_baggage_included,
  cabin_class, seats_available, source, fetched_at

transfer_times             -- Tiempos/precios de traslado entre aeropuertos/ciudades del mismo grupo (para open-jaw)
  origin_iata, destination_iata, mode, duration_min, price_eur

hotel_transfer             -- Tiempo estimado aeropuerto→centro por ciudad, usado para calcular la hora de salida del hotel
  city, airport_iata, airport_to_center_min, notes
```

El campo `legs.source` distingue datos de ejemplo (`mock_seed_2026-09`) de datos reales que se incorporen en el futuro (p. ej. `ignav`, `flightapi`).

---

## Lógica de búsqueda (open-jaw, ranking, filtros)

Implementada en [`lib/search-engine.ts`](./lib/search-engine.ts). Resumen del algoritmo:

1. Se obtienen todos los aeropuertos del `destination_group_id` solicitado.
2. Se buscan tramos de **ida** directos desde el aeropuerto de origen hacia cualquier aeropuerto del grupo, en la fecha de ida.
3. Se buscan tramos de **vuelta** directos desde cualquier aeropuerto del grupo hacia el mismo aeropuerto de origen, en la fecha de vuelta.
4. Se generan **todas las combinaciones** ida × vuelta (producto cartesiano) y se marca `isOpenJaw = true` cuando el aeropuerto de llegada de la ida es distinto del aeropuerto de salida de la vuelta.
5. Si hay open-jaw, se consulta `transfer_times` para mostrar el traslado interno estimado entre ambas ciudades/aeropuertos.
6. Se aplican los filtros (hora mínima de salida, equipaje de mano, aerolíneas, precio máximo).
7. Se calcula el precio total para el número de pasajeros indicado (adultos + niños).
8. Se calcula la hora de salida del hotel: `hora_salida_vuelo_vuelta - 120 min (aeropuerto) - minutos_traslado_hotel_aeropuerto`.
9. Se ordena por el criterio elegido (`checkout_time` por defecto, `price` o `duration`).

Esta lógica vive **en el backend** (`app/api/search/route.ts`), no en ninguna API externa, por lo que es completamente personalizable y no depende de los filtros limitados de un metabuscador comercial.

---

## APIs externas: estado actual y plan de integración

**Estado actual (v0.1):** la app NO consume ninguna API de vuelos externa todavía. Los datos de `legs` son **fixtures/ejemplos** (`source = 'mock_seed_2026-09'`) generados a partir de investigación manual de rutas reales (aerolíneas, aeropuertos, duraciones aproximadas), pero **los precios y horarios exactos NO están verificados en vivo**.

**Plan de integración futura (pendiente, a decisión del usuario):**

| API candidata | Qué aportaría | Límite gratuito conocido |
|---|---|---|
| [Ignav](https://ignav.com) | Precios de vuelos en vivo (one-way/round-trip), filtros por aerolínea/escalas/cabina, enlaces de reserva | 1.000 peticiones gratis, luego 2 USD/1.000 |
| [FlightAPI.io](https://www.flightapi.io) | Precios de vuelos en vivo, alternativa/complemento a Ignav | Free tier limitado (decenas de llamadas) |
| [Aviationstack](https://aviationstack.com) | Estado real de vuelos, horarios, validación de rutas (sin precios) | 100 peticiones/mes gratis |

Cuando se conecte alguna de estas APIs, el plan es:

1. Añadir un job/endpoint que llame a la API y escriba filas en `legs` con `source` igual al nombre de la API.
2. Mantener el mismo modelo de datos (`legs`, `transfer_times`, etc.) para no tener que tocar `search-engine.ts`.
3. Marcar los datos mock como obsoletos o eliminarlos una vez haya cobertura real suficiente.

---

## Cómo replicar el proyecto desde cero

Estos son los pasos exactos que se siguieron para crear TiritiTravel, para poder reproducirlos en otra cuenta o entorno:

### 1. Crear el repositorio GitHub

```bash
# Repositorio privado, inicializado con README
gh repo create tiriti-travel --private --add-readme
```

### 2. Crear el proyecto Neon (base de datos)

1. Crear cuenta/proyecto en [Neon](https://neon.tech) (plan gratuito).
2. Ejecutar el esquema en [`scripts/schema.sql`](./scripts/schema.sql) contra la base `neondb` por defecto.
3. Poblar las tablas `destination_groups`, `airports`, `hotel_transfer`, `transfer_times` y `legs` (ver sección [Modelo de datos](#modelo-de-datos); los inserts de ejemplo usados están documentados en el historial de commits).
4. Obtener la cadena de conexión (`postgresql://usuario:password@host/neondb?sslmode=require`) desde el dashboard de Neon o mediante `neonctl connection-string`.

### 3. Clonar y configurar el proyecto localmente

```bash
git clone https://github.com/<tu-usuario>/tiriti-travel.git
cd tiriti-travel
npm install
cp .env.example .env.local
# Edita .env.local y pega tu DATABASE_URL de Neon
npm run dev
```

### 4. Crear el proyecto en Vercel enlazado al repositorio

1. En [vercel.com/new](https://vercel.com/new), importar el repositorio de GitHub `tiriti-travel`.
2. Vercel detecta automáticamente el framework Next.js.
3. **Antes del primer deploy con éxito**, ir a `Project Settings → Environment Variables` y añadir `DATABASE_URL` (Production + Preview + Development) con la cadena de conexión de Neon.
4. Lanzar/relanzar el deploy.

> ⚠️ **Importante**: el build de Next.js falla si `DATABASE_URL` no está definida ANTES del primer deploy, porque las rutas API necesitan poder inicializarse. El código actual usa inicialización perezosa (`lib/db.ts`) para minimizar este riesgo, pero la variable debe existir en Vercel para que las API routes funcionen en producción.

### 5. (Opcional) Proteger el despliegue

Como es una app de **uso exclusivamente personal**, se recomienda mantener activada la protección "Vercel Authentication" (SSO) del proyecto en `Project Settings → Deployment Protection`, de forma que solo el propietario autenticado en Vercel pueda acceder a la URL de producción.

---

## Desarrollo local

```bash
npm install
npm run dev
# abrir http://localhost:3000
```

Requiere `DATABASE_URL` definida en `.env.local` (ver `.env.example`).

---

## Despliegue en Vercel

- **Proyecto**: `tiriti-travel` (cuenta personal `gsus1982`).
- **Integración**: Git nativa con `Gsus1982/tiriti-travel`, rama `main` = producción.
- **Despliegue automático**: cada `git push` a `main` dispara un nuevo build y deploy sin pasos manuales adicionales (una vez configurada `DATABASE_URL`).
- **Protección de acceso**: Vercel Authentication (SSO) activada para todos los entornos, ya que es una herramienta de uso personal.

---

## Variables de entorno

| Variable | Obligatoria | Descripción |
|---|---|---|
| `DATABASE_URL` | Sí | Cadena de conexión Postgres de Neon. Formato: `postgresql://usuario:password@host/neondb?sslmode=require` |
| `IGNAV_API_KEY` | No (futuro) | Clave de la API de Ignav, cuando se integre búsqueda de tarifas en vivo |
| `FLIGHTAPI_KEY` | No (futuro) | Clave de FlightAPI.io, alternativa/complemento a Ignav |

Ver [`.env.example`](./.env.example).

---

## Limitaciones conocidas

- **Datos mock**: los precios y horarios actuales son de ejemplo, no verificados en vivo (ver sección de APIs externas).
- **Sin búsqueda de hoteles**: fuera de alcance de la v0.1 por decisión explícita; se puede añadir en una fase posterior con el mismo patrón de tablas.
- **Sin autenticación propia**: la privacidad de la app se apoya en la protección de despliegue de Vercel (SSO), no en un sistema de login propio, ya que es de uso exclusivamente personal.
- **Open-jaw solo dentro de un `destination_group`**: no se contemplan combinaciones entre grupos de países distintos (p. ej., entrar por Polonia y salir por Letonia), en línea con lo definido en el proyecto.
- **Origen sin flexibilidad**: por diseño explícito, el aeropuerto de origen en España es siempre el mismo en ida y vuelta; no se contempla open-jaw en origen.

---

## Historial de cambios

Ver [`CHANGELOG.md`](./CHANGELOG.md).
