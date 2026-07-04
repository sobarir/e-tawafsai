import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.spec.ts"],
    exclude: ["**/*.int.spec.ts", "**/node_modules/**"],
  },
  plugins: [
    swc.vite({ module: { type: "es6" } }),
  ],
});
