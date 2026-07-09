# Known issues - OST

| Vấn đề | Workaround | Trạng thái | Phát hiện |
|--------|-----------|------------|-----------|
| Rust toolchain chưa cài trên máy dev (cargo/rustc not found) | Đã cài rustup 1.96.1 (TASK-001) | Resolved 2026-07-09 | 2026-07-09 |
| rustc không tự tìm được MSVC link.exe từ Git Bash: GNU `link` (coreutils) che PATH; PATH sạch thì vswhere-detect cũng fail với VS 18 Enterprise | Mọi lệnh cargo trong agent shell bọc qua vcvars64: `cmd //c "\"C:\Program Files\Microsoft Visual Studio\18\Enterprise\VC\Auxiliary\Build\vcvars64.bat\" >nul 2>&1 && set PATH=%USERPROFILE%\.cargo\bin;%PATH% && cargo <args>"` | Open (workaround ổn định) | 2026-07-09 |
| `~/.cargo/bin` không có trong PATH của Git Bash session | `export PATH="$USERPROFILE/.cargo/bin:$PATH"` hoặc dùng cmd wrapper ở trên | Open | 2026-07-09 |
| Wrapper vcvars một dòng (`cmd //c "\"...\""`) bị Git Bash phá escape quotes khi chạy từ agent shell | Tạo file `.bat` wrapper (call vcvars64 >nul, prepend `%USERPROFILE%\.cargo\bin`, `cd /d <dir>`, `cargo %*`) rồi gọi `cmd //c <bat> <args>`; background bash không kế thừa repo cwd - luôn `cd /d` tuyệt đối | Open (workaround ổn định) | 2026-07-09 |
| Windows SDK thiếu hoàn toàn trên máy dev (link fail LNK1181 kernel32.lib) dù VS 18 có VC Tools | ĐÃ CÀI Windows 11 SDK 10.0.26100.7705 qua winget (Microsoft.WindowsSDK.10.0.26100) trong TASK-002 | Resolved 2026-07-09 | 2026-07-09 |
| Compile Rust song song có thể lỗi OS 1455 (paging file too small) trên máy này | Chạy lại với `cargo <cmd> -j 2` | Open | 2026-07-09 |
| Sandbox của agent Bash tool chặn kết nối loopback: vite bind được :1420 nhưng mọi kết nối kẹt SYN_RECEIVED (kể cả probe của tauri dev cùng job) | Chạy `npm run tauri dev`/dev server với sandbox tắt (dangerouslyDisableSandbox) hoặc user tự chạy | Open (workaround ổn định) | 2026-07-09 |
| Prettier fail toàn bộ trên GitHub windows runner do autocrlf=true đổi LF->CRLF khi checkout | Đã thêm `.gitattributes` (`* text=auto eol=lf`, bat/ps1 giữ CRLF) | Resolved 2026-07-09 | 2026-07-09 |
| tauri-driver (e2e) còn hạn chế trên Windows - đánh giá lại khi wire e2e | Ưu tiên unit/integration; e2e smoke thủ công tạm thời | Open | 2026-07-09 |
| Branch protection cho `main` không bật được: repo private trên GitHub Free (403 - cần Pro hoặc repo public). Owner quyết định defer (2026-07-09) | Kỷ luật local: hook guard-main-commit chặn commit/push thẳng main; quy tắc no-self-merge trong git-workflow.md. Bật lại khi repo public hoặc nâng gói | Deferred | 2026-07-09 |
