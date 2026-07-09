---
title: "TASK-009: Settings UI - provider key entry/validation, model selection"
status: Active
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
- [ ] Settings window: provider list with masked status, add-key flow (paste -> validate
      via provider `validate_key` -> store -> clear input), remove-key flow.
- [ ] Default provider/model selection + fallback order (persisted in tauri-plugin-store -
      names only, never keys).
- [ ] Clear error surfaces for invalid key / quota / network (typed errors from the
      provider layer).
- [ ] i18n vi+en; Vitest with mocked IPC.

## Test scenarios / acceptance
- [ ] After entry, the key value is unreachable from the WebView (assert IPC surface).
- [ ] Invalid key shows a specific, actionable message.

## Session log (AI session log)

| Date | Who | What was done | Result |
|------|-----|---------------|--------|
| 2026-07-09 | orchestrator | Task created and registered in master-plan (bootstrap seed) | Planned |
| 2026-07-09 | frontend-ui-dev | Flipped status to Active. Built Rust key command surface (`commands/keys.rs`: statuses/save/check/delete, typed `KeyCommandError`, `SaveKeyOutcome`), settings window (`shell/settings.rs`) + tray entry, registered `KeyStore` + `tauri-plugin-store`. Added Input primitive (+ design-system row), `keysIpc`/`settingsIpc` typed wrapper, `settings.ts` persistence (names only), `useProviderKeys`/`useProviderSelection` hooks, `SettingsView` + i18n (vi+en). Followed up TASK-006: real Credential Manager round-trip smoke test (`keys/backend.rs`, `#[ignore]`) and automated command-surface no-`expose`/no-`ApiKey` test. | Active - all gates green |
| 2026-07-09 | frontend-ui-dev | Verified: Vitest 124/124, eslint+prettier clean, tsc strict clean; cargo fmt+clippy -D warnings clean, cargo test 79 pass + 1 ignored (real keychain smoke ran manually and PASSED). Synced `ipc.md` contract. | Active - ready for review gates |
| 2026-07-09 | qa-test | Quality-gate verification: Vitest 124 pass, eslint+prettier+tsc clean, cargo fmt/clippy clean, cargo test 79 pass, both key-surface guard tests pass, real keychain smoke PASSED via --ignored. Found AC-03.4 branch gap: checkKey invalid-verdict and error paths untested; added 2 tests to useProviderKeys.test.ts (now 126 pass). | Active - suite release-gate-ready |
| 2026-07-09 | frontend-ui-dev | Applied both post-review should-fixes. FIX1 (543fa6a, scope agents): consolidated the two overlapping primitives tables in design-system.md into one `### Landed` table incl. Input. FIX2 (c5cb4a9, scope ui): useProviderSelection now catches saveProviderSettings rejections into typed `error: { kind: "persist" }` state (was an unhandled rejection silently dropping the change); SettingsView renders a persist-error alert; added Vitest case asserting the surfaced error + resolved (non-rejecting) mutation + error-clear on next success. Optional cleanups: Input spreads `{...rest}` before controlled a11y attrs, corrected stale settings.ts store comment, dropped unused i18n keys settings.checking/defaultModel (vi+en). | Active - Vitest 127 pass, eslint+prettier+tsc clean (no Rust touched) |

## Result
<Fill when moving to Done.>
