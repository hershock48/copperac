import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// The project shipped with no linter at all, which is how a hardcoded
// price: "10.00" in structured data goes unnoticed.
//
// Next 16's config package is native flat config, so it is spread in
// directly. The FlatCompat shim it replaced started failing on a circular
// plugin reference the moment the package went native.
export default defineConfig([
  globalIgnores([".next/**", "node_modules/**", "out/**", "next-env.d.ts", "*.config.mjs"]),
  ...nextVitals,
  ...nextTs,
  {
    // The route tests are CommonJS on purpose: they compile a TypeScript
    // route in a vm sandbox with a hand-rolled require, and `module` is the
    // sandbox's own. The two rules below are about app code, not that.
    files: ["lib/__tests__/**/*.cjs"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
      "@next/next/no-assign-module-variable": "off",
    },
  },
]);
