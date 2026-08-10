import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.spec.ts"],
    globals: true,
    fileParallelism: false,
    passWithNoTests: true,
    setupFiles: ["./vitest.setup.ts"],
  },
  resolve: {
    alias: {
      "@salon/shared": path.resolve(import.meta.dirname, "../../packages/shared/dist/index.js"),
    },
  },
});