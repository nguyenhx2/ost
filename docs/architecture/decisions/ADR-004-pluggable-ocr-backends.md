---
title: "ADR-004: OCR engine - local PaddleOCR default with pluggable optional cloud backends behind informed consent"
status: Accepted
date: 2026-07-09
deciders: [nguyenhx2]
tags: [adr, architecture, screen, privacy]
---

# ADR-004: OCR engine - local PaddleOCR default with pluggable optional cloud backends behind informed consent

> Status is Proposed and stays Proposed. This ADR carries an OPTIONAL requirement change
> (opt-in cloud OCR = the screenshot crop leaves the machine) that ONLY THE OWNER can
> authorize. The LOCAL default needs NO requirement change and can proceed on the R1 spike
> alone. The document below is an OWNER-DECISION PACKAGE, not an accepted decision. Do not
> set status Accepted until the owner signs off; the protect-adr hook makes Accepted ADRs
> immutable and only the owner accepts.

## Context

FR-02 (region translate with live preview) needs an OCR engine. The engine sits behind the
`OcrEngine` trait (NFR-SCA-01). Forces and constraints:

- **OCR sources are ENGLISH and JAPANESE at highest volume** (game subtitles, app chrome,
  low-DPI UI text); Korean and Chinese are secondary. EN + JA therefore carry the MOST WEIGHT
  for OCR recognition QUALITY on low-DPI screen text, including Japanese vertical text (縦書き)
  common in games. Vietnamese is also the default translation target (BR-07: source
  auto-detected, target defaults to vi), and Vietnamese text does appear as a source too
  (mixed-language UIs, vi subtitles), so it must remain recognizable - it is NOT dropped.
- **Language coverage breadth is an evaluation criterion in its own right, with Vietnamese
  REQUIRED.** Broader script coverage (en + ja + zh + ko + vi and beyond) is a genuine
  DESIRABLE property, not dead weight to trim: an engine that covers more of the user's real
  input scores HIGHER on this axis. Vietnamese support is a hard requirement; an engine that
  cannot recognize Vietnamese at all carries a real coverage deficiency on this criterion.
- NFR-PERF-02: region translate end-to-end p95 < 2s after selection; the OCR stage's
  working budget is <= 700ms p95 for the local path.
- NFR-PERF-03: idle < 100MB RAM / < 1% CPU.
- Confidence flag (AC-02.6 / BR-05, OI-07): OCR regions with poor recognition must carry a
  visible confidence flag; low-confidence output must never be a silent best-guess.
- Image privacy (AC-02.5 / BR-01 / NFR-SEC-03): screenshots stay in session RAM, are never
  written to disk, and by default never leave the machine.
- CT-07 / NFR-SCA-01: Windows-first, but the backend must be swappable behind the
  `OcrEngine` trait for the macOS/Linux ports in Phase 4.
- A first-run model download is acceptable: the whisper STT model already follows this
  pattern (AC-01.8 / NFR-REL-04).

### What changed since the prior draft

The prior ADR-004 draft treated Vietnamese as the single dominant OCR SOURCE and chose
PaddleOCR mainly on that basis. An owner clarification (2026-07-09) rebalances the framing:
OCR source content is EN + JA at HIGHEST volume, so EN + JA carry the most weight for
recognition QUALITY. A follow-up owner correction (2026-07-09) is explicit that Vietnamese
is NOT dropped: PP-OCRv5 keeps FULL language coverage including vi, and broad coverage
(en/ja/zh/ko/vi) is itself a desirable property scored as a distinct criterion, not weight
to trim. The "only local engine that can OCR Vietnamese" point is therefore RETAINED as a
first-class plus (see coverage criterion), no longer the sole basis for the choice. The
owner wants a local default retained, is NOT mandating cloud, and asked that
Windows.Media.Ocr be evaluated fairly against the local option.

The decision below has been RE-DERIVED under the EN + JA framing (not carried forward). It
resolves open item OI-01 (docs/specs/11-assumptions-constraints.md) for the local default
and scopes the optional-cloud follow-on. Net: PaddleOCR PP-OCRv5 is the SINGLE local default
because it wins the highest-weight quality axis (in-model JA including vertical text), AND
because it is the only local engine covering Vietnamese and offers the broadest coverage
(en/ja/zh/ko/vi), AND because it provides native per-line confidence (AC-02.6) plus an ONNX
Runtime path that ports to macOS/Linux in Phase 4.

**Every cloud / multimodal-LLM OCR path sends the SCREENSHOT CROP off-machine.** As written
today, that would violate NFR-SEC-03 (docs/specs/07-non-functional-requirements.md), BR-01
(docs/context/business-rules.md), the FR-02 acceptance criterion AC-02.5
(docs/specs/05-functional-requirements.md), and CLAUDE.md invariant 3. Adopting any cloud
backend is therefore a REQUIREMENT CHANGE that only the owner can authorize. This ADR
proposes the amendment text (see "Proposed requirement amendments") but does not apply it.
The LOCAL default needs no such amendment.

