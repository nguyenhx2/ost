---
title: "ADR-004: OCR engine - PaddleOCR PP-OCRv5 on ONNX Runtime via oar-ocr"
status: Proposed
date: 2026-07-09
deciders: []
tags: [adr, architecture, screen]
---

# ADR-004: OCR engine - PaddleOCR PP-OCRv5 on ONNX Runtime via oar-ocr

## Context

FR-02 (region translate with live preview) needs a local OCR engine. Forces and
constraints:

- Vietnamese is first-class (BR-07): translation target is vi, sources are often
  ja/en/zh/ko, and vi-source content must also work.
- NFR-PERF-02: region translate end-to-end p95 < 2s after selection; the OCR stage's
  working budget is <= 700ms p95.
- NFR-PERF-03: idle < 100MB RAM / < 1% CPU.
- NFR-SEC-03 / BR-01: screenshots never persist and never leave the machine - cloud OCR
  is constitutionally excluded.
- CT-07 / NFR-SCA-01: Windows-first, but the backend must be swappable behind the
  `OcrEngine` trait for the macOS/Linux ports in Phase 4.
- A first-run model download is acceptable: the whisper STT model already follows this
  pattern (AC-01.8 / NFR-REL-04).

This ADR resolves open item OI-01 (docs/specs/11-assumptions-constraints.md).

## Decision

Adopt PaddleOCR PP-OCRv5 mobile models running on ONNX Runtime via the `oar-ocr` crate
(pure Rust, Apache-2.0) as the single `OcrEngine` trait implementation for the MVP -
CONDITIONAL on a mandatory latency criterion spike passing as the FIRST gate of TASK-007,
before any pipeline integration.

Pinned versions: `oar-ocr` 0.8.0 (released 2026-07-08), `ort` 2.0.0-rc.12 (2026-03-05).

## Rationale (evidence-cited)

1. It is the only local candidate that can OCR Vietnamese at all:
   `latin_PP-OCRv5_mobile_rec` explicitly lists Vietnamese (PP-OCRv5 multilingual doc,
   PaddleOCR repo, retrieved 2026-07-09). Windows.Media.Ocr has NO Vietnamese in any of
   its 25 published languages across the API's 10-year history (Microsoft Learn
   winrt-26100; Windows Developer Blog 2016-02-08).
2. It covers ja/en/zh (main model) + ko (korean rec model) + vi (latin rec model) with ONE
   engine and one confidence semantics, so AC-02.6 / OI-07 confidence calibration stays
   singular. Models are modest: mobile det 4.6MB + rec 15.8MB ONNX; ~21-40MB total
   download, routed by the user-selected source language (monkt/paddleocr-onnx on Hugging
   Face, retrieved 2026-07-09).
3. Healthy pure-Rust path: `oar-ocr` v0.8.0 (2026-07-08, 255k downloads, Apache-2.0,
   supports PP-OCRv5/v6) on `ort` 2.0.0-rc.12 (12.8M downloads). Contrast: Tesseract Rust
   bindings are stale (`leptess` 0.14.0, 2023-02) or shell out per call
   (`rusty-tesseract` requires a separately installed tesseract.exe).
4. It is the only candidate whose same implementation ports to macOS/Linux in Phase 4
   (ONNX Runtime is cross-platform), satisfying CT-07 without a backend rewrite.
5. Packaging mirrors the already-specced whisper first-run flow: user confirmation, HTTPS,
   progress, integrity check, resume (NFR-REL-04).

## Options considered

| Option | Pros | Cons |
|--------|------|------|
| A (chosen) PaddleOCR PP-OCRv5 mobile via oar-ocr/ort | Only local engine with Vietnamese; one engine covers vi+ja/en/zh/ko with single confidence semantics; pure-Rust, actively maintained; same impl ports to macOS/Linux (Phase 4); models 21-40MB, whisper-style first-run download | Per-region CPU latency unproven for our input class (spike-gated); bundle grows by onnxruntime lib + models; `ort` is a release candidate; idle budget needs a lazy session lifecycle |
| B Windows.Media.Ocr (`windows` crate) | Zero-install, OS-native, fast on installed language packs | No Vietnamese ever (25 languages, none vi); ja/zh/ko packs typically absent by default and not silently installable; Windows-only contradicts CT-07 |
| C Tesseract | Cross-platform, long-established, permissive license | Own docs warn poor output on low-DPI screen text - exactly FR-02's input; documented vi-diacritic confusion; weak CJK; Rust binding pain on Windows |
| D Cloud OCR (Google Vision / Azure) | Best accuracy, zero local footprint | Image bytes leave the machine - violates NFR-SEC-03 / BR-01 outright |
| E Hybrid WMO + Paddle | Fast path where OS packs exist | Fast path rarely fires on default machines, never covers vi; doubled calibration + test matrix; machine-dependent routing |

### Rejection detail

- **B - Windows.Media.Ocr**: REJECTED as sole engine. No Vietnamese in any of its 25
  published languages (Microsoft Learn winrt-26100; corroborated by its absence in
  third-party Vietnamese-market translator docs). ja/zh/ko packs are typically absent by
  default (local verification 2026-07-09 on Win11: only en-US + ja present) and the app
  cannot install packs silently - it is a user Settings action, and DISM needs elevation
  (Language FOD docs, updated 2023-06-29). Windows-only contradicts CT-07. Variants also
  rejected: Windows AI TextRecognizer (Copilot+ NPU-only, undocumented languages -
  Microsoft Learn Text Recognition); OneOCR extraction (reverse-engineered Snipping Tool
  dll/model, unlicensed redistribution - legal risk). RETAINED as the designated fast-path
  fallback behind the `OcrEngine` trait if the latency spike fails (see R2).
