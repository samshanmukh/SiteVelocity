import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "generated/**",
      "next-env.d.ts",
      "eslint.config.mjs",
    ],
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      // Contract tests exercise generated modules through untyped surfaces.
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
);
