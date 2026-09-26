import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    env: {
      USDT_CONTRACT_ADDRESS:
        process.env.USDT_CONTRACT_ADDRESS ||
        "0x55d398326f99059fF775485246999027B3197955",
      DEPOSIT_WALLET:
        process.env.DEPOSIT_WALLET ||
        "0xc051a1b111085ddD6Bc2FF8346Ad0f4E7dF26935",
      WITHDRAW_WALLET:
        process.env.WITHDRAW_WALLET ||
        "0x48A909049FB00581CA83beA39BB824eBb90132FA",
    },
  },
  resolve: {
    alias: {
      "@": resolve(root, "."),
    },
  },
});
