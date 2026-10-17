import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // React Compiler optimization hints, kept as warnings (still visible in
      // `npm run lint`) rather than build-blocking errors. These flag spots the
      // compiler declined to optimize — not runtime bugs; the app builds and
      // runs correctly. Most set-state-in-effect cases are legitimate lifecycle
      // patterns (mount hydration, resetting state on prop change).
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
      "react-hooks/refs": "warn",
      // Respect the leading-underscore convention for intentionally-unused
      // bindings (function params, caught errors).
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
  // Turn off ESLint rules that conflict with Prettier (must be last).
  prettier,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next, widened to any depth: a git
    // worktree checked out inside the repo (e.g. .claude/worktrees/*) carries
    // its own build output, and a root-relative ".next/**" would not match it,
    // so `npm run check` failed on generated bundles.
    "**/.next/**",
    "**/out/**",
    "**/build/**",
    "next-env.d.ts",
    // Generated coverage report (contains its own eslint-disable directives).
    "**/coverage/**",
    // Harness-managed state and scratch worktrees, never our sources.
    ".claude/**",
    // The Python backend's virtualenv can ship vendored JS.
    "**/.venv/**",
  ]),
]);

export default eslintConfig;