## Decision

1. **Local default (unconditional).** Adopt PaddleOCR PP-OCRv5 mobile models on ONNX
   Runtime via the `oar-ocr` crate (pure Rust, Apache-2.0) as the DEFAULT and always-present
   `OcrEngine` implementation. Japanese (and Chinese) is first-class alongside English in the
   single PP-OCRv5 main recognition model (no separate ja model needed); the bundle also
   ships the Korean and Vietnamese/latin recognition models for FULL coverage
   (en/ja/zh/ko/vi - Vietnamese KEPT). The first-run download is the fuller model set (~40MB
   range: det 4.6MB + main rec 15.8MB + ko + vi/latin rec), which is explicitly ACCEPTABLE
   and reuses the whisper first-run pattern (AC-01.8 / NFR-REL-04). The app ships fully
   functional with ZERO cloud configuration;
   the local engine is the offline fallback (NFR-REL-03). This is CONDITIONAL on the
   mandatory local latency criterion spike (R1) passing as the FIRST gate of TASK-007,
   before any pipeline integration. Pinned versions: `oar-ocr` 0.8.0 (released 2026-07-08),
   `ort` 2.0.0-rc.12 (2026-03-05).

2. **Windows.Media.Ocr retained as R2 fallback + opt-in fast-EN backend.** Legacy
   `Windows.Media.Ocr.OcrEngine` (reachable from the `windows` crate) supports en + ja with
   zero model download, zero new Rust dependency, and fully on-device (NFR-SEC-03 / BR-01
   clean, no amendment). It is fast (reputed real-time) and trivial to set up, so it is a
   genuinely strong candidate. It is NOT the sole default because `OcrWord` exposes only
   `Text` + `BoundingRect` and NO confidence score, which cannot satisfy AC-02.6 without a
   synthesized proxy (a silent best-guess that BR-05 forbids). It is registered behind the
   `OcrEngine` trait as (a) the R2 escalation target if the local spike fails, and (b) an
   explicit opt-in fast-EN backend for users who accept the confidence limitation via a
   standing "confidence unavailable" banner.

3. **Pluggable optional cloud backends (owner-gated).** The `OcrEngine` trait gains a
   backend registry so the user can select and switch OCR backends in Settings. Each cloud
   backend is default-OFF and hidden behind a per-backend informed-consent gate. Subject to
   owner sign-off (see "Owner decision required"), offer:
   - **Google Cloud Vision** (best cloud privacy posture, per-word confidence, strong CJK) -
     user supplies the key.
   - **Azure AI Vision Read** (now eligible: en + ja print + handwriting supported, no
     training, deletes after processing, per-word confidence, free 5k/mo then ~$1.50/1k) -
     user supplies the key.
   - **Multimodal-LLM (reuse the FR-03 provider layer)** only as a SECONDARY / EXPERIMENTAL
     backend, with a standing "unverified transcription" low-confidence banner and a
     BLOCKING restriction on Gemini free tier (which trains on submitted content).

4. **Consent gate (mandatory for every cloud backend).** The FIRST actual cloud OCR call on
   a backend triggers a consent dialog that names, in plain language: (a) exactly what
   leaves the machine - a crop of the selected region only, never the full screen; (b) where
   it goes - the named provider / endpoint; (c) the provider's retention / training posture.
   Consent is per-backend, default-OFF, revocable in Settings, and while any cloud backend
   is active an always-visible indicator names the active cloud backend on the output
   surface.

5. **Data minimization on every cloud path.** Send ONLY the selected region crop (never the
   full screen), downscaled (multimodal-LLM path: long-edge cap ~1568px), with metadata
   stripped, held in memory only, never written to disk.

6. **Gemini free-tier block.** Where a Gemini key's tier is detectable as free, block the
   cloud OCR call (or hard-warn and require affirmative acknowledgement of the training
   risk in the consent copy) because Google trains on free-tier submissions; paid / ZDR
   tiers and Anthropic / OpenAI API do not train by default.

7. **Confidence-source abstraction.** The `OcrEngine` trait exposes confidence as an
   enum-tagged value: `PerLine(scores)` (local PaddleOCR, Google Vision, Azure Read) vs
   `Unavailable { reason }` (Windows.Media.Ocr, multimodal-LLM). When confidence is
   `Unavailable`, the UI shows a standing "unverified transcription" low-confidence banner so
   BR-05 / AC-02.6 stays honest instead of implying a confidence signal that does not exist.

8. **Sequencing.** Cloud backends are implemented AFTER the local engine is proven (R1
   spike passed and local path integrated). Each new image-egress path requires a
   security-reviewer pass before merge (security-privacy.md).

