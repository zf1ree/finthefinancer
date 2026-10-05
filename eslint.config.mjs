import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import boundaries from "eslint-plugin-boundaries";

// Camadas (docs/arquitetura.md, seção "Camadas"):
// domain só depende de si mesmo; application depende de domain e das próprias portas;
// infrastructure implementa as portas; app (rotas/páginas) compõe tudo.
const layers = [
  { type: "app", pattern: "src/app" },
  { type: "components", pattern: "src/components" },
  { type: "application", pattern: "src/application" },
  { type: "domain", pattern: "src/domain" },
  { type: "infrastructure", pattern: "src/infrastructure" },
  { type: "ai", pattern: "src/ai" },
  { type: "lib", pattern: "src/lib" },
];

const allow = (from, to) => ({
  from: { element: { type: from } },
  allow: { to: { element: { types: { anyOf: to } } } },
});

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: { boundaries },
    settings: {
      "boundaries/elements": layers,
      "boundaries/include": ["src/**/*"],
      "import/resolver": { typescript: { alwaysTryTypes: true } },
    },
    rules: {
      "boundaries/dependencies": [
        2,
        {
          default: "disallow",
          policies: [
            allow("domain", ["domain"]),
            allow("lib", ["lib"]),
            allow("application", ["application", "domain", "lib"]),
            allow("infrastructure", ["infrastructure", "application", "domain", "lib"]),
            allow("ai", ["ai", "application", "domain", "lib"]),
            allow("components", ["components", "domain", "lib"]),
            allow("app", [
              "app",
              "components",
              "application",
              "infrastructure",
              "ai",
              "domain",
              "lib",
            ]),
          ],
        },
      ],
    },
  },
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "playwright-report/**",
    "test-results/**",
  ]),
]);

export default eslintConfig;
