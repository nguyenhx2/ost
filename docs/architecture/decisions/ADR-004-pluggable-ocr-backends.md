---
title: "ADR-004: OCR engine - local PaddleOCR default with pluggable optional cloud backends behind informed consent"
status: Proposed
date: 2026-07-09
deciders: []
tags: [adr, architecture, screen, privacy]
---

# ADR-004: OCR engine - local PaddleOCR default with pluggable optional cloud backends behind informed consent

> Status is Proposed and stays Proposed. This ADR now carries a requirement change
> (optional cloud OCR = the screenshot crop leaves the machine) that ONLY THE OWNER can
> authorize. The document below is an OWNER-DECISION PACKAGE, not an accepted decision. Do
> not set status Accepted until the owner signs off on the "Owner decision required"
> section and the pending requirement amendments.

## Context

FR-02 (region translate with live preview) needs an OCR engine. The engine sits behind the
`OcrEngine` trait (NFR-SCA-01). Forces and constraints:

- Vietnamese is first-class (BR-07): target is vi, sources are often ja/en/zh/ko, and
  vi-source content must also work.
- NFR-PERF-02: region translate end-to-end p95 < 2s after selection; the OCR stage's
  working budget is <= 700ms p95 for the local path.
- NFR-PERF-03: idle < 100MB RAM / < 1% CPU.
- Confidence flag (AC-02.6 / BR-05, OI-07): OCR regions with poor recognition must carry a
  visible confidence flag; low-confidence output must never be a silent best-guess.
- CT-07 / NFR-SCA-01: Windows-first, but the backend must be swappable behind the
  `OcrEngine` trait for the macOS/Linux ports in Phase 4.
- A first-run model download is acceptable: the whisper STT model already follows this
  pattern (AC-01.8 / NFR-REL-04).

### What changed since the first draft

The first ADR-004 draft chose a single local engine and excluded cloud OCR
"constitutionally" under NFR-SEC-03 / BR-01 (screenshots never leave the machine). The
owner did NOT accept that framing. The owner asked for (1) a user-switchable / pluggable
OCR backend that is easy to set up and switch, and (2) cloud OCR options to be evaluated -
Google Cloud Vision specifically, with the owner able to supply a key.

This reframes the decision from "single local engine, cloud excluded" to "local default +
pluggable optional cloud backends behind informed consent." That reframing has a hard
constitutional consequence that this ADR must not paper over:

**Every cloud / multimodal-LLM OCR path sends the SCREENSHOT CROP off-machine.** As written
today, that violates NFR-SEC-03 (docs/specs/07-non-functional-requirements.md), BR-01
(docs/context/business-rules.md), the FR-02 acceptance criterion AC-02.5
(docs/specs/05-functional-requirements.md), and CLAUDE.md invariant 3. Adopting any cloud
backend is therefore a REQUIREMENT CHANGE that only the owner can authorize. This ADR
proposes the amendment text (see "Proposed requirement amendments") but does not apply it.

This ADR resolves open item OI-01 (docs/specs/11-assumptions-constraints.md) for the local
default and scopes the optional-cloud follow-on.

## Decision

1. **Local default (unconditional).** Adopt PaddleOCR PP-OCRv5 mobile models on ONNX
   Runtime via the `oar-ocr` crate (pure Rust, Apache-2.0) as the DEFAULT and always-present
   `OcrEngine` implementation. The app ships fully functional with ZERO cloud configuration;
   the local engine is the offline fallback (NFR-REL-03). This remains CONDITIONAL on the
   mandatory local latency criterion spike (R1) passing as the FIRST gate of TASK-007,
   before any pipeline integration. Pinned versions: `oar-ocr` 0.8.0 (released 2026-07-08),
   `ort` 2.0.0-rc.12 (2026-03-05).

