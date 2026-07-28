---
paths:
  - "src-tauri/src/**"
  - "src/**"
  - "docs/architecture/domain-model.md"
  - "docs/architecture/api-contracts/**"
---

# Rule: Domain model (bounded contexts)

OST's agent harness and its module boundaries are organized around Domain-Driven Design: the
context map below is not documentation of a design that happened elsewhere, it IS the design.
Full detail (aggregate boundaries, invariants) lives in `docs/architecture/domain-model.md`, owned
by `domain-modeler`; this rule states the enforceable part.

## Context map

| Kind | Context | Owns (real paths) | Ubiquitous language | Owning agent |
|---|---|---|---|---|
| Core | Recognition | `src-tauri/src/ocr/`, `src-tauri/src/stt/` | Recognition, Segment, Confidence, Fidelity (Full/Degraded) | `recognition-dev` |
| Core | Translation | `src-tauri/src/providers/`, `src-tauri/src/llm/` | TranslationProposal, Provider, Model, Prompt, GenerationParams | `translation-dev` |
| Supporting | Capture | `src-tauri/src/capture/`, `src-tauri/src/audio/` | Region, Monitor, AudioFrame, VAD, Chunk, CaptureSession | `capture-dev` |
| Supporting | Presentation | `src/` | Overlay, Caption, Preview, Proposal | `presentation-dev` |
| Generic | Model Lifecycle | `src-tauri/src/models/` | ModelArtifact, Consent, Disclosure, Digest | `platform-dev` |
| Generic | Platform Shell | `src-tauri/src/shell/`, `src-tauri/src/commands/`, `src-tauri/src/keys/`, `src-tauri/src/core/` (shared kernel), `src-tauri/src/lib.rs`, `src-tauri/src/main.rs` | Window, Tray, Hotkey, IPC contract, ProviderKey | `platform-dev` |

Core contexts carry the product's differentiating logic (turning pixels/audio into text, turning
text into a translation). Supporting contexts are necessary but not differentiating. Generic
contexts solve a problem any desktop app has; they get infrastructure-grade design, not product
design.

## The one rule that makes this DDD, not naming

**Contexts communicate ONLY through their published contracts, never by reaching into another
context's internals.** The anti-corruption layers already exist in code as traits -
`TranslationProvider`, `OcrEngine`, `SpeechToText`, `ScreenCapturer`, `AudioSource` - plus the
Tauri IPC contract in `docs/architecture/api-contracts/`. A change that imports a function, a
struct field, or a module path from another context's directory instead of going through its
trait or the IPC layer is a boundary violation, whether or not it compiles and passes tests.
`code-reviewer` and `security-reviewer` check every diff against the table above.

`src-tauri/src/core/` is a deliberate, narrow exception: a **shared kernel** between Recognition
and Capture (the one-heavy-session-at-a-time discipline, `HeavySessionCoordinator`) plus a
platform-wide resource probe. It is owned by `platform-dev`; Recognition and Capture register
`Unloader` closures into it rather than editing it. Do not add a second shared kernel without a
`domain-modeler` sign-off recorded in `docs/architecture/domain-model.md` - that is exactly the
kind of accretion that turns a narrow exception into a god-module.

## Consulting `domain-modeler`

Dispatch `domain-modeler` BEFORE writing code, whenever a task:

- touches modules owned by two different contexts in the table above,
- needs a trait to grow a new method, or the IPC contract to grow a new command/field,
- introduces a concept that does not already have a row in a context's ubiquitous language.

A dev agent that hits one of these mid-task stops and reports it to the orchestrator rather than
guessing the contract and hoping the other side matches.
