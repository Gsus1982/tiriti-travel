// Parseo de lenguaje natural con IA real (OpenAI), sustituyendo/complementando el
// parser de regex (lib/nlp-search.ts). A diferencia del regex, esto puede razonar sobre
// cosas como "un pais nordico" (Suecia/Noruega/Finlandia/Dinamarca/Islandia) o
// sinonimos que el regex nunca cubrira, y explica en lenguaje natural por que ha
// interpretado algo de una forma.
//
// AVISO IMPORTANTE (sin verificar contra la API real): esta sesion no tiene acceso de
// red a api.openai.com, asi que esta llamada no se ha podido probar en vivo. Escrita
// con la mejor informacion disponible (verificada por busqueda web en esta sesion):
// - Modelo: gpt-4o-mini por defecto (configurable via OPENAI_MODEL) -- es el nombre de
//   modelo que se puede verificar con mas confianza que sigue siendo valido; la
//   nomenclatura de modelos de OpenAI ha cambiado mucho y las fuentes sobre los mas
//   recientes son contradictorias entre si. Si quieres el modelo mas barato disponible
//   ahora mismo, revisa developers.openai.com/api/docs/pricing y cambia la variable de
//   entorno OPENAI_MODEL en Vercel, sin tocar codigo.
// - Formato: Chat Completions API con response_format json_schema (structured outputs),
//   soportado por gpt-4o-mini segun la documentacion de OpenAI.
// Prueba esto con una consulta real en cuanto puedas; si el formato de respuesta no
// coincide con lo esperado, el error aparecera claramente (ver app/api/ai-parse) y cae
// automaticamente al parser de regex local, nunca rompe la busqueda.

export type AIParsedFilters = {
  originIatas: string[];
  destinationGroupIds: string[];
  destinationIatas: string[];
  outboundDateFrom: string | null;
  outboundDateTo: string | null;
  inboundDateFrom: string | null;
  inboundDateTo: string | null;
  outboundNotBeforeHour: number | null;
  inboundNotBeforeHour: number | null;
  maxPriceTotal: number | null;
  explanation: string;
};

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    originIatas: { type: 'array', items: { type: 'string' } },
    destinationGroupIds: { type: 'array', items: { type: 'string' } },
    destinationIatas: { type: 'array', items: { type: 'string' } },
    outboundDateFrom: { type: ['string', 'null'], description: 'YYYY-MM-DD' },
    outboundDateTo: { type: ['string', 'null'], description: 'YYYY-MM-DD' },
    inboundDateFrom: { type: ['string', 'null'], description: 'YYYY-MM-DD' },
    inboundDateTo: { type: ['string', 'null'], description: 'YYYY-MM-DD' },
    outboundNotBeforeHour: { type: ['number', 'null'] },
    inboundNotBeforeHour: { type: ['number', 'null'] },
    maxPriceTotal: { type: ['number', 'null'] },
    explanation: {
      type: 'string',
      description: 'Explicacion breve en espanol, en lenguaje natural, de como se ha interpretado la frase y por que.'
    }
  },
  required: [
    'originIatas',
    'destinationGroupIds',
    'destinationIatas',
    'outboundDateFrom',
    'outboundDateTo',
    'inboundDateFrom',
    'inboundDateTo',
    'outboundNotBeforeHour',
    'inboundNotBeforeHour',
    'maxPriceTotal',
    'explanation'
  ],
  additionalProperties: false
};

export async function parseSearchQueryWithAI(
  text: string,
  context: {
    referenceDate: string; // YYYY-MM-DD, para resolver "el finde que viene" etc.
    origins: { iata: string; city: string }[];
    groups: { id: string; name: string; country: string }[];
    realDestinations: { dest_iata: string; dest_name: string; country: string }[];
  }
): Promise<AIParsedFilters> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY no configurada');
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';

  // Limite de contexto: si hay muchos destinos reales (varios origenes a la vez con
  // mucha conectividad), se recorta para no disparar el coste ni el tamano de la
  // peticion -- de sobra para que la IA razone sobre paises/zonas.
  const realDestinationsTrimmed = context.realDestinations.slice(0, 220);

  const systemPrompt = `Eres el intérprete de búsquedas de Tiriti Travel, un buscador de vuelos DIRECTOS (sin escalas) personal.
Tu trabajo: convertir una frase en español sobre un viaje en filtros estructurados.

Fecha de referencia (hoy): ${context.referenceDate}
Orígenes disponibles: ${JSON.stringify(context.origins)}
Grupos de destino curados (usar destinationGroupIds si la frase encaja con el TEMA de alguno): ${JSON.stringify(
    context.groups
  )}
Destinos reales con vuelo directo confirmado desde los orígenes ya elegidos (usar destinationIatas para destinos/países/zonas concretas, ej. "un país nórdico" -> elige los dest_iata cuyo country sea nórdico): ${JSON.stringify(
    realDestinationsTrimmed
  )}

Reglas:
- Si la frase no menciona origen, deja originIatas vacío (no inventes).
- Si hay varias fechas alternativas para el mismo sentido (ida o vuelta), usa el rango completo (DateFrom = la más temprana, DateTo = la más tardía) -- NUNCA asumas que la última fecha mencionada es la vuelta si el texto no lo dice explícitamente.
- outboundNotBeforeHour/inboundNotBeforeHour: hora mínima de salida en cada sentido, si se menciona.
- explanation: 1-3 frases en español explicando cómo se ha interpretado la frase, mencionando cualquier ambigüedad.
- No inventes destinos que no estén en la lista de destinos reales o grupos curados proporcionada.`;

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: text }
      ],
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'search_filters', strict: true, schema: RESPONSE_SCHEMA }
      },
      max_tokens: 500,
      temperature: 0.2
    }),
    signal: AbortSignal.timeout(15000)
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`OpenAI API error ${res.status}: ${text}`);
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error('Respuesta de OpenAI sin contenido');

  const parsed = JSON.parse(content) as AIParsedFilters;
  return parsed;
}
