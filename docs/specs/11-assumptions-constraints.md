---
title: "11 - Gia dinh, rang buoc, van de mo"
sidebar_label: "11 Assumptions"
description: "Gia dinh (AS), rang buoc (CT) va van de mo (OI) cua OST, moi muc co ID."
tags: [specs, assumptions, constraints, open-issues]
---

# 11 - Giả định, ràng buộc, vấn đề mở {#assumptions-constraints}

Nguyên tắc: không bịa yêu cầu. Mọi thứ chưa được quyết định rõ nằm ở đây với ID; khi được
chốt, chuyển vào FR/NFR/BR tương ứng và ghi vào
[13-revision-history.md](13-revision-history.md).

## Giả định (AS)

| ID | Giả định | Ảnh hưởng nếu sai |
|----|----------|-------------------|
| AS-01 {#as-01} | Một người dùng, một máy; không đồng bộ đa máy, không tài khoản | Nếu cần sync -> thiết kế lại lưu trữ + ADR mới |
| AS-02 {#as-02} | Người dùng tự có API key hợp lệ của ít nhất một provider và tự chịu chi phí | Không có key -> chỉ STT/OCR local hoạt động, không dịch được |
| AS-03 {#as-03} | Máy đích: Windows 10/11 x64, có WebView2; đủ CPU/RAM chạy tối thiểu model whisper tiny | Máy quá yếu -> độ trễ vượt budget; cần thông báo rõ ở first-run |
| AS-04 {#as-04} | Nhận diện ngôn ngữ tự động của whisper đủ tin cậy cho các ngôn ngữ phổ biến; trường hợp sai đã có cơ chế ghim (BR-07) | Auto sai nhiều -> cân nhắc mặc định ghim theo lựa chọn người dùng |
| AS-05 {#as-05} | Cần internet cho phần dịch LLM; STT local chạy không cần mạng (NFR-REL-03) | - |
| AS-06 {#as-06} | Model whisper tải từ nguồn ggml chính thức của hệ sinh thái whisper.cpp qua HTTPS, có kiểm toàn vẹn | Nguồn thay đổi -> cập nhật downloader; xem OI-03 |

## Ràng buộc (CT)

| ID | Ràng buộc | Nguồn |
|----|-----------|-------|
| CT-01 {#ct-01} | Stack cố định: Tauri 2 + Rust core + React 19/TS/Vite; đổi stack cần ADR mới | ADR-001 |
| CT-02 {#ct-02} | STT chạy local bằng whisper.cpp; audio thô không rời máy, không ghi đĩa | ADR-002, BR-01 |
| CT-03 {#ct-03} | API key chỉ trong OS keychain qua keyring; WebView chỉ thấy trạng thái masked | ADR-003, BR-02 |
| CT-04 {#ct-04} | Budget hiệu năng là tiêu chí chấp nhận: audio p95 < 3s, vùng p95 < 2s, idle RAM < 100MB / CPU < 1% | BR-04, [NFR-PERF](07-non-functional-requirements.md#nfr-performance) |
| CT-05 {#ct-05} | Human-in-the-loop: bản dịch là đề xuất, không bao giờ tự kích hoạt hành động; đoạn tin cậy thấp phải flag; text capture là dữ liệu không tin cậy (anti-injection) | BR-03, BR-05, human-in-the-loop.md |
| CT-06 {#ct-06} | UI chỉ từ primitives + design token, dark-first, không emoji, icon lucide; text AI render plain text | design-system.md, [NFR-USA-05](07-non-functional-requirements.md#nfr-usability) |
| CT-07 {#ct-07} | Windows ship trước; mọi phụ thuộc OS sau trait để Phase 4 port macOS/Linux | ADR-001, [NFR-SCA-01](07-non-functional-requirements.md#nfr-scalability) |

## Vấn đề mở (OI)

| ID | Vấn đề | Chủ trì / kế hoạch | Trạng thái |
|----|--------|--------------------|------------|
| OI-01 {#oi-01} | Engine OCR: đã chốt tại ADR-004 (2026-07-09) - mặc định local PaddleOCR PP-OCRv5 (oar-ocr/ort) sau trait `OcrEngine`; Windows.Media.Ocr giữ làm R2 fallback + opt-in fast-EN/JA; cloud OCR (Google Vision, Azure Read, multimodal-LLM) opt-in per-backend theo BR-09. Local default spike-gated (R1 <=700ms) là gate đầu của TASK-007 | TASK-005 -> ADR-004 | Đã chốt (2026-07-09) |
| OI-02 {#oi-02} | GitHub remote chưa tạo (repo slug TBD); CI trên GitHub Actions chưa chạy được cho đến khi có remote | TASK-004 | Mở |
| OI-03 {#oi-03} | Nguồn tải model whisper cụ thể (host, mirror, chính sách checksum/resume) chưa chốt | Quyết định khi implement FR-01 first-run (liên quan AS-06, NFR-REL-04) | Mở |
| OI-04 {#oi-04} | Bộ hotkey mặc định cho 3 hành động (toggle audio, chọn vùng, ẩn/hiện overlay) chưa được người dùng chốt | Đề xuất trong PRD-FR-04, xin xác nhận chủ dự án | Mở |
| OI-05 {#oi-05} | Giới hạn lưu giữ lịch sử dịch (số bản ghi / dung lượng / thời gian) chưa quyết; hiện chỉ có xoá toàn bộ thủ công | Đề xuất trong PRD-FR-04 | Mở |
| OI-06 {#oi-06} | Tự khởi động cùng Windows (autostart) có nằm trong MVP không - chưa quyết | Xin quyết định chủ dự án trước Phase 2 | Mở |
| OI-07 {#oi-07} | Ngưỡng confidence cụ thể cho flag STT/OCR (BR-05) chưa có con số; cần hiệu chỉnh bằng thực nghiệm. OCR confidence là enum-tagged (`PerLine(scores)` vs `Unavailable{reason}`, ADR-004); ngưỡng chỉ áp cho nhánh `PerLine`; nhánh `Unavailable` (Windows.Media.Ocr, multimodal-LLM) dùng banner cố định thay vì ngưỡng. R1 spike của TASK-007 đo phân bố confidence để hiệu chỉnh. Confidence không đủ làm tín hiệu khi backend bị chặn charset: trait `OcrEngine` khai báo độ trung thực theo từng ngôn ngữ `Full` vs `Degraded{reason}`, và trạng thái `Degraded` kích hoạt một notice cố định thay vì dựa vào ngưỡng, vì lỗi rơi diacritic mang confidence cao và không vượt ngưỡng `PerLine` | Chốt trong quá trình implement FR-01/FR-02, ghi vào PRD | Mở |
