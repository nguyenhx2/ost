# API contracts - OST

Một file cho mỗi domain contract, cập nhật TRONG CÙNG PR với thay đổi contract:

- `ipc.md` - hợp đồng Tauri IPC (commands + events) giữa WebView và Rust core (chủ sở hữu:
  dev agent của domain bị chạm + frontend-ui-dev đồng bộ).
- `providers.md` - trait `TranslationProvider` và hành vi chung của các provider client
  (chủ sở hữu: llm-integration-dev).

Chưa có file nào - tạo khi contract đầu tiên hình thành (TASK-006, TASK-007).
