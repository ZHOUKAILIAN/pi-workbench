# Repository Instructions

This repository is an asset library for Codex-native multi-agent collaboration. Do not add a custom agent executor or workflow runtime unless a requirement explicitly changes the repository boundary.

## Asset ownership

- Put reusable roles in `agents/`.
- Put task prompts in `prompts/`.
- Put declarative multi-agent compositions in `teams/`.
- Put authoring skeletons in `templates/`.
- Put machine-readable contracts in `schemas/`.
- Put only sanitized evidence in `examples/`.

## Change rules

- Keep agent tasks bounded and independently executable.
- State read/write permissions explicitly.
- Require evidence, completion criteria, and escalation conditions.
- Prefer links between assets over duplicated prompt text.
- Keep human-facing documents in Markdown and control data in YAML or JSON.
- Never commit credentials, personal data, customer data, raw session logs, or machine-specific secrets.

## Verification

For every change:

1. Check Markdown links and referenced asset IDs.
2. Validate YAML/JSON syntax.
3. Validate team recipes against `schemas/team.schema.json` when a validator is available.
4. Review the diff for secrets and machine-specific paths.

