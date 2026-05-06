/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: "#4f46e5",
        success: "#22c55e",
        danger: "#ef4444",
        surface: "#f5f6f8",
        ink: "#111827",
        muted: "#6b7280",
        line: "#e5e7eb"
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"]
      },
      boxShadow: {
        soft: "0 10px 30px rgba(15, 23, 42, 0.06)"
      }
    }
  },
  plugins: []
};
