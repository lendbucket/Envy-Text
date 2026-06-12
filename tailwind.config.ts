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
        canvas: "#F7F8FA",
        panel: "#FFFFFF",
        border: "#E4E7EC",
        primary: "#111827",
        secondary: "#6B7280",
        accent: {
          DEFAULT: "#2563EB",
          hover: "#1D4ED8",
          tint: "#EFF4FF",
        },
        delivered: "#16A34A",
        failed: "#DC2626",
        scheduled: "#D97706",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        display: ["var(--font-inter)", "system-ui", "sans-serif"],
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
