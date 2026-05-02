/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'spotify-green': '#1DB954',
        'spotify-black': '#121212',
        'spotify-dark': '#181818',
        'spotify-gray': '#282828',
        'spotify-light-gray': '#B3B3B3',
      },
    },
  },
  plugins: [],
}
