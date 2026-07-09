---
title: "01 - Tong quan"
sidebar_label: "01 Tong quan"
description: "Boi canh, van de, muc tieu, pham vi va chi so thanh cong cua OST."
tags: [specs, overview]
---

# 01 - Tổng quan {#overview}

## Bối cảnh

Người dùng máy tính thường xuyên tiếp xúc nội dung ngoại ngữ theo thời gian thực: video,
livestream, cuộc họp online, game, tài liệu và UI phần mềm không có bản dịch. Các công cụ
dịch hiện có hoặc yêu cầu copy/paste thủ công, hoặc upload audio/màn hình lên cloud (rủi ro
riêng tư, tốn phí theo phút), hoặc chạy nặng nề chiếm tài nguyên máy.

OST (On-Screen Translator) là ứng dụng desktop chạy ngầm, dịch trực tiếp hai nguồn:

1. **Audio hệ thống** (âm thanh đang phát ra loa/tai nghe) - phụ đề song ngữ thời gian thực.
2. **Vùng màn hình bất kỳ** do người dùng chọn - preview dịch cập nhật trực tiếp.

Người dùng tự mang API key của provider AI mình chọn (Gemini, Anthropic, OpenAI,
OpenRouter); ứng dụng không có backend riêng, không thu thập dữ liệu.

## Vấn đề

- Không có cách xem phụ đề dịch thời gian thực cho MỌI nguồn audio trên máy (không phụ
  thuộc ứng dụng phát) mà audio không rời máy.
- Dịch nội dung trên màn hình (game, app, ảnh) đòi hỏi chụp - upload - paste thủ công,
  chậm và đứt mạch làm việc.
- Các giải pháp cloud toàn phần đắt (phí audio theo phút) và đẩy nội dung nhạy cảm ra ngoài.

## Mục tiêu

| # | Mục tiêu | Đo bằng |
|---|----------|---------|
| G1 | Phụ đề dịch audio hệ thống thời gian thực, độ trễ chấp nhận được | Audio end-to-end p95 < 3s ([NFR-PERF-01](07-non-functional-requirements.md#nfr-performance)) |
| G2 | Dịch vùng màn hình tức thì với preview | Từ lúc chốt vùng đến khi có bản dịch p95 < 2s ([NFR-PERF-02](07-non-functional-requirements.md#nfr-performance)) |
| G3 | Chạy ngầm không cản trở máy | Idle RAM < 100MB, CPU < 1% ([NFR-PERF-03](07-non-functional-requirements.md#nfr-performance)) |
| G4 | Riêng tư mặc định | Audio/ảnh chụp không bao giờ rời máy hoặc ghi đĩa; chỉ TEXT tối thiểu đến provider ([NFR-SEC](07-non-functional-requirements.md#nfr-security)) |
| G5 | Người dùng toàn quyền với chi phí AI | Key tự cung cấp, chọn provider/model, fallback ([FR-03](05-functional-requirements.md#fr-03)) |

## Phạm vi

### Trong phạm vi (MVP - Windows)

- Dịch audio hệ thống trực tiếp: WASAPI loopback -> VAD/chunk -> whisper.cpp local -> LLM
  dịch -> overlay phụ đề song ngữ ([FR-01](05-functional-requirements.md#fr-01)).
- Dịch vùng màn hình có preview cập nhật trực tiếp ([FR-02](05-functional-requirements.md#fr-02)).
- Bốn provider LLM qua API key người dùng, lưu OS keychain, chọn model, fallback
  ([FR-03](05-functional-requirements.md#fr-03)).
- Global hotkeys, system tray, overlay pin/copy/dismiss, lịch sử dịch text-only (bật mặc
  định, xoá được), i18n Việt-Anh ([FR-04](05-functional-requirements.md#fr-04)).
- Chạy ngầm dưới budget hiệu năng nghiêm ngặt ([FR-05](05-functional-requirements.md#fr-05)).
- Chọn model whisper lần chạy đầu theo gợi ý phần cứng, người dùng xác nhận tải.

### Ngoài phạm vi (MVP)

- macOS / Linux (Phase 4 - kiến trúc trait đã chừa sẵn chỗ).
- STT cloud realtime (ADR-002 ghi nhận là ADR mới trong tương lai nếu cần).
- Dịch micro (giọng của chính người dùng) - chỉ loopback audio hệ thống.
- Telemetry, tài khoản người dùng, đồng bộ đa máy, backend riêng.
- Tự động thao tác vào ứng dụng khác (auto-type/click/send) - cấm vĩnh viễn theo
  [BR-03](../context/business-rules.md).
- OCR tài liệu hàng loạt / dịch file; chỉ dịch vùng màn hình đang hiển thị.

## Chỉ số thành công

- 100% tiêu chí chấp nhận của FR-01..FR-05 đạt (kiểm chứng bằng test tự động + benchmark).
- Budget hiệu năng giữ vững qua mọi merge vào pipeline (gate CI).
- Không tồn tại đường code nào ghi audio/ảnh chụp xuống đĩa hoặc gửi ra ngoài; key không
  xuất hiện ngoài OS keychain (audit module `keys/`).

## Tài liệu nền

- Kiến trúc: [system-overview.md](../architecture/system-overview.md)
- Quyết định nền tảng: ADR-001 (Tauri 2 + React 19), ADR-002 (whisper.cpp local),
  ADR-003 (keyring) trong `docs/architecture/decisions/`
- Quy tắc nghiệp vụ: [business-rules.md](../context/business-rules.md)
