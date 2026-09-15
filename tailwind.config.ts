import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Tema claro con acento indigo (ref. private-jet booking UI real que mando el
        // usuario). El nav superior y los titulares usan 'ink' (casi negro); las
        // tarjetas son blancas sobre un fondo de cielo suave definido en globals.css.
        ink: {
          DEFAULT: '#0e1013',
          soft: '#4b5165'
        },
        indigo: {
          DEFAULT: '#6366f1',
          light: '#818cf8',
          dark: '#4f46e5',
          pale: '#eef1ff'
        }
      },
      fontFamily: {
        sans: ['ui-sans-serif', '-apple-system', 'Segoe UI', 'system-ui', 'sans-serif'],
        display: ['Iowan Old Style', 'Palatino Linotype', 'Georgia', 'ui-serif', 'serif'],
        // Fuente solo para el logotipo "Tiriti Travel" en el nav -- caracter
        // desenfadado/bohemio a proposito, usada UNICAMENTE ahi, nunca en el resto de
        // la UI, para que no desentone con el resto del diseno (limpio y funcional).
        logo: ['Pacifico', 'cursive']
      }
    }
  },
  plugins: []
};

export default config;
