---
title: "TASK-022: Wire e2e acceptance gate (WebdriverIO + tauri-driver)"
status: Done
fr: "FR-01, FR-02, FR-04"
owner: qa-test
deps: "TASK-021"
priority: P0
phase: 1
created: 2026-07-11
tags: [task]
---

<!-- TASK FILES ARE WRITTEN 100% IN ENGLISH (see .claude/rules/task-tracking.md). -->

# TASK-022: Wire e2e acceptance gate (WebdriverIO + tauri-driver)

## Goal
Bootstrap the e2e layer (testing.md) so the critical flows are driven by a real WebDriver session - above all region-select must drive the REAL capture/OCR path and assert it never hangs (the owner acceptance bar). Be honest about what runs in CI vs dev-host vs manual.

## Inputs / context
- Related FR: FR-01/02/04; testing.md e2e layer; human-in-the-loop.md (no silent hang).
- VERIFIED by orchestrator: there is NO production debug-mock to narrow. RegionPipeline::new_default wires the REAL WindowsScreenCapturer + PaddleOcrEngine in BOTH debug and release; the only region.rs "mocks" are #[cfg(test)] fixtures; TASK-021 already corrected the stale line-3 comment. So do NOT narrow/add a mock - the real pipeline already runs; the e2e just has to drive it.
- Env constraint (known-issues, 2026-07-11): debug / `tauri dev` load the WebView from http://localhost:1420 which is BLOCKED here; the RELEASE binary loads embedded assets via tauri://. So target the e2e at the RELEASE binary, not a debug/dev build.
- tauri-driver on Windows has limits (msedgedriver / WebView2); real screen capture needs a real display.

## To do
- [ ] Bootstrap: install WebdriverIO + @wdio/cli + tauri-driver (`cargo install tauri-driver`); a wdio config pointing `application` at the RELEASE binary (ost.exe, embedded assets); an e2e/ dir; package.json e2e script.
- [ ] Specs for the critical flows (testing.md): settings/key-entry (masked status, no key on the surface), region-select -> preview (drives the REAL capturer; asserts the flow reaches consent-dialog / region:ocr-result / region:ocr-error, NEVER a hang), overlay lifecycle (open/pin/copy/dismiss keyboard-operable).
- [ ] Run what is runnable on THIS host (has a display) against the release binary; paste the REAL result.
- [ ] Document the honest split in testing.md + known-issues: which specs run in CI (driveable, no real capture), which need a dev-host + display, which stay manual. Do NOT claim CI-green proves the capture works if CI cannot run the capture.

## Test scenarios / acceptance
- [ ] The region-select e2e drives the REAL WindowsScreenCapturer (not a canned mock) and asserts consent/ocr-result/ocr-error, never a hang (owner acceptance bar) - on the dev host if CI cannot.
- [ ] Settings + overlay-lifecycle specs run against the release binary.
- [ ] The CI-vs-dev-host-vs-manual split is documented honestly.

## Orchestration notes
- 2026-07-11: registered as the owner's pre-handoff e2e acceptance gate. PREMISE CORRECTION: the coordinator's "narrow the debug-mock" step is moot - no production mock exists (verified); wire e2e against the real path directly. If driving the real path needs a design change (e.g. tauri-driver cannot drive the release binary at all on this env), ESCALATE to the orchestrator/owner rather than faking it with a mock.

## Session log (AI session log)

