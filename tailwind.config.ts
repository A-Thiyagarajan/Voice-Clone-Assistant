import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      boxShadow: {
        glass: "0 24px 80px rgba(15, 23, 42, 0.24)"
      },
      animation: {
        "soft-pulse": "softPulse 2.2s ease-in-out infinite",
        float: "float 7s ease-in-out infinite"
      },
      keyframes: {
        softPulse: {
          "0%, 100%": { transform: "scale(1)", opacity: "0.86" },
          "50%": { transform: "scale(1.04)", opacity: "1" }
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-10px)" }
        }
      }
    }
  },
  plugins: []
};

export default config;
