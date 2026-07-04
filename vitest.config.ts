import path from "node:path";
import react from "@vitejs/plugin-react";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    // Ignore git worktrees living under `./.worktrees/` and `.claude/worktrees/`
    // (nested node_modules/tests) and the Playwright e2e runner (standalone tsx
    // script, run via `npm run test:e2e`).
    exclude: [
      ...configDefaults.exclude,
      "**/.worktrees/**",
      "**/.claude/worktrees/**",
      "e2e/**",
    ],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
