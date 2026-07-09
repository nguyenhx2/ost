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

## Invariant principles

1. Human-in-the-loop: AI translation output is a proposal rendered to the user; it is never
   used to trigger actions automatically. (human-in-the-loop.md)
2. Follow the docs: every feature maps to an FR and meets its acceptance criteria.
3. User API keys and captured audio/screen content are the most sensitive data in the system:
   keys live ONLY in the OS keychain, captured content never persists to disk or leaves the
   machine except the minimal text sent to the user-chosen LLM provider. (security-privacy.md)
4. Agent guardrails: least privilege, untrusted-data defense, never read secrets, gated
   destructive actions. (agent-guardrails.md)
5. Performance is a requirement, not an optimization: latency and idle-resource budgets in
   the NFRs gate every merge touching the pipelines. (tech-stack.md, testing.md)
6. UI from primitives and tokens only; dark-first; no emoji; SVG icons via lucide-react.
   (frontend.md, design-system.md)
7. Writing style everywhere: no emoji; never the em dash - write "-"; no AI attribution in
   commits/PRs.

## Precedence on conflict

Rules in `.claude/rules/` > per-folder CLAUDE.md > default habits.

## Rule list

- tech-stack.md - the settled technology stack.
- coding-standards.md - code standards (Rust + TypeScript).
- testing.md - testing (cargo test, Vitest, WebdriverIO).
- git-workflow.md - git and PRs (GitHub).
- conventional-commits.md - commit format (hook-enforced).
- agent-guardrails.md - protection layers for agents.
- security-privacy.md - API keys, captured content, secrets.
- docs-workflow.md - reading/writing documents in docs/.
- task-tracking.md - task state in markdown files.
- frontend.md - frontend standards, brand/icon/a11y policy.
- design-system.md - primitives-and-tokens contract (hard gate).
- human-in-the-loop.md - AI output is a proposal, never an action.
