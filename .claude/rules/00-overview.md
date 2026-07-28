# Rule: Overview

This directory contains ALL system rules. Every agent and every code change must comply.

## System

OST (On-Screen Translator) is a cross-platform desktop app (Windows first) that translates
live system audio (WASAPI loopback -> local whisper.cpp STT -> LLM translation) and arbitrary
user-selected screen regions (capture -> OCR -> LLM translation with live preview), rendered
as low-latency overlays. Users bring their own AI provider keys (Gemini, Claude/Anthropic,
OpenAI, OpenRouter) stored in the OS keychain. The app runs in the background (tray + global
hotkeys) with strict performance budgets. Features FR-01..FR-05, see
`docs/specs/05-functional-requirements.md`.

The codebase and the agent harness are organized around Domain-Driven Design: six bounded
contexts, one owning dev agent each, communicating only through published contracts (traits +
the Tauri IPC). See `domain-model.md` for the context map and `docs/architecture/domain-model.md`
for the full detail.

## How these rules load

- No `paths:` frontmatter means the file loads into EVERY session, at CLAUDE.md priority. Only
  four files earn that here: `00-overview.md`, `agent-guardrails.md`, `task-tracking.md`,
  `conventional-commits.md` - they either bind agent behavior or decide what may be sent where,
  and both questions arise before any file is touched.
- Every other rule carries `paths:` and loads only when a matching file is touched. Path-scoping
  is a cost-discipline requirement, not an afterthought: a rule with no `paths:` is a permanent
  context tax on every agent, in every session, whether or not that agent ever touches the surface
  the rule governs.
- Precedence on conflict: `.claude/rules/` > per-folder CLAUDE.md > default habits.

## Invariant principles

1. Human-in-the-loop: AI translation output is a proposal rendered to the user; it is never
   used to trigger actions automatically. (human-in-the-loop.md)
2. Follow the docs: every feature maps to an FR and meets its acceptance criteria.
3. Contexts talk only through their published contracts - a trait or the IPC contract - never by
   reaching into another bounded context's internals. (domain-model.md)
4. User API keys and captured audio/screen content are the most sensitive data in the system:
   keys live ONLY in the OS keychain, captured content never persists to disk or leaves the
   machine except the minimal text sent to the user-chosen LLM provider. (security-privacy.md)
5. Agent guardrails: least privilege, untrusted-data defense, never read secrets, gated
   destructive actions. (agent-guardrails.md)
6. Performance is a requirement, not an optimization: latency and idle-resource budgets in
   the NFRs gate every merge touching the pipelines, and are tested like any other acceptance
   criterion. (tech-stack.md, testing.md)
7. The domain model is the design driver; tests express its invariants and the FR acceptance
   criteria - dropping tests is never what "design from the domain model" means. (testing.md)
8. UI from primitives and tokens only; dark-first; no emoji; SVG icons via lucide-react.
   (frontend.md, design-system.md)
9. Writing style everywhere: no emoji; never the em dash - write "-"; no AI attribution in
   commits/PRs.

## Rule list

Always loaded (no `paths:`):
- agent-guardrails.md - protection layers for agents.
- task-tracking.md - task state in markdown files.
- conventional-commits.md - commit format (hook-enforced).

Loaded only when a matching file is touched:
- domain-model.md - the bounded-context map and the contract-only-communication rule.
- tech-stack.md - the settled technology stack.
- coding-standards.md - code standards (Rust + TypeScript).
- testing.md - testing (cargo test, Vitest, WebdriverIO); domain invariants over test-first order.
- git-workflow.md - git and PRs (GitHub).
- security-privacy.md - API keys, captured content, secrets.
- docs-workflow.md - reading/writing documents in docs/.
- frontend.md - frontend standards, brand/icon/a11y policy.
- design-system.md - primitives-and-tokens contract (hard gate).
- human-in-the-loop.md - AI output is a proposal, never an action.
