# Domain glossary - OST

| Thuật ngữ | Định nghĩa | Đồng nghĩa |
|-----------|------------|------------|
| Loopback capture | Bắt audio đang PHÁT RA loa/tai nghe của hệ thống (không phải micro), trên Windows qua WASAPI loopback | system audio capture |
| VAD | Voice Activity Detection - phát hiện đoạn có tiếng nói để cắt chunk gửi STT, bỏ qua khoảng lặng | voice activity detection |
| STT | Speech-to-text - chuyển audio thành văn bản; trong OST chạy local bằng whisper.cpp | ASR, transcription |
| Region translate | Luồng FR-02: chọn vùng màn hình -> capture -> OCR -> dịch -> preview | screen translate |
| Overlay | Cửa sổ always-on-top hiển thị kết quả dịch (phụ đề audio hoặc preview vùng) | caption window |
| Provider | Một dịch vụ LLM có API key do người dùng cung cấp: Gemini, Anthropic (Claude), OpenAI, OpenRouter | LLM provider |
| TranslationProvider | Trait Rust chung mọi provider client phải implement | provider trait |
| Keychain / Credential Manager | Kho credential của OS nơi DUY NHẤT lưu API key (qua keyring crate) | OS keychain |
| Session | Một phiên dịch đang chạy (audio session hoặc region session) | translation session |
| Hạt giống FR | 5 FR sơ bộ từ intake, chờ spec-builder chi tiết hoá (TASK-003) | seed FR |