## Rationale (evidence-cited, 2026-07-09)

Scoring weight order for the engine choice: (1) EN and JA recognition QUALITY including
Japanese vertical text (縦書き); (2) language coverage breadth with Vietnamese REQUIRED;
(3) latency vs the <= 700ms p95 OCR-stage budget at high volume; (4) setup friction;
(5) privacy; (6) Phase-4 cross-platform swappability. EN/JA carry the most weight for
recognition QUALITY; coverage breadth is a distinct, first-class criterion - not a constraint
to minimize.

Local default:

1. **In-model Japanese guarantee on any machine.** PP-OCRv5's single main recognition model
   recognizes Japanese (and Chinese) first-class alongside English - no separate ja model, no
   OS language pack. This wins on the highest-weight quality axis (high-volume JA) against
   Windows.Media.Ocr, whose ja-JP pack is often ABSENT on stock Win11 and cannot be silently
   installed (DISM needs elevation; Language FOD docs updated 2023-06-29). PaddleOCR ships JA
   in its model bundle regardless of host configuration. (PP-OCRv5 multilingual doc, PaddleOCR
   repo; monkt/paddleocr-onnx, Hugging Face - retrieved 2026-07-09.)
2. **Broadest local language coverage, Vietnamese included.** PP-OCRv5 covers en/ja/zh in the
   single main recognition model, plus Korean (korean rec) and Vietnamese (latin rec) in the
   bundle. It is the ONLY local engine in this evaluation that covers Vietnamese at all, and
   it offers the widest script coverage of the local options. Because coverage breadth with
   Vietnamese required is an explicit criterion (weight #2), this is a strong, first-class
   reason PaddleOCR is the default - broad coverage is a desirable property in its own right,
   not weight to trim.
3. **Native per-line confidence satisfies AC-02.6 / BR-05.** `oar-ocr` exposes per-line rec
   confidence, so the FR-02 confidence flag is a real signal, not a synthesized proxy. This
   is decisively where Windows.Media.Ocr falls short as a silent default (see Decision #2).
4. **Cross-platform Phase 4.** The same ONNX Runtime implementation ports to macOS/Linux in
   Phase 4 without a backend rewrite, satisfying CT-07.
5. **Acceptable footprint, whisper-style first run.** The full-coverage bundle is the ~40MB
   range (det 4.6MB + main rec 15.8MB + ko + vi/latin rec); Vietnamese is KEPT, not dropped.
   This first-run download range is explicitly ACCEPTABLE - the whisper STT model already
   establishes the first-run-download pattern (AC-01.8 / NFR-REL-04) - and is NOT a
   significant negative.
6. **Private by default.** Offline (NFR-REL-03); nothing leaves the machine at the OCR stage
   unless the user explicitly opts a cloud backend in.
7. **Accuracy caveat (spike-gated).** Dated line-strict accuracy figures are EN 0.8753 /
   JA 0.7577 (PP-OCRv5 mobile, tech-researcher 2026-07-09); JA-vertical (縦書き) accuracy and
   low-DPI small-crop accuracy are UNBENCHMARKED for our input class and must be measured in
   the R1 spike.

Windows.Media.Ocr, fairly evaluated:

8. It genuinely beats PaddleOCR on latency (reputed real-time, no ORT session to warm) and
   on setup (zero model download, zero new Rust crate, purely on-device). Two distinct
   on-device Microsoft OCR stacks exist and must not be conflated:
   - **(a) Legacy `Windows.Media.Ocr.OcrEngine`** - reachable today from the `windows` crate,
     en + ja supported, but `OcrWord` exposes only `Text` + `BoundingRect`, so there is NO
     per-word or per-line confidence. It cannot satisfy AC-02.6 as a silent default.
   - **(b) Windows AI `TextRecognizer` (Windows App SDK)** - HAS per-word confidence but is
     NPU-only (Copilot+ hardware) and is NOT reachable from the `windows` crate. It is a
     possible future fast-path only, not usable now.
9. **Two decisive gaps against the default criteria, not one.** (i) Confidence: the legacy
   stack yields no confidence score, so using it as the default at high volume would fire the
   "confidence unavailable" state on EVERY region and gut AC-02.6 - a standing banner is
   acceptable for an explicit opt-in backend but not for a silent default. (ii) Coverage:
   across its ~25 published OCR languages WMO has NO Vietnamese at all - a real deficiency
   against the now-explicit coverage criterion (weight #2), IN ADDITION TO the confidence
   gap. WMO's zero-dependency, zero-install convenience does NOT override the Vietnamese
   coverage requirement. Hence WMO is retained as R2 fallback + opt-in fast-EN/JA backend,
   not the default.

Optional cloud (why offer at all, and which):

10. **Google Cloud Vision** has the best cloud privacy posture (in-memory processing, no
   training on submitted content, DPA-covered), strong CJK, and per-word confidence - so it
   preserves AC-02.6. Free tier <= 1000 units/month, then ~$1.50/1k; requires a new key.
   Open flag: no dated small-crop latency benchmark exists, so its p95 against NFR-PERF-02
   is unproven for our input class. (Tech-researcher 2026-07-09.)
11. **Azure AI Vision Read** is NOW ELIGIBLE under the EN + JA framing (the prior Vietnamese
    disqualification is VOID). It supports en + ja print + handwriting, does not train on
    submitted content and deletes after processing, and returns word confidence. Free 5k/mo
    then ~$1.50/1k; requires a new key. (Tech-researcher 2026-07-09.)
12. **Multimodal-LLM** (reuse FR-03 provider) needs no new key, dependency, or model download
    and collapses OCR + translate into one call, and ports for free; BUT it yields no
    per-line OCR confidence (breaks AC-02.6 / BR-05 unless the standing banner is used),
    carries a verbatim-fidelity risk, has 1-4s latency (stresses NFR-PERF-02), sends the
    image off-machine, and Gemini FREE tier trains on submitted content (paid / ZDR does not;
    Anthropic / OpenAI API do not train by default). Hence secondary / experimental only.

## Options considered

| Option | Pros | Cons | Verdict |
|--------|------|------|---------|
| A (default) PaddleOCR PP-OCRv5 mobile via oar-ocr/ort | In-model JA (+zh) on any machine (no OS pack); broadest local coverage en/ja/zh/ko/vi - the ONLY local engine covering Vietnamese (coverage criterion, weight #2); per-line confidence (AC-02.6); offline (NFR-REL-03); ports to macOS/Linux; full-coverage bundle ~40MB, whisper-style first run (acceptable) | Per-region CPU latency unproven (spike-gated R1); JA-vertical + low-DPI accuracy unbenchmarked; bundle grows by onnxruntime + models; `ort` is a release candidate; idle budget needs lazy session lifecycle | ADOPTED as default, spike-gated |
| B Windows.Media.Ocr (legacy, via `windows` crate) | Zero-install, zero new crate, purely on-device (no amendment); fast (reputed real-time); en + ja supported | NO Vietnamese across its ~25 OCR languages -> real coverage deficiency (weight #2), and zero-install convenience does NOT override it; `OcrWord` has NO confidence -> cannot satisfy AC-02.6 as a silent default (proxy = BR-05 silent best-guess); ja-JP pack often absent on stock Win11 + not silently installable; JA-vertical accuracy unknown; Windows-only (CT-07). Note: Windows AI TextRecognizer HAS confidence but is NPU-only + not in the `windows` crate | STRONG CANDIDATE, not chosen as default on TWO gaps - no Vietnamese coverage AND the AC-02.6 confidence gap; RETAINED as R2 fallback + opt-in fast-EN/JA backend |
| D1 (optional) Google Cloud Vision | Best cloud privacy (in-memory, no training, DPA); strong CJK; per-word confidence preserves AC-02.6; free <=1000/mo | Crop leaves the machine (requirement change); new key; no dated small-crop latency benchmark; network dependency | ADOPTED as optional cloud backend, OWNER-GATED |
| D2 (optional) Azure AI Vision Read | en + ja print + handwriting; no training + deletes after processing; word confidence; free 5k/mo | Crop leaves the machine (requirement change); new key; network dependency; small-crop p95 unproven | ADOPTED as optional cloud backend, OWNER-GATED (eligibility restored under EN+JA framing) |
| D3 (optional) Multimodal-LLM via FR-03 provider | No new key/dep/download; OCR+translate in one call; ports free | Crop leaves the machine; no per-line confidence (needs standing banner); verbatim-fidelity risk; 1-4s latency; Gemini free tier trains | ADOPTED as secondary/experimental, OWNER-GATED, Gemini-free-tier blocked |
| C Tesseract (jpn / jpn_vert) | Cross-platform, permissive license | Own docs warn poor output on low-DPI screen text (FR-02's input); jpn_vert PSM fragility; Windows binding/shell-out latency unacceptable in live-preview (AC-02.4) | REJECTED |
| E Hybrid WMO (fast zero-setup en/ja path) + PaddleOCR (broad-coverage engine, only local one covering vi) | Fast WMO where it works; escalate to Paddle for coverage/confidence | (a) WMO gives no confidence score to ROUTE on, so the escalation signal does not exist without running Paddle anyway; (b) coverage - WMO cannot be the front path for anything needing vi (no Vietnamese) while Paddle already covers en/ja/zh/ko/vi, so a SINGLE Paddle default is simpler and preferred; doubled calibration + test matrix | DEFERRED - single PaddleOCR default preferred; trait keeps the hybrid retrofittable as a latency fallback (R2) |

### Rejection / disqualification detail

- **B - Windows.Media.Ocr:** STRONG CANDIDATE, not chosen as default. Fairly, it beats
  PaddleOCR on latency and setup and is fully on-device with no amendment. It falls short as
  the default on TWO decisive gaps, not one. (1) Coverage: across its ~25 published OCR
  languages WMO has NO Vietnamese at all - a real deficiency against the explicit coverage
  criterion (Vietnamese required), and its zero-install, zero-dependency convenience does NOT
  override that requirement. (2) Confidence (AC-02.6): the legacy `Windows.Media.Ocr.OcrEngine`
  (the only stack reachable from the `windows` crate) exposes `Text` + `BoundingRect` only and
  NO confidence, so a silent default would fire the "confidence unavailable" state on every
  region at high volume, and a synthesized confidence proxy is exactly the silent best-guess
  BR-05 forbids. Secondary risks: the ja-JP language pack is often absent on stock Win11 and
  cannot be installed silently (DISM needs elevation), JA-vertical accuracy is unknown, and it
  is Windows-only (CT-07). The confidence-capable Windows AI `TextRecognizer` (Windows App SDK)
  is NPU-only (Copilot+) and not reachable from the `windows` crate - a possible future
  fast-path only. WMO is RETAINED as the R2 escalation target and as an explicit opt-in
  fast-EN/JA backend behind a standing "confidence unavailable" banner. Also noted and
  excluded: OneOCR extraction (reverse-engineered Snipping Tool dll/model - unlicensed
  redistribution, legal risk).
- **C - Tesseract (jpn / jpn_vert):** REJECTED. Its own docs warn of poor output on low-DPI
  screen text, and FR-02's input IS low-DPI UI screenshots. `jpn_vert` PSM handling is
  fragile for vertical text, and the Windows Rust binding path (`leptess` stale/vcpkg;
  `rusty-tesseract` shell-out) adds latency unacceptable in live-preview mode (AC-02.4).
- **E - Hybrid WMO + Paddle:** DEFERRED in favour of a SINGLE PaddleOCR default. The hybrid
  would pair WMO as a fast, zero-setup en/ja path with PaddleOCR as the broad-coverage engine
  (and the only local one covering vi). A single Paddle default is simpler and preferred
  because (a) WMO yields no confidence score to route on, so the escalation signal does not
  exist without running Paddle anyway, and (b) coverage reinforces this - WMO cannot be the
  default or the primary path as it lacks Vietnamese entirely, while Paddle already covers
  en/ja/zh/ko/vi. The `OcrEngine` registry keeps the hybrid retrofittable as a latency
  fallback (R2); revisit only if R1 shows Paddle missing budget on EN small-crops.

## Owner decision required (preconditions before ANY cloud backend ships)

The local default (Option A) needs no requirement change and can proceed on the R1 spike.
Every optional cloud backend (D1 Google Vision, D2 Azure Read, D3 multimodal-LLM) requires
the owner to authorize ALL SEVEN of the following before implementation begins. These are
the brainstormer's preconditions (2026-07-09):

1. **Local stays the default and offline fallback.** The app ships fully functional with
   zero cloud config; local PaddleOCR is always present and is the NFR-REL-03 offline
   fallback. Cloud is opt-in only.
2. **Per-backend informed-consent gate, default-OFF.** The first actual cloud OCR call on a
   backend triggers a consent dialog naming what leaves the machine (a crop of the selected
   region only), where it goes (named provider/endpoint), and the provider's
   retention/training posture. Consent is revocable in Settings.
3. **Data minimization.** Only the selected region crop is sent (never the full screen),
   downscaled (LLM long-edge cap ~1568px), metadata stripped, in-memory only, never on disk.
4. **Gemini free-tier is a BLOCKING condition.** Block or hard-warn where detectable, with
   affirmative acknowledgement of the training risk required in the consent copy.
5. **Confidence-source abstraction + standing banner.** The trait tags confidence as
   `PerLine(scores)` vs `Unavailable { reason }`; the WMO and LLM paths (no per-line
   confidence) show a standing "unverified transcription" low-confidence banner so
   BR-05 / AC-02.6 stays honest.
6. **Always-visible active-cloud-backend indicator** on the output surface whenever a cloud
   backend is active.
7. **Security-reviewer pass on each new image-egress path** before merge; cloud impls are
   sequenced AFTER the local engine is proven (R1 passed).

Authorizing these SEVEN also requires the owner to sign off on the requirement amendments
below (they change BR-01, NFR-SEC-03, AC-02.5/AC-02.6, NFR-REL-03 and add a new business
rule). Until the owner signs off, cloud backends are NOT built and TASK-007 ships local-only.

## Proposed requirement amendments (pending owner sign-off - NOT YET APPLIED)

The following amendments are DRAFTS. They are recorded here for the owner to review. They do
NOT modify the live BR-01 row (docs/context/business-rules.md), the live NFR-SEC-03 row
(docs/specs/07-non-functional-requirements.md), or the live AC-02.5 / AC-02.6
(docs/specs/05-functional-requirements.md). On owner sign-off, the ba-analyst applies them
and adds the revision-history row(s) in (f). The LOCAL default requires NONE of these
amendments.

Live wording confirmed by reading docs/specs/05 and 07 on 2026-07-09 (see "Reconciliation"
at the end). AC numbering: AC-02.5 is the image-egress criterion; AC-02.6 is the
confidence-flag criterion.

**(a) Proposed BR-01 (consent carve-out).**
Current live BR-01: "Audio thô không bao giờ rời máy và không bao giờ ghi xuống đĩa; chỉ
TEXT tối thiểu được gửi đến provider người dùng chọn."
Proposed BR-01: "Audio thô không bao giờ rời máy và không bao giờ ghi xuống đĩa. Ảnh chụp
màn hình mặc định không rời máy: OCR mặc định chạy local. Người dùng CÓ THỂ bật một backend
OCR đám mây tuỳ chọn; khi đó chỉ một crop của vùng đã chọn (không phải toàn màn hình), đã
thu nhỏ và loại bỏ metadata, được gửi đến provider người dùng chọn - và chỉ sau khi người
dùng đồng ý qua cổng consent per-backend (xem BR-09). Ngoài trường hợp opt-in này, chỉ TEXT
tối thiểu rời máy."

**(b) Proposed NFR-SEC-03.**
Current live NFR-SEC-03: "Audio thô và ảnh chụp màn hình: chỉ trong RAM phiên, không ghi
đĩa, không rời máy; chỉ TEXT tối thiểu gửi đến provider người dùng chọn."
Proposed NFR-SEC-03: "Audio thô: chỉ trong RAM phiên, không ghi đĩa, không rời máy. Ảnh chụp
màn hình: chỉ trong RAM phiên, không ghi đĩa; MẶC ĐỊNH không rời máy (OCR local). Nếu người
dùng bật backend OCR đám mây (opt-in, consent per-backend theo BR-09): chỉ crop vùng đã chọn
- đã thu nhỏ (LLM long-edge <= ~1568px), loại metadata, chỉ trong RAM - được gửi đến provider
đó qua HTTPS; không bao giờ gửi toàn màn hình, không bao giờ ghi đĩa. Mỗi đường rời-ảnh mới
phải qua security-reviewer."

**(c) Proposed AC-02.5, AC-02.6 / OI-07 confidence-semantics + standing banner.**
Current live AC-02.5: "Ảnh chụp màn hình chỉ tồn tại trong RAM của phiên: không ghi xuống
đĩa, không gửi ra ngoài máy; chỉ TEXT OCR được gửi đến provider (kiểm bằng test + audit)."
Proposed AC-02.5: "Ảnh chụp màn hình chỉ tồn tại trong RAM của phiên, không ghi xuống đĩa.
Với backend OCR local (mặc định) ảnh không rời máy; chỉ TEXT OCR được gửi đến provider. Với
backend OCR đám mây do người dùng bật (consent per-backend theo BR-09): chỉ crop vùng đã
chọn đã thu nhỏ + loại metadata rời máy đến provider đó, không bao giờ gửi toàn màn hình
(kiểm bằng test + audit)."
Current live AC-02.6: "Vùng OCR có độ nhận dạng kém được gắn confidence flag hiển thị rõ."
Proposed AC-02.6: "Vùng OCR có độ nhận dạng kém được gắn confidence flag hiển thị rõ. Backend
cung cấp confidence theo dòng (`PerLine`) dùng ngưỡng hiệu chỉnh (OI-07). Backend không cung
cấp confidence (`Unavailable`, ví dụ Windows.Media.Ocr hoặc đường multimodal-LLM) hiển thị
banner cố định 'bản nhận dạng chưa kiểm chứng' thay vì đoán im lặng (giữ đúng BR-05)."
Proposed OI-07 note: mở rộng OI-07 để ghi nhận confidence là enum-tagged
(`PerLine(scores)` vs `Unavailable{reason}`) và ngưỡng chỉ áp cho nhánh `PerLine`.

**(d) Proposed NFR-REL-03 (cloud->local fallback).**
Current live NFR-REL-03: "Mất mạng: STT local vẫn chạy, phần dịch báo trạng thái offline rõ
ràng thay vì treo."
Proposed NFR-REL-03: "Mất mạng: STT local vẫn chạy; OCR local (mặc định) vẫn chạy. Nếu backend
OCR đám mây đang bật mà mất mạng hoặc provider lỗi, hệ thống báo trạng thái offline rõ ràng và
tự động dùng backend OCR local làm fallback thay vì treo; phần dịch báo offline rõ ràng."

**(e) Proposed NEW business rule BR-09 (cloud-OCR consent + Gemini free-tier restriction).**
Proposed BR-09: "OCR đám mây là opt-in per-backend, mặc định TẮT. Lần đầu một backend đám mây
thực sự gửi ảnh, hệ thống hiện dialog consent nêu rõ: (1) cái gì rời máy - chỉ crop vùng đã
chọn; (2) đi đâu - tên provider/endpoint; (3) chính sách lưu giữ/huấn luyện của provider.
Consent thu hồi được trong Settings; khi backend đám mây đang hoạt động luôn có chỉ báo hiển
thị tên backend. Gemini free-tier (huấn luyện trên nội dung gửi lên) bị CHẶN cho OCR đám mây
nơi phát hiện được, hoặc yêu cầu người dùng xác nhận rủi ro huấn luyện một cách khẳng định.
Nguồn: quyết định chủ dự án <ngày sign-off>; ADR-004."

**(f) Proposed docs/specs/13-revision-history.md row(s) - added ONLY on sign-off.**
Add one row:
"| 1.1 | <ngày sign-off> | ba-analyst (TASK-005) | Quyết định chủ dự án cho phép backend OCR
đám mây tuỳ chọn (opt-in, consent per-backend): sửa BR-01, NFR-SEC-03, AC-02.5, AC-02.6/OI-07,
NFR-REL-03; thêm BR-09 (consent OCR đám mây + chặn Gemini free-tier). OCR local PaddleOCR vẫn
là mặc định và fallback offline. Chi tiết ở ADR-004. |"

## Consequences

- Positive: app stays fully functional and private by default (local OCR, nothing leaves
  the machine at the OCR stage out of the box); Japanese - the owner's high-volume source -
  is guaranteed in-model on any machine, and the local engine offers the BROADEST coverage of
  the options (en/ja/zh/ko/vi) - the only local engine covering Vietnamese; the owner's ask
  for a switchable, easy-to-set-up backend (including Windows.Media.Ocr and cloud options) is
  satisfied without weakening the default privacy posture; the `OcrEngine` registry +
  confidence-source abstraction make Phase 4 ports and future backends additive, not rewrites.
- Negative / trade-off:
  - Cloud backends are a genuine requirement change (image egress); they cannot ship until
    the owner authorizes the seven preconditions and the amendments.
  - The default trades WMO's superior latency and zero-setup for PaddleOCR's real per-line
    confidence, in-model JA, and broader coverage (en/ja/zh/ko/vi including Vietnamese, which
    WMO lacks entirely); if R1 shows Paddle missing the EN small-crop budget, WMO can be
    promoted for EN/JA (see R2 ladder).
  - Google Vision / Azure Read small-crop p95 vs NFR-PERF-02 is unproven (no dated
    benchmark) - a cloud latency spike is needed before either is presented as budget-meeting.
  - The WMO and multimodal-LLM paths have no per-line confidence and need the standing banner
    to keep BR-05 honest; Gemini free tier must be blocked.
  - Local path trade-offs: unproven per-region CPU latency (R1 spike), unbenchmarked
    JA-vertical + low-DPI accuracy, `ort` release-candidate churn, and a lazy ORT session
    lifecycle for the idle budget (NFR-PERF-03). The full-coverage model bundle (~40MB
    first-run download, Vietnamese KEPT) is an ACCEPTABLE trade-off, NOT a significant
    negative: it reuses the whisper first-run pattern (AC-01.8 / NFR-REL-04).
- Follow-up work: TASK-007 runs the R1 local latency spike as its FIRST gating item and
  ships local-only; cloud backends are separate, owner-gated, sequenced after local is
  proven, each with a security-reviewer pass and a cloud latency spike.

## Residual risks and validation plan

| ID | Risk | Validation / mitigation |
|----|------|-------------------------|
| R1 | Local OCR-stage latency exceeds <= 700ms p95 | MANDATORY criterion spike as TASK-007's FIRST gating item: PP-OCRv5 mobile det+rec via oar-ocr on representative synthetic region crops (~400x100 up to ~1200x800; EN + JA primary fixtures, Vietnamese + ko + zh secondary - Vietnamese KEPT), consumer CPU. Pass gate: OCR-stage p95 <= 700ms. Wire into CI so regressions block merge. |
| R2 | Local spike fails | Escalation ladder: (1) PP-OCRv6 tiny; (2) cap/downscale det input, skip det for single-line subtitle crops; (3) promote Windows.Media.Ocr as a real second backend (`Unavailable{reason}` + standing banner) for EN/JA where the pack exists; (4) WMO as default ONLY under an owner-authorized AC-02.6 amendment. |
| R3 | Idle RAM blown by resident ORT session | Spike measures resident RAM active and 60s post-session; lazy model load, never at app start (NFR-REL-02). |
| R4 | Confidence output unusable for AC-02.6 | Local spike confirms per-line rec confidence usable + measures its distribution for OI-07 calibration; `Unavailable` backends (WMO, LLM) fall back to the standing banner. |
| R5 | JA-vertical + low-DPI accuracy unbenchmarked | Local spike measures JA-vertical (縦書き) accuracy on BOTH Paddle and WMO, plus low-DPI game-subtitle EN + JA character accuracy on synthetic UI screenshots with a minimum character-accuracy bar. |
| R6 | PP-OCRv5 model license unpinned | Verification item before this ADR moves to Accepted. |
| R7 | `ort` rc churn | Pin exact versions; log upgrades in docs/context/tool-changelog.md; security-reviewer pass on the native dependency. |
| R8 | Model download UX friction | Reuse the whisper first-run flow (AC-01.8 / NFR-REL-04); the ~40MB full-coverage model set (en/ja/zh/ko/vi, Vietnamese KEPT) is an ACCEPTABLE first-run download, not a significant friction. |
| R9 | WMO ja-JP pack absent / small-crop latency unknown | Spike probes whether the ja-JP language pack ships on stock Win11 (+ elevation/deep-link cost if absent) and measures WMO small-crop p95, so the R2 promotion path is data-backed before it is taken. |
| R10 | Google Vision / Azure Read small-crop p95 vs NFR-PERF-02 unproven | Cloud latency spike on representative crops before presenting either as budget-compliant; if it misses, present as an accuracy backend with an explicit latency caveat in Settings, not as the low-latency path. |
| R11 | Image egress via a cloud backend regresses NFR-SEC-03 / BR-01 | Only proceed under owner-signed amendments; enforce crop-only + downscale + metadata-strip + in-memory in code; security-reviewer pass on each image-egress path; consent gate + active-backend indicator; audit test that full-screen bytes never leave. |
| R12 | Gemini free tier trains on submitted crops | Block or hard-warn where detectable; affirmative acknowledgement in consent copy (BR-09). |
| R13 | User confusion about which backend is active / where images go | Always-visible active-cloud-backend indicator; per-backend consent naming the provider; local is the default so the safe state is the default state. |

## Revisit triggers

- The R2 escalation ladder is exhausted.
- oar-ocr or ort maintenance stalls for ~12 months.
- Windows AI TextRecognizer becomes reachable from the `windows` crate on mainstream
  non-NPU hardware AND its language coverage adds Vietnamese (both the confidence gap and the
  coverage gap would then need to close before on-device WMO could be a default).
- An adverse change in Paddle model licensing.
- A provider's retention / training posture changes materially (re-evaluate its consent copy
  and eligibility - e.g. Google Vision or Azure starts training, or Gemini paid-tier posture
  changes).
- OCR source-language mix shifts materially away from EN + JA (would re-open model bundle
  and engine choice).

## References

- docs/specs/05-functional-requirements.md (FR-02, AC-02.1..AC-02.9),
  docs/specs/07-non-functional-requirements.md (NFR-SEC-03, NFR-PERF-02/03, NFR-REL-03,
  NFR-SCA-01), docs/specs/11-assumptions-constraints.md (OI-01, OI-07, CT-07),
  docs/context/business-rules.md (BR-01, BR-05, BR-07)
- docs/tasks/active/TASK-005-decide-ocr-engine.md (tech-researcher evidence + brainstormer
  design + ba-analyst owner-decision package; EN+JA re-scope 2026-07-09)
- PP-OCRv5 multilingual doc, PaddleOCR repo (retrieved 2026-07-09); monkt/paddleocr-onnx,
  Hugging Face (retrieved 2026-07-09)
- Google Cloud Vision privacy / data-usage + pricing (tech-researcher, retrieved 2026-07-09)
- Azure AI Vision Read supported languages (en + ja print + handwriting) + no-train/delete
  posture + pricing (tech-researcher, retrieved 2026-07-09)
- Multimodal-LLM OCR trade-off + Gemini free-tier training posture (tech-researcher,
  retrieved 2026-07-09)
- Microsoft Learn, Windows.Media.Ocr / OcrWord (winrt-26100, Text + BoundingRect only, no
  confidence); Windows AI TextRecognizer (Windows App SDK, NPU-only); Language FOD docs
  (updated 2023-06-29)
- Tesseract ImproveQuality docs; jpn_vert PSM handling
- ADR-002 (first-run model download pattern), .claude/rules/security-privacy.md,
  .claude/rules/tech-stack.md, .claude/rules/human-in-the-loop.md
</content>
</invoke>
