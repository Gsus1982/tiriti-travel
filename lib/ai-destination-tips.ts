// Consejo breve de la IA sobre el destino elegido -- mismo patron que ai-recommend.ts
// (OpenAI, gpt-4o-mini, response_format json_schema). Algo que ningun buscador
// generico integra directamente en el resultado de la busqueda.
//
// AVISO: no se ha podido verificar contra la API real en esta sesion.

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    whatToSee: { type: 'string', description: '2-3 frases en español: que ver o hacer en el destino en una estancia corta.' },
    whatToPack: { type: 'string', description: '1-2 frases en español: que llevar en la maleta segun el destino y la epoca del año.' }
  },
  required: ['whatToSee', 'whatToPack'],
  additionalProperties: false
};

export type DestinationTips = { whatToSee: string; whatToPack: string };

export async function getDestinationTips(destinationName: string, country: string, month: number): Promise<DestinationTips> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY no configurada');
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';

  const monthNames = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
  ];

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'system',
          content:
            'Eres el asesor de viajes de Tiriti Travel. Dado un destino, su pais y el mes del viaje, da un consejo breve y util en español: que ver/hacer alli en una estancia corta (2-3 dias), y que llevar en la maleta segun la epoca del año. Se concreto y practico, nada generico.'
        },
        { role: 'user', content: `Destino: ${destinationName}, ${country}. Mes del viaje: ${monthNames[month - 1]}.` }
      ],
      response_format: { type: 'json_schema', json_schema: { name: 'destination_tips', strict: true, schema: RESPONSE_SCHEMA } },
      max_tokens: 300,
      temperature: 0.5
    }),
    signal: AbortSignal.timeout(8000)
  });

  if (!res.ok) throw new Error(`OpenAI API error ${res.status}`);
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error('Respuesta de OpenAI sin contenido');
  return JSON.parse(content) as DestinationTips;
}
