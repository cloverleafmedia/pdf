/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        clover: {
          50:  '#edfdf5',
          100: '#d3f9e6',
          200: '#aaf0ce',
          300: '#72e2b0',
          400: '#38cc8c',
          500: '#16b074',
          600: '#0d8f5e',
          700: '#0c724d',
          800: '#0d5b3e',
          900: '#0c4b34',
          950: '#042a1e',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
    },
  },
  plugins: [],
}
