import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      exclude: ["src/**/*.d.ts", "src/**/types.ts", "src/app.ts"],
      include: ["src/**/*.ts"],
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      reportsDirectory: "coverage"
    },
    environment: "node",
    include: ["test/**/*.test.ts"]
  }
});
