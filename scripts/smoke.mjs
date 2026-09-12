import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { apply, doctor } from "./workbench.mjs";

// Real CLI discovery, not a model/provider test. Every generated artifact is private and temporary.
const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "pi-workbench-smoke-"));
const home = path.join(root, "home");
const target = path.join(home, ".pi", "agent");
const cwd = path.join(root, "project");
const put = (file, text) => { fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 }); fs.writeFileSync(file, text, { mode: 0o600 }); };
let child;
try {
  fs.mkdirSync(cwd, { recursive: true });
  const skill = path.join(root, "fixture-skill");
  put(path.join(skill, "SKILL.md"), "---\nname: workbench-smoke\ndescription: Use only when testing isolated workbench resource discovery.\n---\nReturn discovery evidence without calling a provider.\n");
  const pkg = path.join(root, "fixture-package");
  put(path.join(pkg, "package.json"), JSON.stringify({ name: "workbench-smoke-fixture", pi: { extensions: ["index.ts"] } }));
  put(path.join(pkg, "index.ts"), 'export default function(pi) { pi.registerCommand("fixture-ready", { description: "Smoke fixture", handler: async () => {} }); }\n');
  const local = path.join(root, "local.json");
  put(local, JSON.stringify({ skills: [skill], packages: [pkg] }));
  apply({ target, localPath: local });
  assert.equal(doctor({ target, localPath: local }).ok, true);
  const probe = path.join(root, "probe.ts");
  put(probe, `import { discoverAgents } from ${JSON.stringify(path.join(target, "extensions/subagent/agents.ts"))};
export default function(pi) {
  pi.on("before_provider_request", () => { throw new Error("Provider requests prohibited during smoke"); });
  pi.registerCommand("workbench-probe", {
    description: "Read-only discovery probe",
    handler: async (_args, ctx) => {
      const commands = pi.getCommands().map(c => c.name);
      const tools = pi.getAllTools().map(t => t.name);
      const agents = discoverAgents(ctx.cwd, "user").agents.map(a => a.name).sort();
      const globalRules = ctx.getSystemPromptOptions().contextFiles?.some(f => f.path === ${JSON.stringify(path.join(target, "AGENTS.md"))}) ?? false;
      ctx.ui.notify(JSON.stringify({ type: "workbench_probe", commands, tools, agents, globalRules }), "info");
    }
  });
}
`);
  // Do not inherit credentials, user model/session variables, NODE_OPTIONS or package configuration.
  const env = { PATH: process.env.PATH, HOME: home, USERPROFILE: home, TERM: "dumb", LANG: "en_US.UTF-8", PI_CODING_AGENT_DIR: target, PI_OFFLINE: "1", PI_TELEMETRY: "0" };
  child = spawn("pi", ["--mode", "rpc", "--no-session", "--offline", "--no-approve", "-e", probe], { cwd, env, stdio: ["pipe", "pipe", "pipe"] });
  const closed = new Promise((resolve) => child.once("close", resolve));
  const result = await new Promise((resolve, reject) => {
    let buffer = "", stderr = "", data;
    const timer = setTimeout(() => reject(new Error(`Pi smoke timed out. ${stderr.slice(-1500)}`)), 30000);
    const finish = (error, value) => { clearTimeout(timer); error ? reject(error) : resolve(value); };
    child.once("error", () => finish(new Error("Pi executable unavailable; install the documented version before running smoke.")));
    child.once("exit", (code) => finish(new Error(`Pi exited before probe completion (${code}). ${stderr.slice(-1500)}`)));
    child.stdin.on("error", () => {});
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => { stderr = (stderr + chunk).slice(-4000); });
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      buffer += chunk;
      let newline;
      while ((newline = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1);
        let event;
        try { event = JSON.parse(line); } catch { continue; }
        try {
          assert.notEqual(event.type, "agent_start", "Smoke must not start a model turn");
          assert.notEqual(event.type, "extension_error", `Extension error: ${event.error}`);
          if (event.type === "response") assert.equal(event.success, true, event.error);
          if (event.id === "commands") {
            const commands = event.data.commands.map(c => c.name);
            assert.ok(commands.includes("workbench-probe"), `Probe failed to load. ${stderr}`);
            for (const name of ["build", "work", "figma_delivery", "skill:workbench-smoke", "fixture-ready"]) assert.ok(commands.includes(name), `Missing ${name}`);
            // Invoke only after verifying this is an extension command, never a model prompt.
            child.stdin.write(JSON.stringify({ id: "probe", type: "prompt", message: "/workbench-probe" }) + "\n");
          }
          if (event.type === "extension_ui_request" && event.method === "notify") {
            const notification = JSON.parse(event.message);
            if (notification.type === "workbench_probe") data = notification;
          }
          if (event.id === "probe") {
            assert.ok(data, `Probe data missing. ${stderr}`);
            assert.ok(data.tools.includes("subagent"), "Subagent tool not registered");
            assert.deepEqual(data.agents, ["code_reviewer", "evidence_investigator", "implementer", "product_aligner", "verifier"]);
            assert.equal(data.globalRules, true, "Global AGENTS not loaded");
            finish(null, data);
          }
        } catch (error) { finish(error); }
      }
    });
    child.stdin.write(JSON.stringify({ id: "commands", type: "get_commands" }) + "\n");
  });
  child.kill("SIGTERM");
  const killTimer = setTimeout(() => child.kill("SIGKILL"), 3000);
  await closed;
  clearTimeout(killTimer);
  console.log(`Pi smoke passed: ${result.agents.length} roles, 3 prompts, global AGENTS, subagent, fixture skill and fixture package. No provider requests.`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  if (child && child.exitCode === null && child.signalCode === null) {
    const closed = new Promise(resolve => child.once("close", resolve));
    child.kill("SIGKILL");
    await closed;
  }
  fs.rmSync(root, { recursive: true, force: true });
}
