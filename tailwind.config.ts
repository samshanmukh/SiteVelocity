import type { Config } from "tailwindcss";

/**
 * Minimal Tailwind config for Alpha UI generation.
 * Presentation tokens may expand after `pdd generate`; keep committed config lean.
 */
const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
    "./generated/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};

export default config;
