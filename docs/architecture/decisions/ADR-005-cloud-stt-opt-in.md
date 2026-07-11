---
title: "ADR-005: Optional cloud speech-to-text backends behind owner-gated informed consent"
status: Proposed
date: 2026-07-11
deciders: [nguyenhx2]
tags: [adr, architecture, audio, privacy]
---

> Status is Proposed and stays Proposed. This ADR carries a requirement change (opt-in cloud
> STT means RAW AUDIO leaves the machine) that ONLY THE OWNER can authorize. It SUPERSEDES the
> "audio never leaves the machine" premise of ADR-002 - an Accepted, immutable ADR - IF and
> only if accepted. Until the owner signs off, ADR-002's local-only premise stands unchanged,
> no cloud-STT code or dependency lands (TASK-026 hard stop), and this document is an
> OWNER-DECISION PACKAGE, not an accepted decision.

# ADR-005: Optional cloud speech-to-text backends behind owner-gated informed consent

## Context

FR-01 (live audio translation) currently runs speech-to-text locally via whisper.cpp
(`whisper-rs`), per ADR-002 (Accepted, 2026-07-09): only the transcribed TEXT is sent to the
user-chosen LLM provider, and raw audio never leaves the machine or touches disk. That
premise is also codified as BR-01 (docs/context/business-rules.md) and NFR-SEC-03
(docs/specs/07-non-functional-requirements.md).

The owner requested (2026-07-11) an exploration of cloud STT choices to sit alongside local
whisper - potentially lower latency, potentially better accuracy on some inputs, at the cost
of sending raw audio to a third party. This is not a tuning knob: EVERY cloud STT backend
sends the user's live system audio off-machine, which directly contradicts ADR-002's Accepted
premise and BR-01 as currently worded. Adopting any cloud STT backend is therefore a
requirement change, not an implementation detail, and follows the same owner-gated pattern
already established for cloud OCR in ADR-004 (Accepted... pending owner sign-off status, used
here as the structural precedent for how an owner-gated, consent-first opt-in package is
built and sequenced).

TASK-026 also covers two LOCAL, no-spec-change improvements that ARE cleared to implement
immediately and are NOT part of this ADR's gate: a whisper local model-size switcher (see
PRD-FR-01-stt-backend-options.md) and a "Custom (local, OpenAI-compatible)" translation
provider entry for LM Studio-style local servers (loopback-only, zero egress). Both proceed
independently of this ADR. This ADR concerns ONLY the cloud-STT question.

Forces and constraints:

- ADR-002 is Accepted and immutable (protect-adr hook); it cannot be edited directly. A new
  ADR is required to record a superseding decision, and it stays Proposed until the owner
  accepts it - at which point BR-01/NFR-SEC-03 amendments (drafted below) would be applied by
  ba-analyst and ADR-002 would be marked Superseded by ADR-005.
- BR-04: audio p95 < 3s end-to-end, idle < 100MB RAM / < 1% CPU. Any cloud path must be
  evaluated against this budget alongside its egress cost.
- Human-in-the-loop / anti-injection: transcribed text remains DATA, never instructions,
  regardless of which STT backend produced it (agent-guardrails.md section 2).
- Precedent: ADR-004 (OCR) already worked through an owner-gated cloud opt-in for image data;
  this ADR follows the same shape (consent gate, data minimization, revocability, visible
  indicator, security-reviewer pass) applied to audio instead of images.

## Decision

Local whisper.cpp remains the unconditional default and offline fallback for FR-01 (unchanged
from ADR-002). This ADR PROPOSES, subject to owner sign-off of all seven preconditions below,
to add a pluggable cloud STT backend registry behind the existing `SpeechToText` trait, with
every cloud backend default-OFF behind a per-backend informed-consent gate. Until sign-off,
NO cloud STT backend is implemented, and the Settings STT picker shows cloud entries only as
disabled/greyed with a "pending ADR-005 approval" tooltip (see
PRD-FR-01-stt-backend-options.md, FR-01.STT-6).

### Candidate backends

