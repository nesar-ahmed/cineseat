/** @type {import('tailwindcss').Config} */
const config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // One extra breakpoint so the seat map and nav behave on large phones.
      screens: { xs: '480px' },
      colors: {
        // Blue-tinted neutrals: richer than pure gray on a dark screen.
        ink: {
          50: '#f6f6fa',
          100: '#e8e8f0',
          200: '#c9c9d8',
          300: '#a3a3b8',
          400: '#7c7c94',
          500: '#5b5b72',
          600: '#41415a',
          700: '#2e2e43',
          800: '#1d1d2e',
          850: '#161624',
          900: '#111120',
          950: '#08080f',
        },
        // Rose stays the action colour (phase 0 palette, kept intact).
        brand: {
          50: '#fef3f2',
          200: '#fbc6cf',
          300: '#f89bb0',
          400: '#f2607f',
          500: '#e11d48',
          600: '#be123c',
          700: '#93123a',
          800: '#6b1030',
          900: '#4c0519',
        },
        // Gold for the "premium" moments: ratings, holds, ticket stubs.
        gold: {
          100: '#fbf3dd',
          200: '#f5e4b6',
          300: '#eed38c',
          400: '#e6b95c',
          500: '#d99f34',
          600: '#b07d1e',
          700: '#7d5814',
        },
        // Seat states need to read as colour + shape, so each gets its own tone.
        seat: {
          free: '#22223a',
          hover: '#2f2f4d',
          held: '#e6b95c',
          booked: '#15151f',
          taken: '#e11d48',
        },
      },
      fontFamily: {
        display: ['var(--font-display)'],
        sans: ['var(--font-sans)'],
        mono: ['var(--font-mono)'],
      },
      boxShadow: {
        card: '0 1px 0 0 rgba(255,255,255,0.05) inset, 0 24px 50px -30px rgba(0,0,0,0.95)',
        glow: '0 0 0 1px rgba(225,29,72,0.35), 0 18px 45px -20px rgba(225,29,72,0.65)',
        lift: '0 34px 70px -34px rgba(0,0,0,0.95)',
        inset: 'inset 0 1px 0 0 rgba(255,255,255,0.07)',
      },
      keyframes: {
        'seat-pulse': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.55' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-6px)' },
        },
        sweep: {
          '0%': { transform: 'translateX(-120%)' },
          '100%': { transform: 'translateX(220%)' },
        },
      },
      animation: {
        'seat-pulse': 'seat-pulse 2.4s ease-in-out infinite',
        float: 'float 7s ease-in-out infinite',
        sweep: 'sweep 2.8s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

module.exports = config;
