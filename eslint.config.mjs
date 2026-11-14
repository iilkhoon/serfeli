import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // `const { secret, ...rest } = value` is the project's way of omitting fields.
      "@typescript-eslint/no-unused-vars": ["error", { ignoreRestSiblings: true }],
      // Merchant logos and product photos are remote URLs; no next/image optimizer is configured.
      "@next/next/no-img-element": "off",
      // The storefront is one catch-all page that routes itself; plain links do full navigations on purpose.
      "@next/next/no-html-link-for-pages": "off",
    },
  },
  globalIgnores(["dist/**", ".vinext/**", ".wrangler/**", ".runtime/**", "outputs/**", "work/**"]),
  {
    files: ["components/ui/**/*.{ts,tsx}", "hooks/use-mobile.ts"],
    rules: {
      // These files are vendored verbatim from shadcn@4.17.0. Keep the
      // registry source intact while applying the stricter rules to Site code.
      "@typescript-eslint/no-unused-vars": "off",
      "react-hooks/purity": "off",
      "react-hooks/set-state-in-effect": "off",
    },
  },
]);

export default eslintConfig;
