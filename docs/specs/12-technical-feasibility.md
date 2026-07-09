---
title: "12 - Kha thi ky thuat"
sidebar_label: "12 Feasibility"
description: "Danh gia kha thi theo tung FR, rui ro va khuyen nghi PoC cua OST."
tags: [specs, feasibility, risks]
---

# 12 - Khả thi kỹ thuật {#technical-feasibility}

## Bảng khả thi theo FR {#feasibility-table}

| FR | Khả thi | Lý do / phụ thuộc |
|----|---------|-------------------|
| [FR-01](05-functional-requirements.md#fr-01) | Yes | WASAPI loopback (cpal/wasapi) + whisper-rs là stack đã kiểm chứng trong hệ sinh thái Rust; ADR-002 ước tính độ trễ 1.5-3s trong budget p95 < 3s; rủi ro chính là máy yếu (R-01) và chất lượng model nhỏ |
| [FR-02](05-functional-requirements.md#fr-02) | Partial | Capture (xcap/WGC) khả thi rõ; phần OCR CHƯA chốt engine ([OI-01](11-assumptions-constraints.md#oi-01)) - budget p95 < 2s chỉ khẳng định được sau bakeoff TASK-005 |
| [FR-03](05-functional-requirements.md#fr-03) | Yes | keyring crate + 4 REST API text đơn giản; trait chung đã định hình trong coding-standards; fallback là logic thuần |
| [FR-04](05-functional-requirements.md#fr-04) | Yes | Tauri 2 hỗ trợ sẵn tray, global shortcut, multi-window overlay; lịch sử text-only là file I/O đơn giản; i18n chuẩn ngành |
| [FR-05](05-functional-requirements.md#fr-05) | Yes | Tauri idle ~10-40MB (ADR-001) chừa dư budget 100MB; rủi ro nằm ở giữ CPU < 1% khi model whisper đã nạp (R-02) |

## Rủi ro chính

| ID | Rủi ro | FR | Giảm thiểu |
|----|--------|----|------------|
| R-01 | Máy không GPU/CPU yếu khiến whisper vượt budget 3s | FR-01 | First-run dò phần cứng gợi ý model nhỏ (AC-01.8); benchmark criterion gate CI (AC-05.5) |
| R-02 | Giữ model whisper trong RAM xung đột budget idle < 100MB | FR-01, FR-05 | Nạp model khi phiên bắt đầu, giải phóng khi dừng (AC-05.4); đo thực nghiệm sớm |
| R-03 | Nội dung DRM/protected (một số app phát) không capture được qua loopback hoặc màn hình đen khi capture | FR-01, FR-02 | Thông báo lỗi rõ ràng cho người dùng; ghi vào known-issues khi gặp |
| R-04 | Chất lượng/tốc độ OCR không đạt p95 < 2s | FR-02 | Bakeoff TASK-005 với tiêu chí đo cụ thể trước khi viết pipeline (OI-01) |
| R-05 | Rate limit / quota provider làm đứt phiên dịch dài | FR-03 | Fallback theo thứ tự người dùng (AC-03.6); gộp segment hợp lý để giảm số lệnh gọi |
| R-06 | Overlay always-on-top không hiển thị trên game fullscreen exclusive | FR-01, FR-02 | Khuyến nghị borderless windowed; ghi nhận hạn chế trong tài liệu người dùng |
| R-07 | Prompt injection từ nội dung capture (text dạng chỉ thị trong audio/màn hình) | FR-01..FR-03 | Tách chỉ thị/dữ liệu trong prompt, schema-validate, render plain text ([NFR-SEC-06](07-non-functional-requirements.md#nfr-security)) |

## Khuyến nghị PoC (trước hoặc trong Phase 1)

1. PoC-01: đo độ trễ đầu-cuối loopback -> whisper (tiny/base/small) -> mock provider trên
   máy dev, xác nhận budget AC-01.2 và mức RAM/CPU khi phiên chạy (R-01, R-02).
2. PoC-02: bakeoff OCR (TASK-005) - Windows.Media.Ocr vs Tesseract vs PaddleOCR trên bộ
   ảnh cố định (UI game, phụ đề, text nhỏ), đo độ chính xác + thời gian, chốt bằng ADR
   (OI-01, R-04).
3. PoC-03: overlay luôn-trên-cùng qua các chế độ hiển thị (windowed, borderless,
   fullscreen exclusive) để lượng hoá R-06.

## Kết luận

MVP khả thi với stack đã chốt (ADR-001..003). Điểm chưa khẳng định duy nhất ở mức yêu cầu
là engine OCR (FR-02 - Partial); mọi FR khác là Yes với rủi ro đã có phương án giảm thiểu
và được benchmark gate trong CI.
