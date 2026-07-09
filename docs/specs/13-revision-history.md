---
title: "13 - Lich su phien ban"
sidebar_label: "13 Revision history"
description: "Lich su phien ban cua bo specs OST. Moi thay doi yeu cau phai co mot dong o day."
tags: [specs, revision-history]
---

# 13 - Lịch sử phiên bản {#revision-history}

Mọi thay đổi yêu cầu (không tính sửa chính tả/định dạng) phải thêm một dòng tại đây và
đồng bộ PRD liên quan trong `docs/requirements/`.

| Phiên bản | Ngày | Tác giả | Tóm tắt thay đổi |
|-----------|------|---------|-------------------|
| 1.0 | 2026-07-09 | ba-analyst (TASK-003) | Phát hành bộ specs 13 phần đầu tiên, chi tiết hoá 5 FR hạt giống từ intake. Bao gồm quyết định sản phẩm 2026-07-09 của chủ dự án: (1) ngôn ngữ nguồn auto-detect + ghim thủ công, ngôn ngữ đích mặc định tiếng Việt (BR-07); (2) lịch sử dịch bật mặc định, text-only, lưu local, xoá toàn bộ được, tắt được (BR-06); (3) first-run dò phần cứng gợi ý model whisper, tải sau xác nhận (BR-08). Vấn đề mở OI-01..OI-07 ghi tại [11-assumptions-constraints.md](11-assumptions-constraints.md). |
| 1.0 (sign-off) | 2026-07-09 | chủ dự án | Phê duyệt 6 lượng hoá do BA suy diễn trong v1.0: AC-01.10 (dừng capture <= 1s), AC-05.4 (về idle trong 60s), NFR-PERF-03 (idle đo trung bình 5 phút), AC-01.2 (benchmark phiên >= 10 phút), AC-02.4 (p95 < 2s cho cả live-update), AC-04.1 (3 hành động hotkey mặc định; combo cụ thể vẫn mở tại OI-04). Không thay đổi nội dung yêu cầu. |
| 1.1 | 2026-07-09 | ba-analyst (TASK-005) | Quyết định chủ dự án cho phép backend OCR đám mây tuỳ chọn (opt-in, consent per-backend): sửa BR-01, NFR-SEC-03, AC-02.5, AC-02.6/OI-07, NFR-REL-03; thêm BR-09 (consent OCR đám mây + chặn Gemini free-tier); chốt OI-01 (ADR-004 chọn local PaddleOCR mặc định + backend pluggable); đồng bộ PRD-FR-02. OCR local PaddleOCR vẫn là mặc định và fallback offline. Chi tiết ở ADR-004. |
