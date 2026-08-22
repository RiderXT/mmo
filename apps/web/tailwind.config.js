/** Tailwind's automatic opacity-modifier shorthand (e.g. `border-gold/40`, `bg-rarity-rare/10`)
 * only auto-injects an alpha channel for colors it recognizes as hex/rgb — a plain string like
 * `"oklch(76% 0.09 85)"` is opaque to that mechanism, so every `/NN` variant of it silently
 * generates no CSS rule at all (not an error — just missing). Wrapping each color as a function
 * receiving `{ opacityValue }` is Tailwind's documented escape hatch for non-hex color formats;
 * without it `/NN` classes across the whole app fall back to the browser/Tailwind default border
 * color instead of a translucent version of the real token. */
function oklch(l, c, h) {
  return ({ opacityValue }) => (opacityValue === undefined ? `oklch(${l} ${c} ${h})` : `oklch(${l} ${c} ${h} / ${opacityValue})`);
}

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Neutral (chroma 0) — matches what admin pages already showed via index.css's
        // .admin-scope override (oklch(12% 0 0), "#1d1d1d"-ish). Making the base token itself
        // neutral means every page gets the same flat background with no per-scope override
        // needed; cards (panel/panel-raised) intentionally untouched, still warm-toned.
        ink: oklch("12%", "0", "0"),
        panel: oklch("23%", "0.006", "45"),
        "panel-raised": oklch("28%", "0.007", "45"),
        line: oklch("40%", "0.035", "45"),
        "line-soft": oklch("48%", "0.035", "45"),
        gold: { DEFAULT: oklch("76%", "0.09", "85"), bright: oklch("80%", "0.14", "85") },
        parchment: { DEFAULT: oklch("92%", "0.01", "60"), dim: oklch("65%", "0.02", "50"), faint: oklch("60%", "0.02", "55") },
        hp: { DEFAULT: oklch("48%", "0.16", "25"), bright: oklch("58%", "0.16", "25") },
        mp: { DEFAULT: oklch("48%", "0.13", "250"), bright: oklch("62%", "0.13", "250") },
        rarity: {
          common: oklch("60%", "0.02", "50"),
          uncommon: oklch("68%", "0.09", "145"),
          rare: oklch("62%", "0.09", "250"),
          epic: oklch("50%", "0.12", "300"),
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