2. **Pluggable optional cloud backends (owner-gated).** The `OcrEngine` trait gains a
   backend registry so the user can select and switch OCR backends in Settings. Each cloud
   backend is default-OFF and hidden behind a per-backend informed-consent gate. Subject to
   owner sign-off (see "Owner decision required"), offer:
   - **Google Cloud Vision** as the first optional cloud backend (best cloud privacy
     posture, keeps per-word confidence, strong vi + CJK) - user supplies the key.
   - **Multimodal-LLM (reuse the FR-03 provider layer)** only as a SECONDARY / EXPERIMENTAL
     backend, with a standing "unverified transcription" low-confidence banner and a
     BLOCKING restriction on Gemini free tier (which trains on submitted content).
   - **Do NOT offer Azure** OCR: Vietnamese is not in Azure OCR's supported languages
     (disqualified, see Options).

3. **Consent gate (mandatory for every cloud backend).** The FIRST actual cloud OCR call on
   a backend triggers a consent dialog that names, in plain language: (a) exactly what
   leaves the machine - a crop of the selected region only, never the full screen; (b) where
   it goes - the named provider / endpoint; (c) the provider's retention / training posture.
   Consent is per-backend, default-OFF, revocable in Settings, and while any cloud backend
   is active an always-visible indicator names the active cloud backend on the output
   surface.

4. **Data minimization on every cloud path.** Send ONLY the selected region crop (never the
   full screen), downscaled (multimodal-LLM path: long-edge cap ~1568px), with metadata
   stripped, held in memory only, never written to disk.

5. **Gemini free-tier block.** Where a Gemini key's tier is detectable as free, block the
   cloud OCR call (or hard-warn and require affirmative acknowledgement of the training
   risk in the consent copy) because Google trains on free-tier submissions; paid / ZDR
   tiers and Anthropic / OpenAI API do not train by default.

6. **Confidence-source abstraction.** The `OcrEngine` trait exposes confidence as an
   enum-tagged value: `PerLine(scores)` (local PaddleOCR, Google Vision) vs
   `Unavailable { reason }` (multimodal-LLM). When confidence is `Unavailable`, the UI shows
   a standing "unverified transcription" low-confidence banner so BR-05 / AC-02.6 stays
   honest instead of implying a confidence signal that does not exist.

7. **Sequencing.** Cloud backends are implemented AFTER the local engine is proven (R1
   spike passed and local path integrated). Each new image-egress path requires a
   security-reviewer pass before merge (security-privacy.md).

## Rationale (evidence-cited, 2026-07-09)

Local default:

1. Local PaddleOCR is the only local candidate that can OCR Vietnamese at all:
   `latin_PP-OCRv5_mobile_rec` explicitly lists Vietnamese (PP-OCRv5 multilingual doc,
   PaddleOCR repo, retrieved 2026-07-09). Windows.Media.Ocr has NO Vietnamese in any of its
   25 published languages across the API's 10-year history (Microsoft Learn winrt-26100;
   Windows Developer Blog 2016-02-08).
2. It covers ja/en/zh (main model) + ko (korean rec model) + vi (latin rec model) with ONE
   engine and one local confidence semantics. Models are modest: mobile det 4.6MB + rec
   15.8MB ONNX; ~21-40MB total, routed by the user-selected source language
   (monkt/paddleocr-onnx on Hugging Face, retrieved 2026-07-09).
3. Healthy pure-Rust path: `oar-ocr` 0.8.0 (2026-07-08, Apache-2.0, PP-OCRv5/v6) on `ort`
   2.0.0-rc.12. Per-line rec confidence is available (satisfies AC-02.6 / BR-05), and it is
   offline (satisfies NFR-REL-03).
4. Same implementation ports to macOS/Linux in Phase 4 (ONNX Runtime is cross-platform),
   satisfying CT-07 without a backend rewrite.
5. Keeping local as the default means the app is fully functional and private out of the
   box: nothing leaves the machine at the OCR stage unless the user explicitly opts a cloud
   backend in.

Optional cloud (why offer at all, and which):

