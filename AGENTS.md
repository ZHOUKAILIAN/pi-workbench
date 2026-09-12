# Repository Instructions

This repository is **Pi Workbench**, a personal Pi work environment with reusable roles, prompts, extension sources and safe installation tools. Keep the workbench focused on configuration and composition; workflow engines and external skills remain in their owning repositories.

## Source of truth

- `README.md`: product goal, installation interface and acceptance criteria.
- `docs/configuration.md`: local configuration, optional dependencies, updates, rollback and verification boundaries.
- `config/AGENTS.md`: portable global collaboration rules, installed to the Pi agent directory. This root file governs development of this repository only.
- `config/settings.json`: safe defaults; local credentials and model catalogs never belong here.
- `agents/*.md`: reusable role definitions; `prompts/*.md`: workflow entry prompts.
- `extensions/subagent/`: the adopted standalone subagent implementation, originating in Pi's MIT example and the user's local customization. Keep attribution in `THIRD_PARTY_NOTICES.md`.
- `manifests/dependencies.json`: external source locations and pinned recovery references. External skills and private extensions keep their own repositories as the source of truth.
- `scripts/workbench.mjs`: install/plan/doctor/restore behavior; `test/`: deterministic tests.

## Change rules

- One purpose per branch. Preserve unrelated work and keep changes scoped.
- Route documentation changes back into README and the configuration guide, rather than adding task-specific reports. Describe the current product and usage, not the history of how the repository was built.
- Never import private extension code, credentials, customer data, provider endpoints, machine paths, raw sessions, caches or backups into public history.
- Install is explicit. Never test against the real user agent directory. Tests use isolated temporary directories and must not call a model or install packages.
- `plan` is read-only. Conflicting managed files require `--replace`. Every changed apply must have a private rollback backup before any managed file is modified.
- Preserve unrelated settings/files and directory permissions. Rollback refuses post-install edits. Reject symlink write targets and path traversal.
- Keep CLI dependencies limited to Node built-ins. Use Pi's documented discovery paths rather than building a registry or custom runtime.
- Review the current diff plus affected references and adjacent contracts, not the entire unrelated workspace. No overlapping parallel writes.
- After review passes, make a scoped local commit; push, GitHub rename and live configuration deployment require user authorization.

## Verification

1. `npm test` (structure, portability and deterministic installation/rollback tests).
2. `npm run smoke` when Pi is installed (isolated, no provider calls); otherwise report it blocked.
3. `git diff --check` and inspect staged/new files for secrets, privacy and machine paths.
4. Report actual verification evidence and external dependencies not tested; never equate source presence with provider E2E readiness.
