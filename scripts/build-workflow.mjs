import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import YAML from "yaml";
import { defaults } from "../runtime/gate.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const target = resolve(root, ".github/workflows/quality-gate.yml");
const { version } = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const descriptions = {
  "working-directory":
    "Package directory relative to the checkout. Installation stays at the checkout root.",
  config: "Quality gate JSON config relative to the selected package.",
  deep: "Run deep checks.",
  "check-timeout-seconds": "Per-script timeout, 1–1200 seconds.",
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
Object.assign(inputs, {
  "node-version": { description: "Node.js version.", type: "string", default: "24.22.2" },
  "report-name": {
    description: "Unique report artifact name.",
    type: "string",
    default: "quality-report",
  },
  "browser-evidence": {
    description: "Upload test-results and playwright-report on check failure.",
    type: "boolean",
    default: false,
  },
});

function requireSafeDelimiter(source, delimiter) {
  if (source.split(/\r?\n/).includes(delimiter))
    throw new Error(`Embedded source contains the heredoc delimiter ${delimiter}.`);
}

function script(source, delimiter, entrypoint) {
  const program = `${source}\n${entrypoint}`;
  requireSafeDelimiter(program, delimiter);
  const body = `node --input-type=module <<'${delimiter}'\n${program}\n${delimiter}\n`;
  if (body.length > 21_000) throw new Error(`${delimiter} exceeds the workflow run limit.`);
  return body;
}

function runnerScript(source, delimiter, exported, entrypoint) {
  requireSafeDelimiter(source, delimiter);
  const gzipped = gzipSync(source);
  gzipped[9] = 3; // The gzip header records the build OS; fix it so macOS and Linux generate the same workflow.
  const embedded = gzipped
    .toString("base64")
    .match(/.{1,120}/g)
    ?.join("\n");
  const loader = [
    'import { gunzipSync } from "node:zlib";',
    "const embedded = `" + embedded + "`;",
    'const code = gunzipSync(Buffer.from(embedded, "base64"));',
    "const { " +
      exported +
      ' } = await import("data:text/javascript;base64," + code.toString("base64"));',
  ].join("\n");
  return script(loader, delimiter, entrypoint);
}

const runner = readFileSync(resolve(root, "runtime/gate.mjs"), "utf8");
const reportAssertion = readFileSync(resolve(root, "runtime/assert-report.mjs"), "utf8");
const checkout = "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1";
const setupNode = "actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1";
const cacheRestore = "actions/cache/restore@caa296126883cff596d87d8935842f9db880ef25";
const cacheSave = "actions/cache/save@caa296126883cff596d87d8935842f9db880ef25";
const setupBun = "oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6";
const upload = "actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9";
const versions = {
  [checkout]: "v7.0.1",
  [setupNode]: "v7.1.0",
  [setupBun]: "v2.2.0",
  [upload]: "v7.0.2",
  [cacheRestore]: "v5.1.0",
  [cacheSave]: "v5.1.0",
};
const workflow = {
  name: "Reusable product engineering quality gate",
  on: {
    workflow_call: {
      inputs,
      outputs: {
        passed: {
          description: "Verified gate verdict.",
          value: "${{ jobs.quality.outputs.passed }}",
        },
        report: {
          description: "Name of the uploaded report artifact.",
          value: "${{ jobs.quality.outputs.report }}",
        },
      },
    },
  },
  permissions: { contents: "read" },
  jobs: {
    quality: {
      name: "Product engineering quality gate",
      "runs-on": "ubuntu-24.04",
      "timeout-minutes": 30,
      outputs: {
        passed: "${{ steps.verdict.outputs.passed }}",
        report: "${{ steps.report.outputs.artifact-id && inputs.report-name || '' }}",
      },
      steps: [
        {
          name: "Check out consumer",
          id: "checkout",
          uses: checkout,
          with: { "persist-credentials": false, "fetch-depth": 2 },
        },
        {
          name: "Set up Node",
          id: "node",
          uses: setupNode,
          with: { "node-version": "${{ inputs.node-version }}", "package-manager-cache": false },
        },
        {
          name: "Plan dependency download caching",
          id: "plan",
          shell: "bash",
          run: runnerScript(
            runner,
            "QUALITY_GATE_CACHE_PLAN",
            "publishCachePlan",
            "await publishCachePlan();",
          ),
        },
        {
          name: "Restore dependency downloads",
          id: "restore",
          if: "${{ steps.plan.outputs.key != '' }}",
          uses: cacheRestore,
          with: { key: "${{ steps.plan.outputs.key }}", path: "${{ steps.plan.outputs.path }}" },
        },
        {
          name: "Provision the declared Bun version",
          id: "bun",
          if: "${{ steps.plan.outputs.manager == 'bun' }}",
          uses: setupBun,
          with: { "bun-version": "${{ steps.plan.outputs.version }}" },
        },
        {
          name: "Install and run quality checks",
          id: "checks",
          shell: "bash",
          env: {
            QG_OPTIONS: "${{ toJSON(inputs) }}",
            QG_PLANNED_VERSION: "${{ steps.plan.outputs.version }}",
            QG_CHANGE_EVENT: "${{ github.event_name }}",
            QG_CHANGE_BASE:
              "${{ github.event.pull_request.base.sha || github.event.merge_group.base_sha }}",
            QG_CHANGE_HEAD:
              "${{ github.event.pull_request.head.sha || github.event.merge_group.head_sha }}",
          },
          run: runnerScript(
            runner,
            "QUALITY_GATE_RUNTIME",
            "main",
            `const result = await main(JSON.parse(process.env.QG_OPTIONS), { version: ${JSON.stringify(version)}, cacheParent: process.env.RUNNER_TEMP, npmVersion: process.env.QG_PLANNED_VERSION });\nif (!result.passed) process.exitCode = 1;`,
          ),
        },
        {
          name: "Verify the gate report and step outcome",
          id: "verdict",
          if: "${{ !cancelled() }}",
          shell: "bash",
          env: {
            QG_OUTCOME: "${{ steps.checks.outcome }}",
            QG_BROWSER_EVIDENCE: "${{ inputs.browser-evidence }}",
            QG_WORKING_DIRECTORY: "${{ inputs.working-directory }}",
          },
          run: script(reportAssertion, "QUALITY_GATE_ASSERT", "publishVerdict();"),
        },
        {
          name: "Upload machine-readable quality report",
          id: "report",
          if: "${{ !cancelled() && steps.checks.outcome != 'skipped' }}",
          uses: upload,
          with: {
            name: "${{ inputs.report-name }}",
            path: ".quality-gate/report.json\n.quality-gate/summary.md",
            "include-hidden-files": true,
            "if-no-files-found": "error",
            "retention-days": 7,
          },
        },
        {
          name: "Link the uploaded report",
          id: "report_link",
          if: "${{ !cancelled() && steps.report.outputs.artifact-url != '' }}",
          shell: "bash",
          env: { QG_REPORT_URL: "${{ steps.report.outputs.artifact-url }}" },
          run: script(
            'import { appendFileSync } from "node:fs";',
            "QUALITY_GATE_REPORT_LINK",
            String.raw`appendFileSync(process.env.GITHUB_STEP_SUMMARY, "\n[Download the JSON and Markdown report](" + process.env.QG_REPORT_URL + ")\n");`,
          ),
        },
        {
          name: "Save dependency downloads on default-branch cache miss",
          id: "save",
          if: "${{ success() && github.event_name == 'push' && github.ref == format('refs/heads/{0}', github.event.repository.default_branch) && steps.plan.outputs.key != '' && steps.restore.outputs.cache-hit != 'true' }}",
          uses: cacheSave,
          with: { key: "${{ steps.plan.outputs.key }}", path: "${{ steps.plan.outputs.path }}" },
        },
        {
          name: "Upload opted-in browser failure evidence",
          if: "${{ failure() && (steps.verdict.outputs.browserResults != '' || steps.verdict.outputs.browserReport != '') }}",
          uses: upload,
          with: {
            name: "${{ inputs.report-name }}-browser-failure",
            path: "${{ steps.verdict.outputs.browserResults }}\n${{ steps.verdict.outputs.browserReport }}",
            "include-hidden-files": false,
            "if-no-files-found": "warn",
            "retention-days": 3,
          },
        },
      ],
    },
  },
};
const document = new YAML.Document(workflow);
workflow.jobs.quality.steps.forEach((step, index) => {
  if (!("uses" in step) || !step.uses) return;
  const node = document.getIn(["jobs", "quality", "steps", index, "uses"], true);
  if (YAML.isScalar(node)) node.comment = " " + versions[step.uses];
});
function emit(path, contents) {
  if (process.argv.includes("--check")) {
    if (readFileSync(path, "utf8") !== contents)
      throw new Error(
        "Generated workflow is stale. Run npm run generate with Node 24.22.2, the version CI checks with, and commit the result.",
      );
    console.log("Generated workflow matches its tested runtime: " + path.split("/").at(-1));
  } else writeFileSync(path, contents);
}
emit(
  target,
  "# Generated by scripts/build-workflow.mjs. Edit runtime and generator sources.\n" +
    document.toString({ lineWidth: 0, blockQuote: "literal" }),
);

requireSafeDelimiter(
  readFileSync(resolve(root, "runtime/ai-assist.mjs"), "utf8"),
  "QUALITY_GATE_AI",
);
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
