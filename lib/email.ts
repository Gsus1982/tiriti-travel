// Cliente minimo para la API de Resend (https://resend.com), usado para las
// notificaciones reales de las alertas de precio (ver app/api/cron/check-alerts).
//
// IMPORTANTE DE SEGURIDAD: la API key SIEMPRE se lee de la variable de entorno
// RESEND_API_KEY. Nunca la escribas en este archivo ni en ningun commit. Configurala
// en Vercel -> Project Settings -> Environment Variables.
//
// Variables de entorno esperadas:
// - RESEND_API_KEY: la clave de tu cuenta de Resend.
// - RESEND_FROM_EMAIL: direccion remitente. Si no verificas un dominio propio en
//   Resend, usa "onboarding@resend.dev" (funciona sin configuracion adicional, pero
//   solo para pruebas/uso personal, no para enviar a terceros a escala).
// - RESEND_TO_EMAIL: direccion por defecto a la que llegan los avisos si la alerta
//   concreta no tiene su propio email guardado.

const RESEND_API_URL = 'https://api.resend.com/emails';

export type SendEmailParams = {
  to: string;
  subject: string;
  html: string;
};

export async function sendEmail(params: SendEmailParams): Promise<{ id: string } | null> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';

  if (!apiKey) {
    console.warn('RESEND_API_KEY no configurada -- se omite el envio de email (esto no rompe el cron).');
    return null;
  }

  const res = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: `Tiriti Travel <${from}>`,
      to: [params.to],
      subject: params.subject,
      html: params.html
    }),
    signal: AbortSignal.timeout(10000)
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Resend API error ${res.status}: ${text.slice(0, 300)}`);
  }

  return res.json();
}

export function buildPriceAlertEmailHtml(params: {
  label: string | null;
  originIatas: string[];
  destinationIata: string;
  minPrice: number;
  maxPriceTotal: number;
  outboundDateFrom: string;
  inboundDateFrom: string;
}): string {
  const title = params.label || `Alerta ${params.originIatas.join('/')} -> ${params.destinationIata}`;
  return `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
      <h2 style="color:#4f46e5;">¡Ha bajado el precio! 🎉</h2>
      <p><strong>${title}</strong></p>
      <p>Encontramos un vuelo directo a <strong>${params.destinationIata}</strong> desde
      <strong>${params.originIatas.join(', ')}</strong> por
      <strong>${params.minPrice.toFixed(2)} €</strong>
      (tu limite era ${params.maxPriceTotal.toFixed(2)} €).</p>
      <p>Fechas: ida desde ${params.outboundDateFrom}, vuelta desde ${params.inboundDateFrom}.</p>
      <p style="color:#94a3b8; font-size: 12px;">Abre Tiriti Travel y repite la busqueda para ver el detalle y reservar.</p>
    </div>
  `;
}
