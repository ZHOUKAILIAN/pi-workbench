import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];

function fail(message) {
  failures.push(message);
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function listFiles(relativeDir, suffix) {
  const absoluteDir = path.join(root, relativeDir);
  if (!fs.existsSync(absoluteDir)) return [];
  return fs
    .readdirSync(absoluteDir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(suffix))
    .map((entry) => path.join(entry.parentPath, entry.name));
}

const roleFiles = listFiles(".agents/skills/feature-delivery/references/agents", ".md");
if (roleFiles.length < 5) {
  fail(`expected at least 5 role prompts, found ${roleFiles.length}`);
}

const roleHeadings = [
  "## Responsibility",
  "## Boundaries",
  "## Required input",
  "## Output contract",
  "## Completion and escalation",
];

for (const absolutePath of roleFiles) {
  const relativePath = path.relative(root, absolutePath);
  const source = fs.readFileSync(absolutePath, "utf8");
  if (!source.match(/^#\s+\S/m)) fail(`${relativePath}: missing role title`);
  for (const heading of roleHeadings) {
    if (!source.includes(heading)) fail(`${relativePath}: missing ${heading}`);
  }
}

const skillRoots = fs.existsSync(path.join(root, ".agents/skills"))
  ? fs
      .readdirSync(path.join(root, ".agents/skills"), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(".agents/skills", entry.name))
  : [];

if (skillRoots.length === 0) fail("expected at least one project skill");

const controllerHeadings = [
  "## Core Rule",
  "## Priority",
  "## Active Mode",
  "## Gates",
  "## Red Flags",
  "## Handoff Rules",
  "## Completion Signal",
];

for (const skillRoot of skillRoots) {
  const skillMdPath = path.join(skillRoot, "SKILL.md");
  const skillJsonPath = path.join(skillRoot, "skill.json");
  const openaiYamlPath = path.join(skillRoot, "agents/openai.yaml");
  if (!fs.existsSync(path.join(root, skillMdPath))) {
    fail(`${skillRoot}: missing SKILL.md`);
    continue;
  }
  if (!fs.existsSync(path.join(root, skillJsonPath))) {
    fail(`${skillRoot}: missing skill.json`);
    continue;
  }
  if (!fs.existsSync(path.join(root, openaiYamlPath))) {
    fail(`${skillRoot}: missing agents/openai.yaml`);
    continue;
  }

  const markdown = read(skillMdPath);
  const frontmatter = markdown.match(/^---\n([\s\S]*?)\n---/m)?.[1] ?? "";
  const markdownName = frontmatter.match(/^name:\s*(.+)$/m)?.[1]?.trim();
  const markdownDescription = frontmatter.match(/^description:\s*(.+)$/m)?.[1]?.trim();
  let metadata;
  try {
    metadata = JSON.parse(read(skillJsonPath));
  } catch (error) {
    fail(`${skillJsonPath}: invalid JSON: ${error.message}`);
    continue;
  }

  if (!markdownName || !markdownDescription) fail(`${skillMdPath}: incomplete frontmatter`);
  if (metadata.name !== markdownName) fail(`${skillRoot}: SKILL.md and skill.json names differ`);
  if (metadata.description !== markdownDescription) {
    fail(`${skillRoot}: SKILL.md and skill.json descriptions differ`);
  }
  if (metadata.sub_skills && !Array.isArray(metadata.sub_skills)) {
    fail(`${skillJsonPath}: sub_skills must be an array`);
  }
  const openaiYaml = read(openaiYamlPath);
  if (!openaiYaml.includes(`$${metadata.name}`)) {
    fail(`${openaiYamlPath}: default_prompt must mention $${metadata.name}`);
  }
  for (const heading of controllerHeadings) {
    if (!markdown.includes(heading)) fail(`${skillMdPath}: missing ${heading}`);
  }
}

for (const legacyDir of ["agents", "prompts", "teams", "schemas", "templates"]) {
  if (fs.existsSync(path.join(root, legacyDir))) {
    fail(`${legacyDir}/ is a legacy duplicate source; use Codex-native paths`);
  }
}

const markdownFiles = ["README.md", "AGENTS.md", ...listFiles(".agents/skills", ".md").map((file) => path.relative(root, file))];
for (const markdownPath of markdownFiles) {
  const source = read(markdownPath);
  for (const match of source.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
    const target = match[1];
    if (/^(https?:|#)/.test(target)) continue;
    const withoutAnchor = target.split("#", 1)[0];
    const resolved = path.resolve(path.dirname(path.join(root, markdownPath)), withoutAnchor);
    if (!fs.existsSync(resolved)) fail(`${markdownPath}: broken local link ${target}`);
  }
}

if (failures.length > 0) {
  console.error("Validation failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Validated ${roleFiles.length} role prompts and ${skillRoots.length} workflow skill.`);
