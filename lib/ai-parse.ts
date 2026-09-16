// Parseo de lenguaje natural con IA real (OpenAI), sustituyendo/complementando el
// parser de regex (lib/nlp-search.ts). A diferencia del regex, esto puede razonar sobre
// cosas como "un pais nordico" (Suecia/Noruega/Finlandia/Dinamarca/Islandia) o
// sinonimos que el regex nunca cubrira, y explica en lenguaje natural por que ha
// interpretado algo de una forma.

export type AIParsedFilters = {
  originIatas: string[];
  destinationIatas: string[];
  outboundDateFrom: string | null;
  outboundDateTo: string | null;
  inboundDateFrom: string | null;
  inboundDateTo: string | null;
  outboundNotBeforeHour: number | null;
  inboundNotBeforeHour: number | null;
  maxPriceTotal: number | null;
  explanation: string;
  warnings: string[];
};

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    originIatas: { type: 'array', items: { type: 'string' } },
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

// La IA (respuesta JSON de OpenAI) nunca devuelve el campo `warnings` -- se anade
// despues, en este archivo, tras el post-procesado. Este tipo representa exactamente
// lo que sale del JSON.parse de la respuesta de OpenAI.
type AIRawResponse = Omit<AIParsedFilters, 'warnings'>;

export async function parseSearchQueryWithAI(
  text: string,
  context: {
    referenceDate: string; // YYYY-MM-DD, para resolver "el finde que viene" etc.
    origins: { iata: string; city: string }[];
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
Destinos reales con vuelo directo confirmado desde los orígenes ya elegidos (usa SIEMPRE destinationIatas de esta lista, incluso para peticiones sobre países/zonas -- ej. "un país nórdico" -> elige los dest_iata cuyo country sea nórdico -- y para peticiones abiertas tipo "el lugar más atractivo" o "sorpréndeme"): ${JSON.stringify(
    realDestinationsTrimmed
  )}

Reglas:
- Si la frase no menciona origen, deja originIatas vacío (no inventes).
- Si hay varias fechas alternativas para el mismo sentido (ida o vuelta), usa el rango completo (DateFrom = la más temprana, DateTo = la más tardía) -- NUNCA asumas que la última fecha mencionada es la vuelta si el texto no lo dice explícitamente.
- outboundNotBeforeHour/inboundNotBeforeHour: hora mínima de salida en cada sentido, si se menciona.
- explanation: 1-3 frases en español explicando cómo se ha interpretado la frase, mencionando cualquier ambigüedad.
- No inventes destinos que no estén en la lista de destinos reales proporcionada.
- LÍMITE DE CUOTA (importante): cada búsqueda contra Ignav cuesta cuota gratuita limitada. El número de orígenes elegidos MULTIPLICADO por el número de destinos elegidos NO puede superar 6. Si la frase es abierta ("el lugar más atractivo", "sorpréndeme", sin destino concreto), elige COMO MUCHO ${Math.floor(6 / Math.max(context.origins.length, 1))} destino(s) por cada origen que detectes en la frase -- prioriza calidad sobre cantidad, no listes muchas opciones "por si acaso".`;

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

  const raw = JSON.parse(content) as AIRawResponse;
  const parsed: AIParsedFilters = { ...raw, warnings: [] };

  // FIX (bug real reportado -- la misma frase exacta encontraba vuelos unas veces y
  // otras no): pedirle el limite a la IA en el prompt no basta -- los modelos no
  // siempre obedecen un numero exacto, y ademas con temperature > 0 el ORDEN en que la
  // IA devuelve los destinos varia entre llamadas idénticas. El .slice() anterior
  // recortaba SIEMPRE los ultimos de ESE orden variable, asi que la misma consulta
  // podia descartar Wroclaw una vez y Katowice otra, cambiando que rutas se buscaban
  // de verdad y por tanto si se encontraban vuelos reales (que en rutas low-cost a
  // Polonia no operan a diario). Ahora el recorte ordena alfabeticamente por IATA
  // ANTES de cortar, asi la misma frase descarta siempre el mismo destino.
  const originCount = Math.max(parsed.originIatas.length, 1);
  const maxDestinations = Math.max(1, Math.floor(6 / originCount));
  if (parsed.destinationIatas.length > maxDestinations) {
    const sortedDestinations = [...parsed.destinationIatas].sort();
    const kept = sortedDestinations.slice(0, maxDestinations);
    const dropped = sortedDestinations.slice(maxDestinations);
    parsed.destinationIatas = kept;
    parsed.explanation += ` Se ha limitado a ${maxDestinations} destino(s) (${kept.join(', ')}) para no superar el maximo de 6 combinaciones origen x destino que protege tu cuota gratuita de Ignav; se ha descartado: ${dropped.join(', ')}.`;
    parsed.warnings.push(
      `Pediste ${sortedDestinations.length} destino(s) con ${originCount} origen(es) (${sortedDestinations.length * originCount} combinaciones), por encima del maximo de 6 permitido. Se ha buscado solo en ${kept.join(', ')} -- se ha descartado ${dropped.join(', ')}. Si quieres los ${sortedDestinations.length} destinos a la vez, reduce a ${Math.max(1, Math.floor(6 / sortedDestinations.length))} origen(es).`
    );
  }

  return parsed;
}
