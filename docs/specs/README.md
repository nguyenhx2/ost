# Specs - OST

Thư mục này thuộc về skill `spec-builder` (cấu trúc BA 13 phần). CHƯA có specs chính thức -
TASK-003 trong master-plan là chạy spec-builder để chi tiết hoá 5 FR hạt giống:

| FR | Tên | Mô tả một dòng |
|----|-----|----------------|
| FR-01 | Dịch audio hệ thống trực tiếp | Capture WASAPI loopback -> VAD/chunk -> whisper.cpp local -> LLM dịch -> overlay phụ đề song ngữ |
| FR-02 | Dịch vùng màn hình có preview | Người dùng chọn vùng bất kỳ -> capture -> OCR -> LLM dịch -> preview overlay, cập nhật trực tiếp |
| FR-03 | Đa provider AI bằng API key | Gemini / Claude (Anthropic) / OpenAI / OpenRouter qua một trait chung; key lưu trong OS keychain; chọn model, fallback |
| FR-04 | Tương tác tối đa | Global hotkeys, system tray, overlay pin/copy/dismiss, lịch sử phiên, i18n Việt-Anh |
| FR-05 | Chạy ngầm + hiệu năng | Nền tray, budget: audio p95 < 3s, vùng màn hình p95 < 2s, idle RAM < 100MB / CPU < 1% |

KHÔNG tự bịa cấu trúc 13 phần ở đây - luôn dùng spec-builder. Mọi thay đổi yêu cầu ghi vào
`13-revision-history.md` (hook sẽ nhắc).
