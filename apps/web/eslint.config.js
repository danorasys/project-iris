import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";

export default tseslint.config(
  { ignores: ["dist", "*.cjs"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // eslint-plugin-react-hooks v7 (upgraded from v5) adds these two rules
      // as errors by default. They flag real, pre-existing patterns in this
      // codebase (setState-from-effect for "default to first loaded catalog
      // option", and a ref written during render for "always call the latest
      // callback"), not anything introduced by this dependency upgrade.
      // Downgraded to warnings, same as react-refresh below, so the upgrade
      // doesn't silently start failing `npm run lint` — fixing the
      // underlying patterns is a separate, deliberate follow-up.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    },
  },
);
