// API REST de Wikipedia (gratis, sin clave, sin registro) -- alternativa gratuita al
// consejo de la IA sobre el destino: mismo objetivo (dar contexto sobre el sitio), cero
// coste de tokens, disponible incluso sin OPENAI_API_KEY configurada.
//
// AVISO: no se ha podido verificar contra la API real en esta sesion.

export type WikiSummary = { extract: string; url: string };

export async function getWikipediaSummary(destinationName: string, lang = 'es'): Promise<WikiSummary | null> {
  try {
    const title = encodeURIComponent(destinationName.replace(/\s*\([^)]*\)\s*$/, '').trim());
    const res = await fetch(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${title}`, {
      signal: AbortSignal.timeout(6000),
      headers: { 'User-Agent': 'TiritiTravel/1.0 (uso personal)' }
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.extract) return null;
    return { extract: data.extract, url: data.content_urls?.desktop?.page ?? `https://${lang}.wikipedia.org/wiki/${title}` };
  } catch {
    return null;
  }
}
