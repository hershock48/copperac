import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

// The project shipped with no linter at all, which is how a hardcoded
// price: "10.00" in structured data goes unnoticed.
const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

const config = [
  { ignores: [".next/**", "node_modules/**", "out/**", "next-env.d.ts", "*.config.mjs"] },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
];

export default config;
