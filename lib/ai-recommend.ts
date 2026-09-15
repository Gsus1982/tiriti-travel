// Tras una busqueda, la IA revisa los primeros resultados y recomienda UNO con una
// explicacion razonada (precio Y comodidad -- hora de salida del hotel el dia de
// vuelta, que es el criterio propio de esta app que ningun buscador generico usa).
// Convierte la app de "listado de vuelos" a "asesor que analiza y recomienda".
//
// AVISO: no se ha podido verificar contra la API real de OpenAI desde esta sesion.

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    recommendedIndex: { type: 'number', description: 'Indice (empezando en 0) del resultado recomendado.' },
    explanation: { type: 'string', description: 'Explicacion breve (1-2 frases) en espanol de por que se recomienda ese resultado.' }
  },
  required: ['recommendedIndex', 'explanation'],
  additionalProperties: false
};

export type SummarizedItinerary = {
  originIata: string;
  destinationName: string;
  outboundDepartureAt: string;
  inboundDepartureAt: string;
  totalPrice: number;
  currency: string;
  hotelCheckoutAt: string;
  isOpenJaw: boolean;
  source: 'ignav' | 'skyscanner';
};

export type Recommendation = { recommendedIndex: number; explanation: string };

export async function recommendBestItinerary(itineraries: SummarizedItinerary[]): Promise<Recommendation> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY no configurada');
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';

  const trimmed = itineraries.slice(0, 12);

  const systemPrompt = `Eres el asesor de Tiriti Travel, un buscador de vuelos DIRECTOS personal.
Tienes una lista de resultados de una busqueda (indices desde 0). Recomienda UNO solo, considerando 2 cosas a la vez:
1. Precio total (mas barato, mejor, pero no es lo unico que importa).
2. Comodidad real del viaje: "hotelCheckoutAt" es la hora a la que hay que salir del hotel el dia de vuelta (calculada restando el traslado al aeropuerto y el margen de seguridad a la hora de salida del vuelo de vuelta) -- cuanto MAS TARDE mejor (no hay que madrugar), cuanto mas temprano de madrugada, peor, salvo que el ahorro de precio sea claramente grande.

Resultados: ${JSON.stringify(trimmed)}

explanation: 1-2 frases en espanol, mencionando el precio y la hora de salida del hotel, explicando por que es la mejor opcion (o el mejor equilibrio precio/comodidad) de la lista.`;

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
        { role: 'user', content: 'Recomiendame el mejor de estos resultados.' }
      ],
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'recommendation', strict: true, schema: RESPONSE_SCHEMA }
      },
      max_tokens: 250,
      temperature: 0.3
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

  const parsed = JSON.parse(content) as Recommendation;
  if (parsed.recommendedIndex < 0 || parsed.recommendedIndex >= trimmed.length) {
    throw new Error('Indice recomendado fuera de rango');
  }
  return parsed;
}
