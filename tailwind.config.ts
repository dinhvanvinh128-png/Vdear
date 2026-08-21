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
        // Bảng màu truyền thống: đỏ trầm, vàng, nâu gỗ
        clan: {
          red: "#8a1f1f",
          "red-dark": "#6d1717",
          gold: "#c9a227",
          "gold-light": "#e4c76a",
          brown: "#5c4433",
          cream: "#f7f2e9",
          ink: "#2b2420"
        }
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        serif: ["var(--font-serif)", "Georgia", "serif"]
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "translateY(0)" }
        }
      },
      animation: {
        "fade-in": "fade-in 0.4s ease-out both"
      }
    }
  },
  plugins: []
};

export default config;
