/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'base': '#202020',
        'panel': '#2B2B2B',
        'well': '#161616',
        'highlight': '#1A2F3D',
        'primary': '#F0F0F0',
        'secondary': '#8C8C8C',
        'accent': '#78B3CE',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [],
};
