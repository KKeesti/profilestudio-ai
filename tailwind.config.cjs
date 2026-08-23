/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './index.html',
    './index.tsx',
    './App.tsx',
    './Header.tsx',
    './constants.tsx',
    './components/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        gold: '#c2a35d',
        dark: '#05070a',
        lab: {
          paper: '#f4f7f5',
          white: '#ffffff',
          ink: '#15302b',
          teal: '#08786f',
          coral: '#f1694f',
          mist: '#dfe9e5',
          line: '#c7d6d1',
        },
      },
      fontFamily: {
        serif: ['Playfair Display', 'serif'],
        sans: ['Inter', 'sans-serif'],
        lab: ['Onest', 'Arial', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
