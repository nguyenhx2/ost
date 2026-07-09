---
title: "ADR-002: Local speech-to-text with whisper.cpp; translation via user-key LLM providers"
status: Accepted
date: 2026-07-09
deciders: [nguyenhx2]
tags: [adr, architecture, audio]
---

# ADR-002: Local speech-to-text with whisper.cpp; translation via user-key LLM providers

## Context

FR-01 translates live system audio. The split of work between local compute and cloud APIs
drives latency, per-minute cost, and privacy. Users bring their own LLM keys (FR-03), so
every cloud byte costs the user money.

## Decision

Speech-to-text runs locally via whisper.cpp (`whisper-rs`), fed by WASAPI loopback chunks
(~1-3s) gated by voice-activity detection. Only the transcribed TEXT is sent to the
user-chosen LLM provider for translation. Raw audio never leaves the machine and is never
persisted to disk.

## Options considered

| Option | Pros | Cons |
|--------|------|------|
| A (chosen) Local whisper + LLM translate | No per-minute audio cost, stable offline STT latency, audio stays on-machine (privacy), works with every text-capable provider | Model download (~100MB-1GB), CPU/GPU load during sessions, STT quality bounded by chosen model size |
| B Cloud realtime (Gemini Live / OpenAI Realtime) | Lowest latency on good networks, best STT quality, no local model | Per-minute audio pricing, audio uploaded to cloud, only 2 of 4 providers support it, network-dependent |
| C Hybrid, user-selectable | Maximum flexibility | Two pipelines to build/test for MVP; doubles surface area |

## Consequences

- Positive: predictable cost (LLM text tokens only); privacy story is simple and strong;
  provider-agnostic translation.
- Negative / trade-off: end-to-end latency ~1.5-3s (budget p95 < 3s); model management UX
  needed (download, size selection, GPU detection).
- Follow-up work: cloud-realtime path may be added later as a NEW ADR if users demand
  sub-second latency; keep the `SpeechToText` trait ready for it.

## References

- Project intake, 2026-07-09 (STT pipeline question).
- .claude/rules/security-privacy.md
