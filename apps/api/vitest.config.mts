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
    root: import.meta.dirname,
  },
  resolve: {
    alias: {
      "@salon/shared": path.resolve(import.meta.dirname, "../../packages/shared/dist"),
    },
  },
});
