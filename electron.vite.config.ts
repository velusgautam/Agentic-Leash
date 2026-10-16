import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "electron-vite";

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        input: {
          index: resolve("src/main/index.ts"),
          "leash-hook": resolve("src/hook/leash-hook.ts"),
          "leash-helper": resolve("src/helper/leash-helper.ts"),
        },
      },
    },
  },
  preload: {},
  renderer: {
    resolve: { alias: { "~": resolve("src/renderer/src") } },
    plugins: [react(), tailwindcss()],
  },
});