| Date | Who | What was done | Result |
|------|-----|---------------|--------|
| 2026-07-11 | orchestrator | Registered the e2e acceptance gate; verified there is NO production debug-mock (real pipeline runs in debug too); target the release binary (localhost blocked). Dispatching qa-test | Active |
| 2026-07-11 | qa-test | Bootstrapped e2e: installed tauri-driver 2.0.6 + wdio 9.20.0 stack (pinned); pinned msedgedriver 150.0.4078.48 (matches WebView2) under e2e/.driver (gitignored); wdio.conf.ts targets the RELEASE ost.exe. Built release via `npm run tauri build -- --no-bundle` (plain `cargo build` did NOT embed dist -> "asset not found"; tauri CLI build fixed it). Added the `e2e` feature + WebDriver-only `e2e_region_probe` command (reuses the REAL RegionPipeline capturer+engine, absent from production) so the single-WebView session can observe the region outcome (events go to the unobservable preview window). | In progress |
| 2026-07-11 | qa-test | RAN all 4 specs against the release binary (display host, OCR models present): ALL GREEN. region-select drove the REAL WindowsScreenCapturer + PaddleOcrEngine: consent-required 17ms (fail-closed) then post-consent ocr-result:len=85 360ms - real capture + OCR, NO HANG (owner acceptance bar met). smoke/settings/overlay green (real IPC/keychain, masked key status, keyboard-operable overlay). Documented honest CI/dev-host/manual split in testing.md + known-issues.md; logged tools in tool-changelog.md. Frontend unaffected: `npm run test` 228 passed, lint + tsc clean; `cargo clippy --features e2e -- -D warnings` clean. Opening PR. | Done pending review |
| 2026-07-11 | qa-test | Bootstrapped WebdriverIO 9.20 + tauri-driver 2.0.6 + pinned msedgedriver; wdio targets the RELEASE binary (tauri://). 4 specs GREEN: smoke, settings-keys (masked, no key on surface), overlay-lifecycle, region-select. region-select drives the REAL WindowsScreenCapturer+PaddleOcrEngine via a #[cfg(feature=e2e)] probe: consent-required 17ms (no pixels) then ocr-result len=85 in 360ms - NO HANG. Frontend 228 passed; clippy --features e2e clean. | Green |
| 2026-07-11 | code-reviewer | PASS. e2e_region_probe absent from production (e2e feature off by default; command + lib.rs registration both cfg-gated; reuses real primitives, no prod behavior change). Region e2e drives the REAL path (hang -> Mocha timeout -> RED), not a mock. testing.md content sound (additive, weakens no rule) but needs owner sign-off by LOCATION. | PASS |
| 2026-07-11 | security-reviewer | PASS. Probe compiled out of production (zero prod attack surface). No secret/driver-binary/model committed (the AIza-shaped string is a negative assertion). Captured content stays in RAM - probe returns only a char count, no text/pixels. testing.md weakens no security rule. | PASS |
| 2026-07-11 | orchestrator | Stripped the .claude/rules/testing.md addition (held for OWNER sign-off; content preserved in e2e/README.md + known-issues.md). Merged PR #40 (merge commit 65a80da); CI GREEN; secret-scan clean; no .claude/ path. Closed: Done in frontmatter + board, moved to done/. | Done |

## Result
The e2e acceptance gate is wired and on `main` (PR #40, merge commit 65a80da): WebdriverIO
9.20 + tauri-driver 2.0.6 driving the RELEASE binary (tauri:// embedded assets - debug/tauri
dev load from the blocked localhost). Four specs pass: smoke, settings-keys, overlay-lifecycle,
and region-select. tauri-driver CAN drive the release binary here (not a blocker).

THE ACCEPTANCE BAR (region-select does not hang) IS PROVEN, not asserted: the region-select
spec drives the REAL WindowsScreenCapturer + PaddleOcrEngine (the production RegionPipeline
Arcs) via a `#[cfg(feature = "e2e")]` `e2e_region_probe` command - absent from production builds
(the `e2e` Cargo feature is off by default) and changing no production capture/OCR behavior. It
observed consent-required in 17ms (fail-closed gate, zero pixels grabbed) then, after
grant_model_consent, a real ocr-result (len=85) in 360ms - real capture + OCR end to end, NO
hang. A hung capturer would never resolve -> Mocha timeout -> RED (the TASK-021 regression guard).

PREMISE CORRECTION (reported to owner): there was NO production debug-mock to narrow. Verified
crate-wide - RegionPipeline::new_default wires the real capturer/engine in debug AND release;
region.rs "mocks" are #[cfg(test)] only; the only prod debug_assertions is main.rs hiding the
console in release. The bug hid because the real capture was never runtime-exercised (unit tests
mock the capturer; tauri dev/debug loads the blocked localhost), not because of a debug-mock.

HONEST CI-vs-dev-host-vs-manual split (documented in e2e/README.md + known-issues.md):
- Display host (CI candidate once WebView2 provisioned): smoke, settings-keys, overlay-lifecycle
  - NO real capture; a green run here does NOT prove capture works.
- Dev host + display + OCR models (~/.oar): the region-select real-capture leg. NOT headless-CI.
- Manual: overlay copy-with-content (needs a live audio session).

Gates: qa (4 specs green + 228 frontend), code-reviewer PASS, security-reviewer PASS; secret-scan
clean; CI green.

OWNER SIGN-OFF PENDING (not blocking): the .claude/rules/testing.md "E2E acceptance gate" section
(35-line additive diff) was held out of this PR because rule files need owner sign-off. The same
split is documented in e2e/README.md + known-issues.md. Apply the testing.md addition on owner
approval. Non-blocking nits: dev-deps use caret ranges (repo convention) vs "pinned" wording;
region-select spec mutates real OS consent state (dev-host only, not CI without an isolated profile).
