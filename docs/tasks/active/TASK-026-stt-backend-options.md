---
title: "TASK-026: STT backend options for live audio translation (research + design + cloud-STT ADR package)"
status: Active
fr: FR-01
owner: tech-researcher
deps: TASK-014
priority: P1
phase: 2
created: 2026-07-11
tags: [task]
---

# TASK-026: STT backend options for live audio translation (research + design + cloud-STT ADR package)

## Goal
Let Settings choose the STT tool/model for live translation (local or cloud). Research local vs cloud STT, produce a trade-off matrix and design; apply the LOCAL parts (whisper model-size switcher, LM Studio / local-OpenAI-compatible translation provider) immediately; draft a superseding cloud-STT ADR (Proposed) + BR-01/NFR-SEC amendments and bring them to the owner for recorded sign-off BEFORE any cloud-STT code lands.

## Inputs / context
- Related FR: [FR-01](../../specs/05-functional-requirements.md#fr-01)
- Current STT: local whisper.cpp via whisper-rs, base model, hardware probe + consent download (BR-08).
- LM Studio serves an OpenAI-compatible API on localhost; installed models are LLMs only (no ASR) - usable as a LOCAL TRANSLATION provider via the existing OpenAI client with a custom loopback base_url (config.rs already validates loopback base URLs). Quick win, zero cloud key, zero new egress.
- Governance: cloud STT sends RAW AUDIO off-machine, violating BR-01 and ADR-002's premise (audio never leaves the machine). ADR-002 is Accepted/immutable -> needs a NEW superseding ADR (Proposed) + BR-01/NFR-SEC-03 amendment drafts, gated behind the per-backend informed-consent pattern (default-off, consent naming what leaves/where/retention, revocable, visible indicator), like BR-09.
- Owner authorization (2026-07-11) to PROPOSE cloud STT; local parts apply immediately.

## To do
- [x] tech-researcher: local whisper.cpp model upgrades (small/medium/large-v3/distil/turbo) RAM/latency vs audio p95 < 3s; credible local ASR vs whisper for ja/en; cloud STT (Google, Azure, OpenAI) pricing/streaming/vi-ja-en quality - with citations.
- [x] brainstormer: trade-off matrix + recommended default.
- [x] ba-analyst: design (Settings STT backend picker + LM Studio provider entry) + cloud-STT ADR (Proposed) + BR-01/NFR-SEC amendment drafts.
- [ ] Implementation order: (1) whisper model-size switcher (local, no spec change), (2) LM Studio/custom-base-URL local provider (localhost, no spec change), (3) cloud STT blocked on owner sign-off.

## Test scenarios / acceptance
- [x] Research conclusions cited; recommended local default named.
- [x] Cloud-STT ADR package (ADR Proposed + BR/NFR amendment drafts + consent pattern) ready for one-read owner decision.
- [x] Local parts specified for immediate implementation without spec change.

## Orchestration notes
- HARD STOP: no cloud-STT code or dependency lands before recorded owner sign-off of the ADR package.
- Cloud-STT package (ADR-005 + draft BR-01/NFR-SEC-03/BR-10 amendments) awaits owner sign-off; local parts (whisper model-size switcher, Custom local OpenAI-compatible provider) are cleared for implementation without waiting on that sign-off.

## Session log (AI session log)

| Date | Who | What was done | Result |
|------|-----|---------------|--------|
| 2026-07-11 | orchestrator | Registered task; dispatched tech-researcher (sonnet) for the research phase | pending |
| 2026-07-11 | tech-researcher | Research complete: recommended local whisper lineup tiny/base/small/large-v3-turbo (medium dropped, no accuracy win over turbo at ~5GB RAM), default base; large-v3 CUDA-only; cloud STT (Google/Azure/OpenAI) surveyed - not compelling enough today to justify audio egress for the general case | done |
| 2026-07-11 | brainstormer | Trade-off matrix complete: local tiers vs RAM/latency/budget; cloud candidates vs streaming/pricing/scope; recommended owner-gated opt-in framing for cloud STT, modeled on ADR-004's cloud-OCR pattern | done |
| 2026-07-11 | ba-analyst | Drafted docs/requirements/PRD-FR-01-stt-backend-options.md (STT engine picker + separate Custom local OpenAI-compatible provider entry) and docs/architecture/decisions/ADR-005-cloud-stt-opt-in.md (Proposed, with draft BR-01/NFR-SEC-03 amendments and new BR-10) | done |
| 2026-07-11 | llm-integration-dev | Part B (in worktree ost-wt-provider, branch feat/local-openai-provider): added `ProviderId::LocalOpenAi` ("local_openai") + `local_openai.rs` client wrapping the OpenAI wire schema against a user base_url, enforced strictly via new `ProviderHttpConfig::is_loopback_only` (rejects non-loopback even over https); new `ProviderError::LocalServerUnreachable` for connection-refused; `factory::build_local_openai_provider(base_url)` (kept out of the total `build_provider`/`ProviderId::ALL` keychain path - this provider never touches the keychain); minimal command surface `commands/providers.rs` (`provider_picker_metadata`, `check_local_provider_connection`); updated `docs/architecture/api-contracts/providers.md`. TDD with wiremock (loopback listener + refused-port simulation); cargo fmt/clippy -D warnings/test all clean (one pre-existing openrouter.rs timeout flake under `-j 2` parallel test contention, unrelated to this change, passes single-threaded). Deferred to frontend-ui-dev/settings-store owner: persisting `base_url` in the settings store and rendering the picker/base_url field | done |
| 2026-07-11 | llm-integration-dev | Review-fix round on code-reviewer + security-reviewer REQUEST-CHANGES (same core issue): (1) BLOCKER redirect-following - `LocalOpenAiClient::with_config` now builds its `reqwest::Client` with `.redirect(reqwest::redirect::Policy::none())` (loopback servers have no legitimate redirect use; reqwest's default 10-redirect-to-any-host policy would have carried captured-content translate requests off-machine on a malicious/misconfigured 3xx); added regression test `redirect_to_non_loopback_host_is_not_followed` (wiremock 302 with an off-loopback `Location`, asserts `ProviderError::Api{status:302,..}` and exactly one request hit the mock). Cloud clients unchanged (out of scope per orchestrator - logged as a follow-up hardening candidate). (2) BLOCKER keyring gate bypass - `commands::keys::delete_provider_key` now rejects `ProviderId::LocalOpenAi` with `KeyCommandError::Config` BEFORE calling `KeyStore::delete_key` (factored into a new `delete_key_impl` for unit testing, mirroring `save_key_impl`/`check_key_impl`); added `delete_local_openai_is_rejected_before_touching_the_keychain` (asserts the mocked backend's `delete_secret` is never called) and a contrast test `delete_known_provider_reaches_the_keychain`. (3) added a comment on `parse_provider` explaining why `local_openai` reaching save/check is safe-by-construction (so it is not "fixed" into an inconsistent pre-filter later). Updated `docs/architecture/api-contracts/providers.md` (redirect policy + delete gate, no new error kind). Verified: `cargo fmt --check` clean, `cargo clippy --all-targets -- -D warnings` clean, `cargo test -j 2 --lib` 305 passed / 0 failed (new tests confirmed passing individually) | done |
| 2026-07-11 | audio-pipeline-dev | Part A (Rust backend, worktree ost-wt-stt, branch feat/stt-model-switcher): implemented the whisper model-size switcher end to end - catalog (stt/catalog.rs: tiny/base/small/large-v3-turbo/large-v3, RAM floors, CUDA gate for large-v3, medium excluded), pure switch state machine (stt/switch.rs), progress-reporting download variant (stt/download.rs ensure_model_available_with_progress), IPC commands list_stt_models/request_stt_model_switch/confirm_stt_model_switch (shell/audio_session.rs, reusing the BR-08 consent gate + emitting stt:model-download-progress), settings.json persistence (key sttModel) with hardware-revalidated startup fallback (lib.rs), and docs/architecture/api-contracts/ipc.md updated in the same branch. Pinned real SHA-256 digests for ggml-large-v3-turbo.bin/ggml-large-v3.bin from the Hugging Face LFS metadata (same method as the existing pins). cargo fmt/clippy -D warnings/test all clean (290 passed, 0 failed). STT picker UI (frontend) and cloud-STT (ADR-005 sign-off) remain out of scope for this part. | done |
| 2026-07-11 | audio-pipeline-dev | Review-fix round (security REQUEST-CHANGES + code should-fixes) on the same branch/worktree: (1) BLOCKER - `stt/download.rs` no longer buffers the whole artifact in memory nor uses an unbounded `reqwest::get`; it now streams each chunk straight to a `.bin.partial` temp file via a `reqwest::Client` (connect timeout 30s), hashing SHA-256 incrementally and verifying the finished digest against the pin BEFORE the atomic rename (mismatch/any error deletes the temp file, fail-closed unchanged). Bounded with an IDLE timeout (30s, applied to both the initial response wait and every chunk read - a stall is aborted without penalizing a slow-but-alive multi-GB transfer) plus a 4h overall wall-clock backstop, and an oversize guard (2x the model's PINNED approx size, never the untrusted `Content-Length`) that aborts a runaway transfer. New `DownloadError::Timeout`/`Oversize` variants. Added `tokio` `fs` feature. New unit tests against a local wiremock server exercise the streaming/digest-match path, a digest-mismatch rejection, an idle-stall timeout, an overall-timeout abort, and the oversize abort (`stt::download::tests::download_verified_*`, 5 new tests). (2) SHOULD-FIX - `shell/audio_session.rs` `apply_model_switch` is now `async` and off-loads the blocking `tauri-plugin-store` `store.save()` onto `tokio::task::spawn_blocking` (mirrors the `run_caption_loop` whisper-inference pattern, AC-05.3); `request_stt_model_switch` became an `async` command to await it (no IPC contract change - Tauri commands are invoked the same way regardless). Verify: `cargo fmt --check` clean, `cargo clippy --all-targets -- -D warnings` clean, `cargo test -j 2` - all in-scope modules green (58 stt:: + 20 audio:: + 54 shell:: = 132 passed, 0 failed); a pre-existing, out-of-scope flakiness in `providers::` (anthropic/gemini/openai wiremock tests, ~19-20 intermittent failures under parallel `--lib` runs) was confirmed present on the base commit too (reproduced after `git stash` before touching anything) and is unrelated to this diff - reported here, not fixed (providers/ is outside this agent's scope). Pushed to origin/feat/stt-model-switcher. | done |

## Result
<Fill when moving to Done; link the PR/commit.>
