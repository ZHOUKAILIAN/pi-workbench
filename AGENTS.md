# Repository Instructions

This repository is a Codex-native agent and workflow asset library. Keep Codex as the executor and do not add a custom agent runtime unless the user explicitly changes the product boundary.

## Source of truth

- `.agents/skills/*/references/agents/*.md` owns reusable role prompts.
- `.agents/skills/*/SKILL.md` owns workflow sequencing, prompt selection, and gates.
- Each skill's `skill.json` owns machine-readable discovery metadata.
- Each skill's `agents/openai.yaml` owns UI-facing name, description, and default prompt.
- `.codex/config.toml` owns project-level concurrency and depth defaults.
- `examples/` contains sanitized evidence only.

Do not duplicate role instructions in a generic prompt folder, unsupported custom-agent config, or workflow YAML.

## Change rules

- Keep every delegated task bounded and independently executable.
- State write scope, output contract, completion criteria, and escalation conditions.
- Never assign overlapping writes to parallel agents.
- The parent agent owns scope decisions, gate decisions, conflict resolution, and the final claim.
- Never commit credentials, personal data, customer data, raw sessions, or machine-specific secrets.

## Verification

For every change:

1. Run `npm test`.
2. Run `codex -C . debug prompt-input "validate Codex agent assets"` when Codex is installed.
3. Confirm the model-visible prompt contains changed skill names and startup output has no warning caused by changed assets.
4. Review `git diff --check` and scan the diff for secrets and machine-specific paths.
