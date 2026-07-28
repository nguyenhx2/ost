# Domain model - OST

Chủ sở hữu: `domain-modeler`. Tài liệu này là NGUỒN SỰ THẬT cho ranh giới module: bounded context
nào sở hữu path nào, ngôn ngữ chung (ubiquitous language) của từng context, và hợp đồng
anti-corruption layer (ACL) giữa các context. `.claude/rules/domain-model.md` là bản rút gọn có
hiệu lực bắt buộc (agent nào cũng phải tuân); file này là bản đầy đủ, cập nhật khi ranh giới thay
đổi.

OST không có database quan hệ, nên "domain model" ở đây không phải ERD - nó là bản đồ context
(context map) và hợp đồng giữa các module Rust/TS thực tế trong repo.

## Bản đồ bounded context

| Loại | Context | Sở hữu (path thật) | Ngôn ngữ chung | Agent sở hữu |
|---|---|---|---|---|
| Core | Recognition | `src-tauri/src/ocr/`, `src-tauri/src/stt/` | Recognition, Segment, Confidence, Fidelity (Full/Degraded) | `recognition-dev` |
| Core | Translation | `src-tauri/src/providers/`, `src-tauri/src/llm/` | TranslationProposal, Provider, Model, Prompt, GenerationParams | `translation-dev` |
| Supporting | Capture | `src-tauri/src/capture/`, `src-tauri/src/audio/` | Region, Monitor, AudioFrame, VAD, Chunk, CaptureSession | `capture-dev` |
| Supporting | Presentation | `src/` | Overlay, Caption, Preview, Proposal | `presentation-dev` |
| Generic | Model Lifecycle | `src-tauri/src/models/` | ModelArtifact, Consent, Disclosure, Digest | `platform-dev` |
| Generic | Platform Shell | `src-tauri/src/shell/`, `src-tauri/src/commands/`, `src-tauri/src/keys/`, `src-tauri/src/core/` (shared kernel), `src-tauri/src/lib.rs`, `src-tauri/src/main.rs` | Window, Tray, Hotkey, IPC contract, ProviderKey | `platform-dev` |

**Core** = logic tạo khác biệt cạnh tranh của sản phẩm (nhận dạng chữ/tiếng nói, tạo bản dịch).
**Supporting** = cần thiết nhưng không tạo khác biệt (capture chỉ đưa dữ liệu thô vào; presentation
chỉ hiển thị). **Generic** = bài toán hạ tầng mọi desktop app đều có (quản lý model tải về, cửa sổ/
tray/hotkey, lưu key) - được thiết kế ở mức hạ tầng, không cần đầu tư thiết kế sản phẩm.

## Nguyên tắc duy nhất khiến đây là DDD, không phải đặt tên lại

**Các context chỉ giao tiếp qua hợp đồng đã công bố (published contract), không bao giờ đọc/gọi
thẳng vào nội bộ của context khác.** ACL đã tồn tại sẵn trong code dưới dạng trait:
`TranslationProvider`, `OcrEngine`, `SpeechToText`, `ScreenCapturer`, `AudioSource`, cộng với hợp
đồng IPC Tauri tại `docs/architecture/api-contracts/`. Một thay đổi import thẳng một hàm/struct/
module-path từ thư mục của context khác - thay vì đi qua trait hoặc lớp IPC - là vi phạm ranh giới,
bất kể có compile/test pass hay không. `code-reviewer` và `security-reviewer` kiểm tra điều này
trên mọi diff, dựa vào bảng trên.

### Luồng dữ liệu qua các context (khớp `docs/architecture/system-overview.md`)

- **FR-01 audio**: Capture (`audio/` - WASAPI loopback + VAD + chunk) -> Recognition (`stt/` -
  whisper.cpp local, sinh `Segment` có `Confidence`/`Fidelity`) -> Translation (`providers/`/`llm/`
  - sinh `TranslationProposal`) -> Presentation (`src/` - overlay phụ đề song ngữ).
- **FR-02 vùng màn hình**: Capture (`capture/` - chọn vùng, chụp) -> Recognition (`ocr/` - sinh
  `Segment`) -> Translation -> Presentation (preview + overlay).
- **FR-03 keys**: Presentation (Settings UI) -> IPC (Platform Shell `commands/`) -> Platform Shell
  `keys/` -> Credential Manager. Translation KHÔNG tự lưu key - nó gọi API đã công bố của Platform
  Shell để lấy key lúc cần, không sở hữu module `keys/`.

## Shared kernel: `src-tauri/src/core/`

Ngoại lệ DDD hẹp, có chủ đích: `core::session::HeavySessionCoordinator` thực thi nguyên tắc "tối đa
MỘT bộ model nặng resident cùng lúc" (BR-04) giữa Recognition (phiên OCR) và Capture (phiên audio/
STT theo nghĩa rộng của pipeline) - Recognition và Capture đăng ký `Unloader` closure vào đây thay
vì tự triển khai lại logic; `core::resource::ProcessResourceProbe` là probe đo RAM/CPU dùng để xác
minh NFR-PERF (idle < 100MB/1% CPU) cho toàn app, không thuộc riêng context nào. Cả hai module sở
hữu bởi `platform-dev`. KHÔNG thêm shared kernel thứ hai mà không có sign-off của `domain-modeler`
ghi lại tại đây - đây chính là kiểu tích tụ biến một ngoại lệ hẹp thành god-module.

## Khi nào cần tư vấn `domain-modeler`

Điều phối viên (`orchestrator`) dispatch `domain-modeler` TRƯỚC khi viết code, khi một task:

- chạm vào module thuộc sở hữu của hai context khác nhau trong bảng trên,
- cần một trait thêm method mới, hoặc hợp đồng IPC thêm command/field mới,
- đưa vào một khái niệm chưa có dòng trong ngôn ngữ chung của context nào.

Một dev agent gặp một trong ba tình huống trên giữa chừng task thì DỪNG và báo cáo cho orchestrator
thay vì tự đoán hợp đồng và hy vọng phía bên kia khớp.

## Lịch sử tái tổ chức

Trước đây (tới 2026-07) roster nhóm agent theo FR: `audio-pipeline-dev` sở hữu `audio/`+`stt/`,
`screen-translate-dev` sở hữu `capture/`+`ocr/`, `llm-integration-dev` sở hữu `providers/`+`keys/`,
`frontend-ui-dev` sở hữu `src/`+`shell/`. Việc tái tổ chức theo DDD (2026-07-28) tách lại theo
context: STT rời khỏi audio-pipeline sang Recognition (cùng OCR); `keys/` rời khỏi Translation sang
Platform Shell (cùng `shell/`); `llm/` (managed local engine, ADR-006) nhập vào Translation cùng
`providers/`. Lý do: Capture (thu thập dữ liệu thô) và Recognition (biến dữ liệu thô thành text) là
hai mối quan tâm khác nhau dù trước đây bị nhóm chung theo FR; key storage là hạ tầng nền tảng
(Generic), không phải logic dịch thuật (Core) dù trước đây bị nhóm chung theo module Rust liền kề.
