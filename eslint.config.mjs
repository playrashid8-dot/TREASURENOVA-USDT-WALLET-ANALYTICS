import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([".next/**", "out/**", "build/**", "node_modules/**", "coverage/**"]),
  {
    rules: {
      // Client dashboard polls APIs on mount / filter change — intentional.
      "react-hooks/set-state-in-effect": "off",
    },
  },
]);

export default eslintConfig;
