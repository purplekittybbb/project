import type { Config } from "tailwindcss";

/**
 * Design tokens — build-plan.md section 4 (anti-slop).
 * Single teal accent; green/red are SEMANTIC only (profit / erosion), used sparingly.
 * No cream, no terracotta, no serif display, no gradients.
 */
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: "#0F1417", // cold near-black — background / text
        surface: "#F5F7F6", // cold paper — NOT cream
        accent: "#0E6E6B", // disciplined petrol/teal — the single accent
        profit: "#157F5B", // semantic green — positive delta only
        erosion: "#B4432E", // semantic red — negative delta / erosion only
      },
      fontFamily: {
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        body: ["var(--font-body)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
