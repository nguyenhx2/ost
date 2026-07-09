---
title: "Specs OST - Muc luc"
sidebar_label: "Specs README"
description: "Muc luc bo tai lieu phan tich nghiep vu 13 phan cua OST (On-Screen Translator)."
tags: [specs, readme, toc]
---

# Bộ specs OST (On-Screen Translator)

OST là ứng dụng desktop (Windows trước tiên) dịch trực tiếp audio hệ thống và vùng màn hình
do người dùng chọn, hiển thị kết quả qua overlay độ trễ thấp. Người dùng tự cung cấp API key
của provider AI (Gemini, Anthropic, OpenAI, OpenRouter), key chỉ nằm trong OS keychain.

Bộ tài liệu này là **nguồn chân lý về yêu cầu** (source of truth). Mọi tính năng phải map về
một FR và đạt tiêu chí chấp nhận của FR đó. Thay đổi yêu cầu phải được ghi vào
[13-revision-history.md](13-revision-history.md).

## Bảng tóm tắt FR

| FR | Tên | Mô tả một dòng | Ưu tiên |
|----|-----|----------------|---------|
| [FR-01](05-functional-requirements.md#fr-01) | Dịch audio hệ thống trực tiếp | Capture WASAPI loopback -> VAD/chunk -> whisper.cpp local -> LLM dịch -> overlay phụ đề song ngữ | Must |
| [FR-02](05-functional-requirements.md#fr-02) | Dịch vùng màn hình có preview | Người dùng chọn vùng bất kỳ -> capture -> OCR -> LLM dịch -> preview overlay, cập nhật trực tiếp | Must |
| [FR-03](05-functional-requirements.md#fr-03) | Đa provider AI bằng API key | Gemini / Claude (Anthropic) / OpenAI / OpenRouter qua một trait chung; key lưu trong OS keychain; chọn model, fallback | Must |
| [FR-04](05-functional-requirements.md#fr-04) | Tương tác tối đa | Global hotkeys, system tray, overlay pin/copy/dismiss, lịch sử dịch, i18n Việt-Anh | Must |
| [FR-05](05-functional-requirements.md#fr-05) | Chạy ngầm + hiệu năng | Nền tray; budget: audio p95 < 3s, vùng màn hình p95 < 2s, idle RAM < 100MB / CPU < 1% | Must |

## Mục lục

| Phần | Nội dung |
|------|----------|
| [01-overview.md](01-overview.md) | Bối cảnh, vấn đề, mục tiêu, phạm vi, chỉ số thành công |
| [02-stakeholders.md](02-stakeholders.md) | Các bên liên quan và mức ảnh hưởng |
| [03-glossary.md](03-glossary.md) | Thuật ngữ miền - từ vựng chống ảo giác |
| [04-business-flows.md](04-business-flows.md) | Luồng nghiệp vụ đầu-cuối (Mermaid) |
| [05-functional-requirements.md](05-functional-requirements.md) | FR-01..FR-05, use case, user story |
| [06-access-control.md](06-access-control.md) | Phân quyền và ranh giới truy cập key |
| [07-non-functional-requirements.md](07-non-functional-requirements.md) | NFR: hiệu năng, bảo mật, tin cậy, khả dụng, mở rộng |
| [08-data-model.md](08-data-model.md) | Mô hình dữ liệu (ER) + từ điển dữ liệu |
| [09-integration-interface.md](09-integration-interface.md) | Giao diện tích hợp ngoài |
| [10-ui-ux-wireframes.md](10-ui-ux-wireframes.md) | Ghi chú màn hình theo FR |
| [11-assumptions-constraints.md](11-assumptions-constraints.md) | Giả định, ràng buộc, vấn đề mở |
| [12-technical-feasibility.md](12-technical-feasibility.md) | Khả thi kỹ thuật theo FR, rủi ro, PoC |
| [13-revision-history.md](13-revision-history.md) | Lịch sử phiên bản yêu cầu |

## Hướng dẫn đọc

- Dev agent: đọc 05 (FR mình phụ trách) + 07 (NFR) + 11 (ràng buộc) trước khi code.
- Reviewer/spec-guardian: dùng 05 làm hợp đồng khoá; đối chiếu tiêu chí chấp nhận từng số.
- BA: mọi chỉnh sửa đi kèm một dòng trong [13-revision-history.md](13-revision-history.md)
  và đồng bộ PRD trong `docs/requirements/`.

KHÔNG tự bịa cấu trúc mới ngoài 13 phần này - luôn dùng skill `spec-builder`.
