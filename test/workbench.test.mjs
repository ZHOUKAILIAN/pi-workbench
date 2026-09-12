import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { apply, buildPlan, doctor, parseArgs, restore } from "../scripts/workbench.mjs";

const roots = [];
const mkdir = (p) => fs.mkdirSync(p, { recursive: true });
const put = (p, value, mode) => { mkdir(path.dirname(p)); fs.writeFileSync(p, value); if (mode) fs.chmodSync(p, mode); };
function fixture() {
  const tempRoot = fs.realpathSync(os.tmpdir());
  const root = fs.mkdtempSync(path.join(tempRoot, "pi-workbench-repo-"));
  roots.push(root);
  put(path.join(root, "config/settings.json"), JSON.stringify({ defaultModel: "base", theme: "light", unknown: { retained: true }, skills: ["base-skill"], packages: ["base-package"] }));
  put(path.join(root, "config/AGENTS.md"), "repo agents\n");
  put(path.join(root, "agents/verifier.md"), "---\nname: verifier\nmodel: old/provider\ndescription: verify\n---\nverify\n");
  put(path.join(root, "agents/plain.md"), "---\nname: plain\ndescription: plain\n---\nplain\n");
  put(path.join(root, "prompts/work.md"), "work\n");
  put(path.join(root, "extensions/subagent/index.ts"), "export const index = true;\n");
  put(path.join(root, "extensions/subagent/agents.ts"), "export const agents = true;\n");
  put(path.join(root, "manifests/dependencies.json"), JSON.stringify({ npmPackages: [{ source: "npm:pi-tool@1.2.3", purpose: "test tool" }] }));
  const target = path.join(path.dirname(root), `pi-workbench-target-${path.basename(root)}`);
  roots.push(target);
  return { root, target };
}
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });
const opts = (f, extra = {}) => ({ repoRoot: f.root, target: f.target, ...extra });
const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));

test("plan is read-only and clean apply installs Pi resources", () => {
  const f = fixture();
  const localDir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "pi-workbench-local-"));
  roots.push(localDir);
  const skill = path.join(localDir, "skill"); const pkg = path.join(localDir, "pkg"); mkdir(skill); mkdir(pkg);
  const local = path.join(localDir, "private.json");
  put(local, JSON.stringify({ settings: { defaultModel: "local-model", theme: "dark", defaultThinkingLevel: "high", enabledModels: ["x/*"] }, agentModels: { verifier: "local/provider" }, skills: [skill], packages: [pkg] }));
  const plan = buildPlan(opts(f, { localPath: local, withTools: true }));
  assert.equal(fs.existsSync(f.target), false);
  assert.deepEqual(plan.conflicts, []);
  const result = apply(opts(f, { localPath: local, withTools: true }));
  assert.equal(result.changed, true);
  assert.ok(result.backupId);
  assert.equal(fs.existsSync(path.join(f.target, ".workbench-backups", result.backupId, "manifest.json")), true);
  const settings = readJson(path.join(f.target, "settings.json"));
  assert.equal(settings.defaultModel, "local-model");
  assert.equal(settings.unknown.retained, true);
  assert.deepEqual(settings.skills, ["base-skill", skill]);
  assert.deepEqual(settings.packages, ["base-package", pkg, "npm:pi-tool@1.2.3"]);
  assert.match(fs.readFileSync(path.join(f.target, "agents/verifier.md"), "utf8"), /model: "local\/provider"/);
  assert.doesNotMatch(fs.readFileSync(path.join(f.target, "agents/plain.md"), "utf8"), /model:/);
  assert.equal(doctor(opts(f, { localPath: local, withTools: true })).ok, true);
});

test("existing settings and preferences survive while local safe settings override", () => {
  const f = fixture(); mkdir(f.target);
  put(path.join(f.target, "settings.json"), JSON.stringify({ defaultModel: "existing", custom: "keep", theme: "light" }));
  const local = path.join(f.root, "local.json"); put(local, JSON.stringify({ settings: { theme: "dark" } }));
  apply(opts(f, { localPath: local }));
  const settings = readJson(path.join(f.target, "settings.json"));
  assert.equal(settings.defaultModel, "existing"); assert.equal(settings.custom, "keep"); assert.equal(settings.theme, "dark");
});

