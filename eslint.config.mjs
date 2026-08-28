// @ts-check
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";
import globals from "globals";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/dist-e2e/**",
      "**/build/**",
      "**/.next/**",
      "**/out/**",
      "**/coverage/**",
      "**/.vitest/**",
      "**/*.tsbuildinfo",
      "**/.claude/**",
      "**/.agents/**",
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-explicit-any": "error",
      "no-console": "warn",
    },
  },
  {
    // SECURITY_AUDIT_REPORT.md F-03: apps/web keeps a long-lived customer
    // refresh token in localStorage (necessary given the cross-origin Render
    // deployment — see the finding for why), which makes staying free of new
    // XSS sinks a hard requirement there, not just good practice. apps/admin
    // gets the same guard for the same reason at a smaller scale (its own
    // session lives in sessionStorage). No new dependency needed —
    // `no-restricted-syntax` is a core ESLint rule.
    files: ["apps/web/src/**/*.{ts,tsx}", "apps/admin/src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
          message:
            "dangerouslySetInnerHTML in an app that stores a session token in browser storage " +
            "(SECURITY_AUDIT_REPORT.md F-03) needs a second look before merging — confirm the " +
            "HTML is never derived from user input, sanitize it if it ever is, and note the " +
            "reasoning in a comment next to this usage.",
        },
        {
          selector: "AssignmentExpression[left.property.name=/^(innerHTML|outerHTML)$/]",
          message: "Assigning innerHTML/outerHTML directly is an XSS sink — see F-03. Use React rendering instead.",
        },
        {
          selector: "CallExpression[callee.object.name='document'][callee.property.name='write']",
          message: "document.write is an XSS sink — see F-03.",
        },
        {
          selector: "NewExpression[callee.name='Function']",
          message: "new Function(...) executes a string as code — see F-03.",
        },
      ],
    },
  },
  prettier,
);