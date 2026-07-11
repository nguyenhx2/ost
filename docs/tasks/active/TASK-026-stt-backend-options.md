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

## Result
<Fill when moving to Done; link the PR/commit.>
