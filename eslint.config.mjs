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
]);
