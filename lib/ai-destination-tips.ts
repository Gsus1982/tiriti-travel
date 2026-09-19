// Consejo breve de la IA sobre el destino elegido -- mismo patron que ai-recommend.ts
// (OpenAI, gpt-4o-mini, response_format json_schema). Algo que ningun buscador
// generico integra directamente en el resultado de la busqueda.
//
// Mejoras de esta sesion: se le pasa el CLIMA REAL ya calculado (Open-Meteo, en vez de
// que la IA lo adivine solo por el mes) y cuantos ninos viajan, para un angulo familiar
// cuando aplica.
//
// AVISO: no se ha podido verificar contra la API real en esta sesion.

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    whatToSee: { type: 'string', description: '2-3 frases en español: que ver o hacer en el destino en una estancia corta, mencionando si es apto para niños cuando corresponda.' },
    whatToPack: { type: 'string', description: '1-2 frases en español: que llevar en la maleta, basado en el clima REAL indicado (no en suposiciones sobre el mes).' }
  },
  required: ['whatToSee', 'whatToPack'],
  additionalProperties: false
};

export type DestinationTips = { whatToSee: string; whatToPack: string };

export type ClimateHint = { avgMinC: number; avgMaxC: number; avgPrecipMm: number };

export async function getDestinationTips(
  destinationName: string,
  country: string,
  month: number,
  climate?: ClimateHint | null,
  childrenCount = 0
): Promise<DestinationTips> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY no configurada');
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';

  const monthNames = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
  ];

  const climateLine = climate
    ? `Clima REAL esperado (dato medido, no una suposicion): entre ${climate.avgMinC} y ${climate.avgMaxC}°C, ${climate.avgPrecipMm} mm de lluvia de media.`
    : `No hay dato de clima real disponible -- usa tu conocimiento general del mes.`;
  const familyLine = childrenCount > 0 ? `Viajan ${childrenCount} niño(s) -- menciona si el destino es apto para niños y alguna idea familiar si aplica.` : '';

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'system',
          content:
            'Eres el asesor de viajes de Tiriti Travel. Dado un destino, su pais, el mes del viaje y el clima real esperado, da un consejo breve y util en español: que ver/hacer alli en una estancia corta (2-3 dias), y que llevar en la maleta segun el CLIMA REAL indicado (no el mes en abstracto). Se concreto y practico, nada generico.'
        },
        {
          role: 'user',
          content: `Destino: ${destinationName}, ${country}. Mes del viaje: ${monthNames[month - 1]}. ${climateLine} ${familyLine}`
        }
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
