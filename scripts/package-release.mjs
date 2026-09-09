import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
if (!/^\d+\.\d+\.\d+$/.test(manifest.version)) throw new Error("Expected an x.y.z release version");
if (process.env.RELEASE_TAG && process.env.RELEASE_TAG !== `v${manifest.version}`) {
  throw new Error("Git tag does not match package.json version");
}

const name = `eye-break-reminder-${manifest.version}`;
const staging = mkdtempSync(join(tmpdir(), "eye-break-release-"));
const bundle = join(staging, name);
const releaseDir = join(root, "release");
mkdirSync(bundle);
mkdirSync(releaseDir, { recursive: true });

// Explicit inputs keep local settings, logs, dependencies, and secrets out of releases.
for (const path of [
  "src",
  "assets",
  "scripts",
  ".github",
  ".gitignore",
  ".prettierrc",
  ".prettierignore",
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "eslint.config.mjs",
  "README.md",
  "RELEASING.md",
  "CHANGELOG.md",
  "LICENSE",
]) {
  cpSync(join(root, path), join(bundle, path), { recursive: true });
}

const compiledManifest = JSON.parse(readFileSync(join(root, "dist", "package.json"), "utf8"));
if (compiledManifest.version !== manifest.version) throw new Error("Build version is stale");
mkdirSync(join(bundle, "dist"));
cpSync(join(root, "dist", "assets"), join(bundle, "dist", "assets"), { recursive: true });
cpSync(join(root, "dist", "package.json"), join(bundle, "dist", "package.json"));
for (const command of manifest.commands) {
  cpSync(join(root, "dist", `${command.name}.js`), join(bundle, "dist", `${command.name}.js`));
}

// Build a fresh archive, then copy it over the previous output so old entries cannot survive.
const archive = `${name}.zip`;
execFileSync("/usr/bin/zip", ["-q", "-r", "-X", join(staging, archive), name], { cwd: staging });
cpSync(join(staging, archive), join(releaseDir, archive));
const sha256 = createHash("sha256")
  .update(readFileSync(join(releaseDir, archive)))
  .digest("hex");
writeFileSync(join(releaseDir, `${archive}.sha256`), `${sha256}  ${archive}\n`);
console.log(`Release archive (not a Raycast installer): ${join(releaseDir, archive)}`);
console.log(`SHA-256: ${sha256}`);
