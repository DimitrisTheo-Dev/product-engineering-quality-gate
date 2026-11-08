#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, cpSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    apply: { type: "boolean" },
    "dry-run": { type: "boolean" },
    destination: { type: "string" },
  },
});
if (values.apply && values["dry-run"]) throw new Error("Choose --dry-run or --apply.");
const source = fileURLToPath(
  new URL("../skills/product-engineering-quality-gate", import.meta.url),
);
const candidates = [
  join(homedir(), ".agents/skills"),
  ...(process.env.CODEX_HOME ? [join(process.env.CODEX_HOME, "skills")] : []),
  join(homedir(), ".codex/skills"),
];
const destination = resolve(
  values.destination ?? join(candidates[0], "product-engineering-quality-gate"),
);
console.log(
  JSON.stringify(
    {
      mode: values.apply ? "apply" : "dry-run",
      detected: candidates.map((path) => ({ path, exists: existsSync(path) })),
      destination,
      instructionsChanged: false,
    },
    null,
    2,
  ),
);
if (existsSync(destination)) {
  const files = readdirSync(source, { recursive: true, withFileTypes: true }).filter((entry) =>
    entry.isFile(),
  );
  const same = files.every((entry) => {
    const suffix = join(entry.parentPath, entry.name).slice(source.length + 1);
    return (
      existsSync(join(destination, suffix)) &&
      readFileSync(join(destination, suffix), "utf8") === readFileSync(join(source, suffix), "utf8")
    );
  });
  if (!same)
    throw new Error(
      "Destination contains different content. Preserve it and choose a new --destination or upgrade manually.",
    );
  console.log("Identical skill is already installed; no files changed.");
} else if (values.apply) {
  mkdirSync(destination, { recursive: true });
  cpSync(source, destination, { recursive: true, errorOnExist: true, force: false });
  console.log(
    "Installed. Restart Codex if the skill does not appear. No global instructions or configuration were edited.",
  );
}
