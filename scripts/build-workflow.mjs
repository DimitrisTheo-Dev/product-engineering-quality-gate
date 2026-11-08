import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { defaults } from "../runtime/gate.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const target = resolve(root, ".github/workflows/quality-gate.yml");
const descriptions = {
  "working-directory":
    "Package directory, relative to checkout. Lockfile and install stay at checkout root.",
  "typecheck-script": "Required existing package script for type checking.",
  "build-script": "Required existing package script for the production build.",
  "test-script":
    "auto selects test:ci then test; an explicit name is required to exist; empty disables tests.",
  "product-script": "Optional consumer behavior test script, such as test:product.",
  "extra-script": "Optional existing lint or CI setup script; retains checks beyond Oxlint.",
  "smoke-script": "Optional fast smoke test script; runs on every invocation when selected.",
  "e2e-script": "Optional expensive E2E script; runs only when deep is true.",
  "security-script": "Optional dependency/security script; runs only when deep is true.",
  "react-doctor":
    "Run pinned local React Doctor on React packages, with error-level findings blocking.",
  fallow:
    "Enable pinned local Fallow dead code, duplication, complexity, and architecture checks in deep runs.",
  playwright:
    "Install local pinned Playwright Chromium and system dependencies when browser tests are selected.",
  deep: "Explicitly opt in to Fallow, E2E, and dependency/security checks.",
  "check-timeout-seconds":
    "Per-command time limit, 1..1200 seconds. The job also has a 30-minute limit.",
};

const inputs = Object.fromEntries(
  Object.entries(defaults).map(([key, value]) => [
    key,
    {
      description: descriptions[key],
      required: false,
      type: typeof value,
      default: value,
    },
  ]),
);
inputs["node-version"] = {
  description: "Exact Node.js version; default is Node 24 LTS.",
  required: false,
  type: "string",
  default: "24.22.2",
};
inputs["upload-playwright-failures"] = {
  description:
    "Opt in to uploading sanitized traces/screenshots on failure. Review artifacts for sensitive data first.",
  required: false,
  type: "boolean",
  default: false,
};
inputs["report-name"] = {
  description: "Unique artifact name. Set a distinct value for each caller matrix entry.",
  required: false,
  type: "string",
  default: "quality-report",
};

const runner = readFileSync(resolve(root, "runtime/gate.mjs"), "utf8");
const workflow = {
  name: "Reusable product engineering quality gate",
  on: { workflow_call: { inputs } },
  permissions: { contents: "read" },
  jobs: {
    quality: {
      name: "Product engineering quality gate",
      "runs-on": "ubuntu-24.04",
      "timeout-minutes": 30,
      steps: [
        {
          name: "Check out consumer",
          id: "checkout",
          uses: "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1",
          with: { "persist-credentials": false, "fetch-depth": 1 },
        },
        {
          name: "Set up Node",
          id: "node",
          uses: "actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1",
          with: { "node-version": "${{ inputs.node-version }}", "package-manager-cache": false },
        },
        {
          name: "Install and run quality checks",
          id: "checks",
          shell: "bash",
          env: { QG_OPTIONS: "${{ toJSON(inputs) }}" },
          run: `node --input-type=module <<'QUALITY_GATE_RUNTIME'\n${runner}\nconst result = await main(JSON.parse(process.env.QG_OPTIONS));\nif (!result.passed) process.exitCode = 1;\nQUALITY_GATE_RUNTIME\n`,
        },
        {
          name: "Upload machine-readable quality report",
          id: "report",
          if: "${{ !cancelled() && steps.checks.outcome != 'skipped' }}",
          uses: "actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9",
          with: {
            name: "${{ inputs.report-name }}",
            path: ".quality-gate/report.json\n.quality-gate/summary.md",
            "include-hidden-files": true,
            "if-no-files-found": "warn",
            "retention-days": 7,
          },
        },
        {
          name: "Upload opted-in browser failure evidence",
          id: "browser_artifacts",
          if: "${{ failure() && inputs.upload-playwright-failures }}",
          uses: "actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9",
          with: {
            name: "${{ inputs.report-name }}-browser-failure",
            path: "${{ inputs.working-directory }}/test-results/\n${{ inputs.working-directory }}/playwright-report/",
            "include-hidden-files": false,
            "if-no-files-found": "warn",
            "retention-days": 3,
          },
        },
        {
          name: "Link artifacts and setup limitations",
          if: "${{ !cancelled() }}",
          shell: "bash",
          env: {
            REPORT_URL: "${{ steps.report.outputs.artifact-url }}",
            BROWSER_URL: "${{ steps.browser_artifacts.outputs.artifact-url }}",
            CHECKOUT: "${{ steps.checkout.outcome }}",
            NODE: "${{ steps.node.outcome }}",
            CHECKS: "${{ steps.checks.outcome }}",
          },
          run: `node --input-type=module <<'REPORT'\nimport { appendFileSync } from 'node:fs';\nconst lines = [];\nif (process.env.REPORT_URL) lines.push('[Download JSON and Markdown report](' + process.env.REPORT_URL + ')');\nif (process.env.BROWSER_URL) lines.push('[Download browser failure evidence](' + process.env.BROWSER_URL + ')');\nif (process.env.CHECKOUT !== 'success' || process.env.NODE !== 'success') lines.push('**FAIL: setup unavailable.** Checkout or Node setup failed; quality checks were SKIPPED. Read the failed setup step.');\nif (process.env.CHECKS === 'failure') lines.push('**FAIL:** the required quality gate failed. Reporting does not override its exit status.');\nappendFileSync(process.env.GITHUB_STEP_SUMMARY, '\\n' + lines.join('\\n\\n') + '\\n');\nREPORT\n`,
        },
      ],
    },
  },
};
// Caller owns concurrency. Sharing github.workflow-based groups inside a called workflow can cancel its caller.
const output =
  "# Generated by scripts/build-workflow.mjs. Edit runtime/gate.mjs and the generator.\n# Pins: checkout v7.0.1; setup-node v7.1.0; upload-artifact v7.0.2.\n" +
  YAML.stringify(workflow, { lineWidth: 0, blockQuote: "literal" });
