import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    exclude: ["references/**", "node_modules/**", ".next/**"],
    include: ["tests/unit/**/*.test.ts"],
  },
});
