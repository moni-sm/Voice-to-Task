/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'brand-blue': '#2f81f7',
        'brand-dark': '#0d1117',
        'brand-gray': '#161b22',
      }
    },
  },
  plugins: [],
}
