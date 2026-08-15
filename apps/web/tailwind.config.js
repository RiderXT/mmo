/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0e0c0a",
        panel: "#1d1712",
        "panel-raised": "#241d16",
        line: "#4a3c28",
        "line-soft": "#322a1f",
        gold: { DEFAULT: "#c9a227", bright: "#e2bd4e" },
        parchment: { DEFAULT: "#e8dfc9", dim: "#a89b7e", faint: "#6f6551" },
        hp: { DEFAULT: "#8b2635", bright: "#b1394a" },
        mp: { DEFAULT: "#2e6f80", bright: "#3f95ab" },
        rarity: {
          common: "#8a8477",
          uncommon: "#5b8c4b",
          rare: "#3e6fa6",
          epic: "#7b4fa6",
        },
      },
      fontFamily: {
        display: ["Cambria", "Iowan Old Style", "Palatino Linotype", "Georgia", "serif"],
        mono: [
          "SFMono-Regular",
          "Consolas",
          "Liberation Mono",
          "Menlo",
          "monospace",
        ],
      },
    },
  },
  plugins: [],
};
