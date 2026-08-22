import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        // Sơn son thếp vàng — đỏ sơn mài, vàng thếp, mực nho, giấy dó
        clan: {
          red: "#7E1C1C",
          "red-dark": "#571313",
          gold: "#C6A15B",
          "gold-light": "#E4C879",
          brown: "#4A3B2E",
          cream: "#F3ECDD",
          ink: "#211A16"
        }
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        serif: ["var(--font-serif)", "Georgia", "serif"]
      },
      boxShadow: {
        plaque: "0 1px 0 rgba(198,161,91,.4), 0 20px 45px -20px rgba(0,0,0,.55)",
        tablet: "0 1px 0 rgba(198,161,91,.35), 0 10px 24px -14px rgba(33,26,22,.45)"
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" }
        },
        "seal-in": {
          "0%": { opacity: "0", transform: "rotate(-8deg) scale(1.4)" },
          "60%": { opacity: "1" },
          "100%": { opacity: "1", transform: "rotate(-6deg) scale(1)" }
        }
      },
      animation: {
        "fade-in": "fade-in 0.5s ease-out both",
        "seal-in": "seal-in 0.7s cubic-bezier(.2,.7,.3,1) 0.3s both"
      }
    }
  },
  plugins: []
};

export default config;