| Backend | Pricing (streaming) | Notes |
|---------|---------------------|-------|
| Google Cloud STT (primary candidate) | $0.016/min | Native streaming; broad ja/vi/en language support |
| Azure AI Speech (primary candidate) | ~$0.0167/min | Real-time streaming; broad ja/vi/en language support |
| OpenAI gpt-realtime-whisper (third candidate) | $0.017/min | True streaming; open question whether to keep as a third candidate or defer (see Open questions) |

Explicitly EXCLUDED from this candidate list: OpenAI `gpt-4o-transcribe` and `whisper-1`.
Neither supports streaming, so neither can serve live captions under FR-01's continuous
overlay model - they would require batch-style request/response that cannot meet the
subtitle-as-you-speak experience, independent of the p95 < 3s budget question.

### Preconditions (all seven required before any cloud-STT implementation begins)

Modeled directly on ADR-004's owner-gated cloud-OCR preconditions:

1. **Local stays the unconditional default and offline fallback.** The app ships fully
   functional with zero cloud STT configuration; local whisper.cpp is always present and
   remains the NFR-REL-03 offline fallback. Cloud STT is opt-in only, never a replacement.
2. **Per-backend informed-consent gate, default-OFF.** The first actual cloud STT call on a
   backend triggers a consent dialog naming, in plain language: (a) exactly what leaves the
   machine - raw audio (not text) from the active session; (b) where it goes - the named
   provider/endpoint; (c) the provider's retention/training posture. Consent is per-backend
   and revocable in Settings at any time.
3. **Data minimization.** Only live session audio is streamed to the backend, never
   persisted; no recording buffer is written to disk on either side of the call; the stream
   stops the instant the session stops or consent is revoked.
4. **Revocable consent.** Revoking consent for a backend immediately stops any in-flight
   streaming to that backend and reverts the active session to local whisper without a crash
   or hang.
5. **Always-visible active-cloud-backend indicator.** Whenever a cloud STT backend is
   streaming, the output surface (overlay) shows which backend is active, consistent with the
   provider-transparency principle already applied to translation providers (FR-03) and cloud
   OCR (ADR-004).
6. **Confidence/latency indicator.** The overlay reflects whichever confidence/latency signal
   the active backend provides, so switching to a cloud backend does not silently degrade the
   BR-05 confidence-flag guarantee that local whisper's segment confidence already satisfies.
7. **Security-reviewer pass per new audio-egress path.** Each new cloud STT backend
   integration requires a dedicated security-reviewer pass before merge (mirrors ADR-004's
   image-egress precondition, applied to audio egress), and is sequenced only AFTER both
   TASK-026 local deliverables - the whisper model-size switcher and the custom local
   translation provider - have shipped.

## Options considered

| Option | Pros | Cons |
|--------|------|------|
| A (chosen framing) Cloud STT as owner-gated opt-in, local stays default | Preserves the ADR-002 privacy default for every user who never opts in; matches the already-accepted-shape precedent (ADR-004); adds capability without forcing an egress trade-off on anyone | Requires a BR-01/NFR-SEC-03 requirement change and owner sign-off before any code lands; two STT code paths to maintain long-term |
| B Cloud STT as the new default, local as fallback | Potentially lower latency/higher accuracy for well-connected users out of the box | Reverses ADR-002's privacy-by-default premise for EVERY user, not just opt-ins; contradicts BR-01's current audio-never-leaves-machine guarantee even for users who never asked for cloud; rejected |
| C Do not pursue cloud STT at all | No requirement change, no new egress surface, no added maintenance burden | Research (tech-researcher, 2026-07-11) found cloud STT not compelling enough today to justify the egress cost for the general case - closest to the current recommendation, but the owner asked to keep the option open as a documented, gated proposal rather than closing it outright |

Research finding informing this framing (tech-researcher, 2026-07-11): cloud STT is not
compelling enough today to justify audio egress for the general FR-01 use case - local
whisper.cpp (particularly the `base` default and the `large-v3-turbo` upgrade path, see
PRD-FR-01-stt-backend-options.md) already covers the latency and accuracy needs for ja/vi/en
on consumer Windows hardware without any egress. This ADR therefore frames cloud STT as a
narrow, owner-gated, opt-in addition rather than a general-purpose alternative - see Open
question (c) below for whether it should be scoped even narrower (a low-power/laptop niche).

