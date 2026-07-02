// All design tokens (colors, typography, border-radius, animations) live in
// app/globals.css @theme — the single source of truth for the design system.
// This file is kept minimal: only content paths and plugins belong here.
export default {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./modules/**/*.{js,ts,jsx,tsx}",
    "./hooks/**/*.{js,ts,jsx,tsx}",
    "./lib/**/*.{js,ts,jsx,tsx}",
  ],
  plugins: [],
};
