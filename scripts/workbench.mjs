#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const DEFAULT_REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SAFE_SETTINGS = {
  defaultProvider: "string", defaultModel: "string", theme: "string",
  defaultThinkingLevel: "thinking", transport: "transport", enabledModels: "strings",
  steeringMode: "mode", followUpMode: "mode", hideThinkingBlock: "boolean",
  showCacheMissNotices: "boolean", quietStartup: "boolean", collapseChangelog: "boolean",
  enableSkillCommands: "boolean", defaultTools: "strings", doubleEscapeAction: "action",
  treeFilterMode: "tree", editorPaddingX: "number", outputPad: "number",
  autocompleteMaxVisible: "number", showHardwareCursor: "boolean", tuiMode: "string",
  fullscreenExitOutput: "string", fullscreenScrollbar: "string", fullscreenCopyOnSelect: "boolean",
};
const THINKING = new Set(["off", "minimal", "low", "medium", "high", "xhigh", "max"]);
const TRANSPORT = new Set(["auto", "sse", "websocket", "websocket-cached"]);
const MODES = new Set(["all", "one-at-a-time"]);
const ACTIONS = new Set(["fork", "tree", "none"]);
const TREES = new Set(["default", "no-tools", "user-only", "labeled-only", "all"]);
const MODEL_REF = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;
const SEMVER = "(?:0|[1-9]\\d*)\\.(?:0|[1-9]\\d*)\\.(?:0|[1-9]\\d*)(?:-[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?(?:\\+[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?";

class WorkbenchError extends Error {}
const fail = (message) => { throw new WorkbenchError(message); };
const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const isPlainObject = (v) => isObject(v) && Object.getPrototypeOf(v) === Object.prototype;
const has = (p) => { try { fs.lstatSync(p); return true; } catch (e) { if (e.code === "ENOENT") return false; throw e; } };
const sha = (data) => crypto.createHash("sha256").update(data).digest("hex");
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const unique = (items) => {
  const seen = new Set();
  return items.filter((item) => { const k = JSON.stringify(item); if (seen.has(k)) return false; seen.add(k); return true; });
};

