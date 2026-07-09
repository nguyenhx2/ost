---
title: "03 - Thuat ngu"
sidebar_label: "03 Glossary"
description: "Tu dien thuat ngu mien cua OST - tu vung chong ao giac cho moi agent."
tags: [specs, glossary]
---

# 03 - Thuật ngữ {#glossary}

Từ vựng chuẩn của dự án. Mọi tài liệu và code dùng đúng các thuật ngữ này; bản đồng bộ rút
gọn nằm ở [docs/context/domain-glossary.md](../context/domain-glossary.md).

| Thuật ngữ | Định nghĩa | Đồng nghĩa |
|-----------|------------|------------|
| Loopback capture | Bắt audio đang PHÁT RA loa/tai nghe của hệ thống (không phải micro), trên Windows qua WASAPI loopback | system audio capture |
| VAD | Voice Activity Detection - phát hiện đoạn có tiếng nói để cắt chunk gửi STT, bỏ qua khoảng lặng | voice activity detection |
| Chunk | Đoạn audio ~1-3 giây do VAD cắt ra, đơn vị đầu vào của STT | audio segment |
| STT | Speech-to-text - chuyển audio thành văn bản; trong OST chạy local bằng whisper.cpp (ADR-002) | ASR, transcription |
| Whisper model | File model ggml của whisper.cpp (tiny/base/small/medium/large), tải về `models/` lần chạy đầu sau khi người dùng xác nhận | ggml model |
| OCR | Optical Character Recognition - nhận dạng văn bản từ ảnh chụp vùng màn hình; engine CHƯA chốt ([OI-01](11-assumptions-constraints.md#oi-01)) | text recognition |
| Region translate | Luồng FR-02: chọn vùng màn hình -> capture -> OCR -> dịch -> preview | screen translate |
| Region session | Phiên dịch vùng đang chạy: vùng được capture lại định kỳ và preview cập nhật trực tiếp | live region |
| Overlay | Cửa sổ always-on-top hiển thị kết quả dịch (phụ đề audio hoặc preview vùng) | caption window |
| Overlay pin | Ghim overlay: giữ overlay hiển thị cố định tại vị trí đã đặt, không tự ẩn khi phiên kết thúc | pin |
| Ngôn ngữ nguồn | Ngôn ngữ của nội dung gốc; mặc định whisper tự nhận diện, người dùng có thể ghim thủ công (BR-07) | source language |
| Ngôn ngữ đích | Ngôn ngữ bản dịch; cấu hình được, mặc định tiếng Việt (BR-07) | target language |
| Provider | Một dịch vụ LLM có API key do người dùng cung cấp: Gemini, Anthropic (Claude), OpenAI, OpenRouter | LLM provider |
| TranslationProvider | Trait Rust chung mọi provider client phải implement | provider trait |
| Provider fallback | Thứ tự dự phòng người dùng định nghĩa: khi provider đang chọn lỗi, hệ thống thử provider kế tiếp và hiển thị rõ provider đã dùng | fallback order |
| Keychain / Credential Manager | Kho credential của OS, nơi DUY NHẤT lưu API key (qua keyring crate, ADR-003) | OS keychain |
| Masked key status | Trạng thái "đã có key / chưa có key" - thông tin duy nhất về key mà WebView được thấy | key presence |
| Session | Một phiên dịch đang chạy (audio session hoặc region session) | translation session |
| Lịch sử dịch | Bản ghi TEXT-ONLY các lượt dịch, lưu local, bật mặc định, có nút xoá toàn bộ, tắt được (BR-06) | translation history |
| Confidence flag | Đánh dấu hiển thị rõ ràng cho đoạn STT/OCR có độ tin cậy dưới ngưỡng (BR-05) | uncertainty marker |
| Global hotkey | Phím tắt toàn cục hoạt động cả khi ứng dụng khác đang focus | system-wide shortcut |
| Tray | Biểu tượng khay hệ thống, điểm điều khiển khi ứng dụng chạy ngầm | system tray |
| Human-in-the-loop | Nguyên tắc: bản dịch AI chỉ là đề xuất cho người dùng, không bao giờ tự kích hoạt hành động (BR-03) | HITL |
| Anti-injection | Nguyên tắc: text từ audio/màn hình/OCR là DỮ LIỆU không tin cậy, không bao giờ được diễn giải như chỉ thị | prompt-injection defense |
| Hạt giống FR | 5 FR sơ bộ từ intake, đã được chi tiết hoá thành [05-functional-requirements.md](05-functional-requirements.md) | seed FR |
