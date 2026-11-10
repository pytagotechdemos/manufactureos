import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    conditions: ["react-server"],
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(new URL("./tests/server-only.ts", import.meta.url)),
    },
  },
  test: {
    testTimeout: 120_000,
    hookTimeout: 120_000,
    environment: "node",
    environmentOptions: {
      node: { conditions: ["react-server"] },
    },
  },
});
