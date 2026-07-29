# Decisions - OST

Append-only decision log. Each entry: date, decision, why, status. Replaces the old
per-file ADR set (docs/architecture/decisions/ADR-001..006) - all six are compressed below,
carried forward in full effect. New entries go at the bottom; never edit or delete an entry
that has shipped code against it - append a superseding entry instead and mark the old one's
status accordingly.

## 2026-07-09 - Tauri 2 + Rust core + React 19 frontend

**Decision**: Tauri 2, Rust core owns all heavy pipelines (audio, STT, capture, OCR, provider
I/O), React 19 + TypeScript + Vite frontend in the system WebView. OS-dependent pieces sit
behind Rust traits.

**Why**: top priorities are background operation, low idle resource use, and native-speed
capture/STT in-process. Electron's 150-300MB idle footprint contradicts the performance
budget; Flutter's desktop capture/audio ecosystem is immature for this niche. Tauri gives
~10-40MB idle RAM and native tray/overlay/global-hotkey support.

**Status**: Accepted, shipped (the whole codebase).

## 2026-07-09 - Local speech-to-text via whisper.cpp; translation via user-key LLM providers

**Decision**: STT runs locally via whisper.cpp (`whisper-rs`), fed by WASAPI loopback chunks
(~1-3s) gated by VAD. Only the transcribed TEXT goes to the user-chosen LLM provider. Raw
audio never leaves the machine, never persists to disk.

**Why**: predictable cost (LLM text tokens only, no per-minute audio pricing), a simple and
strong privacy story, provider-agnostic translation. Cloud realtime STT (Gemini Live/OpenAI
Realtime) would have lower latency on good networks but uploads audio and only 2 of 4
providers support it.

**Status**: Accepted, shipped. (See the 2026-07-11 entry below for the cloud-STT opt-in that
was researched but never authorized.)

## 2026-07-09 - API keys stored in the OS keychain via the `keyring` crate

**Decision**: provider keys live exclusively in the OS credential store (Windows Credential
Manager first) via one wrapper module, `src-tauri/src/keys/`. The WebView only ever receives
provider name + masked presence status. Keys never appear in the settings store, logs, error
messages, or IPC payloads.

**Why**: OS-managed encryption is the strongest available default for a desktop app with
nothing to back up or remember, versus an app-encrypted config file (weakest, rejected) or
Tauri Stronghold (extra password burden for marginal portability gain).

**Status**: Accepted, shipped.

## 2026-07-09 - OCR: local PaddleOCR PP-OCRv5 default, pluggable optional cloud backends

**Decision**: PaddleOCR PP-OCRv5 mobile (via `oar-ocr`/`ort`, ONNX Runtime) is the default and
always-present local `OcrEngine`, covering en/ja/zh/ko/vi with native per-line confidence.
Windows.Media.Ocr is retained as an R2 fallback and an explicit opt-in fast-EN/JA backend (it
has no confidence score and no Vietnamese - two gaps that disqualify it as the silent
default). Optional cloud backends (Google Cloud Vision, Azure AI Vision Read, multimodal-LLM
as a secondary/experimental path) are gated behind seven owner-authorized preconditions:
local stays the default and offline fallback; per-backend informed consent, default-off;
only a downscaled, metadata-stripped region crop ever leaves (never the full screen, never
disk); Gemini free-tier blocked or hard-warned (it trains on submitted content); a
confidence-source abstraction (`PerLine(scores)` vs `Unavailable{reason}`) with a standing
"unverified transcription" banner where confidence is unavailable; an always-visible
active-cloud-backend indicator; a `reviewer` pass per new image-egress path.

**Why**: PaddleOCR wins the highest-weight criterion (in-model Japanese, including vertical
text, on any machine with no OS language pack) and is the only local engine covering
Vietnamese, satisfying the confidence requirement (AC-02.6) that Windows.Media.Ocr cannot.
Tesseract was rejected outright - its own docs warn of poor low-DPI screen-text accuracy,
which is exactly FR-02's input class.

