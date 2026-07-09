# Docs - OST (On-Screen Translator)

Tài liệu thiết kế cho cả người và AI agents. Mức độ đọc theo thư mục:

| Thư mục | Mức đọc | Nội dung |
|---------|---------|----------|
| specs/ | ALWAYS | Phân tích BA 13 phần - nguồn chân lý cho yêu cầu (FR, NFR, quy tắc nghiệp vụ) |
| requirements/ | ALWAYS | PRD - một file cho mỗi tính năng, chi tiết hoá một FR cho sprint |
| architecture/decisions/ | ALWAYS | ADR - bất biến sau khi Accepted |
| architecture/system-overview.md | ALWAYS | Kiến trúc tổng quan (Mermaid) |
| architecture/api-contracts/ | ON-DEMAND | Hợp đồng IPC/provider theo domain; cập nhật khi contract đổi |
| tasks/active/ + pending/ + done/ | MANUAL | Task files + AI session log (100% tiếng Anh) |
| context/ | ON-DEMAND | Bộ nhớ dài hạn của AI: glossary, business-rules, known-issues, tool-changelog |
| templates/ | MANUAL | Template cho TASK / PRD / ADR mới |

## Luồng chuẩn

1. Yêu cầu mới -> cập nhật specs/ (ba-analyst) -> tạo/cập nhật PRD trong requirements/.
2. Quyết định kỹ thuật lớn -> ADR trong architecture/decisions/ (/new-adr).
3. Công việc sprint -> TASK trong tasks/active/ (/new-task) -> agents làm việc và ghi session log.
4. Xong -> chuyển task sang tasks/done/, cập nhật context/ (/sync-context).

Hợp đồng agent: xem CLAUDE.md (repo root) và .claude/rules/.

Ngôn ngữ: prose tiếng Việt; task files, master-plan và ADR 100% tiếng Anh; code/enum/tên file
luôn tiếng Anh.