test("local schema, external paths, and JSON errors are safe", () => {
  const f = fixture();
  const bad = path.join(f.root, "bad.json"); put(bad, '{"settings":{"apiKey":"DO_NOT_PRINT"}}');
  assert.throws(() => buildPlan(opts(f, { localPath: bad })), (e) => e.message === "local configuration is invalid" && !e.message.includes("apiKey") && !e.message.includes("DO_NOT_PRINT"));
  put(bad, "{ invalid secret DO_NOT_PRINT");
  assert.throws(() => buildPlan(opts(f, { localPath: bad })), (e) => e.message === "local configuration contains invalid JSON");
  const missing = path.join(f.root, "missing");
  put(path.join(f.root, "local.json"), JSON.stringify({ skills: [missing] }));
  assert.throws(() => buildPlan(opts(f, { localPath: path.join(f.root, "local.json") })), /local skills\[0\] is missing/);
  put(path.join(f.root, "local.json"), JSON.stringify({ settings: { packages: ["escape"] } }));
  assert.throws(() => buildPlan(opts(f, { localPath: path.join(f.root, "local.json") })), /local configuration is invalid/);
});

test("conflicts fail globally without writes; replace backs up and restores", () => {
  const f = fixture(); mkdir(f.target); put(path.join(f.target, "AGENTS.md"), "hand edited\n", 0o600);
  assert.throws(() => apply(opts(f)), /conflicting managed files/);
  assert.equal(fs.readFileSync(path.join(f.target, "AGENTS.md"), "utf8"), "hand edited\n");
  assert.equal(fs.existsSync(path.join(f.target, ".workbench-backups")), false);
  const result = apply(opts(f, { replace: true }));
  const backup = path.join(f.target, ".workbench-backups", result.backupId);
  assert.equal(fs.statSync(backup).mode & 0o777, 0o700);
  assert.equal(fs.statSync(path.join(backup, "manifest.json")).mode & 0o777, 0o600);
  assert.equal(fs.readFileSync(path.join(f.target, "AGENTS.md"), "utf8"), "repo agents\n");
  restore(opts(f, { backupId: result.backupId }));
  assert.equal(fs.readFileSync(path.join(f.target, "AGENTS.md"), "utf8"), "hand edited\n");
  assert.equal(fs.statSync(path.join(f.target, "AGENTS.md")).mode & 0o777, 0o600);
  assert.equal(fs.existsSync(path.join(f.target, "agents/verifier.md")), false);
});

test("apply is idempotent and restore rejects later edits", () => {
  const f = fixture(); mkdir(f.target); put(path.join(f.target, "AGENTS.md"), "before\n");
  const first = apply(opts(f, { replace: true }));
  assert.ok(first.backupId);
  const before = fs.readdirSync(path.join(f.target, ".workbench-backups"));
  const second = apply(opts(f));
  assert.equal(second.changed, false); assert.equal(second.backupId, null);
  assert.deepEqual(fs.readdirSync(path.join(f.target, ".workbench-backups")), before);
  put(path.join(f.target, "prompts/work.md"), "manual edit\n");
  assert.throws(() => restore(opts(f, { backupId: first.backupId })), /target changed/);
  assert.equal(fs.readFileSync(path.join(f.target, "prompts/work.md"), "utf8"), "manual edit\n");
});