## Draft requirement amendments (pending owner sign-off - NOT YET APPLIED)

These are DRAFTS for the owner to review alongside the seven preconditions. They do NOT
modify the live BR-01 row (docs/context/business-rules.md) or the live NFR-SEC-03 row
(docs/specs/07-non-functional-requirements.md) until sign-off. On sign-off, ba-analyst applies
them, adds the docs/specs/13-revision-history.md row, and marks ADR-002 Superseded by ADR-005.

**(a) Draft BR-01 amendment (cloud-STT carve-out, parallel to the existing BR-09 cloud-OCR
carve-out).**

Current live BR-01: "Audio thô không bao giờ rời máy và không bao giờ ghi xuống đĩa. Ảnh chụp
màn hình mặc định không rời máy: OCR mặc định chạy local. Người dùng CÓ THỂ bật một backend
OCR đám mây tuỳ chọn; khi đó chỉ một crop của vùng đã chọn (không phải toàn màn hình), đã thu
nhỏ và loại bỏ metadata, được gửi đến provider người dùng chọn - và chỉ sau khi người dùng
đồng ý qua cổng consent per-backend (xem BR-09). Ngoài trường hợp opt-in này, chỉ TEXT tối
thiểu rời máy."

Draft amended BR-01: "Mặc định, audio thô không bao giờ rời máy và không bao giờ ghi xuống
đĩa: STT chạy local qua whisper.cpp. Người dùng CÓ THỂ bật một backend STT đám mây tuỳ chọn
(xem BR-10); khi đó audio phiên đang hoạt động được stream đến provider người dùng chọn, chỉ
sau khi người dùng đồng ý qua cổng consent per-backend, không bao giờ ghi xuống đĩa ở bất kỳ
phía nào, và dừng ngay khi phiên dừng hoặc consent bị thu hồi. Ảnh chụp màn hình mặc định
không rời máy: OCR mặc định chạy local. Người dùng CÓ THỂ bật một backend OCR đám mây tuỳ
chọn theo cùng cơ chế (xem BR-09). Ngoài hai trường hợp opt-in này, chỉ TEXT tối thiểu rời
máy."

**(b) Draft NFR-SEC-03 amendment.**

Current live NFR-SEC-03: "Audio thô: chỉ trong RAM phiên, không ghi đĩa, không rời máy. Ảnh
chụp màn hình: chỉ trong RAM phiên, không ghi đĩa; MẶC ĐỊNH không rời máy (OCR local). Nếu
người dùng bật backend OCR đám mây (opt-in, consent per-backend theo BR-09): chỉ crop vùng đã
chọn - đã thu nhỏ (LLM long-edge <= ~1568px), loại metadata, chỉ trong RAM - được gửi đến
provider đó qua HTTPS; không bao giờ gửi toàn màn hình, không bao giờ ghi đĩa. Mỗi đường
rời-ảnh mới phải qua security-reviewer."

Draft amended NFR-SEC-03: "Audio thô: chỉ trong RAM phiên, không ghi đĩa; MẶC ĐỊNH không rời
máy (STT local). Nếu người dùng bật backend STT đám mây (opt-in, consent per-backend theo
BR-10): audio phiên đang hoạt động được stream qua HTTPS đến provider đó, không bao giờ ghi
đĩa ở phía app, dừng ngay khi phiên dừng hoặc consent bị thu hồi. Ảnh chụp màn hình: chỉ trong
RAM phiên, không ghi đĩa; MẶC ĐỊNH không rời máy (OCR local). Nếu người dùng bật backend OCR
đám mây (opt-in, consent per-backend theo BR-09): chỉ crop vùng đã chọn - đã thu nhỏ (LLM
long-edge <= ~1568px), loại metadata, chỉ trong RAM - được gửi đến provider đó qua HTTPS;
không bao giờ gửi toàn màn hình, không bao giờ ghi đĩa. Mỗi đường rời-audio hoặc rời-ảnh mới
phải qua security-reviewer."

