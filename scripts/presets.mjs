const fallowChecks = [
  { command: "dead-code", name: "Fallow dead code", parseErrors: true },
  { command: "dupes", name: "Fallow duplication", parseErrors: false },
  { command: "health", name: "Fallow complexity", parseErrors: true },
  { command: "architecture", name: "Fallow architecture", parseErrors: true },
];

export const legacyScripts = { "quality:format": "oxfmt --check" };

export const presets = {
  oxc: {
    dependencies: { oxfmt: "0.77.0", oxlint: "1.92.0" },
    scripts: {
      "quality:format": "oxfmt --check . '!**/quality-gate.config.json' '!.quality-gate/**'",
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
    scripts: Object.fromEntries(
      fallowChecks.map(({ command, parseErrors }) => [
        `quality:fallow:${command}`,
        `FALLOW_TELEMETRY_DISABLED=1 fallow ${command} --fail-on-issues${parseErrors ? " --fail-on-parse-error" : ""} --format github-annotations`,
      ]),
    ),
    checks: fallowChecks.map(({ name, command }) => ({
      name,
      kind: "analysis",
      script: `quality:fallow:${command}`,
      tier: "deep",
    })),
  },
  playwright: {
    dependencies: { "@playwright/test": "1.65.0" },
    scripts: { "quality:browsers": "playwright install --with-deps chromium" },
    setup: ["quality:browsers"],
  },
};
