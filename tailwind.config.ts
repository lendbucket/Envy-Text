import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        canvas: "#FAF7F2",
        panel: "#FFFFFF",
        border: "#E8E2D8",
        primary: "#1C1410",
        secondary: "#6F6258",
        accent: {
          DEFAULT: "#B0445C",
          hover: "#9C3B50",
        },
        delivered: "#2E7D52",
        failed: "#C03434",
        scheduled: "#9A6B15",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        display: ["var(--font-fraunces)", "serif"],
      },
      borderRadius: {
        xl: "0.75rem",
      },
      spacing: {
        sidebar: "14rem",
      },
    },
  },
  plugins: [],
};

export default config;