**(c) Draft new business rule BR-10 (cloud-STT consent), modeled on BR-09's structure.**

Draft BR-10: "STT đám mây là opt-in per-backend, mặc định TẮT. Lần đầu một backend đám mây
thực sự stream audio, hệ thống hiện dialog consent nêu rõ: (1) cái gì rời máy - audio thô của
phiên đang hoạt động (không phải text); (2) đi đâu - tên provider/endpoint; (3) chính sách
lưu giữ/huấn luyện của provider. Consent thu hồi được trong Settings bất kỳ lúc nào; thu hồi
dừng ngay việc stream. Khi backend đám mây đang hoạt động luôn có chỉ báo hiển thị tên backend
trên overlay. Nguồn: quyết định chủ dự án <ngày sign-off>; ADR-005."

**(d) Draft docs/specs/13-revision-history.md row (added ONLY on sign-off).**

"| 1.3 | \<ngày sign-off\> | ba-analyst (TASK-026) | Quyết định chủ dự án cho phép backend STT
đám mây tuỳ chọn (opt-in, consent per-backend): sửa BR-01, NFR-SEC-03; thêm BR-10 (consent STT
đám mây); ADR-002 chuyển Superseded by ADR-005. STT local whisper.cpp vẫn là mặc định và
fallback offline. Chi tiết ở ADR-005. |"

## Open questions for the owner

(a) Is Azure's dedicated speech-translation endpoint (~$2.50/hr, merges STT+translate and
bypasses the FR-03 provider layer entirely) in or out of scope for this ADR? It would be a
structurally different integration than the STT-only candidates above.

(b) Keep OpenAI gpt-realtime-whisper as a third candidate alongside Google Cloud STT and Azure
AI Speech, or defer it and evaluate only two candidates for the initial cloud-STT rollout?

(c) Should cloud STT be scoped narrowly to a low-power/laptop niche (users whose hardware
cannot run local whisper within the p95 < 3s budget) rather than offered as a general
alternative to local whisper, given research found cloud not compelling enough today to
justify the egress for the general case?

## Consequences

- Positive: keeps ADR-002's local-first privacy default intact for every user who never opts
  in; gives the owner a documented, one-read decision package instead of an ad hoc discussion;
  reuses the already-proven ADR-004 consent-gate shape rather than inventing a new one;
  batch-only OpenAI transcription models are correctly excluded up front, narrowing the actual
  decision to genuine streaming candidates.
- Negative / trade-off: if accepted, this ADR permanently changes BR-01's meaning from an
  unconditional guarantee to a default-with-opt-in guarantee, which is a materially higher-
  stakes amendment than the cloud-OCR one (raw audio is a broader/more continuous signal than
  a single screenshot crop); maintaining a second STT code path adds long-term surface area;
  three unresolved open questions (scope, candidate count, niche-vs-general framing) must be
  answered before implementation can be scoped precisely.
- Follow-up work: TASK-026's two local deliverables (whisper model-size switcher, custom local
  translation provider) proceed immediately and are unaffected by this ADR's outcome. Cloud
  STT implementation, if authorized, is a new task sequenced strictly after both local
  deliverables ship, with its own security-reviewer pass per backend.

## References

- docs/context/business-rules.md (BR-01, BR-04, BR-05, BR-09)
- docs/specs/07-non-functional-requirements.md (NFR-SEC-03, NFR-PERF, NFR-REL-03)
- docs/architecture/decisions/ADR-002-local-whisper-stt.md (Accepted premise this ADR would
  supersede if accepted)
- docs/architecture/decisions/ADR-004-pluggable-ocr-backends.md (structural precedent for the
  owner-gated cloud-opt-in consent pattern)
- docs/requirements/PRD-FR-01-stt-backend-options.md (local model-size switcher and custom
  local translation provider, cleared for immediate implementation independent of this ADR)
- docs/tasks/active/TASK-026-stt-backend-options.md (tech-researcher evidence, 2026-07-11)
- .claude/rules/security-privacy.md, .claude/rules/human-in-the-loop.md
