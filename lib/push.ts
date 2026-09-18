import webpush from 'web-push';
import { sql } from './db';

function configureWebPush(): boolean {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'mailto:noreply@tiriti-travel.local';
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  return true;
}

/**
 * Manda una notificacion push a TODAS las suscripciones guardadas (uso personal, un
 * solo usuario real -- si en el futuro hay varios dispositivos, les llega a todos por
 * igual). Limpia automaticamente las suscripciones caducadas (404/410) que devuelva el
 * navegador. Best-effort: nunca debe romper el cron de alertas si falla.
 */
export async function sendPushToAll(title: string, body: string, url?: string): Promise<void> {
  if (!configureWebPush()) return;
  try {
    const subs = (await sql`SELECT endpoint, p256dh, auth FROM push_subscriptions`) as {
      endpoint: string;
      p256dh: string;
      auth: string;
    }[];
    const payload = JSON.stringify({ title, body, url: url ?? '/' });
    await Promise.allSettled(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload);
        } catch (err: any) {
          if (err?.statusCode === 404 || err?.statusCode === 410) {
            await sql`DELETE FROM push_subscriptions WHERE endpoint = ${s.endpoint}`;
          }
        }
      })
    );
  } catch {
    // Tabla sin migrar todavia u otro fallo -- no debe romper el cron de alertas.
  }
}
