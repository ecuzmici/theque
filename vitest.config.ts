import path from "node:path";
import react from "@vitejs/plugin-react";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    // Ignore git worktrees living under `./.worktrees/` (nested node_modules/tests)
    // and the Playwright e2e runner (standalone tsx script, run via `npm run test:e2e`).
    exclude: [...configDefaults.exclude, "**/.worktrees/**", "e2e/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // next-view-transitions' ESM entry imports next/link in a way vitest can't
      // resolve; use a pass-through stub for component tests (see the stub file).
      "next-view-transitions": path.resolve(
        __dirname,
        "./src/test/next-view-transitions-stub.tsx",
      ),
    },
  },
});
