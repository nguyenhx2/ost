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
| Chunk | Đoạn audio ~1-3 giây do VAD cắt ra, đơn vị đầu vào của STT | audio segment |
| Whisper model | File model ggml của whisper.cpp (tiny..large), tải về `models/` lần chạy đầu sau khi người dùng xác nhận (BR-08) | ggml model |
| OCR | Nhận dạng văn bản từ ảnh chụp vùng màn hình; engine chưa chốt (OI-01, TASK-005) | text recognition |
| Overlay pin | Ghim overlay: giữ overlay hiển thị cố định tại vị trí đã đặt, không tự ẩn | pin |
| Ngôn ngữ nguồn / đích | Nguồn: auto-detect mặc định, ghim được; đích: cấu hình được, mặc định tiếng Việt (BR-07) | source / target language |
| Provider fallback | Thứ tự dự phòng người dùng định nghĩa; provider lỗi thì thử provider kế tiếp, badge hiển thị provider thực dùng | fallback order |
| Masked key status | Trạng thái "đã có key / chưa có key" - thông tin duy nhất về key mà WebView được thấy (BR-02) | key presence |
| Lịch sử dịch | Bản ghi TEXT-ONLY các lượt dịch, lưu local, bật mặc định, xoá toàn bộ được, tắt được (BR-06) | translation history |
| Confidence flag | Đánh dấu hiển thị rõ cho đoạn STT/OCR có độ tin cậy dưới ngưỡng (BR-05) | uncertainty marker |
| Global hotkey | Phím tắt toàn cục hoạt động cả khi ứng dụng khác đang focus | system-wide shortcut |
