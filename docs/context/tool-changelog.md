# Tool changelog - OST

Nhật ký thay đổi dependency/tool/infra (cái gì, vì sao, kiểm chứng thế nào).

## 2026-07-09

- Bootstrap workspace AI-agent bằng skill `project-bootstrap` (greenfield): tạo `.claude/`
  (settings + 6 hooks PowerShell + 13 rules + 15 agents + 10 commands), cây `docs/`,
  CLAUDE.md / AGENTS.md / README.md, `.env.example`, CI skeleton, git init nhánh `main`
  với identity local `nguyenhx2 <nguyenhx1@gmail.com>`. Kiểm chứng: hooks test bằng JSON
  payload (block exit 2 / allow exit 0); smoke test vòng đời task trên TASK-001.
- Môi trường dev ghi nhận: Windows 11, Node v22.17.0, git 2.48.1; Rust toolchain CHƯA có
  (TASK-001).
- Thêm dependency trực tiếp `url = "2.5.8"` (src-tauri) - trước đây là transitive dep qua
  reqwest, nay pin trực tiếp để `providers/config.rs::base_url_is_allowed` parse host bằng
  `url` crate thay vì tách chuỗi thủ công (chặn kiểu userinfo `http://localhost:8080@evil.com`
  bypass loopback check). Kiểm chứng: `cargo clippy -- -D warnings` sạch, `cargo test` xanh
  (thêm test userinfo/ipv6/malformed). Refs: FR-03, TASK-006.
