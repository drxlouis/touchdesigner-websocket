import { defineConfig } from "vite";

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        control: "index.html",
        window: "window.html",
      },
    },
  },
});