**Status**: Local default Accepted and shipped. Cloud backends remain authorized in
principle (the seven preconditions are owner-approved) but **not implemented** - see
`docs/backlog.md` (cloud-OCR parked: a second serial network round-trip cannot fit inside the
region p95 < 2s budget on top of the LLM translate call; local OCR already meets EN/JA at
1.000 accuracy and isn't on the critical path). Known gap: Vietnamese output is `Degraded`
(diacritics in U+1E00-U+1EFF are dropped by the latin rec model despite high per-line
confidence) - see `docs/known-issues.md`.

## 2026-07-11 - Cloud speech-to-text backends: proposed, not authorized

**Decision proposed**: a pluggable cloud STT backend registry (Google Cloud STT, Azure AI
Speech, and possibly OpenAI's realtime transcription as a third candidate) behind the
existing `SpeechToText` trait, gated behind the same seven-precondition shape as the cloud-OCR
decision above (consent, revocability, data minimization, always-visible indicator,
`reviewer` pass per backend), sequenced after local-only improvements ship.

**Why considered**: the owner asked to explore whether cloud STT could beat local whisper on
latency/accuracy for some users. Research found it **not compelling enough** to justify
streaming raw audio off-machine for the general case - local whisper (with the tier
switcher: tiny/base/small/large-v3-turbo/large-v3) already covers ja/vi/en needs on consumer
Windows hardware without any egress, and streaming raw audio is a materially higher-stakes
privacy trade than a single OCR screenshot crop.

**Status**: Proposed, never signed off. Local whisper.cpp remains the unconditional default;
no cloud-STT code, dependency, or egress path exists. The Settings STT picker should keep any
cloud entries disabled with a "pending owner approval" note if/when built. Unpark only on a
genuine user need or explicit owner sign-off.

## 2026-07-12 - Managed local LLM translation engine (`llama-server` subprocess)

**Decision**: the app downloads a GGUF translation model (Hy-MT2-7B default, Qwen3-14B,
Hy-MT2-30B-A3B, via the shared consent-gated download engine) and manages **one**
`llama-server` child process at a time, bound loopback-only (`127.0.0.1`), health-checked to
readiness, killed on app exit or model switch. Translation still flows only through the
existing loopback-only `providers::local_openai` client pointed at the managed server's base
URL - the process manager never speaks the translation protocol itself.

**Why a subprocess and not in-process `llama.cpp`**: crash isolation. The whisper-Vulkan
finding (`docs/known-issues.md`) showed a GPU backend that enumerates devices at model-load
time with no usable driver aborts the **entire process** via an FFI panic - hit twice with
in-process whisper. As a subprocess, that same class of fault only kills the child; the Rust
core detects the exit code and can recover or report cleanly. A "download-only, user runs the
server themselves" option was rejected as failing the actual goal (fully local, no
hand-configuration).

**Status**: Accepted, backend shipped (model download, process manager, IPC commands). GPU
posture is default-off/opt-in, mirroring the Vulkan decision below. Binary is located (env
var / `~/.ost/bin` / PATH), not yet bundled/signed per platform - see `docs/backlog.md`.
GGUF preset digests are trust-on-first-use (not hard-pinned) pending offline verification of
each preset's Hugging Face repo/filename.

## 2026-07-12 - Vulkan GPU acceleration for whisper: opt-in, not default

**Decision**: ship whisper.cpp CPU-only by default; a `vulkan` Cargo feature (opt-in, off by
default) links GPU acceleration for users who build it themselves.

**Why**: whisper.cpp's Vulkan backend enumerates GPU devices at model-load time
(`ggml-backend-reg` static init, before any use-GPU check runs); with no usable driver this
throws across the FFI boundary and aborts the whole process - not a recoverable error. CPU
p95 is far outside budget (base tier: 15.6s vs the 3s target) but is always safe; GPU
(measured: base p95 0.79s on an Intel Arc iGPU) is fast but unsafe as a default on unknown
hardware. Fixing this properly needs a whisper-rs-sys fork/patch (delay-load `vulkan-1.dll` +
guard the init call) - deferred, would need its own ADR-equivalent entry here if picked up.

**Status**: Accepted, shipped as opt-in (`--features vulkan`). Default distribution stays
CPU-only.
