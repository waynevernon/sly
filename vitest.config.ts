import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config";

export default defineConfig(async (configEnv) =>
  mergeConfig(
    await viteConfig(configEnv),
    defineConfig({
      test: {
        environment: "jsdom",
        globals: true,
        setupFiles: ["./src/test/setup.ts"],
        include: ["src/**/*.test.{ts,tsx}"],
      },
    }),
  ),
);
