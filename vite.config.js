/// <reference types="vitest" />
/// <reference types="vite/client" />

import { resolve } from "path";
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

// https://vitejs.dev/config/
export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, "src/index.ts"),
      name: "@benpowley/usestream",
      fileName: "use-stream",
    },
    rollupOptions: {
      external: ["react"],
    },
  },
  // test: {
  //   globals: true,
  //   environment: "happy-dom",
  //   setupFiles: "./src/Tests/setup.ts",
  //   coverage: {
  //     reporter: ["text", "json", "html"],
  //   },
  // },
  plugins: [dts()],
});
