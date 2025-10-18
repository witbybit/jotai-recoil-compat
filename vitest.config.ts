import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "happy-dom",
    setupFiles: [],
    environmentOptions: {
      happyDOM: {
        settings: {
          disableJavaScriptEvaluation: false,
        },
      },
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
    },
  },
  resolve: {
    conditions: ["browser"],
  },
});
