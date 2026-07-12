---
title: "ADR-006: Local LLM translation engine as a managed llama-server subprocess"
status: Accepted
date: 2026-07-12
deciders: [nguyenhx2]
tags: [adr, architecture, llm, local-inference, security]
---

<!-- ADRs ARE WRITTEN 100% IN ENGLISH (see .claude/rules/docs-workflow.md). -->

# ADR-006: Local LLM translation engine as a managed llama-server subprocess

## Context

Until now OST only translates through cloud provider keys (FR-03) or a local
OpenAI-compatible server the USER runs themselves (`providers::local_openai`,
TASK-026 part B). The owner decided (2026-07-12) that OST should DOWNLOAD and set
up a local LLM translation engine the same way it already downloads the STT
(whisper) and OCR models - so a user with capable hardware gets fully local,
key-free translation out of the box.

Three ways to run local GGUF inference were on the table:

1. **In-process** - link `llama.cpp` into the Rust core (like `whisper-rs` does
   for STT).
2. **Managed subprocess** - the app owns a `llama-server` child process and
   talks to it over its loopback OpenAI-compatible HTTP API.
3. **Download-only** - fetch the GGUF but still require the user to launch their
   own server (essentially today's `local_openai` with a bundled model).

The decisive force is **crash isolation**. The whisper-Vulkan finding
(`docs/context/known-issues.md`, 2026-07-12) is that a GPU backend which
enumerates devices at model-load time with no usable driver throws across the
FFI boundary and **aborts the entire process** - we hit that class of crash
twice with in-process whisper. In-process for the LLM too would mean any such
GPU/driver fault takes the whole app down. As a subprocess it only kills the
child, which the Rust core detects (exit code) and recovers from.

This ADR RECORDS the owner's architecture decision (they decided; this documents
it) and is authored under a deliberate, owner-approved least-privilege exception:
the llm-integration-dev agent normally owns only `providers/` + `keys/`, but this
cohesive feature spans `models/`, a new `llm/` module, and the IPC surface, and
the owner directed lean execution without routing through the orchestrator. The
exception is recorded here, in the PR body, and in the task file. The Settings
"Local LLM" tab (React UI) is explicitly OUT of this scope and is built by a
separate frontend agent against the IPC contract defined here.

## Decision

Adopt **Option B: the app manages a `llama-server` subprocess**.

- The app downloads a GGUF translation model through the EXISTING consent-gated,
  size-disclosed, integrity-checked model-download facility (`src-tauri/src/models/`)
  - the same fail-closed gate OCR and whisper use, not a second one - streamed,
  cancellable, and with a live progress bar (mirroring the STT model download).
- A new `src-tauri/src/llm/` module manages ONE `llama-server` child at a time:
  it locates the binary, spawns it with the owner's recommended flags
  (`--flash-attn`, `--cache-type-k q8_0 --cache-type-v q8_0`, `--n-gpu-layers`),
  binds it to **loopback only** (`127.0.0.1`), health-checks it to readiness,
  detects an early exit (the crash-isolation case), and kills it on app exit /
  model switch.
- Translation continues to flow ONLY through the provider layer: the existing
  loopback-only `providers::local_openai` client (redirects disabled) is pointed
  at the managed server's base URL, reusing the Hy-MT2 prompt format and
  per-model generation params already landed in `providers/local_models.rs`.
- GPU is **default-off / opt-in in posture**, mirroring the Vulkan opt-in owner
  decision (`known-issues.md`, 2026-07-12): the manager surfaces a GPU-launch
  crash cleanly and (Step 2) falls back to CPU flags; it never assumes a working
  GPU driver.

## Options considered

| Option | Pros | Cons |
|--------|------|------|
| A - in-process (link llama.cpp) | No IPC hop; one process; lowest latency | A GPU/driver enumeration fault aborts the WHOLE app (the whisper-Vulkan finding); ships a second heavy native build into the core; couples the app's lifetime to inference stability |
| **B - managed subprocess (chosen)** | Crash isolation: a child fault only kills the child, detected + recovered by the core; reuses the existing loopback-only OpenAI-compatible client verbatim; `llama-server` is a well-maintained, fast-moving upstream we track rather than vendor | Must locate/ship a `llama-server` binary per platform (distribution/signing follow-up); an extra loopback HTTP hop; a process to supervise |
| C - download-only (user runs the server) | Least code; no process supervision | Fails the owner's goal ("the owner should not have to hand-run it"); leaves setup friction that defeats the point of downloading the model for them |

## Consequences

- Positive:
  - A GPU/driver crash (the exact class that blocks default-on Vulkan for STT)
    is survivable: it kills the child, the core detects the exit code and can
    surface an error or fall back to CPU, and the app stays up.
  - Zero new provider protocol code - the managed server is just a loopback
    `local_openai` endpoint; the Hy-MT2/Qwen3 prompt + param routing already
    exists.
  - One shared, fail-closed consent + download facility now serves OCR, whisper,
    AND the local LLM; a generic streaming download engine was factored into
    `models/download.rs` for reuse.
  - The subprocess binds loopback only and the manager is unit-tested behind an
    injected spawn+health abstraction (no real server in tests).
- Negative / trade-off:
  - OST must provide a `llama-server` binary per platform. First cut: the binary
    is LOCATED (env var, `~/.ost/bin`, or PATH), so the owner drops it once and
    the app spawns it. Bundling + signing per platform is deferred (see below).
  - The preset GGUF download **sizes are large** (Hy-MT2-7B Q4_K_M ~4.6 GB,
    Qwen3-14B ~9 GB, Hy-MT2-30B-A3B ~18 GB) - flag exact per-platform binary
    sizes as a devops follow-up before bundling.
  - The preset GGUF **repo/filename/SHA-256 could not be verified offline**;
    presets ship unpinned and the download RECORDS the actual digest on first
    download (trust-on-first-use) rather than carrying a fabricated pin. See
    Follow-up.
- Follow-up work (Step 2 / other agents - do NOT block this backend):
  - devops/distribution: per-platform `llama-server` bundling + signing; measure
    and record binary sizes; a consent-gated auto-download of the official
    llama.cpp release binary as an alternative to manual placement.
  - GPU no-driver posture for the subprocess: on an early GPU-launch exit, retry
    with CPU flags (`--n-gpu-layers 0`) or surface a typed, actionable error
    (the manager already detects and reports the early exit).
  - Verify each preset's Hugging Face repo/filename and capture the real
    SHA-256 (surfaced by the first download) to hard-pin the presets in
    `llm::model`, upgrading trust-on-first-use to the fail-closed pinned path.
  - Frontend: the Settings "Local LLM" tab (a separate frontend agent, against
    the IPC contract in `docs/architecture/api-contracts/providers.md`).
  - Optionally de-duplicate `stt::download` onto the shared
    `models::download` engine (needs the audio-pipeline-dev scope).

## References

- FR-03 (`docs/specs/05-functional-requirements.md`); PRD-FR-03.
- ADR-002 (local whisper STT - the download/consent pattern reused here).
- ADR-003 (keyring) - unaffected: this engine needs no key.
- `docs/context/known-issues.md` (2026-07-12) - the whisper-Vulkan
  abort-the-process finding (crash-isolation rationale) and the Vulkan
  default-off / opt-in owner decision (GPU posture mirrored here).
- `docs/architecture/api-contracts/providers.md` - the `local_openai` client +
  the local-LLM IPC contract this ADR's implementation defines.
- `.claude/rules/security-privacy.md` (user-confirmed download, loopback-only
  egress), `.claude/rules/agent-guardrails.md` (gated outbound actions).
