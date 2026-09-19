// "Sorprendeme" con criterio real -- REDISEÑO (sesion 13, a peticion del usuario tras
// probarlo su esposa): antes elegia EXACTAMENTE el numero de destinos que cabian en el
// limite de combinaciones (normalmente 1-2 con un solo origen) y lanzaba una busqueda
// real de inmediato -- decepcionante comparado con el "a cualquier parte" de
// Skyscanner, que muestra MUCHAS opciones antes de comprometerte a nada.
//
// Ahora es un flujo en 2 fases, igual que "Ideas de destino" (Travelpayouts): esta
// funcion SIEMPRE pide varios candidatos (hasta 6, independientemente del limite de
// combinaciones de Ignav) con una razon breve cada uno -- fase gratis, sin gastar
// cuota. El llamante (page.tsx) los muestra como tarjetas; solo cuando el usuario
// elige UNA se lanza la busqueda real de Ignav para esa unica ruta.
//
// AVISO: no se ha podido verificar contra la API real de OpenAI desde esta sesion.

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    destinations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          destIata: { type: 'string' },
          reason: { type: 'string', description: '1 frase breve en español: por que este destino es una buena idea para estas fechas.' }
        },
        required: ['destIata', 'reason'],
        additionalProperties: false
      }
    }
  },
  required: ['destinations'],
  additionalProperties: false
};

export type SurpriseCandidate = { destIata: string; reason: string };
export type SurpriseSuggestion = { candidates: SurpriseCandidate[] };

const MAX_CANDIDATES = 6;

export async function pickSurpriseDestinationsWithAI(context: {
  originLabels: string[];
  outboundDateFrom: string;
  outboundDateTo: string;
  inboundDateFrom: string;
  inboundDateTo: string;
  realDestinations: { dest_iata: string; dest_name: string; country: string }[];
}): Promise<SurpriseSuggestion> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY no configurada');
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';

  const pool = context.realDestinations.slice(0, 220);
  const candidateCount = Math.min(MAX_CANDIDATES, pool.length);

  const systemPrompt = `Eres el asesor de "Sorprendeme" de Tiriti Travel, un buscador de vuelos DIRECTOS personal.
El usuario no sabe a donde ir. Esta fase NO gasta cuota real (es solo para inspirar, como el "a cualquier parte" de Skyscanner) -- propon VARIAS ideas distintas, no una sola.

Origen(es): ${JSON.stringify(context.originLabels)}
Fechas de ida: entre ${context.outboundDateFrom} y ${context.outboundDateTo}
Fechas de vuelta: entre ${context.inboundDateFrom} y ${context.inboundDateTo}
Destinos reales con vuelo directo confirmado desde ese origen (elige EXACTAMENTE ${candidateCount} de esta lista, nunca inventes otros, nunca elijas uno que no este aqui): ${JSON.stringify(
    pool
  )}

Elige ${candidateCount} destinos DISTINTOS ENTRE SI (no repitas el mismo tipo de sitio) que consideres buenas ideas para esas fechas, razonando sobre: popularidad de la ruta, distancia, epoca del año (temporada baja/alta, algun evento estacional tipico conocido de esas fechas en ese destino si aplica). Para cada uno, una frase breve y concreta explicando por que -- nada generico ("bonita ciudad"), algo especifico de ESE lugar en ESAS fechas.`;

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
        { role: 'user', content: `Dame ${candidateCount} ideas de destino distintas.` }
      ],
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'surprise_candidates', strict: true, schema: RESPONSE_SCHEMA }
      },
      max_tokens: 500,
      temperature: 0.8
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

  const parsed = JSON.parse(content) as { destinations: SurpriseCandidate[] };
  // Red de seguridad: solo aceptar IATAs que de verdad estaban en la lista ofrecida,
  // por si el modelo se inventa alguno a pesar de la instruccion (mismo patron que
  // ai-parse.ts, que no lo tenia y causo el bug real reportado de destinos
  // inexistentes).
  const validIatas = new Set(pool.map((d) => d.dest_iata));
  const filtered = parsed.destinations.filter((d) => validIatas.has(d.destIata));
  if (filtered.length === 0) throw new Error('La IA no eligio ningun destino valido de la lista ofrecida');
  return { candidates: filtered };
}
