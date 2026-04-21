import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [tailwindcss(), react()],
  base: "./", // relative paths for GitHub Pages deployment
  build: {
    outDir: "dist",
    target: "es2022",
  },
});
