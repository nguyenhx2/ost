# Known issues - OST

| Vấn đề | Workaround | Trạng thái | Phát hiện |
|--------|-----------|------------|-----------|
| Rust toolchain chưa cài trên máy dev (cargo/rustc not found) | Đã cài rustup 1.96.1 (TASK-001) | Resolved 2026-07-09 | 2026-07-09 |
| rustc không tự tìm được MSVC link.exe từ Git Bash: GNU `link` (coreutils) che PATH; PATH sạch thì vswhere-detect cũng fail với VS 18 Enterprise | Mọi lệnh cargo trong agent shell bọc qua vcvars64: `cmd //c "\"C:\Program Files\Microsoft Visual Studio\18\Enterprise\VC\Auxiliary\Build\vcvars64.bat\" >nul 2>&1 && set PATH=%USERPROFILE%\.cargo\bin;%PATH% && cargo <args>"` | Open (workaround ổn định) | 2026-07-09 |
| `~/.cargo/bin` không có trong PATH của Git Bash session | `export PATH="$USERPROFILE/.cargo/bin:$PATH"` hoặc dùng cmd wrapper ở trên | Open | 2026-07-09 |
| tauri-driver (e2e) còn hạn chế trên Windows - đánh giá lại khi wire e2e | Ưu tiên unit/integration; e2e smoke thủ công tạm thời | Open | 2026-07-09 |
