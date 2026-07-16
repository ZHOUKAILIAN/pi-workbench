---
name: feature-delivery
description: Use when a scoped repository feature or behavior change needs multi-agent delivery with explicit acceptance criteria and independent verification.
---

# Feature Delivery

## Core Rule

Use Codex-native subagents as bounded roles. The parent agent owns scope, gate decisions, rework routing, and the final claim; a subagent summary is evidence to inspect, not truth to repeat.

## Priority

The user's newest instructions and repository `AGENTS.md` files override this workflow. Do not use this skill for a read-only question, a one-line change with no meaningful delegation boundary, or a task where the user prohibited subagents.

## Active Mode

The active mode is local feature delivery through an accepted requirement contract, technical plan, implementation, independent QA, and independent review. Shipping actions such as commit, push, PR, release, or deploy require explicit user intent.

## Required Inputs

- The user's goal and hard constraints.
- The target repository or workspace.
- The repository's actual rules and source code.

Discover ordinary code paths and test commands from the repository. Stop and ask only when a silent assumption would materially change scope, ownership, external writes, safety, or user-visible behavior.

## Available Assets

The following role prompts define the single source of truth for each stage:

- `references/agents/product-manager.md`: requirement boundary and acceptance contract.
- `references/agents/technical-designer.md`: implementation and verification design.
- `references/agents/developer.md`: scoped implementation and self-test.
- `references/agents/qa.md`: acceptance and regression verification.
- `references/agents/reviewer.md`: independent code review.

Before each delegation, read that role prompt completely and include its responsibility, boundaries, required inputs, output contract, and completion condition in the spawned task. Do not rely on a role name alone.

## Agent Availability

Use the native subagent tool exposed by the current Codex surface. Do not pass a custom `agent_type` unless the callable tool schema in that exact session explicitly supports it. The reliable path is a generic subagent with the selected role prompt embedded in a bounded task.

If subagents are unavailable, do not claim multi-agent delivery; ask whether to continue as a single agent.

Use a fresh subagent for each role. After accepting a stage artifact, explicitly release that child before starting the next stage so completed agents do not consume concurrency slots. Never reuse a read-only Product or Technical Design agent as the write-enabled Developer.

If a stage agent returns neither an artifact nor a concrete error, send one bounded follow-up. If it still produces no result, release it and retry once with a fresh agent. A second no-result attempt makes that gate `BLOCKED`; do not implement the stage silently in the parent.

## Gates

### 1. Requirement Gate

Read `references/agents/product-manager.md`, then delegate the original request as a bounded Product Manager task. Pass the complete user request, workspace, known constraints, and a read-only boundary.

The parent must inspect the returned Requirement Contract. Continue only when scope, acceptance criteria, and material decisions are explicit. If the contract is `BLOCKED`, obtain the missing user decision before design.

### 2. Technical Plan Gate

Read `references/agents/technical-designer.md`, then delegate the accepted Requirement Contract as a bounded Technical Designer task.

The parent must inspect the Technical Plan against actual repository evidence. Continue only when the change map, write scope, risks, and verification mapping are concrete. Route factual gaps back to Technical Designer; route product decisions back to Product Manager or the user.

### 3. Implementation Gate

Read `references/agents/developer.md`, then delegate the accepted contract and plan as a bounded Developer task, including the exact write scope.

After the developer returns, the parent must inspect the actual diff and verification output. Do not advance because an Implementation Report merely says tests passed. If the diff exceeds the accepted scope, stop and resolve it before QA.

### 4. Independent Verification Gate

After implementation is stable, read `references/agents/qa.md` and `references/agents/reviewer.md`. Run the resulting QA and Reviewer tasks in parallel only because both are read-only and independent.

- QA receives the original contract, acceptance criteria, implementation report, and changed-file scope.
- Reviewer receives the contract, plan, and actual diff scope.

The parent must reconcile both results. Any QA `FAIL` or Reviewer `REQUEST_CHANGES` returns a bounded correction list to Developer, followed by fresh QA and review of the corrected diff. After two unsuccessful rework attempts, stop and ask the user how to proceed.

### 5. Completion Gate

Completion requires all of the following:

- Every acceptance criterion has a verified result or an explicit unresolved status.
- The final diff stays inside the accepted scope.
- Relevant verification commands actually ran, or skipped checks have concrete reasons.
- QA returns `PASS`.
- Reviewer returns `APPROVE` with no unresolved actionable finding.
- The parent inspected the underlying diff and evidence.

If any item fails, the task is not ready. Fix and re-run the failed gate, or report the task as blocked.

## Red Flags

- "The role description is enough" -> pass a bounded task with required output and completion criteria.
- "The agents can edit different parts in parallel" -> do not parallelize overlapping or coupled writes.
- "The developer said tests passed" -> inspect the command evidence and actual diff.
- "QA probably covers review" -> keep behavior verification and code review independent.
- "The previous agent already has the context" -> release it and start a fresh role to avoid constraint leakage and occupied slots.
- "This is close enough" -> account for every acceptance criterion before completion.

## Handoff Rules

- Product ambiguity returns to Product Manager or the user.
- Technical uncertainty returns to Technical Designer.
- Implementation and test failures return to Developer as a bounded correction list.
- QA and review never silently fix the implementation they judge.
- Release each completed stage agent after accepting its artifact; release Developer before parallel QA and Review.
- External delivery begins only after the local Completion Gate and explicit user authorization.

## Completion Signal

The parent returns one proof package containing:

- accepted Requirement Contract summary;
- accepted Technical Plan summary;
- files changed;
- verification commands and results;
- QA verdict;
- Reviewer verdict and findings status;
- skipped checks or unresolved risks;
- current delivery state: local only, committed, pushed, PR opened, or released.
