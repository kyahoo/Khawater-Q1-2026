import type { Config } from "tailwindcss";

export default {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        "arcade-bg": "#F4F4F5",
        "arcade-black": "#09090B",
        "arcade-accent": "#FFD000",
        "arcade-accent-hover": "#E6BB00",
        "arcade-surface": "#FFFFFF",
        "arcade-muted": "#A1A1AA",
        "khawater-blue": "#0B3A4A",
      },
    },
  },
} satisfies Config;
