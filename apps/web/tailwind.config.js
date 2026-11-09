/** @type {import('tailwindcss').Config} */
const config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#fef3f2',
          500: '#e11d48',
          600: '#be123c',
          900: '#4c0519',
        },
      },
    },
  },
  plugins: [],
};

module.exports = config;
