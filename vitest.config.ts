import { defineConfig } from "vitest/config";
import path from "path";
import react from "@vitejs/plugin-react";

const aliases = {
  "@": path.resolve(__dirname, "client/src"),
  "@shared": path.resolve(__dirname, "shared"),
  "@assets": path.resolve(__dirname, "attached_assets"),
};

export default defineConfig({
  resolve: { alias: aliases },
  test: {
    projects: [
      {
        resolve: { alias: aliases },
        test: {
          name: "server",
          environment: "node",
          include: ["tests/server/**/*.test.ts"],
          globals: false,
        },
      },
      {
        plugins: [react()],
        resolve: { alias: aliases },
        test: {
          name: "client",
          environment: "jsdom",
          setupFiles: ["./tests/client/setup.ts"],
          include: ["tests/client/**/*.test.{ts,tsx}"],
          globals: false,
        },
      },
    ],
  },
});
