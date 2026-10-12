import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { apply, buildPlan, doctor, parseArgs, restore } from "../scripts/workbench.mjs";

const roots = [];
const mkdir = (p) => fs.mkdirSync(p, { recursive: true });
const put = (p, value, mode) => { mkdir(path.dirname(p)); fs.writeFileSync(p, value); if (mode) fs.chmodSync(p, mode); };
function fixture() {
  const tempRoot = fs.realpathSync(os.tmpdir());
  const root = fs.mkdtempSync(path.join(tempRoot, "pi-workbench-repo-"));
  roots.push(root);
  const subagent = fs.mkdtempSync(path.join(tempRoot, "pi-workbench-subagent-"));
  roots.push(subagent);
  put(path.join(subagent, "package.json"), JSON.stringify({ name: "@pi/subagent", pi: { extensions: ["src/index.ts"] } }));
  put(path.join(subagent, "src/index.ts"), "export default function() {}\n");
  put(path.join(root, "config/settings.json"), JSON.stringify({ defaultModel: "base", theme: "light", unknown: { retained: true }, skills: ["base-skill"], packages: ["base-package", subagent] }));
  put(path.join(root, "config/AGENTS.md"), "repo agents\n");
  put(path.join(root, "agents/verifier.md"), "---\nname: verifier\nmodel: old/provider\ndescription: verify\n---\nverify\n");
  put(path.join(root, "agents/plain.md"), "---\nname: plain\ndescription: plain\n---\nplain\n");
  put(path.join(root, "prompts/work.md"), "work\n");
  put(path.join(root, "manifests/dependencies.json"), JSON.stringify({ npmPackages: [{ source: "npm:pi-tool@1.2.3", purpose: "test tool" }] }));
  const target = path.join(path.dirname(root), `pi-workbench-target-${path.basename(root)}`);
  roots.push(target);
  return { root, target, subagent };
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
  assert.deepEqual(plan.subagent.issues, []);
  assert.equal(plan.files.some(item => item.relative.startsWith("extensions/")), false);
  const result = apply(opts(f, { localPath: local, withTools: true }));
  assert.equal(result.changed, true);
  assert.ok(result.backupId);
  assert.equal(fs.existsSync(path.join(f.target, ".workbench-backups", result.backupId, "manifest.json")), true);
  const settings = readJson(path.join(f.target, "settings.json"));
  assert.equal(settings.defaultModel, "local-model");
  assert.equal(settings.unknown.retained, true);
  assert.deepEqual(settings.skills, ["base-skill", skill]);
  assert.deepEqual(settings.packages, ["base-package", f.subagent, pkg, "npm:pi-tool@1.2.3"]);
  assert.equal(fs.existsSync(path.join(f.target, "extensions")), false);
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
  assert.equal(fs.existsSync(path.join(f.target, "extensions")), false);
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

test("base resources install without subagent but doctor does not claim independent-review readiness", () => {
  const f = fixture();
  put(path.join(f.root, "config/settings.json"), JSON.stringify({ packages: [] }));
  const plan = buildPlan(opts(f));
  assert.match(plan.subagent.issues[0], /not configured/);
  apply(opts(f));
  assert.equal(fs.existsSync(path.join(f.target, "extensions")), false);
  const health = doctor(opts(f));
  assert.equal(health.ok, false);
  assert.equal(health.issues.length, 1);
  assert.match(health.issues[0], /not configured/);
});

test("legacy subagent sources block apply without writes or deletion, including replace", () => {
  for (const relative of ["extensions/subagent/index.ts", "extensions/subagent.ts", "extensions/subagent.js"]) {
    const f = fixture();
    const legacy = path.join(f.target, relative);
    put(legacy, "user customized legacy source\n");
    const before = fs.readFileSync(legacy);
    assert.match(buildPlan(opts(f)).subagent.issues.join("; "), /legacy subagent/);
    for (const replace of [false, true]) assert.throws(() => apply(opts(f, { replace })), /legacy subagent source detected/);
    assert.deepEqual(fs.readFileSync(legacy), before);
    assert.equal(fs.existsSync(path.join(f.target, "settings.json")), false);
    assert.equal(fs.existsSync(path.join(f.target, ".workbench-backups")), false);
    assert.equal(doctor(opts(f)).ok, false);
  }
});

test("external subagent identity is independent of path name; duplicate declarations block apply", () => {
  const f = fixture();
  const local = path.join(f.root, "local.json");
  // A second declaration through the object form would load the same identity twice.
  put(local, JSON.stringify({ packages: [] }));
  mkdir(f.target);
  put(path.join(f.target, "settings.json"), JSON.stringify({ packages: [{ source: f.subagent }] }));
  const plan = buildPlan(opts(f, { localPath: local }));
  assert.equal(plan.subagent.selected.length, 2);
  assert.match(plan.subagent.issues.join("; "), /multiple external/);
  assert.throws(() => apply(opts(f, { localPath: local })), /external subagent configuration is invalid/);
  assert.equal(fs.existsSync(path.join(f.target, ".workbench-backups")), false);
});

test("disabled first declarations cannot be hidden by appending an enabled local path", () => {
  const f = fixture();
  put(path.join(f.root, "config/settings.json"), JSON.stringify({ packages: [] }));
  const local = path.join(f.root, "local.json");
  put(local, JSON.stringify({ packages: [f.subagent] }));
  const existing = JSON.stringify({ packages: [{ source: f.subagent, extensions: [] }] });
  put(path.join(f.target, "settings.json"), existing);
  const plan = buildPlan(opts(f, { localPath: local }));
  assert.equal(plan.subagent.selected.length, 1);
  assert.equal(plan.subagent.declarations.length, 2);
  assert.match(plan.subagent.issues.join("; "), /including disabled/);
  assert.equal(doctor(opts(f, { localPath: local })).ok, false);
  for (const replace of [false, true]) assert.throws(() => apply(opts(f, { localPath: local, replace })), /external subagent configuration is invalid/);
  assert.equal(fs.readFileSync(path.join(f.target, "settings.json"), "utf8"), existing);
  assert.equal(fs.existsSync(path.join(f.target, ".workbench-backups")), false);
  // An explicitly corrected declaration is healthy; the installer does not correct it itself.
  put(path.join(f.target, "settings.json"), JSON.stringify({ packages: [f.subagent] }));
  apply(opts(f, { localPath: local }));
  assert.equal(doctor(opts(f, { localPath: local })).ok, true);
  assert.deepEqual(readJson(path.join(f.target, "settings.json")).packages, [f.subagent]);
});

test("non-autoload subagent is rejected before writes; explicit autoload true is supported", () => {
  const f = fixture();
  put(path.join(f.root, "config/settings.json"), JSON.stringify({ packages: [] }));
  const existing = JSON.stringify({ packages: [{ source: f.subagent, autoload: false }] });
  put(path.join(f.target, "settings.json"), existing);
  const plan = buildPlan(opts(f));
  assert.equal(plan.subagent.declarations.length, 1);
  assert.equal(plan.subagent.invalid, true);
  assert.equal(doctor(opts(f)).ok, false);
  assert.throws(() => apply(opts(f, { replace: true })), /external subagent configuration is invalid/);
  assert.equal(fs.readFileSync(path.join(f.target, "settings.json"), "utf8"), existing);
  assert.equal(fs.existsSync(path.join(f.target, ".workbench-backups")), false);
  put(path.join(f.target, "settings.json"), JSON.stringify({ packages: [{ source: f.subagent, autoload: true }] }));
  apply(opts(f));
  assert.equal(doctor(opts(f)).ok, true);
});

test("external subagent entries and filters cannot produce a false healthy doctor result", () => {
  const badEntries = ["../outside.ts", "/absolute.ts", "src/missing.ts", "src/*.ts", "src\\index.ts"];
  for (const entry of badEntries) {
    const f = fixture();
    put(path.join(f.subagent, "package.json"), JSON.stringify({ name: "@pi/subagent", pi: { extensions: [entry] } }));
    assert.equal(buildPlan(opts(f)).subagent.invalid, true);
    assert.throws(() => apply(opts(f)), /external subagent configuration is invalid/);
    assert.equal(fs.existsSync(f.target), false);
  }
  const f = fixture();
  put(path.join(f.root, "config/settings.json"), JSON.stringify({ packages: [{ source: f.subagent, extensions: [] }] }));
  assert.equal(buildPlan(opts(f)).subagent.selected.length, 0);
  assert.match(buildPlan(opts(f)).subagent.issues.join("; "), /not configured/);
  put(path.join(f.root, "config/settings.json"), JSON.stringify({ packages: [{ source: f.subagent, extensions: ["src/index.ts"] }] }));
  assert.equal(buildPlan(opts(f)).subagent.invalid, true);
  put(path.join(f.root, "config/settings.json"), JSON.stringify({ packages: [f.subagent] }));
  fs.unlinkSync(path.join(f.subagent, "src/index.ts"));
  fs.symlinkSync(path.join(f.subagent, "package.json"), path.join(f.subagent, "src/index.ts"));
  assert.equal(buildPlan(opts(f)).subagent.invalid, true);
});

test("explicit restore accepts legacy extension receipts without reinstalling a source copy", () => {
  const f = fixture();
  const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");
  const id = "old-install";
  const backup = path.join(f.target, ".workbench-backups", id);
  const original = "original user extension\n";
  const installed = "old workbench extension\n";
  put(path.join(f.target, "extensions/subagent/index.ts"), installed);
  put(path.join(f.target, "extensions/subagent/agents.ts"), installed);
  put(path.join(backup, "files/index.ts"), original);
  put(path.join(backup, "manifest.json"), JSON.stringify({ version: 1, createdDirectories: ["extensions", "extensions/subagent"], files: [
    { path: "extensions/subagent/index.ts", before: { hash: hash(original), mode: 0o600 }, afterHash: hash(installed), backup: "files/index.ts" },
    { path: "extensions/subagent/agents.ts", before: null, afterHash: hash(installed) },
  ] }));
  put(path.join(f.target, "extensions/subagent/index.ts"), "post-install user edit\n");
  assert.throws(() => restore(opts(f, { backupId: id })), /target changed/);
  assert.equal(fs.readFileSync(path.join(f.target, "extensions/subagent/agents.ts"), "utf8"), installed);
  put(path.join(f.target, "extensions/subagent/index.ts"), installed);
  restore(opts(f, { backupId: id }));
  assert.equal(fs.readFileSync(path.join(f.target, "extensions/subagent/index.ts"), "utf8"), original);
  assert.equal(fs.statSync(path.join(f.target, "extensions/subagent/index.ts")).mode & 0o777, 0o600);
  assert.equal(fs.existsSync(path.join(f.target, "extensions/subagent/agents.ts")), false);
  assert.equal(fs.existsSync(path.join(f.target, "extensions/subagent")), true);
});

test("help parses without planning or creating the default target", () => {
  const parsed = parseArgs(["--help"]);
  assert.equal(parsed.help, true);
  const f = fixture();
  const output = execFileSync(process.execPath, [path.resolve("scripts/workbench.mjs"), "--help", "--target", f.target], { encoding: "utf8" });
  assert.match(output, /Usage:/); assert.match(output, /--target PATH/);
  assert.equal(fs.existsSync(f.target), false);
});
