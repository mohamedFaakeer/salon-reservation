import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      "packages/shared/vitest.config.mts",
      "apps/api/vitest.config.mts",
    ],
  },
});