6. Google Cloud Vision has the best cloud privacy posture (in-memory processing, no training
   on submitted content, DPA-covered), strong vi + CJK, and per-word confidence - so it
   preserves the confidence flag (AC-02.6) that the local engine also provides. Free tier
   <= 1000 units/month, then ~$1.50/1k; requires a new key. Tech-researcher verified
   2026-07-09. Open flag: no dated small-crop latency benchmark exists for Google Vision, so
   its p95 against NFR-PERF-02 is unproven for our input class.
7. Multimodal-LLM (reuse FR-03 provider) needs no new key, dependency, or model download and
   collapses OCR + translate into one call, and ports for free; BUT it yields no per-line
   OCR confidence (breaks AC-02.6 / BR-05 unless the standing banner is used), carries a
   verbatim-fidelity risk, has 1-4s latency (stresses NFR-PERF-02), and Gemini FREE tier
   trains on submitted content (paid / ZDR does not; Anthropic / OpenAI API do not train by
   default). Tech-researcher verified 2026-07-09. Hence secondary / experimental only.

## Options considered

| Option | Pros | Cons | Verdict |
|--------|------|------|---------|
| A (default) PaddleOCR PP-OCRv5 mobile via oar-ocr/ort | Only local engine with Vietnamese; vi+ja/en/zh/ko in one engine; per-line confidence; offline (NFR-REL-03); ports to macOS/Linux; models 21-40MB, whisper-style first-run | Per-region CPU latency unproven (spike-gated R1); bundle grows by onnxruntime + models; `ort` is a release candidate; idle budget needs lazy session lifecycle | ADOPTED as default, spike-gated |
| D1 (optional) Google Cloud Vision | Best cloud privacy posture (in-memory, no training, DPA); strong vi + CJK; per-word confidence preserves AC-02.6; free <=1000/mo | Crop leaves the machine (requirement change); new key; no dated small-crop latency benchmark; network dependency | ADOPTED as first optional cloud backend, OWNER-GATED |
| D2 (optional) Multimodal-LLM via FR-03 provider | No new key/dep/download; OCR+translate in one call; ports free | Crop leaves the machine; no per-line confidence (needs standing banner); verbatim-fidelity risk; 1-4s latency; Gemini free tier trains | ADOPTED as secondary/experimental, OWNER-GATED, Gemini-free-tier blocked |
| D3 Azure OCR | Cloud footprint | Vietnamese NOT in Azure OCR supported languages; documented diacritic failures | DISQUALIFIED (no Vietnamese) |
| B Windows.Media.Ocr | Zero-install, OS-native, fast on installed packs | No Vietnamese ever (25 languages, none vi); ja/zh/ko packs absent by default; Windows-only contradicts CT-07 | REJECTED as engine; retained as R2 fast-path fallback |
| C Tesseract | Cross-platform, permissive license | Own docs warn poor output on low-DPI screen text (FR-02's input); documented vi-diacritic confusion; weak CJK; Rust binding pain on Windows | REJECTED |
| E Hybrid WMO + Paddle | Fast path where OS packs exist | Fast path rarely fires; never covers vi; doubled calibration + test matrix | DEFERRED, trait keeps it retrofittable |

### Rejection / disqualification detail

- **D3 - Azure OCR: DISQUALIFIED.** Vietnamese is not in Azure OCR's supported-language
  list, with documented diacritic failures (tech-researcher, 2026-07-09). It cannot serve
  FR-02's first-class Vietnamese requirement, so it is not offered even as an optional
  backend.
- **B - Windows.Media.Ocr:** REJECTED as sole engine. No Vietnamese in any of its 25
  published languages (Microsoft Learn winrt-26100). ja/zh/ko packs typically absent by
  default (local verification 2026-07-09 on Win11: only en-US + ja present); the app cannot
  install packs silently (DISM needs elevation, Language FOD docs updated 2023-06-29).
  Windows-only contradicts CT-07. Variants also rejected: Windows AI TextRecognizer
  (Copilot+ NPU-only, undocumented languages); OneOCR extraction (reverse-engineered
  Snipping Tool dll/model, unlicensed redistribution - legal risk). RETAINED as the
  designated fast-path fallback behind the `OcrEngine` trait if the local latency spike
  fails (see R2).
- **C - Tesseract:** REJECTED. Its own docs warn of poor output on low-DPI screen text
  (Tesseract ImproveQuality docs), and FR-02's input IS low-DPI UI screenshots. Documented
  Vietnamese diacritic confusion (tesseract-ocr/langdata issue #66). Weak CJK. Windows Rust
  binding pain (`leptess` stale/vcpkg; `rusty-tesseract` shell-out latency unacceptable in
  live-preview mode AC-02.4).
- **E - Hybrid WMO + Paddle:** DEFERRED. Fast path rarely fires and never covers vi, while
  costing doubled confidence calibration and a doubled test matrix. The `OcrEngine` trait
  keeps it retrofittable.

## Owner decision required (preconditions before ANY cloud backend ships)

The local default (Option A) needs no requirement change and can proceed on the R1 spike.
Every optional cloud backend (D1, D2) requires the owner to authorize ALL SEVEN of the
following before implementation begins. These are the brainstormer's preconditions
(2026-07-09):

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
   `PerLine(scores)` vs `Unavailable { reason }`; the LLM path (no confidence) shows a
   standing "unverified transcription" low-confidence banner so BR-05 / AC-02.6 stays honest.
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
and adds the revision-history row(s) in (f).

Live wording confirmed by reading docs/specs/05 and 07 on 2026-07-09 (see "Reconciliation"
at the end).

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

**(c) Proposed AC-02.5, AC-02.6 / OI-07 confidence-semantics + LLM standing banner.**
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
cấp confidence (`Unavailable`, ví dụ đường multimodal-LLM) hiển thị banner cố định 'bản nhận
dạng chưa kiểm chứng' thay vì đoán im lặng (giữ đúng BR-05)."
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
  the machine at the OCR stage out of the box); the owner's ask - a switchable, easy-to-set-up
  backend and a Google Vision option - is satisfied without weakening the default privacy
  posture; the `OcrEngine` registry + confidence-source abstraction make Phase 4 ports and
  future backends additive, not rewrites.
- Negative / trade-off:
  - Cloud backends are a genuine requirement change (image egress); they cannot ship until
    the owner authorizes the seven preconditions and the amendments.
  - Google Vision small-crop p95 vs NFR-PERF-02 is unproven (no dated benchmark) - a cloud
    latency spike is needed before it is presented as meeting the < 2s budget.
  - The multimodal-LLM path has no per-line confidence and needs the standing banner to keep
    BR-05 honest; Gemini free tier must be blocked.
  - Local path still carries the first draft's trade-offs: unproven per-region CPU latency
    (R1 spike), onnxruntime + model bundle growth, `ort` release-candidate churn, and a lazy
    ORT session lifecycle for the idle budget (NFR-PERF-03).
- Follow-up work: TASK-007 runs the R1 local latency spike as its FIRST gating item and
  ships local-only; cloud backends are separate, owner-gated, sequenced after local is
  proven, each with a security-reviewer pass and (for Google Vision) a cloud latency spike.

## Residual risks and validation plan

| ID | Risk | Validation / mitigation |
|----|------|-------------------------|
| R1 | Local OCR-stage latency exceeds <= 700ms p95 | UNCHANGED mandatory criterion spike as TASK-007's FIRST gating item: PP-OCRv5 mobile det+rec via oar-ocr on representative synthetic region crops (~400x100 up to ~1200x800; en/vi/ja/ko/zh fixtures), consumer CPU. Pass gate: OCR-stage p95 <= 700ms. Wire into CI so regressions block merge. |
| R2 | Local spike fails | Escalation ladder: (1) PP-OCRv6 tiny; (2) cap/downscale det input, skip det for small single-line crops; (3) Windows.Media.Ocr fast path as a second backend behind the trait for en/ja where packs exist; (4) supersede ADR-004 with spike data. |
| R3 | Idle RAM blown by resident ORT session | Spike measures resident RAM active and 60s post-session; lazy model load, never at app start (NFR-REL-02). |
| R4 | Confidence output unusable for AC-02.6 | Local spike confirms per-line rec confidence usable; feed distributions into OI-07 calibration; `Unavailable` backends fall back to the standing banner. |
| R5 | vi-diacritic / low-DPI accuracy unbenchmarked | Local spike includes an accuracy pass on synthetic low-DPI UI screenshots (vi fully accented, ja/ko/zh) with a minimum character-accuracy bar. |
| R6 | PP-OCRv5 model license unpinned | Verification item before this ADR moves to Accepted. |
| R7 | `ort` rc churn | Pin exact versions; log upgrades in docs/context/tool-changelog.md; security-reviewer pass on the native dependency. |
| R8 | Model download UX friction | Reuse whisper first-run flow (NFR-REL-04); download only rec models for selected source languages. |
| R9 | Google Vision small-crop p95 vs NFR-PERF-02 unproven | Cloud latency spike on representative crops before presenting Vision as budget-compliant; if it misses, present it as an accuracy backend with an explicit latency caveat in Settings, not as the low-latency path. |
| R10 | Image egress via a cloud backend regresses NFR-SEC-03 / BR-01 | Only proceed under owner-signed amendments; enforce crop-only + downscale + metadata-strip + in-memory in code; security-reviewer pass on each image-egress path; consent gate + active-backend indicator; audit test that full-screen bytes never leave. |
| R11 | Gemini free tier trains on submitted crops | Block or hard-warn where detectable; affirmative acknowledgement in consent copy (BR-09). |
| R12 | User confusion about which backend is active / where images go | Always-visible active-cloud-backend indicator; per-backend consent naming the provider; local is the default so the safe state is the default state. |

## Revisit triggers

- The R2 escalation ladder is exhausted.
- oar-ocr or ort maintenance stalls for ~12 months.
- Windows AI TextRecognizer ships documented Vietnamese support on mainstream non-NPU
  hardware.
- An adverse change in Paddle model licensing.
- A provider's retention / training posture changes materially (re-evaluate its consent copy
  and eligibility - e.g. Google Vision starts training, or Gemini paid-tier posture changes).

