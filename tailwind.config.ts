import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        "nhs-blue": "#005EB8",
        "nhs-blue-dark": "#003d7a",
        "nhs-blue-light": "#4190d0",
        "nhs-aqua": "#00A9CE",
        "nhs-green": "#009639",
        "nhs-red": "#DA291C",
        "off-white": "#F0F4F9",
        slate: "#425563",
        "slate-light": "#768692",
        border: "#D8E0E8",
      },
      fontFamily: {
        sans: ["DM Sans", "system-ui", "sans-serif"],
        serif: ["DM Serif Display", "Georgia", "serif"],
      },
      boxShadow: {
        card: "0 2px 12px rgba(0,94,184,0.08)",
        "card-hover": "0 8px 32px rgba(0,94,184,0.16)",
      },
    },
  },
  plugins: [],
};

export default config;
