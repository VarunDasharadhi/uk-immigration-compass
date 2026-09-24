/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    './index.html',
    './*.tsx',
    './*.ts',
    './components/**/*.{ts,tsx}',
    './services/**/*.{ts,tsx}',
    './scripts/generate-archive-prerender.mjs',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};
