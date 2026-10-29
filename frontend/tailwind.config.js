/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'ieps-blue': {
          50: '#e8edf5',
          100: '#d4deec',
          200: '#a9bdd9',
          300: '#7e9cc6',
          400: '#537bb3',
          500: '#2a4a8a',
          600: '#1a2a6c',
          700: '#15224d',
          800: '#0f192e',
          900: '#0a0f1f',
        },
        'ieps-gold': {
          50: '#fff9e6',
          100: '#fff3cc',
          200: '#ffe799',
          300: '#ffdb66',
          400: '#ffcf33',
          500: '#ffd700',
          600: '#e6c200',
          700: '#b39900',
          800: '#806600',
          900: '#4d3d00',
        }
      },
      animation: {
        'fadeIn': 'fadeIn 0.3s ease-in-out',
        'slideDown': 'slideDown 0.3s ease-out',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(-10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideDown: {
          '0%': { opacity: '0', transform: 'translateY(-20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        }
      }
    },
  },
  plugins: [],
}