function rejectTraversal(value, label) {
  if (typeof value !== "string" || value.includes("\0") || value.split(/[\\/]/).includes("..")) fail(`${label} is invalid`);
}
function safeResolved(value, base, label) {
  rejectTraversal(value, label);
  return path.resolve(base, value);
}
function noSymlink(p, label = "path") {
  const absolute = path.resolve(p);
  const parsed = path.parse(absolute);
  const parts = absolute.slice(parsed.root.length).split(path.sep).filter(Boolean);
  let current = parsed.root;
  for (let i = 0; i < parts.length; i++) {
    current = path.join(current, parts[i]);
    let st;
    try { st = fs.lstatSync(current); } catch (e) {
      if (e.code === "ENOENT") break;
      fail(`${label} cannot be inspected`);
    }
    if (st.isSymbolicLink()) fail(`${label} contains a symlink`);
    if (i < parts.length - 1 && !st.isDirectory()) fail(`${label} has a non-directory parent`);
  }
}
function regularFile(p, label) {
  noSymlink(p, label);
  let st;
  try { st = fs.lstatSync(p); } catch { fail(`${label} is missing`); }
  if (!st.isFile()) fail(`${label} is not a file`);
  return st;
}
function directory(p, label) {
  noSymlink(p, label);
  let st;
  try { st = fs.lstatSync(p); } catch { fail(`${label} is missing`); }
  if (!st.isDirectory()) fail(`${label} is not a directory`);
  return st;
}
function readText(p, label) {
  regularFile(p, label);
  try { return fs.readFileSync(p, "utf8"); } catch { fail(`${label} cannot be read`); }
}
function readJson(p, label) {
  const text = readText(p, label);
  try { return JSON.parse(text); } catch { fail(`${label} contains invalid JSON`); }
}
function parseLocal(localPath) {
  const value = readJson(localPath, "local configuration");
  if (!isPlainObject(value)) fail("local configuration must be an object");
  const allowed = new Set(["settings", "agentModels", "skills", "packages"]);
  for (const key of Object.keys(value)) if (!allowed.has(key)) fail("local configuration is invalid");
  const settings = value.settings === undefined ? {} : value.settings;
  const agentModels = value.agentModels === undefined ? {} : value.agentModels;
  const skills = value.skills === undefined ? [] : value.skills;
  const packages = value.packages === undefined ? [] : value.packages;
  if (!isPlainObject(settings) || !isPlainObject(agentModels) || !Array.isArray(skills) || !Array.isArray(packages)) fail("local configuration is invalid");
  for (const key of Object.keys(settings)) {
    const kind = Object.hasOwn(SAFE_SETTINGS, key) ? SAFE_SETTINGS[key] : undefined;
    if (!kind) fail("local configuration is invalid");
    const v = settings[key];
    if (kind === "string" && typeof v !== "string") fail(`local setting ${key} has invalid type`);
    if (kind === "strings" && (!Array.isArray(v) || v.some((x) => typeof x !== "string"))) fail(`local setting ${key} has invalid type`);
    if (kind === "boolean" && typeof v !== "boolean") fail(`local setting ${key} has invalid type`);
    if (kind === "number" && (!Number.isFinite(v) || typeof v !== "number")) fail(`local setting ${key} has invalid type`);
    if (kind === "thinking" && (typeof v !== "string" || !THINKING.has(v))) fail(`local setting ${key} has invalid value`);
    if (kind === "transport" && (typeof v !== "string" || !TRANSPORT.has(v))) fail(`local setting ${key} has invalid value`);
    if (kind === "mode" && (typeof v !== "string" || !MODES.has(v))) fail(`local setting ${key} has invalid value`);
    if (kind === "action" && (typeof v !== "string" || !ACTIONS.has(v))) fail(`local setting ${key} has invalid value`);
    if (kind === "tree" && (typeof v !== "string" || !TREES.has(v))) fail(`local setting ${key} has invalid value`);
  }
  for (const role of Object.keys(agentModels)) {
    if (!role || role.includes("/") || role.includes("\\") || role === "." || role === "..") fail("local configuration is invalid");
    const model = agentModels[role];
    if (typeof model !== "string" || !MODEL_REF.test(model)) fail("local configuration is invalid");
  }
  const external = (list, label) => list.map((item, i) => {
    if (typeof item !== "string" || !path.isAbsolute(item)) fail(`${label}[${i}] must be an absolute directory`);
    rejectTraversal(item, `${label}[${i}]`);
    directory(item, `${label}[${i}]`);
    return item;
  });
  return { settings, agentModels, skills: external(skills, "local skills"), packages: external(packages, "local packages") };
}
function readManifest(repoRoot) {
  const p = path.join(repoRoot, "manifests", "dependencies.json");
  const value = readJson(p, "dependencies manifest");
  if (!isPlainObject(value) || !Array.isArray(value.npmPackages)) fail("dependencies manifest has invalid npmPackages");
  return value.npmPackages.map((item, i) => {
    if (!isPlainObject(item) || Object.keys(item).some((k) => !["source", "purpose"].includes(k)) || typeof item.purpose !== "string") fail(`dependencies manifest npmPackages[${i}] is invalid`);
    if (typeof item.source !== "string" || !new RegExp(`^npm:(?:@[^/\\s]+\\/)?[^@/\\s]+@${SEMVER}$`).test(item.source)) fail(`dependencies manifest npmPackages[${i}] has invalid source`);
    return item;
  });
}
function sourceFiles(repoRoot, local) {
  const files = [];
  const add = (source, relative, transform = (x) => x) => {
    const st = regularFile(path.join(repoRoot, source), `source ${source}`);
    const content = transform(readText(path.join(repoRoot, source)));
    files.push({ relative, content: Buffer.from(content), mode: st.mode & 0o777 });
  };
  add("config/settings.json", "settings.json");
  add("config/AGENTS.md", "AGENTS.md");
  for (const group of ["agents", "prompts"]) {
    const dir = path.join(repoRoot, group);
    directory(dir, `source ${group}`);
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (!entry.name.endsWith(".md")) continue;
      if (!entry.isFile()) fail(`source ${group}/${entry.name} is not a regular file`);
      const source = path.join(group, entry.name);
      const transform = group === "agents" ? (text) => renderAgent(text, local.agentModels[entry.name.slice(0, -3)]) : undefined;
      add(source, `${group}/${entry.name}`, transform || ((x) => x));
    }
  }
  return files;
}
function renderAgent(text, model) {
  if (!model) return text;
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const normalized = text.replace(/\r\n?/g, "\n");
  const lines = normalized.split("\n");
  const quotedModel = JSON.stringify(model);
  if (lines[0] !== "---") return ["---", `model: ${quotedModel}`, "---", normalized].join(eol);
  const end = lines.findIndex((line, i) => i > 0 && line === "---");
  if (end < 0) return ["---", `model: ${quotedModel}`, "---", normalized].join(eol);
  const front = lines.slice(1, end).filter((line) => !/^\s*model\s*:/.test(line));
  front.push(`model: ${quotedModel}`);
  const body = lines.slice(end + 1);
  return ["---", ...front, "---", ...body].join(eol);
}
function checkTarget(repoRoot, target) {
  const root = path.resolve(repoRoot);
  const absolute = path.resolve(target);
  const relative = path.relative(root, absolute);
  if (!relative || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))) fail("target must be outside the repository");
  noSymlink(absolute, "target");
  if (has(absolute) && !fs.lstatSync(absolute).isDirectory()) fail("target is not a directory");
  noSymlink(path.join(absolute, ".workbench-backups"), "backup directory");
  return absolute;
}
function getOptions(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? DEFAULT_REPO_ROOT);
  const targetInput = options.target ?? process.env.PI_CODING_AGENT_DIR ?? path.join(os.homedir(), ".pi", "agent");
  const target = path.isAbsolute(targetInput) ? (rejectTraversal(targetInput, "target"), path.resolve(targetInput)) : safeResolved(targetInput, process.cwd(), "target");
  checkTarget(repoRoot, target);
  let local;
  if (options.localPath != null || options.local != null) {
    const localPath = options.localPath ?? options.local;
    if (!path.isAbsolute(localPath)) fail("local configuration must be an absolute path");
    rejectTraversal(localPath, "local configuration");
    local = parseLocal(localPath);
  } else local = { settings: {}, agentModels: {}, skills: [], packages: [] };
  const tools = options.withTools ? readManifest(repoRoot) : [];
  return { repoRoot, target, local, tools, replace: Boolean(options.replace) };
}
function destinationInfo(target, item) {
  const destination = path.join(target, item.relative);
  noSymlink(destination, `target ${item.relative}`);
  if (!has(destination)) return { destination, before: null, action: "create" };
  let st;
  try { st = fs.lstatSync(destination); } catch { fail(`target ${item.relative} cannot be inspected`); }
  if (!st.isFile()) return { destination, before: { type: "other" }, action: "conflict" };
  let content;
  try { content = fs.readFileSync(destination); } catch { fail(`target ${item.relative} cannot be read`); }
  const before = { hash: sha(content), mode: st.mode & 0o777, content };
  return { destination, before, action: before.hash === sha(item.content) ? "unchanged" : "conflict" };
}
// Package identity comes from the declared local package, not a copied dispatcher or directory name.
function subagentStatus(packages, target) {
  const legacy = ["extensions/subagent", "extensions/subagent.ts", "extensions/subagent.js"].filter((relative) => has(path.join(target, relative)));
  const selected = [];
  const declarations = [];
  let invalid = false;
  for (const item of packages) {
    const source = typeof item === "string" ? item : isPlainObject(item) ? item.source : undefined;
    if (typeof source !== "string" || !path.isAbsolute(source)) continue;
    let manifest;
    try { manifest = readJson(path.join(source, "package.json"), "external package manifest"); } catch { continue; }
    if (!isPlainObject(manifest) || manifest.name !== "@pi/subagent") continue;
    // Pi keeps the first same-scope package identity. A disabled declaration must not
    // disappear from conflict checks merely because a later declaration enables it.
    declarations.push(source);
    if (isPlainObject(item) && Array.isArray(item.extensions) && item.extensions.length === 0) continue;
    selected.push(source);
    try {
      rejectTraversal(source, "external subagent package");
      directory(source, "external subagent package");
      // Filtered packages need runtime verification; doctor accepts only unfiltered declarations.
      if (isPlainObject(item) && (item.extensions !== undefined || (item.autoload !== undefined && item.autoload !== true))) fail("filtered or non-autoload subagent declaration");
      const entries = manifest.pi?.extensions;
      if (!Array.isArray(entries) || entries.length === 0) fail("invalid extensions");
      for (const entry of entries) {
        if (typeof entry !== "string" || !entry || path.isAbsolute(entry) || entry.includes("\\") || /[*?!]/.test(entry)) fail("invalid extension entry");
        rejectTraversal(entry, "external subagent entry");
        regularFile(path.join(source, entry), "external subagent entry");
      }
    } catch { invalid = true; }
  }
  const issues = legacy.map((relative) => `legacy subagent source: ${relative}; inspect and migrate explicitly (not removed automatically)`);
  if (!selected.length) issues.push("subagent package not configured: add the external @pi/subagent directory to local.packages");
  if (declarations.length > 1) issues.push("multiple external @pi/subagent declarations (including disabled entries); select one package declaration");
  if (invalid) issues.push("external @pi/subagent declaration or extension entries are invalid/unsupported");
  return { legacy, selected, declarations, invalid, issues };
}
export function buildPlan(options = {}) {
  const context = getOptions(options);
  const defaults = readJson(path.join(context.repoRoot, "config/settings.json"), "source settings");
  if (!isPlainObject(defaults)) fail("source settings must be an object");
  let existing = {};
  const settingsPath = path.join(context.target, "settings.json");
  noSymlink(settingsPath, "target settings");
  if (has(settingsPath)) {
    existing = readJson(settingsPath, "target settings");
    if (!isPlainObject(existing)) fail("target settings must be an object");
  }
  for (const source of [defaults, existing]) {
    if (source.skills !== undefined && !Array.isArray(source.skills)) fail("settings skills must be an array");
    if (source.packages !== undefined && !Array.isArray(source.packages)) fail("settings packages must be an array");
  }
  const settings = { ...defaults, ...existing, ...context.local.settings };
  settings.skills = unique([...(defaults.skills ?? []), ...(existing.skills ?? []), ...context.local.skills]);
  settings.packages = unique([...(defaults.packages ?? []), ...(existing.packages ?? []), ...context.local.packages, ...context.tools.map((x) => x.source)]);
  const resources = sourceFiles(context.repoRoot, context.local);
  const sourceRoles = resources.filter((x) => x.relative.startsWith("agents/")).map((x) => path.basename(x.relative, ".md"));
  for (const role of Object.keys(context.local.agentModels)) if (!sourceRoles.includes(role)) fail("local configuration is invalid");
  const setting = resources.find((x) => x.relative === "settings.json");
  setting.content = Buffer.from(json(settings));
  const details = resources.map((item) => {
    const info = destinationInfo(context.target, item);
    // settings is a merge target: existing keys/preferences are deliberately retained.
    if (item.relative === "settings.json" && info.action === "conflict" && info.before?.hash) info.action = "update";
    const afterMode = info.before?.mode ?? (item.relative === "settings.json" ? 0o600 : 0o644);
    return { ...item, ...info, afterHash: sha(item.content), afterMode };
  });
  const changes = details.filter((x) => x.action !== "unchanged");
  const conflicts = details.filter((x) => x.action === "conflict");
  const subagent = subagentStatus(settings.packages, context.target);
  return { ...context, files: details, changes, conflicts, subagent };
}
function ensureDir(p, mode) {
  noSymlink(p, "write path");
  if (has(p)) { if (!fs.lstatSync(p).isDirectory()) fail("write path is not a directory"); return false; }
  const parent = path.dirname(p);
  if (parent !== p) ensureDir(parent, mode);
  fs.mkdirSync(p, { mode });
  try { fs.chmodSync(p, mode); } catch { fail("cannot set directory mode"); }
  return true;
}
function atomicWrite(p, data, mode) {
  noSymlink(p, "write file");
  const parent = path.dirname(p);
  noSymlink(parent, "write parent");
  const tmp = path.join(parent, `.workbench-tmp-${process.pid}-${crypto.randomBytes(8).toString("hex")}`);
  try {
    fs.writeFileSync(tmp, data, { mode: 0o600, flag: "wx" });
    fs.chmodSync(tmp, mode);
    fs.renameSync(tmp, p);
  } catch { try { if (has(tmp)) fs.unlinkSync(tmp); } catch {} fail("write failed"); }
}
function backupId() { return `${Date.now().toString(36)}-${crypto.randomBytes(6).toString("hex")}`; }
const RESOURCE_DIRECTORIES = ["agents", "prompts"];
// Accept old receipts for explicit restore only; new installs never write these extension paths.
const RESTORABLE_DIRECTORIES = [...RESOURCE_DIRECTORIES, "extensions", "extensions/subagent"];
function makeBackup(plan) {
  const createdDirectories = RESOURCE_DIRECTORIES.filter((dir) =>
    !has(path.join(plan.target, dir)) && plan.changes.some((item) => item.relative.startsWith(`${dir}/`)));
  const root = path.join(plan.target, ".workbench-backups");
  ensureDir(plan.target, 0o700);
  ensureDir(root, 0o700);
  let id;
  let dir;
  do { id = backupId(); dir = path.join(root, id); } while (has(dir));
  noSymlink(dir, "backup path");
  ensureDir(dir, 0o700);
  const payload = [];
  try {
    for (const item of plan.changes) {
      const before = item.before && Object.hasOwn(item.before, "content") ? { hash: item.before.hash, mode: item.before.mode } : null;
      const record = { path: item.relative, before, afterHash: item.afterHash, afterMode: item.afterMode };
      if (before) {
        const name = `files/${item.relative.replaceAll("/", "__")}`;
        const bp = path.join(dir, name);
        ensureDir(path.dirname(bp), 0o700);
        noSymlink(bp, "backup file");
        atomicWrite(bp, item.before.content, 0o600);
        record.backup = name;
      }
      payload.push(record);
    }
    atomicWrite(path.join(dir, "manifest.json"), json({ version: 1, files: payload, createdDirectories }), 0o600);
  } catch (e) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
    throw e;
  }
  return id;
}
function rollback(plan, applied, createdDirs) {
  for (const item of [...applied].reverse()) {
    try {
      if (item.before?.content) { atomicWrite(item.destination, item.before.content, item.before.mode); }
      else if (has(item.destination)) { noSymlink(item.destination); fs.unlinkSync(item.destination); }
    } catch {}
  }
  for (const dir of [...createdDirs].reverse()) { try { if (has(dir) && fs.readdirSync(dir).length === 0) fs.rmdirSync(dir); } catch {} }
}
export function apply(options = {}) {
  const plan = buildPlan(options);
  if (plan.subagent.legacy.length) fail("legacy subagent source detected; inspect and migrate explicitly before apply (even with --replace)");
  if (plan.subagent.declarations.length > 1 || plan.subagent.invalid) fail("external subagent configuration is invalid; inspect plan/doctor before apply");
  if (plan.conflicts.length && !plan.replace) fail("conflicting managed files; rerun with --replace");
  if (plan.conflicts.some((item) => item.before?.type === "other")) fail("managed destination is not a file");
  if (!plan.changes.length) return { changed: false, backupId: null, plan };
  const id = makeBackup(plan);
  const applied = [];
  const createdDirs = [];
  try {
    ensureDir(plan.target, 0o700);
    for (const item of plan.changes) {
      const parent = path.dirname(item.destination);
      const before = new Set();
      let cursor = parent;
      while (cursor !== plan.target && cursor !== path.dirname(cursor)) { if (has(cursor)) break; before.add(cursor); cursor = path.dirname(cursor); }
      ensureDir(parent, 0o700);
      for (const d of [...before].sort((a, b) => a.length - b.length)) if (has(d)) createdDirs.push(d);
      applied.push(item);
      atomicWrite(item.destination, item.content, item.afterMode);
    }
  } catch (e) {
    rollback(plan, applied, createdDirs);
    throw e instanceof WorkbenchError ? e : new WorkbenchError("apply failed");
  }
  return { changed: true, backupId: id, plan };
}
export function doctor(options = {}) {
  const plan = buildPlan(options);
  const issues = [...plan.changes.map((item) => `${item.action === "create" ? "missing" : "inconsistent"}: ${item.relative}`), ...plan.subagent.issues];
  return { ok: issues.length === 0, issues, plan };
}
function readBackup(plan, id) {
  if (typeof id !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(id) || path.basename(id) !== id) fail("backup ID is invalid");
  const dir = path.join(plan.target, ".workbench-backups", id);
  noSymlink(dir, "backup path");
  directory(dir, "backup");
  const manifest = readJson(path.join(dir, "manifest.json"), "backup manifest");
  if (!isPlainObject(manifest) || manifest.version !== 1 || !Array.isArray(manifest.files)) fail("backup manifest is invalid");
  const createdDirectories = manifest.createdDirectories ?? [];
  if (!Array.isArray(createdDirectories) || createdDirectories.some((dir) => !RESTORABLE_DIRECTORIES.includes(dir)) || new Set(createdDirectories).size !== createdDirectories.length) fail("backup directories are invalid");
  for (const dir of createdDirectories) noSymlink(path.join(plan.target, dir), "restore directory");
  const seenPaths = new Set();
  const entries = manifest.files.map((entry, i) => {
    if (!isPlainObject(entry) || typeof entry.path !== "string" || seenPaths.has(entry.path) || !/^(?:settings\.json|AGENTS\.md|agents\/[^/]+\.md|prompts\/[^/]+\.md|extensions\/subagent\/(?:index|agents)\.ts)$/.test(entry.path) || path.isAbsolute(entry.path) || entry.path.split(/[\\/]/).includes("..") || entry.path.includes("\\") || typeof entry.afterHash !== "string" || !/^[a-f0-9]{64}$/.test(entry.afterHash)) fail(`backup entry ${i} is invalid`);
    seenPaths.add(entry.path);
    const destination = path.join(plan.target, entry.path);
    const before = entry.before;
    if (before !== null && (!isPlainObject(before) || !/^[a-f0-9]{64}$/.test(before.hash) || !Number.isInteger(before.mode) || before.mode < 0 || before.mode > 0o777 || typeof entry.backup !== "string")) fail(`backup entry ${i} is invalid`);
    let content = null;
    if (before !== null) {
      if (!/^files\/[A-Za-z0-9._-]+$/.test(entry.backup) || entry.backup.includes("..") || path.isAbsolute(entry.backup) || entry.backup.includes("\\")) fail(`backup entry ${i} is invalid`);
      const bp = path.join(dir, entry.backup);
      noSymlink(bp, "backup file");
      regularFile(bp, "backup file");
      content = fs.readFileSync(bp);
      if (sha(content) !== before.hash) fail("backup content is invalid");
    }
    return { ...entry, destination, content };
  });
  return { entries, createdDirectories };
}
export function restore(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? DEFAULT_REPO_ROOT);
  const targetInput = options.target ?? process.env.PI_CODING_AGENT_DIR ?? path.join(os.homedir(), ".pi", "agent");
  const target = path.isAbsolute(targetInput) ? (rejectTraversal(targetInput, "target"), path.resolve(targetInput)) : safeResolved(targetInput, process.cwd(), "target");
  checkTarget(repoRoot, target);
  const { entries, createdDirectories } = readBackup({ target }, options.backupId ?? options.backup);
  const currentStates = entries.map((entry) => {
    noSymlink(entry.destination, "restore target");
    if (!has(entry.destination)) fail("restore refused: target changed");
    const st = fs.lstatSync(entry.destination);
    if (!st.isFile()) fail("restore target is not a file");
    const content = fs.readFileSync(entry.destination);
    if (sha(content) !== entry.afterHash) fail("restore refused: target changed");
    return { entry, currentContent: content, mode: st.mode & 0o777 };
  });
  const applied = [];
  try {
    for (const state of currentStates) {
      applied.push(state);
      if (state.entry.before === null) fs.unlinkSync(state.entry.destination);
      else atomicWrite(state.entry.destination, state.entry.content, state.entry.before.mode);
    }
  } catch { for (const state of applied.reverse()) { try { atomicWrite(state.entry.destination, state.currentContent, state.mode); } catch {} } fail("restore failed"); }
  // Remove only directories created by this install that remain empty. Keep any later user content.
  for (const relative of [...createdDirectories].sort((a, b) => b.length - a.length)) {
    const dir = path.join(target, relative);
    noSymlink(dir, "restore directory");
    if (has(dir) && fs.lstatSync(dir).isDirectory() && fs.readdirSync(dir).length === 0) fs.rmdirSync(dir);
  }
  return { restored: true, backupId: options.backupId ?? options.backup, files: entries.length };
}
export function parseArgs(argv) {
  let command = "plan"; let commandSeen = false; const options = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") return { command, options, help: true };
    if (["plan", "apply", "doctor", "restore"].includes(arg)) { if (commandSeen) fail("multiple commands"); commandSeen = true; command = arg; continue; }
    if (arg === "--replace") { options.replace = true; continue; }
    if (arg === "--with-tools") { options.withTools = true; continue; }
    const match = arg.match(/^--(target|local|backup)=(.*)$/);
    if (match) { if (!match[2]) fail(`${match[1]} requires a value`); options[match[1] === "local" ? "localPath" : match[1] === "backup" ? "backupId" : "target"] = match[2]; continue; }
    if (["--target", "--local", "--backup"].includes(arg)) {
      if (++i >= argv.length || !argv[i] || argv[i].startsWith("--")) fail(`${arg} requires a value`);
      options[arg === "--local" ? "localPath" : arg === "--backup" ? "backupId" : "target"] = argv[i]; continue;
    }
    fail("unknown argument");
  }
  return { command, options };
}
export function main(argv = process.argv.slice(2)) {
  try {
    const { command, options, help } = parseArgs(argv);
    if (help) {
      const target = process.env.PI_CODING_AGENT_DIR || path.join(os.homedir(), ".pi", "agent");
      console.log(`Usage: workbench.mjs [plan|apply|doctor|restore] [options]\n\nOptions:\n  --target PATH       target agent directory (default: ${target})\n  --local PATH        private local configuration JSON\n  --backup ID         backup ID for restore\n  --replace           allow replacement of conflicting files\n  --with-tools        include pinned manifest dependencies\n  -h, --help          show this help`);
      return;
    }
    if (command === "apply") {
      const result = apply(options); console.log(result.changed ? `Applied ${result.plan.changes.length} files; backup ${result.backupId}` : "No changes");
      for (const issue of result.plan.subagent.issues) console.error(`Warning: ${issue}`);
    } else if (command === "doctor") {
      const result = doctor(options); if (!result.ok) { for (const issue of result.issues) console.error(issue); process.exitCode = 1; } else console.log("Doctor: OK");
    } else if (command === "restore") {
      const result = restore(options); console.log(`Restored ${result.files} files from backup ${result.backupId}`);
    } else {
      const result = buildPlan(options); console.log(`Plan: ${result.changes.length} change(s), ${result.conflicts.length} conflict(s)`); for (const item of result.changes) console.log(`${item.action}: ${item.relative}`);
      for (const issue of result.subagent.issues) console.error(`Warning: ${issue}`);
    }
  } catch (error) {
    console.error(error instanceof WorkbenchError ? error.message : "Operation failed");
    process.exitCode = 1;
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