test("symlink ancestors, leaves, backup paths, and repository targets are rejected", (t) => {
  const f = fixture();
  assert.throws(() => buildPlan(opts(f, { target: f.root })), /outside the repository/);
  const outside = fs.mkdtempSync(path.join(path.dirname(f.root), "pi-workbench-outside-")); roots.push(outside);
  const targetLink = path.join(outside, "target-link"); fs.symlinkSync(f.root, targetLink, "dir");
  assert.throws(() => buildPlan(opts(f, { target: targetLink })), /symlink/);
  const ancestorLink = path.join(outside, "ancestor-link"); fs.symlinkSync(outside, ancestorLink, "dir");
  assert.throws(() => buildPlan(opts(f, { target: path.join(ancestorLink, "nested") })), /symlink/);
  const target = path.join(outside, "target"); mkdir(target); fs.symlinkSync(path.join(f.root, "config/AGENTS.md"), path.join(target, "AGENTS.md"));
  assert.throws(() => apply(opts(f, { target })), /symlink/);
  fs.unlinkSync(path.join(target, "AGENTS.md")); put(path.join(target, "agents"), "not a directory\n");
  assert.throws(() => apply(opts(f, { target })), /non-directory parent/);
  fs.unlinkSync(path.join(target, "agents")); fs.symlinkSync(outside, path.join(target, "agents"), "dir");
  assert.throws(() => apply(opts(f, { target })), /symlink/);
  fs.unlinkSync(path.join(target, "agents")); mkdir(path.join(target, ".workbench-backups")); fs.symlinkSync(outside, path.join(target, ".workbench-backups", "bad"), "dir");
  assert.throws(() => restore(opts(f, { target, backupId: "bad" })), /symlink|backup/);
  t.diagnostic("symlink checks exercised");
});

test("CLI never echoes invalid JSON contents", () => {
  const f = fixture(); const local = path.join(f.root, "private.json"); put(local, "{bad: SECRET_VALUE");
  let output = "";
  try { execFileSync(process.execPath, [path.resolve("scripts/workbench.mjs"), "plan", "--target", f.target, "--local", local], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }); } catch (e) { output = `${e.stdout}${e.stderr}`; }
  assert.doesNotMatch(output, /SECRET_VALUE/); assert.match(output, /invalid JSON/);
});

test("every changed apply has a backup while an unchanged apply does not", () => {
  const f = fixture();
  const first = apply(opts(f));
  assert.ok(first.backupId);
  assert.equal(doctor(opts(f)).ok, true);
  const second = apply(opts(f));
  assert.equal(second.changed, false);
  assert.equal(second.backupId, null);
  assert.deepEqual(fs.readdirSync(path.join(f.target, ".workbench-backups")), [first.backupId]);
});

test("new directories are private and existing directory and file modes are preserved", () => {
  const f = fixture();
  mkdir(f.target); fs.chmodSync(f.target, 0o711);
  mkdir(path.join(f.target, "agents")); fs.chmodSync(path.join(f.target, "agents"), 0o750);
  mkdir(path.join(f.target, "prompts")); fs.chmodSync(path.join(f.target, "prompts"), 0o711);
  put(path.join(f.target, "settings.json"), JSON.stringify({ skills: [], packages: [], custom: "keep" }), 0o640);
  put(path.join(f.target, "AGENTS.md"), "edited\n", 0o600);
  apply(opts(f, { replace: true }));
  assert.equal(fs.statSync(f.target).mode & 0o777, 0o711);
  assert.equal(fs.statSync(path.join(f.target, "agents")).mode & 0o777, 0o750);
  assert.equal(fs.statSync(path.join(f.target, "prompts")).mode & 0o777, 0o711);
  assert.equal(fs.statSync(path.join(f.target, "settings.json")).mode & 0o777, 0o640);
  assert.equal(fs.statSync(path.join(f.target, "AGENTS.md")).mode & 0o777, 0o600);
  assert.equal(fs.statSync(path.join(f.target, "extensions")).mode & 0o777, 0o700);
  assert.equal(fs.statSync(path.join(f.target, "extensions/subagent")).mode & 0o777, 0o700);
});

