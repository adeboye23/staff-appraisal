/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#6366f1",
          50: "#eef0ff",
          100: "#e0e3ff",
          500: "#6366f1",
          600: "#5b5cf0",
          700: "#4f46e5"
        },
        success: "#10b981",
        danger: "#f43f5e",
        surface: "#f4f3fb",
        ink: "#0b0820",
        muted: "#6b7280",
        line: "#e5e7eb"
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        display: [
          "Plus Jakarta Sans",
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "sans-serif"
        ],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "monospace"]
      },
      boxShadow: {
        soft: "0 10px 30px rgba(15, 23, 42, 0.06)",
        glow: "0 20px 50px -20px rgba(99, 102, 241, 0.55)",
        ring: "0 0 0 1px rgba(255,255,255,0.6) inset, 0 20px 60px -20px rgba(15,23,42,0.25)"
      },
      backgroundImage: {
        "brand-gradient":
          "linear-gradient(135deg,#6366f1 0%,#8b5cf6 45%,#ec4899 100%)",
        "brand-soft":
          "linear-gradient(135deg,rgba(99,102,241,0.14) 0%,rgba(236,72,153,0.10) 100%)"
      },
      keyframes: {
        floatA: {
          "0%,100%": { transform: "translate(0,0) scale(1)" },
          "50%": { transform: "translate(30px,-20px) scale(1.05)" }
        },
        floatB: {
          "0%,100%": { transform: "translate(0,0) scale(1)" },
          "50%": { transform: "translate(-25px,25px) scale(1.08)" }
        },
        shimmer: {
          "0%": { backgroundPosition: "-400px 0" },
          "100%": { backgroundPosition: "400px 0" }
        }
      },
      animation: {
        floatA: "floatA 14s ease-in-out infinite",
        floatB: "floatB 18s ease-in-out infinite",
        shimmer: "shimmer 2.2s linear infinite"
      }
    }
  },
  plugins: []
};
