---
title: "TASK-020: Auto-update + installer/bundler (gated release)"
status: Done
fr: "FR-05"
owner: devops
deps: "TASK-004"
priority: P1
phase: 3
created: 2026-07-10
tags: [task]
---

<!-- TASK FILES ARE WRITTEN 100% IN ENGLISH (see .claude/rules/task-tracking.md). -->

# TASK-020: Auto-update + installer/bundler (gated release)

## Goal
Set up the Tauri installer/bundler and signed auto-update via tauri-plugin-updater with CI-only signing keys; releases stay gated behind an explicit owner request.

## Inputs / context
- Related FR: [FR-05](../../specs/05-functional-requirements.md#fr-05); git-workflow.md release rule.
- Related files: `.github/workflows/`, `src-tauri/tauri.conf.json`, the bundler config.

## To do
- [ ] Tauri bundler config for the Windows installer.
- [ ] tauri-plugin-updater wired; update signing keys live ONLY in GitHub Actions secrets (never committed, never in the repo).
- [ ] A release workflow that builds/signs/publishes ONLY on an explicit owner request - never on the agent own initiative.
- [ ] Document the gated release procedure.

## Test scenarios / acceptance
- [ ] Signed update flow works; signing keys CI-only.
- [ ] Release is gated (build/sign/publish only on an explicit owner request).

## Orchestration notes
- RELEASE IS GATED. devops does not publish without an explicit owner request. Escalate for the actual release.

## Session log (AI session log)

| Date | Who | What was done | Result |
|------|-----|---------------|--------|
| 2026-07-10 | orchestrator | Task created and registered in master-plan (Phase B decomposition) | Planned |
| 2026-07-10 | devops | Configured Windows bundler + wired tauri-plugin-updater =2.10.1 + added gated release.yml + documented owner procedure | Config only - NO keys generated/committed, NO release published |
| 2026-07-10 | qa-test | Verified: Rust compiles with tauri-plugin-updater 2.10.1 (clippy -D warnings + fmt clean); tauri.conf.json valid JSON (NSIS+MSI, updater block); release.yml valid YAML, workflow_dispatch-only; ci.yml UNTOUCHED; frontend unaffected; no key committed, no publish. | Green |
| 2026-07-10 | code-reviewer | PASS. workflow_dispatch-only release, no committed key (placeholder pubkey + secret refs), ci.yml untouched, updater plugin init minimal + does NOT auto-apply (human-in-the-loop), dep pinned+logged, master-plan only TASK-020 row. | PASS |
| 2026-07-10 | security-reviewer | MANDATORY (release/signing/egress). PASS. NO private key/secret committed; release workflow gated fail-closed (dispatch-only + confirm guard, signs only from Actions secrets, draft-only, no auto-publish, no key echo); updater verifies minisign signatures against pinned pubkey over HTTPS + no auto-download/apply; ci.yml not weakened. | PASS |
| 2026-07-10 | orchestrator | Rebased onto main (fixed stale TASK-017 row - single-row diff verified). Merged PR #36 (merge commit 9f137e3); CI GREEN; secret-scan clean; release NOT triggered. Closed: Done in frontmatter + board, moved to done/. | Done |

## Result

Config + CI scaffolding for the gated installer/auto-update. NO signing key was
generated or committed and NO release was built, signed, tagged, or published -
those remain OWNER-only actions.

### What landed
- `src-tauri/tauri.conf.json`: Windows bundler config - `productName: "OST"`,
  `publisher`, `category`, `homepage`, install descriptions, icons (existing),
  `bundle.targets: "all"` (on Windows = NSIS + MSI), NSIS `installMode:
  currentUser` (per-user, no-elevation auto-update), WiX `en-US`,
  `createUpdaterArtifacts: true`. New `plugins.updater` block: GitHub-releases
  `latest.json` endpoint + a clearly-marked PLACEHOLDER `pubkey`.
- `src-tauri/Cargo.toml` + `Cargo.lock`: pinned `tauri-plugin-updater = "=2.10.1"`
  (rustls-tls, matches reqwest).
- `src-tauri/src/lib.rs`: desktop-only plugin init
  (`tauri_plugin_updater::Builder::new().build()`); no auto check/apply, so app
  runtime behavior is unchanged.
- `.github/workflows/release.yml`: GATED release pipeline.

### Release workflow gating (release.yml)
- Trigger: `workflow_dispatch` ONLY (manual). It NEVER runs on push, tag, or
  pull_request, so nothing is ever auto-published. It is separate from and does
  not modify/weaken `ci.yml` (`lint-and-test` still gates every PR).
- A `guard` job aborts unless the dispatcher types the confirmation phrase
  `release`.
- Fail-closed: the build stops if `TAURI_SIGNING_PRIVATE_KEY` is absent, so no
  unsigned "release" can be produced.
- Signing reads `TAURI_SIGNING_PRIVATE_KEY` (+ `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`)
  from GitHub Actions secrets ONLY - never from the repo.
- Output is a DRAFT GitHub release (`releaseDraft: true`) with the signed NSIS/MSI
  bundles and the updater `latest.json`; the owner reviews and publishes by hand.
- Installs the same whisper toolchain as ci.yml (CMake 4.3.4 + pinned LLVM 19.1.7
  + LIBCLANG_PATH) because the release build also compiles bundled whisper.cpp.

### OWNER must do BEFORE the first signed release (owner-only, not done here)
1. Generate the updater keypair once: `tauri signer generate -w ost-updater.key`
   (choose a password). Keep the private key OFF the repo and OFF the dev disk.
2. Add GitHub Actions secrets: `TAURI_SIGNING_PRIVATE_KEY` (the private key file
   contents) and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` (its password).
3. Replace the PLACEHOLDER `plugins.updater.pubkey` in `tauri.conf.json` with the
   matching PUBLIC key printed by `tauri signer generate`.
4. Confirm the `plugins.updater.endpoints` repo slug matches the real GitHub repo
   once the remote is created (TASK-004), and add `updater:default` to
   `src-tauri/capabilities/default.json` when a UI update-check control is added.
5. Trigger the release manually: Actions -> release -> Run workflow, input
   `release`; then review and publish the resulting draft.

### Verification
`cargo check` green (updater 2.10.1 compiles), `cargo clippy -- -D warnings`
clean, `cargo fmt --check` clean (warm target D:\t15, vcvars64 + Ninja, -j 2);
`tauri.conf.json` valid JSON; `release.yml` + `ci.yml` valid YAML. Dependency
logged in `docs/context/tool-changelog.md`.

### Not done (gated / OWNER-only)
No keypair generated, no key committed, no release built/signed/tagged/published,
release.yml never run.
