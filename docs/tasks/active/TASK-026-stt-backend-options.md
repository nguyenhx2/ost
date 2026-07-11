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
- [ ] tech-researcher: local whisper.cpp model upgrades (small/medium/large-v3/distil/turbo) RAM/latency vs audio p95 < 3s; credible local ASR vs whisper for ja/en; cloud STT (Google, Azure, OpenAI) pricing/streaming/vi-ja-en quality - with citations.
- [ ] brainstormer: trade-off matrix + recommended default.
- [ ] ba-analyst: design (Settings STT backend picker + LM Studio provider entry) + cloud-STT ADR (Proposed) + BR-01/NFR-SEC amendment drafts.
- [ ] Implementation order: (1) whisper model-size switcher (local, no spec change), (2) LM Studio/custom-base-URL local provider (localhost, no spec change), (3) cloud STT blocked on owner sign-off.

## Test scenarios / acceptance
- [ ] Research conclusions cited; recommended local default named.
- [ ] Cloud-STT ADR package (ADR Proposed + BR/NFR amendment drafts + consent pattern) ready for one-read owner decision.
- [ ] Local parts specified for immediate implementation without spec change.

## Orchestration notes
- HARD STOP: no cloud-STT code or dependency lands before recorded owner sign-off of the ADR package.

## Session log (AI session log)

| Date | Who | What was done | Result |
|------|-----|---------------|--------|
| 2026-07-11 | orchestrator | Registered task; dispatched tech-researcher (sonnet) for the research phase | pending |

## Result
<Fill when moving to Done; link the PR/commit.>
