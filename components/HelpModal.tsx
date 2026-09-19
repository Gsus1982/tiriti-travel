'use client';

import { useState } from 'react';
import { IconHelp, IconX } from './Icons';

type HelpTopic = { title: string; body: string };

const TOPICS: HelpTopic[] = [
  {
    title: 'Orígenes, destinos y fechas',
    body:
      'Puedes elegir varios orígenes y varios destinos a la vez (toca los que quieras, no solo uno). Los "Destinos" son siempre REALES: verificados a diario contra datos públicos de Aena, con vuelo directo confirmado. Las fechas se eligen en un calendario propio: toca uno o varios días sueltos (no tienen que ser seguidos) para ida y para vuelta, con hasta 5 días por sentido y una franja horaria propia para cada día si quieres.'
  },
  {
    title: '¿Por qué hay un límite de combinaciones (y por qué cambia)?',
    body:
      'Cada búsqueda gasta peticiones reales contra Ignav, que da 1000 peticiones DE POR VIDA (no se renuevan nunca). El máximo de combinaciones origen x destino no es un número fijo: sube a 10 si te queda más de la mitad de la cuota, baja a 6/4/3 según se va agotando. Mira "Cuota de Ignav" en el panel de herramientas para saber cuánto te queda antes de decidir cuántos orígenes o destinos elegir.'
  },
  {
    title: '"Sorpréndeme"',
    body:
      'Para cuando no sabes a dónde ir. La IA elige destinos reales (con vuelo directo confirmado) razonando sobre popularidad de la ruta, distancia y época del año -- no es un sorteo al azar. Respeta el mismo límite de combinaciones de arriba.'
  },
  {
    title: 'Describe tu viaje con tus palabras (el cuadro con el marco animado)',
    body:
      'Escribe la búsqueda en una frase normal (fechas, horas, destino, tema...) y una IA real la interpreta y precarga los filtros, explicándote cómo lo ha entendido. Revisa siempre la explicación antes de pulsar "Buscar con esta interpretación". Si la IA no está disponible, cae automáticamente a un analizador más simple, sin IA.'
  },
  {
    title: 'Explorar destinos (gratis)',
    body:
      'Muestra precios orientativos de otros viajeros reales (no en tiempo real, no reservables) para darte ideas de a dónde ir SIN gastar tu cuota de Ignav. Los destinos con nombre y botón "Buscar este" tienen vuelo directo confirmado desde tu origen; los que salen en gris son solo inspiración, sin verificar todavía.'
  },
  {
    title: 'Precio "bajo/normal/alto para esta ruta"',
    body:
      'Compara el precio de un resultado contra el promedio de precios que la propia app ha visto antes para esa misma ruta. Necesita al menos 3 búsquedas previas de esa ruta para aparecer -- al principio no verás esta etiqueta, se va llenando con el uso.'
  },
  {
    title: 'Filtro de aerolíneas, equipaje, open-jaw',
    body:
      'En el panel de filtros: aerolíneas preferidas/a evitar (nombre o código de 2-3 letras), exigir equipaje de mano incluido, y permitir open-jaw (llegar a un aeropuerto y salir de otro de la misma ciudad, ej. Londres).'
  },
  {
    title: 'Calendario de precios',
    body:
      'Para UN solo origen y UN solo destino, muestra el precio más barato encontrado cada día dentro de un rango (máx. 14 días). Útil para ver qué día conviene más antes de lanzar una búsqueda completa. También gasta cuota de Ignav (una petición por día consultado).'
  },
  {
    title: 'Alertas de precio',
    body:
      'Guarda una búsqueda con un precio máximo. Un proceso automático la revisa cada 3 días (antes era diario -- se redujo para no gastar cuota de fondo sin que lo notaras) y, si pones un email, te avisa cuando el precio baja de tu límite.'
  },
  {
    title: 'Comparador y vista lista',
    body:
      'Marca varios resultados para compararlos lado a lado (precio, hora de salida del hotel, aerolínea, open-jaw). El interruptor de vista cambia entre tarjetas grandes y una lista más compacta cuando hay muchos resultados.'
  },
  {
    title: 'Recomendación de la IA',
    body:
      'Tras una búsqueda con resultados, una IA revisa los primeros y marca uno como recomendado, explicando por qué -- considerando precio Y la hora de salida del hotel, no solo el precio más bajo.'
  },
  {
    title: '"Sale más barato otro día"',
    body:
      'Cuando dentro de tu rango de fechas hay otra combinación de la misma ruta que sale más barata, te lo dice directamente en la tarjeta. No gasta ninguna petición extra: compara resultados que ya has obtenido en la misma búsqueda.'
  },
  {
    title: 'Aviso de festivos',
    body:
      'Si tus fechas de ida o vuelta coinciden con un festivo público (en España o en el destino), aparece un aviso en la tarjeta -- relevante porque suele afectar al precio y a la aglomeración.'
  },
  {
    title: 'CO₂ estimado',
    body:
      'Estimación aproximada (no una medición certificada) de las emisiones del vuelo ida y vuelta, calculada con la distancia real entre aeropuertos. Está en "Más detalles del destino", dentro de cada tarjeta.'
  },
  {
    title: 'Clima habitual y tipo de cambio',
    body:
      'También en "Más detalles del destino": el clima típico para esas fechas (promedio de los últimos años, no un pronóstico exacto) y, si el destino usa una moneda distinta del euro, la conversión aproximada.'
  },
  {
    title: 'Historial y compartir',
    body:
      'Cada búsqueda que haces queda guardada en tu propio teléfono (no en un servidor) para repetirla con un toque. "Compartir esta búsqueda" genera un enlace que, al abrirlo, restaura los mismos filtros.'
  }
];

export default function HelpModal() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Ayuda: que hace cada cosa"
        className="p-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors"
      >
        <IconHelp className="w-4 h-4" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
          <div className="bg-white dark:bg-slate-900 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[85vh] overflow-y-auto p-5">
            <div className="flex items-center justify-between mb-3 sticky top-0 bg-white dark:bg-slate-900 pb-2">
              <h2 className="font-display text-lg text-ink dark:text-slate-100">¿Que hace cada cosa?</h2>
              <button
                onClick={() => setOpen(false)}
                aria-label="Cerrar ayuda"
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <IconX className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-2">
              {TOPICS.map((t) => (
                <details key={t.title} className="border-b border-slate-100 dark:border-slate-800 pb-2">
                  <summary className="text-sm font-medium text-ink dark:text-slate-100 cursor-pointer py-1.5">
                    {t.title}
                  </summary>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 pb-1">{t.body}</p>
                </details>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
