import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const roles = ["code_reviewer", "evidence_investigator", "implementer", "product_aligner", "verifier"];
const prompts = ["build", "figma_delivery", "work"];
const tools = new Set(["read", "bash", "powershell", "edit", "write", "grep", "find", "ls"]);
const excluded = new Set([".git", ".pi", "node_modules", "dist", "coverage", "local", ".DS_Store"]);
const forbiddenNames = new Set(["auth.json", "models.json", "models-store.json", "mcp.json", "mcp-cache.json", "trust.json", "sessions", "workflow-runs", ".workbench-backups"]);
const files = [];
function walk(dir = "") {
  for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    if (excluded.has(entry.name)) continue;
    const name = path.join(dir, entry.name);
    check(!forbiddenNames.has(entry.name), `private runtime asset: ${name}`);
    check(!entry.isSymbolicLink(), `source symlink: ${name}`);
    if (entry.isDirectory()) walk(name);
    else if (entry.isFile()) files.push(name);
  }
}
walk();
for (const legacy of [".codex", "local-codex", ".agents/skills/feature-delivery", "extensions/subagent"]) {
  check(!fs.existsSync(path.join(root, legacy)), `retired entry still exists: ${legacy}`);
}
for (const [dir, expected] of [["agents", roles], ["prompts", prompts]]) {
  const actual = files.filter((f) => path.dirname(f) === dir && f.endsWith(".md")).map((f) => path.basename(f, ".md")).sort();
  check(JSON.stringify(actual) === JSON.stringify(expected), `${dir}: expected ${expected.join(", ")}`);
}
for (const name of roles) {
  const file = `agents/${name}.md`;
  if (!files.includes(file)) continue;
  const text = read(file);
  const front = text.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? "";
  check(front.includes(`name: ${name}\n`), `${file}: name mismatch`);
  check(/^description: .+/m.test(front), `${file}: missing description`);
  check(!/^(?:model|fallback-models):/m.test(front), `${file}: model binding belongs in private local configuration`);
  const selected = front.match(/^tools: (.+)$/m)?.[1].split(",").map((t) => t.trim()) ?? [];
  check(selected.length > 0 && selected.every((t) => tools.has(t)), `${file}: unsupported tools`);
  if (name !== "implementer") check(!selected.some((t) => ["edit", "write"].includes(t)), `${file}: read-only role has write tool`);
}
for (const name of prompts) {
  const file = `prompts/${name}.md`;
  if (!files.includes(file)) continue;
  const text = read(file);
  check(text.startsWith("---\n") && /^description: .+/m.test(text), `${file}: missing frontmatter`);
  check(text.includes("$ARGUMENTS"), `${file}: missing argument expansion`);
  check(!/\b(?:gpt-\d|glm-\d|kimi-k\d|smartingredients)/i.test(text), `${file}: hardcoded model`);
}
for (const name of files) {
  const text = read(name);
  check(!/\/Users\/[^/\s]+|\/home\/[^/\s]+|[A-Z]:\\Users\\/i.test(text), `${name}: machine-specific path`);
  check(!/-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----|\bgh[pousr]_[A-Za-z0-9]{20,}|\bsk-[A-Za-z0-9_-]{24,}/.test(text), `${name}: possible secret`);
  if (name.endsWith(".json")) {
    try { JSON.parse(text); } catch { failures.push(`${name}: invalid JSON`); }
  }
  if (name.endsWith(".md")) {
    for (const [, target] of text.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
      if (/^(?:https?:|mailto:|#)/.test(target)) continue;
      const filename = decodeURIComponent(target.split("#")[0]);
      check(fs.existsSync(path.resolve(root, path.dirname(name), filename)), `${name}: broken link ${target}`);
    }
  }
}
try {
  const manifest = JSON.parse(read("manifests/dependencies.json"));
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.pi.package, "@earendil-works/pi-coding-agent");
  assert.match(manifest.pi.testedVersion, /^\d+\.\d+\.\d+$/);
  assert.equal(manifest.npmPackages.length, 2);
  for (const item of manifest.npmPackages) assert.match(item.source, /^npm:.+@\d+\.\d+\.\d+$/);
  for (const item of manifest.repositories) {
    assert.match(item.ref, /^[a-f0-9]{40}$/);
    const url = new URL(item.url);
    assert.equal(url.hostname, "github.com");
    assert.equal(url.username + url.password, "");
  }
  const defaults = JSON.parse(read("config/settings.json"));
  assert.deepEqual(Object.keys(defaults).sort(), ["defaultThinkingLevel", "theme", "transport"]);
  assert.deepEqual(JSON.parse(read("config/local.example.json")), { settings: {}, agentModels: {}, skills: [], packages: [] });
  assert.equal(JSON.parse(read("package.json")).name, "pi-workbench");
  const external = manifest.repositories.find((item) => item.name === "my-pi-extension");
  assert.equal(external?.visibility, "public");
  assert.ok(external?.packages.includes("packages/subagent"), "external subagent source missing");
  for (const file of ["scripts/workbench.mjs", "scripts/smoke.mjs", "THIRD_PARTY_NOTICES.md"]) assert.ok(files.includes(file), `missing ${file}`);
} catch (error) { failures.push(`contract: ${error.message}`); }
if (failures.length) {
  console.error(failures.map((f) => `- ${f}`).join("\n"));
  process.exitCode = 1;
} else console.log(`Validated ${roles.length} roles, ${prompts.length} prompts and ${files.length} source files (private/generated directories excluded).`);
