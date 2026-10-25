import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Live product code must use the API engine, never the illustrative TypeScript engine or demo data.
    files: ["src/app/terminal/**", "src/components/terminal/**", "src/lib/api/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["@/lib/finance/*", "**/lib/finance/*"], message: "Live screens must use the API engine (no client-side financial maths)." },
            { group: ["@/lib/data/*", "**/lib/data/*"], message: "Live screens must not use illustrative demo data." },
          ],
        },
      ],
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "src/lib/api/schema.d.ts"]),
]);
