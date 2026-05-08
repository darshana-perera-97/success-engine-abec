/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}", "./public/index.html"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      colors: {
        nexgenai: {
          navy: "#0F172A",
          charcoal: "#0F1115",
          slate: "#F9FAFB",
          border: "#E2E8F0",
        },
      },
    },
  },
  plugins: [],
};
