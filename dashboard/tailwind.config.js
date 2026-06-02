/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bgMain: "#070a13",
        bgSidebar: "#0b0f19",
        bgCard: "rgba(22, 30, 49, 0.55)",
        colorNormal: "#10b981",
        colorWarning: "#f59e0b",
        colorCritical: "#ef4444",
        colorBlue: "#3b82f6",
      },
      fontFamily: {
        sans: ["Inter", "sans-serif"],
      },
    },
  },
  plugins: [],
}
