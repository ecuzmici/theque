import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    ".agent/**",
    ".cursor/**",
    ".worktrees/**",
    // Agent worktrees and session files (gigabytes of copies of the repo).
    ".claude/**",
    // Extension build output (`npm run build:extension` compiles the .ts sources).
    "extension/popup.js",
    "extension/background.js",
    "extension/category-hints.js",
    "extension/page-snapshot.js",
  ]),
]);

export default eslintConfig;
