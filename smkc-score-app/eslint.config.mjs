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
    ".open-next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "e2e/**", // Add e2e test files to ignore
    "coverage/**", // Add coverage directory to ignore
    "scripts/**", // Node.js utility scripts use CommonJS require() intentionally
    "bm-debug*.js",
    "bm-group-debug.js",
  ]),
  {
    rules: {
      '@typescript-eslint/ban-ts-comment': 'off',
      // Allow underscore-prefixed parameters/variables to be unused.
      // This is the standard convention for intentionally unused parameters
      // (e.g., mock functions that document future production signatures).
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['**/__tests__/**', '**/*.test.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
]);

export default eslintConfig;
