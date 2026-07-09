# API contracts - OST

Một file cho mỗi domain contract, cập nhật TRONG CÙNG PR với thay đổi contract:

- `ipc.md` - hợp đồng Tauri IPC (commands + events) giữa WebView và Rust core (chủ sở hữu:
  dev agent của domain bị chạm + frontend-ui-dev đồng bộ). Đã có: bề mặt IPC vùng dịch
  (region) do TASK-008 giới thiệu.
- `providers.md` - trait `TranslationProvider` và hành vi chung của các provider client
  (chủ sở hữu: llm-integration-dev). Chưa có - tạo cùng TASK-006.
