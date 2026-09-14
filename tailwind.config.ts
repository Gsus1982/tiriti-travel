import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Tema oscuro/dorado de lujo (ref. private-jet booking UI). Antes existia una
        // paleta 'brand' azul sin relacion con el resto de la app, usada solo por
        // RouteMap.tsx, que se habia quedado en el tema claro original.
        ink: {
          DEFAULT: '#0a0c10',
          panel: '#12151b'
        },
        gold: {
          DEFAULT: '#c9a24a',
          light: '#dab765',
          dim: '#8a723a'
        }
      },
      fontFamily: {
        sans: ['ui-sans-serif', '-apple-system', 'Segoe UI', 'system-ui', 'sans-serif'],
        display: ['Iowan Old Style', 'Palatino Linotype', 'Georgia', 'ui-serif', 'serif']
      }
    }
  },
  plugins: []
};

export default config;
