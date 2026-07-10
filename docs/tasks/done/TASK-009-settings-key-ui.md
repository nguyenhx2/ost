---
title: "TASK-009: Settings UI - provider key entry/validation, model selection"
status: Done
fr: "FR-03, FR-04"
owner: frontend-ui-dev
deps: "TASK-006"
priority: P1
phase: 1
created: 2026-07-09
tags: [task]
---

# TASK-009: Settings UI - provider key entry/validation, model selection

## Goal
Users can add/validate/remove API keys for the four providers, pick default provider +
model, and set fallback order - keys stored via TASK-006's keychain wrapper only.

## Inputs / context
- FR-03 spec; ADR-003; `security-privacy.md` (WebView never sees key values after entry);
  `human-in-the-loop.md` (provider transparency).

## To do
- [x] Settings window: provider list with masked status, add-key flow (paste -> validate
      via provider `validate_key` -> store -> clear input), remove-key flow.
- [x] Default provider/model selection + fallback order (persisted in tauri-plugin-store -
      names only, never keys).
- [x] Clear error surfaces for invalid key / quota / network (typed errors from the
      provider layer).
- [x] i18n vi+en; Vitest with mocked IPC.

## Test scenarios / acceptance
- [x] After entry, the key value is unreachable from the WebView (assert IPC surface).
- [x] Invalid key shows a specific, actionable message.

## Session log (AI session log)

| Date | Who | What was done | Result |
|------|-----|---------------|--------|
| 2026-07-09 | orchestrator | Task created and registered in master-plan (bootstrap seed) | Planned |
| 2026-07-09 | frontend-ui-dev | Flipped status to Active. Built Rust key command surface (`commands/keys.rs`: statuses/save/check/delete, typed `KeyCommandError`, `SaveKeyOutcome`), settings window (`shell/settings.rs`) + tray entry, registered `KeyStore` + `tauri-plugin-store`. Added Input primitive (+ design-system row), `keysIpc`/`settingsIpc` typed wrapper, `settings.ts` persistence (names only), `useProviderKeys`/`useProviderSelection` hooks, `SettingsView` + i18n (vi+en). Followed up TASK-006: real Credential Manager round-trip smoke test (`keys/backend.rs`, `#[ignore]`) and automated command-surface no-`expose`/no-`ApiKey` test. | Active - all gates green |
| 2026-07-09 | frontend-ui-dev | Verified: Vitest 124/124, eslint+prettier clean, tsc strict clean; cargo fmt+clippy -D warnings clean, cargo test 79 pass + 1 ignored (real keychain smoke ran manually and PASSED). Synced `ipc.md` contract. | Active - ready for review gates |
| 2026-07-09 | qa-test | Quality-gate verification: Vitest 124 pass, eslint+prettier+tsc clean, cargo fmt/clippy clean, cargo test 79 pass, both key-surface guard tests pass, real keychain smoke PASSED via --ignored. Found AC-03.4 branch gap: checkKey invalid-verdict and error paths untested; added 2 tests to useProviderKeys.test.ts (now 126 pass). | Active - suite release-gate-ready |
| 2026-07-09 | frontend-ui-dev | Applied both post-review should-fixes. FIX1 (543fa6a, scope agents): consolidated the two overlapping primitives tables in design-system.md into one `### Landed` table incl. Input. FIX2 (c5cb4a9, scope ui): useProviderSelection now catches saveProviderSettings rejections into typed `error: { kind: "persist" }` state (was an unhandled rejection silently dropping the change); SettingsView renders a persist-error alert; added Vitest case asserting the surfaced error + resolved (non-rejecting) mutation + error-clear on next success. Optional cleanups: Input spreads `{...rest}` before controlled a11y attrs, corrected stale settings.ts store comment, dropped unused i18n keys settings.checking/defaultModel (vi+en). | Active - Vitest 127 pass, eslint+prettier+tsc clean (no Rust touched) |
| 2026-07-10 | frontend-ui-dev | Rebased branch onto origin/main (7 commits replayed). Only conflict was the TASK-009 master-plan row; resolved as a union keeping all TASK-001..TASK-009 rows (TASK-008 stays Done per main, TASK-009 stays Active). Confirmed status Active in both the frontmatter and the master-plan row. Re-verified the full suite on the rebased tree. | Active - Vitest 127 pass; eslint+prettier clean; cargo fmt --check clean, clippy -D warnings clean, cargo test 79 pass + 1 ignored (keychain smoke) |
| 2026-07-10 | security-reviewer | Mandatory security+privacy gate (diff touches keys/ + commands/keys.rs). Traced every key path: ApiKey newtype has no Serialize/Display + redacting Debug (raw only via expose()); command returns carry masked ProviderKeyStatus (provider_id + key_present) only; two in-repo guard tests (source-scan for expose/ApiKey + runtime serialize of every return) enforce no key on the IPC surface; settings.ts persists names only; add-key clears input on success; tests use injected MockProvider/MockBackend, no network, synthetic keys; no .env reads. NIT only: dead key-free reason field on IPC surface. | PASS - no blockers |
| 2026-07-10 | code-reviewer | Full-diff gate (frontend view/hooks/lib/i18n/Input primitive + Rust key commands/keychain/shell/tray + commit metadata). Design-system HARD GATE holds: custom Select (no native), tokens only, Input primitive created+barrelled+tested with its design-system row landed, lucide icons aria-hidden. IPC via typed wrapper; thin Rust handlers, thiserror, no unwrap outside tests; i18n vi+en complete and accented; all 8 commit subjects valid, no AI attribution/emoji/em dash. NITs only (functional setState in useProviderSelection, first-render loading flash, aria-labelledby on Select labels). | PASS - mergeable as-is |

## Result
<Fill when moving to Done.>
| 2026-07-10 | claude | Independently verified on merged main: PR #10 merge commit c6d212e; review rows present in the task file; commit subjects all within 72 chars | Done |

## Result
Settings UI for provider keys and model selection is on `main` (PR #10, merge commit
c6d212e).

Delivered: the settings window with a provider list showing masked key status, the
add-key flow (paste -> `validate_key` against the provider -> store in the OS keychain ->
clear the input), the remove-key flow, default provider/model selection with fallback
order persisted in tauri-plugin-store (names only, never keys), typed error surfaces for
invalid key / quota / network, the `Input` primitive with its design-system row, and i18n
in vi (fully accented) and en.

Both follow-ups carried from TASK-006 are closed:
- The real Windows Credential Manager round-trip is covered by `keys::backend::
  real_keychain_smoke` (`#[ignore]`, dedicated service name), which was run for real:
  set / get / delete all passed against the live keychain.
- Two automated guards assert no key reaches the IPC surface: a source scan
  (`command_module_never_exposes_key_material`) and a runtime scan that serializes every
  command return value (`no_command_return_value_contains_the_key`). `ApiKey` having no
  `Serialize` is the compile-time backstop behind them.

Evidence: Vitest 127 passed; `cargo test --lib` 79 passed / 1 ignored (the keychain smoke);
ESLint, Prettier, clippy `-D warnings` and `cargo fmt --check` clean; CI `lint-and-test`
green on PR #10. code-reviewer PASS (design-system hard gate holds; nits only).
security-reviewer PASS (traced every key path; no key on the IPC surface; the WebView
receives provider id + `key_present` only).

Carried forward, not done here:
- The revoke-consent control for model downloads lands with TASK-007, which brings the
  consent facility; it needs this window to live in.
- security-reviewer noted an optional future hardening for the non-Gemini clients when
  Anthropic / OpenAI / OpenRouter are added.

