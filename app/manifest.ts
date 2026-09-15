import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Tiriti Travel',
    short_name: 'Tiriti Travel',
    description: 'Metabuscador personal de vuelos directos, sin escalas, con datos en vivo de Ignav',
    start_url: '/',
    display: 'standalone',
    background_color: '#0e1013',
    theme_color: '#0e1013',
    icons: [
      { src: '/icon', sizes: '64x64', type: 'image/png' },
      { src: '/apple-icon', sizes: '180x180', type: 'image/png' }
    ]
  };
}