- **C - Tesseract**: REJECTED. Its own documentation warns of poor output on low-DPI
  screen text (x-height >= 20px, ~300 DPI rescale - Tesseract ImproveQuality docs), and
  FR-02's input IS low-DPI UI screenshots. Documented Vietnamese diacritic confusion
  (tesseract-ocr/langdata issue #66). Weak CJK (~70% on Korean screenshots,
  moderate-credibility 2026 benchmark). Windows Rust binding pain: `leptess` stale/vcpkg;
  `rusty-tesseract` shell-out latency is unacceptable in live-preview mode (AC-02.4).
- **D - Cloud OCR**: REJECTED on constraint. Image bytes leave the machine (Google Cloud
  Vision Data Usage FAQ), violating NFR-SEC-03 / BR-01; no further evaluation warranted.
- **E - Hybrid WMO + Paddle**: DEFERRED, not adopted for MVP. The fast path would rarely
  fire on default machines (packs absent) and never covers vi, while costing doubled
  confidence calibration, a doubled benchmark/test matrix, and machine-dependent routing.
  The `OcrEngine` trait keeps it retrofittable.

## Consequences

- Positive: one engine and one confidence model for all five languages; privacy story
  identical to STT (nothing leaves the machine at the OCR stage); Phase 4 ports swap
  nothing; first-run UX reuses the specced whisper download flow.
- Negative / trade-off:
  - Bundle grows by tens of MB (onnxruntime library, exact size not yet pinned) plus a
    21-40MB model download.
  - Per-region CPU latency is UNPROVEN for our input class - published figures are
    full-document only (1.75s/image, Paddle docs, hardware unstated; 2143ms/page in a
    third-party Python test vs Tesseract 453ms - ttsforfree.com 2026, low-authority
    source, indicative only). Hence the mandatory spike gate.
  - `ort` is a release candidate: pin exact versions and log every upgrade in
    docs/context/tool-changelog.md.
  - The idle budget (NFR-PERF-03) requires a lazy ORT session lifecycle: create on
    session start, drop after session end (NFR-REL-02 60s window) - this is designed in,
    not assumed.
- Follow-up work: TASK-007 runs the criterion spike as its first gating item before any
  pipeline integration; wire the latency benchmark into CI so regressions block merge.

## Residual risks and validation plan

| ID | Risk | Validation / mitigation |
|----|------|-------------------------|
| R1 | OCR-stage latency exceeds the <= 700ms p95 budget | Mandatory criterion spike as TASK-007's FIRST gating item: PP-OCRv5 mobile det+rec via oar-ocr on representative synthetic region crops (~400x100 up to ~1200x800; en/vi/ja/ko/zh fixtures), consumer CPU. Pass gate: OCR-stage p95 <= 700ms on typical regions. Wire into CI so regressions block merge. |
| R2 | Spike fails | Escalation ladder: (1) PP-OCRv6 tiny (1.5M params); (2) cap/downscale det input, skip det for small single-line crops; (3) add Windows.Media.Ocr fast path as a second backend behind the trait for en/ja where packs exist; (4) supersede ADR-004 with spike data - never edit an Accepted ADR. |
| R3 | Idle RAM budget blown by resident ORT session | Spike measures resident RAM while active and 60s post-session with the session dropped; lazy model load, never at app start. |
| R4 | Confidence output unusable for AC-02.6 | Spike confirms per-line rec confidence is usable; feed observed distributions into OI-07 calibration. |
| R5 | vi-diacritic / low-DPI accuracy unbenchmarked | Spike includes an accuracy pass on synthetic low-DPI UI screenshots (vi fully accented, ja/ko/zh UI strings) with a minimum character-accuracy bar before integration. |
| R6 | PP-OCRv5 model file license unpinned | Verification item required before this ADR moves to Accepted. |
| R7 | `ort` rc churn | Pin exact versions; upgrades are deliberate commits logged in docs/context/tool-changelog.md; the new native dependency gets a security-reviewer pass (security-privacy.md). |
| R8 | Model download UX friction | Reuse the whisper first-run flow (NFR-REL-04); download only the rec models for the user-selected source languages. |

## Revisit triggers

- The R2 escalation ladder is exhausted.
- oar-ocr or ort maintenance stalls for ~12 months.
- Windows AI TextRecognizer ships documented language support including Vietnamese on
  mainstream non-NPU hardware.
- An adverse change in Paddle model licensing.

## References

- docs/specs/05-functional-requirements.md (FR-02), docs/specs/11-assumptions-constraints.md (OI-01, CT-07)
- docs/tasks/active/TASK-005-decide-ocr-engine.md (tech-researcher evidence + brainstormer trade-off, 2026-07-09)
- PP-OCRv5 multilingual doc, PaddleOCR repo (retrieved 2026-07-09)
- monkt/paddleocr-onnx, Hugging Face (retrieved 2026-07-09)
- Microsoft Learn, Windows.Media.Ocr language support (winrt-26100); Windows Developer Blog 2016-02-08
- Microsoft Learn, Windows AI Text Recognition; Language FOD docs (updated 2023-06-29)
- Tesseract ImproveQuality docs; tesseract-ocr/langdata issue #66
- Google Cloud Vision Data Usage FAQ
- ADR-002 (first-run model download pattern), .claude/rules/security-privacy.md, .claude/rules/tech-stack.md
