export const presets = {
  oxc: {
    dependencies: { oxfmt: "0.77.0", oxlint: "1.92.0" },
    scripts: {
      "quality:format": "oxfmt --check . '!**/quality-gate.config.json'",
      "quality:lint": "oxlint --deny-warnings --ignore-pattern '**/node_modules/**'",
    },
    checks: [
      { name: "Oxfmt", kind: "format", script: "quality:format", concurrent: true },
      { name: "Oxlint", kind: "lint", script: "quality:lint", concurrent: true },
    ],
  },
  biome: {
    dependencies: { "@biomejs/biome": "2.6.8" },
    scripts: { "quality:static": "biome ci --reporter=github" },
    checks: [{ name: "Biome", kind: "lint", script: "quality:static", concurrent: true }],
  },
  existing: { dependencies: {}, scripts: {}, checks: [] },
};

export const addOns = {
  "react-doctor": {
    dependencies: { "react-doctor": "0.9.22" },
    scripts: {
      "quality:react": "react-doctor . --yes --no-score --no-supply-chain --blocking error",
    },
    checks: [{ name: "React Doctor", kind: "lint", script: "quality:react" }],
  },
  fallow: {
    dependencies: { fallow: "3.41.0" },
    scripts: {
      "quality:fallow":
        "fallow dead-code --fail-on-issues --fail-on-parse-error && fallow dupes --fail-on-issues && fallow health --fail-on-issues --fail-on-parse-error && fallow architecture --fail-on-issues --fail-on-parse-error",
    },
    checks: [{ name: "Fallow", kind: "analysis", script: "quality:fallow", tier: "deep" }],
  },
  playwright: {
    dependencies: { "@playwright/test": "1.65.0" },
    scripts: { "quality:browsers": "playwright install --with-deps chromium" },
    setup: ["quality:browsers"],
  },
};
