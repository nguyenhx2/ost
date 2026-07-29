# Rule: Overview

This directory holds every system rule. Every agent and every code change must comply.

## System

OST (On-Screen Translator) is a cross-platform desktop app (Windows first) that translates
live system audio (WASAPI loopback -> local whisper.cpp STT -> LLM translation) and arbitrary
user-selected screen regions (capture -> local OCR -> LLM translation with live preview),
rendered as low-latency overlays. Users bring their own AI provider keys (Gemini, Anthropic,
OpenAI, OpenRouter) stored in the OS keychain. The app runs in the background (tray + global
hotkeys) under strict performance budgets. See `docs/architecture.md` for the system diagram,
module map, and the IPC/provider contracts; `docs/decisions.md` for why the stack looks the
way it does; `docs/known-issues.md` before debugging anything environment-shaped;
`docs/backlog.md` for open work.

## How these rules load

- `00-overview.md` and `guardrails.md` carry no `paths:` - they load into every session at
  CLAUDE.md priority, because they bind agent behavior and decide what may be sent where,
  both of which matter before any file is touched.
- `conventions.md` and `git.md` carry `paths:` and load only when a matching file is touched.
  Path-scoping is a cost-discipline requirement: a rule with no `paths:` is a permanent
  context tax on every agent, every session, whether or not it ever touches the surface the
  rule governs.
- Precedence on conflict: `.claude/rules/` > per-folder CLAUDE.md > default habits.

## Invariant principles

1. Human-in-the-loop: AI translation output is a proposal rendered to the user; it never
   triggers an action automatically - no auto-send, no auto-click, no auto-typing into other
   apps. Every AI output is correctable (re-translate, switch provider/model, edit before
   use). Low-confidence STT/OCR output is flagged visibly, never a silent best-guess.
2. Contracts, not internals: `rust-dev` and `ui-dev` each own their whole side of the app, but
   the traits (`TranslationProvider`, `OcrEngine`, `SpeechToText`, `ScreenCapturer`,
   `AudioSource`) and the Tauri IPC surface (`docs/architecture.md`) are still the real seams -
   nothing outside `providers/` speaks HTTP to an LLM, nothing outside `keys/` touches the OS
   keychain, captured audio/screenshots never cross IPC as bytes.
3. Keys and captured content are the crown jewels: keys only in the OS keychain; audio/
   screenshots never persist to disk or leave the machine except the minimal text sent to the
   user-chosen provider (`guardrails.md`).
4. Guardrails: least privilege, untrusted-data defense, never read secrets, gated destructive
   actions (`guardrails.md`).
5. Performance is a requirement: audio p95 < 3s, region p95 < 2s, idle < 100MB RAM / 1% CPU -
   gate every merge that touches a pipeline, tested like any other acceptance criterion.
6. Tests are mandatory, not optional: they express the invariants of the code they cover (a
   `Segment` always carries a `Confidence`/`Fidelity`; a `TranslationProposal` never wraps an
   unvalidated provider response) (`conventions.md`).
7. Frontend standards: primitives + tokens only, dark-first, no emoji, lucide SVG icons
   (`conventions.md`).
8. Writing style everywhere: no emoji, never the em dash (write "-"), no AI attribution in
   commits/PRs (`git.md`).

## Rule list

Always loaded (no `paths:`):
- `guardrails.md` - least privilege, untrusted-data defense, secrets, sensitive data, gated
  actions, the pre-finish self-check, and the security/privacy non-negotiables (keychain-only
  keys, captured content never persists/leaves).

Loaded only when a matching file is touched:
- `conventions.md` (`src/**`, `src-tauri/**`, `e2e/**`) - coding standards, testing, frontend/
  design-system rules in one file.
- `git.md` - Conventional Commits, branch/PR workflow, commit identity.
