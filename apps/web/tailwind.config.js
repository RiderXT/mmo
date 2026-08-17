/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "oklch(12% 0.02 45)",
        panel: "oklch(19% 0.025 45)",
        "panel-raised": "oklch(24% 0.03 45)",
        line: "oklch(33% 0.035 45)",
        "line-soft": "oklch(38% 0.035 45)",
        gold: { DEFAULT: "oklch(76% 0.09 85)", bright: "oklch(80% 0.14 85)" },
        parchment: { DEFAULT: "oklch(92% 0.01 60)", dim: "oklch(65% 0.02 50)", faint: "oklch(50% 0.02 55)" },
        hp: { DEFAULT: "oklch(48% 0.16 25)", bright: "oklch(58% 0.16 25)" },
        mp: { DEFAULT: "oklch(48% 0.13 250)", bright: "oklch(62% 0.13 250)" },
        rarity: {
          common: "oklch(60% 0.02 50)",
          uncommon: "oklch(68% 0.09 145)",
          rare: "oklch(62% 0.09 250)",
          epic: "oklch(50% 0.12 300)",
        },
      },
      fontFamily: {
        display: ["Cinzel", "Cambria", "Iowan Old Style", "Palatino Linotype", "Georgia", "serif"],
        sans: ["Inter", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
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
