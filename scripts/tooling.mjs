import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const pins = {
  actionlint: {
    repo: "rhysd/actionlint",
    version: "1.7.12",
    "darwin-arm64": {
      asset: 384924893,
      sha: "aba9ced2dee8d27fecca3dc7feb1a7f9a52caefa1eb46f3271ea66b6e0e6953f",
    },
    "linux-x64": {
      asset: 384924896,
      sha: "8aca8db96f1b94770f1b0d72b6dddcb1ebb8123cb3712530b08cc387b349a3d8",
    },
  },
  gitleaks: {
    repo: "gitleaks/gitleaks",
    version: "8.30.1",
    "darwin-arm64": {
      asset: 378332059,
      sha: "b40ab0ae55c505963e365f271a8d3846efbc170aa17f2607f13df610a9aeb6a5",
    },
    "linux-x64": {
      asset: 378332058,
      sha: "551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb",
    },
  },
};

export function withTool(name, callback) {
  const pin = pins[name];
  const asset = pin?.[`${process.platform}-${process.arch}`];
  if (!asset)
    throw new Error(
      `No ${name} download configured for this platform. Use the official binary manually.`,
    );
  const dir = mkdtempSync(join(tmpdir(), `quality-gate-${name}-`));
  try {
    const result = spawnSync(
      "gh",
      [
        "api",
        "--hostname",
        "github.com",
        "-H",
        "Accept: application/octet-stream",
        `repos/${pin.repo}/releases/assets/${asset.asset}`,
      ],
      { timeout: 90_000, maxBuffer: 32 * 1024 * 1024 },
    );
    if (result.status !== 0)
      throw new Error(
        `Cannot download ${name} ${pin.version} with gh. Check authentication/network or use the official binary manually.`,
      );
    if (createHash("sha256").update(result.stdout).digest("hex") !== asset.sha)
      throw new Error(`${name} archive checksum mismatch; refusing execution.`);
    const archive = join(dir, "tool.tar.gz");
    writeFileSync(archive, result.stdout);
    const unpack = spawnSync("tar", ["-xzf", archive, "-C", dir, name], { encoding: "utf8" });
    if (unpack.status !== 0) throw new Error(`Cannot unpack verified ${name} archive.`);
    const binary = join(dir, name);
    chmodSync(binary, 0o755);
    console.log(`${name} ${pin.version}: verified SHA-256 ${asset.sha}`);
    return callback(binary);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
