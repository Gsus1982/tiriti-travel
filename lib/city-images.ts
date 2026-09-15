// Banco de fotos por ciudad para las tarjetas de resultados (en vez de un icono de avion
// generico). Todas son fotos reales de Pexels (licencia libre, sin atribucion requerida),
// verificadas una a una: se busco cada ciudad en pexels.com y se confirmo la URL real del
// CDN (images.pexels.com/photos/{id}/pexels-photo-{id}.jpeg) antes de incluirla aqui.
//
// No es viable tener una foto propia para cada uno de los cientos de aeropuertos reales
// que puede haber en la cache de Aena, asi que esto cubre las ciudades mas habituales como
// destino y usa FALLBACK_IMAGE_ID para cualquier otra -- nunca se deja una tarjeta sin foto.

function pexelsUrl(id: number, width = 480): string {
  return `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=${width}`;
}

const CITY_PHOTO_IDS: Record<string, number> = {
  paris: 1308940,
  londres: 16009996,
  london: 16009996,
  roma: 13274354,
  rome: 13274354,
  amsterdam: 30620736,
  lisboa: 16343720,
  lisbon: 16343720,
  praga: 16922413,
  prague: 16922413,
  viena: 33432868,
  vienna: 33432868,
  atenas: 19902935,
  athens: 19902935,
  estocolmo: 32158615,
  stockholm: 32158615,
  cracovia: 19606024,
  krakow: 19606024,
  budapest: 26737415
};

// Foto generica de reserva: vista aerea del Mediterraneo desde la ventanilla de un avion.
// Encaja con el resto del tema (vuelos, cielo) y nunca deja una tarjeta sin imagen.
const FALLBACK_IMAGE_ID = 30425165;

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Devuelve la URL de una foto representativa para el nombre de ciudad/destino dado.
 * Busca coincidencia por substring (para que "Cracovia (Balice)" o "Roma-Fiumicino"
 * encuentren su ciudad) y cae en la foto generica si no hay ninguna coincidencia.
 */
export function getCityImageUrl(cityName: string, width = 480): string {
  const norm = normalize(cityName);
  for (const [key, id] of Object.entries(CITY_PHOTO_IDS)) {
    if (norm.includes(key)) return pexelsUrl(id, width);
  }
  return pexelsUrl(FALLBACK_IMAGE_ID, width);
}