test("local null, unknown role, and unsafe model values are rejected without echoing local data", () => {
  const f = fixture(); const local = path.join(f.root, "local.json");
  put(local, JSON.stringify({ settings: null }));
  assert.throws(() => buildPlan(opts(f, { localPath: local })), /local configuration is invalid/);
  put(local, JSON.stringify({ agentModels: { "ROLE_SECRET": "provider/model" } }));
  assert.throws(() => buildPlan(opts(f, { localPath: local })), (e) => e.message === "local configuration is invalid" && !e.message.includes("ROLE_SECRET"));
  put(local, JSON.stringify({ agentModels: { verifier: "provider/model\nquoted" } }));
  assert.throws(() => buildPlan(opts(f, { localPath: local })), /local configuration is invalid/);
});

test("settings collections and pinned tool versions have strict types", () => {
  const f = fixture();
  put(path.join(f.root, "config/settings.json"), JSON.stringify({ skills: "not-array", packages: [] }));
  assert.throws(() => buildPlan(opts(f)), /settings skills must be an array/);
  put(path.join(f.root, "config/settings.json"), JSON.stringify({ skills: [], packages: [] }));
  mkdir(f.target); put(path.join(f.target, "settings.json"), JSON.stringify({ skills: [], packages: "not-array" }));
  assert.throws(() => buildPlan(opts(f)), /settings packages must be an array/);
  put(path.join(f.root, "manifests/dependencies.json"), JSON.stringify({ npmPackages: [{ source: "npm:pi-tool@latest", purpose: "test" }] }));
  assert.throws(() => buildPlan(opts(f, { withTools: true })), /invalid source/);
  put(path.join(f.root, "manifests/dependencies.json"), JSON.stringify({ npmPackages: [{ source: "npm:pi-tool@^1.2.3", purpose: "test" }] }));
  assert.throws(() => buildPlan(opts(f, { withTools: true })), /invalid source/);
});

test("model frontmatter is quoted and normalized to CRLF", () => {
  const f = fixture();
  put(path.join(f.root, "agents/verifier.md"), "---\r\nname: verifier\r\nmodel: old/provider\r\n---\r\nbody\r\n");
  const local = path.join(f.root, "local.json"); put(local, JSON.stringify({ agentModels: { verifier: "local/provider" } }));
  apply(opts(f, { localPath: local }));
  const rendered = fs.readFileSync(path.join(f.target, "agents/verifier.md"), "utf8");
  assert.equal(rendered, '---\r\nname: verifier\r\nmodel: "local/provider"\r\n---\r\nbody\r\n');
  assert.doesNotMatch(rendered, /(?<!\r)\n|\r\r/);
});

test("with-tools is opt-in and remains idempotent", () => {
  const f = fixture();
  const result = apply(opts(f));
  assert.equal(readJson(path.join(f.target, "settings.json")).packages.includes("npm:pi-tool@1.2.3"), false);
  const again = apply(opts(f));
  assert.equal(again.changed, false);
  assert.equal(again.backupId, null);
  assert.deepEqual(fs.readdirSync(path.join(f.target, ".workbench-backups")), [result.backupId]);
});

test("backup manifests reject escape, corruption, missing hashes, and broken symlinks", () => {
  const cases = [
    (entry) => { entry.backup = "files/../escape"; },
    (entry) => { delete entry.before.hash; },
    (entry, backupDir) => { put(path.join(backupDir, entry.backup), "corrupt\n"); },
    (entry, backupDir) => { fs.unlinkSync(path.join(backupDir, entry.backup)); fs.symlinkSync(path.join(backupDir, "missing"), path.join(backupDir, entry.backup)); },
  ];
  for (const mutate of cases) {
    const f = fixture(); mkdir(f.target); put(path.join(f.target, "AGENTS.md"), "edited\n");
    const result = apply(opts(f, { replace: true }));
    const backupDir = path.join(f.target, ".workbench-backups", result.backupId);
    const manifestPath = path.join(backupDir, "manifest.json");
    const manifest = readJson(manifestPath); const entry = manifest.files.find((item) => item.path === "AGENTS.md");
    mutate(entry, backupDir); put(manifestPath, JSON.stringify(manifest));
    assert.throws(() => restore(opts(f, { backupId: result.backupId })), /invalid|symlink/);
  }
});

