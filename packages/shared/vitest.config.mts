import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.{spec,test}.ts"],
    passWithNoTests: true,
    setupFiles: ["./vitest.setup.ts"],
    root: import.meta.dirname,
  },
});