## References

- docs/specs/05-functional-requirements.md (FR-02, AC-02.1..AC-02.9),
  docs/specs/07-non-functional-requirements.md (NFR-SEC-03, NFR-PERF-02/03, NFR-REL-03,
  NFR-SCA-01), docs/specs/11-assumptions-constraints.md (OI-01, OI-07, CT-07),
  docs/context/business-rules.md (BR-01, BR-05, BR-07)
- docs/tasks/active/TASK-005-decide-ocr-engine.md (tech-researcher evidence + brainstormer
  design + ba-analyst owner-decision package, 2026-07-09)
- PP-OCRv5 multilingual doc, PaddleOCR repo (retrieved 2026-07-09); monkt/paddleocr-onnx,
  Hugging Face (retrieved 2026-07-09)
- Google Cloud Vision privacy / data-usage + pricing (tech-researcher, retrieved 2026-07-09)
- Azure OCR supported languages - Vietnamese absent (tech-researcher, retrieved 2026-07-09)
- Multimodal-LLM OCR trade-off + Gemini free-tier training posture (tech-researcher,
  retrieved 2026-07-09)
- Microsoft Learn, Windows.Media.Ocr language support (winrt-26100); Windows Developer Blog
  2016-02-08; Language FOD docs (updated 2023-06-29)
- Tesseract ImproveQuality docs; tesseract-ocr/langdata issue #66
- ADR-002 (first-run model download pattern), .claude/rules/security-privacy.md,
  .claude/rules/tech-stack.md, .claude/rules/human-in-the-loop.md
</content>
</invoke>
