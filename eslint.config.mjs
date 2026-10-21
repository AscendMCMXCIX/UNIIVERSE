import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const LOCALE_MESSAGE = "Write dates and numbers with src/lib/format.ts (formatDate, formatDateTime, formatCount, formatNumber, ...): the same text on the server and in every browser.";

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    ignores: [".next/**", "out/**", "node_modules/**", ".data/**", "drizzle/**", "next-env.d.ts"],
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  {
    // Pages and components write dates and numbers only through src/lib/format.ts, so the server
    // and every browser write the same text whatever the reader's language and time zone; text
    // that differs breaks hydration (docs/STANDARDS.md, Dates and numbers).
    files: ["src/components/**/*.{ts,tsx}", "src/app/**/*.{ts,tsx}"],
    ignores: ["**/*.test.ts", "**/*.test.tsx"],
    rules: {
      "no-restricted-syntax": [
        "error",
        { selector: "CallExpression[callee.property.name=/^toLocale(Date|Time)?String$/]", message: LOCALE_MESSAGE },
        { selector: "NewExpression[callee.object.name='Intl'][callee.property.name=/^(DateTimeFormat|NumberFormat|RelativeTimeFormat|ListFormat|PluralRules)$/]", message: LOCALE_MESSAGE },
        { selector: "CallExpression[callee.object.name='Intl'][callee.property.name=/^(DateTimeFormat|NumberFormat|RelativeTimeFormat|ListFormat|PluralRules)$/]", message: LOCALE_MESSAGE },
      ],
    },
  },
];

export default eslintConfig;