test("a write failure rolls back managed bytes and modes", () => {
  const f = fixture(); mkdir(f.target);
  put(path.join(f.target, "settings.json"), "{\"old\":true}\n", 0o640);
  put(path.join(f.target, "AGENTS.md"), "old agents\n", 0o600);
  const originalRename = fs.renameSync; let failed = false;
  fs.renameSync = (from, to) => {
    if (!failed && String(to).endsWith(`${path.sep}AGENTS.md`) && String(from).includes(".workbench-tmp-")) { failed = true; throw new Error("simulated write failure"); }
    return originalRename(from, to);
  };
  try { assert.throws(() => apply(opts(f, { replace: true })), /write failed/); }
  finally { fs.renameSync = originalRename; }
  assert.equal(fs.readFileSync(path.join(f.target, "settings.json"), "utf8"), "{\"old\":true}\n");
  assert.equal(fs.statSync(path.join(f.target, "settings.json")).mode & 0o777, 0o640);
  assert.equal(fs.readFileSync(path.join(f.target, "AGENTS.md"), "utf8"), "old agents\n");
  assert.equal(fs.statSync(path.join(f.target, "AGENTS.md")).mode & 0o777, 0o600);
});

test("clean-install restore removes newly created empty resource directories", () => {
  const f = fixture();
  const result = apply(opts(f));
  restore(opts(f, { backupId: result.backupId }));
  assert.deepEqual(fs.readdirSync(f.target), [".workbench-backups"]);
});

test("restore retains original directories and later user content", () => {
  const f = fixture();
  mkdir(path.join(f.target, "agents"));
  fs.chmodSync(path.join(f.target, "agents"), 0o750);
  const result = apply(opts(f));
  put(path.join(f.target, "prompts/later.md"), "user content\n");
  restore(opts(f, { backupId: result.backupId }));
  assert.equal(fs.statSync(path.join(f.target, "agents")).mode & 0o777, 0o750);
  assert.deepEqual(fs.readdirSync(path.join(f.target, "prompts")), ["later.md"]);
  assert.equal(fs.existsSync(path.join(f.target, "extensions")), false);
});

test("restore rejects directory ledger traversal before changing files", () => {
  const f = fixture();
  const result = apply(opts(f));
  const manifestPath = path.join(f.target, ".workbench-backups", result.backupId, "manifest.json");
  const manifest = readJson(manifestPath);
  manifest.createdDirectories = ["../outside"];
  put(manifestPath, JSON.stringify(manifest));
  assert.throws(() => restore(opts(f, { backupId: result.backupId })), /backup directories are invalid/);
  assert.equal(doctor(opts(f)).ok, true);
});

test("local settings whitelist cannot be bypassed with prototype property names", () => {
  const f = fixture();
  const local = path.join(f.root, "local.json");
  for (const key of ["toString", "constructor", "__proto__"]) {
    put(local, JSON.stringify({ settings: { [key]: "private-value" } }));
    assert.throws(() => buildPlan(opts(f, { localPath: local })), /local configuration is invalid/);
  }
});

test("with-tools adds exact sources only once across repeated installs", () => {
  const f = fixture();
  apply(opts(f, { withTools: true }));
  assert.equal(apply(opts(f, { withTools: true })).changed, false);
  assert.equal(readJson(path.join(f.target, "settings.json")).packages.filter(p => p === "npm:pi-tool@1.2.3").length, 1);
});

test("help parses without planning or creating the default target", () => {
  const parsed = parseArgs(["--help"]);
  assert.equal(parsed.help, true);
  const f = fixture();
  const output = execFileSync(process.execPath, [path.resolve("scripts/workbench.mjs"), "--help", "--target", f.target], { encoding: "utf8" });
  assert.match(output, /Usage:/); assert.match(output, /--target PATH/);
  assert.equal(fs.existsSync(f.target), false);
});
