// "Sorprendeme" con criterio real: en vez de elegir destinos al azar entre los reales
// disponibles (como hacia antes), se le pide a la IA que razone sobre cuales son mas
// probables de tener vuelos directos baratos/favorables para el origen y las fechas
// dadas -- popularidad de la ruta, distancia, si es una ruta tipica de low-cost, epoca
// del ano. Sigue respetando el limite de combinaciones de Ignav (maxDestinations ya
// viene calculado por el llamante).
//
// AVISO: no se ha podido verificar contra la API real de OpenAI desde esta sesion (sin
// acceso de red a api.openai.com). Si falla, el llamante debe caer a seleccion
// aleatoria -- ver randomSurpriseDestinations en app/page.tsx.

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    destinationIatas: { type: 'array', items: { type: 'string' } },
    explanation: {
      type: 'string',
      description: 'Explicacion breve en espanol (1-2 frases) de por que se han elegido estos destinos.'
    }
  },
  required: ['destinationIatas', 'explanation'],
  additionalProperties: false
};

export type SurpriseSuggestion = { destinationIatas: string[]; explanation: string };

export async function pickSurpriseDestinationsWithAI(context: {
  originLabels: string[];
  outboundDateFrom: string;
  outboundDateTo: string;
  inboundDateFrom: string;
  inboundDateTo: string;
  maxDestinations: number;
  realDestinations: { dest_iata: string; dest_name: string; country: string }[];
}): Promise<SurpriseSuggestion> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY no configurada');
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';

  const pool = context.realDestinations.slice(0, 220);

  const systemPrompt = `Eres el asesor de "Sorprendeme" de Tiriti Travel, un buscador de vuelos DIRECTOS personal.
El usuario no sabe a donde ir y quiere que le propongas destinos con criterio, no al azar.

Origen(es): ${JSON.stringify(context.originLabels)}
Fechas de ida: entre ${context.outboundDateFrom} y ${context.outboundDateTo}
Fechas de vuelta: entre ${context.inboundDateFrom} y ${context.inboundDateTo}
Destinos reales con vuelo directo confirmado desde ese origen (elige EXACTAMENTE ${context.maxDestinations} de esta lista, nunca inventes otros): ${JSON.stringify(
    pool
  )}

Elige los ${context.maxDestinations} destinos de la lista que consideres mas probables de tener vuelos directos baratos o especialmente favorables para esas fechas concretas, razonando sobre: popularidad de la ruta (rutas mas servidas por aerolineas low-cost suelen ser mas baratas), distancia (mas corta suele ser mas barata), y si la epoca del ano (segun las fechas dadas) juega a favor o en contra (temporada baja vs alta, algun evento estacional conocido tipico de esas fechas en ese destino).
explanation: 1-2 frases en espanol explicando el criterio usado, mencionando algun destino concreto.`;

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
        { role: 'user', content: `Sorprendeme con ${context.maxDestinations} destino(s).` }
      ],
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'surprise_destinations', strict: true, schema: RESPONSE_SCHEMA }
      },
      max_tokens: 300,
      temperature: 0.7
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

  const parsed = JSON.parse(content) as SurpriseSuggestion;
  // Red de seguridad: solo aceptar IATAs que de verdad estaban en la lista ofrecida,
  // por si el modelo se inventa alguno a pesar de la instruccion.
  const validIatas = new Set(pool.map((d) => d.dest_iata));
  const filtered = parsed.destinationIatas.filter((i) => validIatas.has(i));
  if (filtered.length === 0) throw new Error('La IA no eligio ningun destino valido de la lista ofrecida');
  return { destinationIatas: filtered.slice(0, context.maxDestinations), explanation: parsed.explanation };
}
