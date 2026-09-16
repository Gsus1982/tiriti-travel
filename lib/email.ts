// Cliente minimo de Resend para notificar por email cuando una alerta de precio
// encuentra un match. Lee las credenciales SIEMPRE de variables de entorno, nunca
// hardcodeadas. Si no estan configuradas, no lanza error: registra en consola y
// sigue sin bloquear el cron.
const RESEND_API_URL = 'https://api.resend.com/emails';

export async function sendAlertEmail(params: {
  to: string;
  label: string | null;
  minPrice: number;
  currency?: string;
  maxPriceTotal: number;
}): Promise<{ sent: boolean; reason?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) {
    console.warn('[email] RESEND_API_KEY o RESEND_FROM_EMAIL no configuradas -- email no enviado.');
    return { sent: false, reason: 'not_configured' };
  }

  const subject = `Tiriti Travel: bajada de precio${params.label ? ` (${params.label})` : ''}`;
  const html = `
    <div style="font-family: sans-serif; color: #1a1a2e;">
      <h2>Tu alerta de precio ha encontrado una opcion</h2>
      <p>Precio minimo encontrado: <strong>${params.minPrice.toFixed(2)} ${params.currency ?? 'EUR'}</strong></p>
      <p>Tu limite configurado era: ${params.maxPriceTotal.toFixed(2)} ${params.currency ?? 'EUR'}</p>
      ${params.label ? `<p>Etiqueta: ${params.label}</p>` : ''}
      <p>Entra en Tiriti Travel y repite la busqueda para ver los detalles y reservar.</p>
    </div>
  `;

  try {
    const res = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ from, to: params.to, subject, html })
    });
    if (!res.ok) {
      const text = await res.text();
      console.error('[email] Resend devolvio error:', res.status, text);
      return { sent: false, reason: `resend_${res.status}` };
    }
    return { sent: true };
  } catch (err) {
    console.error('[email] Fallo al llamar a Resend:', err);
    return { sent: false, reason: 'network_error' };
  }
}