function emit(path, contents) {
  if (process.argv.includes("--check")) {
    if (readFileSync(path, "utf8") !== contents)
      throw new Error("Generated workflow is stale. Run npm run generate and commit the result.");
    console.log("Generated workflow matches its tested runtime: " + path.split("/").at(-1));
  } else writeFileSync(path, contents);
}
emit(target, output);

const aiInputs = {
  confirm: {
    description: "Explicitly authorize one paid provider request.",
    type: "boolean",
    required: false,
    default: false,
  },
  mode: {
    description: "synthetic-evaluation or code-review of the last committed default-branch diff.",
    type: "string",
    required: false,
    default: "synthetic-evaluation",
  },
  model: {
    description: "Explicit provider model ID. Verify the current pricing before dispatch.",
    type: "string",
    required: false,
    default: "",
  },
  "input-usd-per-million": {
    description: "Current uncached input-token price for this model in USD per million.",
    type: "number",
    required: false,
    default: 0,
  },
  "output-usd-per-million": {
    description: "Current output-token price for this model in USD per million.",
    type: "number",
    required: false,
    default: 0,
  },
  "budget-usd": {
    description:
      "Per-dispatch preflight budget estimate; maximum USD 1. Not a provider billing guarantee.",
    type: "number",
    required: false,
    default: 0.05,
  },
};
const allow =
  "github.event_name == 'workflow_dispatch' && github.ref_name == github.event.repository.default_branch && inputs.confirm && vars.ENABLE_AI_ASSIST == 'true'";
const aiWorkflow = {
  name: "Opt-in AI assistance",
  on: {
    workflow_dispatch: { inputs: aiInputs },
    workflow_call: { inputs: aiInputs, secrets: { OPENAI_API_KEY: { required: false } } },
  },
  permissions: { contents: "read" },
  concurrency: { group: "ai-assist-${{ github.repository }}", "cancel-in-progress": false },
  jobs: {
    disabled: {
      if: "${{ !(" + allow + ") }}",
      "runs-on": "ubuntu-24.04",
      "timeout-minutes": 2,
      steps: [
        {
          name: "Explain opt-in requirements",
          shell: "bash",
          run: "echo '**NOT CONFIGURED / SKIPPED:** No provider request. Requires a manual default-branch dispatch, confirm=true, and ENABLE_AI_ASSIST=true. See docs/ai-assistance.md.' >> \"$GITHUB_STEP_SUMMARY\"",
        },
      ],
    },
    provider: {
      if: "${{ " + allow + " }}",
      "runs-on": "ubuntu-24.04",
      "timeout-minutes": 5,
      environment: "ai-assist",
      steps: [
        {
          name: "Check out trusted default branch only",
          uses: "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1",
          with: {
            "persist-credentials": false,
            "fetch-depth": 2,
            ref: "${{ github.event.repository.default_branch }}",
          },
        },
        {
          name: "Set up Node",
          uses: "actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1",
          with: { "node-version": "24.22.2", "package-manager-cache": false },
        },
        {
          name: "One bounded provider request; no consumer install or execution",
          shell: "bash",
          env: {
            OPENAI_API_KEY: "${{ secrets.OPENAI_API_KEY }}",
            AI_MODE: "${{ inputs.mode }}",
            AI_MODEL: "${{ inputs.model }}",
            AI_INPUT_RATE: "${{ inputs.input-usd-per-million }}",
            AI_OUTPUT_RATE: "${{ inputs.output-usd-per-million }}",
            AI_BUDGET: "${{ inputs.budget-usd }}",
          },
          run:
            "node --input-type=module <<'QUALITY_GATE_AI'\n" +
            readFileSync(resolve(root, "runtime/ai-assist.mjs"), "utf8") +
            "\nawait main();\nQUALITY_GATE_AI\n",
        },
      ],
    },
  },
};
emit(
  resolve(root, ".github/workflows/ai-assist.yml"),
  "# Generated by scripts/build-workflow.mjs; explicit manual consent, trusted default branch, disabled by default.\n" +
    YAML.stringify(aiWorkflow, { lineWidth: 0, blockQuote: "literal" }),
);
