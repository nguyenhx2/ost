---
title: "TASK-022: Wire e2e acceptance gate (WebdriverIO + tauri-driver)"
status: Active
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

## Result
<Fill when moving to Done; link the PR/commit. Then move the file to docs/tasks/done/.>
