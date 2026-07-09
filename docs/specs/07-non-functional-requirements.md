---
title: "07 - Yeu cau phi chuc nang"
sidebar_label: "07 NFR"
description: "NFR cua OST: hieu nang, bao mat, tin cay, kha dung, mo rong - kem ID va tieu chi do."
tags: [specs, nfr, performance, security]
---

# 07 - Yêu cầu phi chức năng {#nfr}

ID dạng `NFR-<NHOM>-NN`. Ngân sách hiệu năng là tiêu chí chấp nhận gate merge (BR-04).

## Hiệu năng {#nfr-performance}

| ID | Yêu cầu | Đo/kiểm |
|----|---------|---------|
| NFR-PERF-01 | Độ trễ phụ đề audio đầu-cuối (âm phát ra -> phụ đề dịch hiển thị) p95 < 3s | Benchmark tự động trên phiên >= 10 phút (AC-01.2) |
| NFR-PERF-02 | Độ trễ dịch vùng (chốt vùng -> bản dịch hiển thị) p95 < 2s; live update p95 < 2s từ khi phát hiện thay đổi | Benchmark tự động (AC-02.2, AC-02.4) |
| NFR-PERF-03 | Idle (không phiên hoạt động): RAM < 100MB, CPU < 1%, trung bình cửa sổ 5 phút | Đo tiến trình (AC-05.1) |
| NFR-PERF-04 | Việc nặng (capture, STT, OCR, LLM I/O) trên task/thread riêng; UI không bị block | Kiểm code + e2e (AC-05.3) |
| NFR-PERF-05 | Benchmark criterion cho đường STT chunk chạy trong CI; hồi quy vượt budget chặn merge | CI gate (AC-05.5) |

## Bảo mật {#nfr-security}

Phân loại dữ liệu nhạy cảm: (1) API key - nhạy cảm nhất; (2) nội dung capture (audio
buffer, ảnh chụp, text OCR/STT, bản dịch) - riêng tư của người dùng; (3) lịch sử dịch -
text riêng tư lưu local. Không có PII nào khác được thu thập.

| ID | Yêu cầu | Đo/kiểm |
|----|---------|---------|
| NFR-SEC-01 | API key lưu DUY NHẤT trong OS keychain (Windows Credential Manager) qua module `keys/`; không bao giờ trong file, settings store, log, crash report, thông báo lỗi | Test + audit module (AC-03.2, ADR-003) |
| NFR-SEC-02 | WebView chỉ nhận tên provider + trạng thái masked; không lệnh IPC nào trả giá trị key | Test IPC (AC-03.3) |
| NFR-SEC-03 | Audio thô: chỉ trong RAM phiên, không ghi đĩa, không rời máy. Ảnh chụp màn hình: chỉ trong RAM phiên, không ghi đĩa; MẶC ĐỊNH không rời máy (OCR local). Nếu người dùng bật backend OCR đám mây (opt-in, consent per-backend theo BR-09): chỉ crop vùng đã chọn - đã thu nhỏ (LLM long-edge <= ~1568px), loại metadata, chỉ trong RAM - được gửi đến provider đó qua HTTPS; không bao giờ gửi toàn màn hình, không bao giờ ghi đĩa. Mỗi đường rời-ảnh mới phải qua security-reviewer | Integration test + audit (AC-01.6, AC-02.5, BR-01, BR-09) |
| NFR-SEC-04 | Lịch sử dịch: text-only, lưu local, không bao giờ chứa key/audio/ảnh; có nút xoá toàn bộ; tắt được | Test (AC-04.4..AC-04.6, BR-06) |
| NFR-SEC-05 | Mọi input IPC được validate tại Tauri command handler; response provider được schema-validate trước khi dùng | Unit test biên |
| NFR-SEC-06 | Anti-injection: text capture (STT/OCR) là DATA không tin cậy - prompt tách rõ chỉ thị/dữ liệu; output render plain text (không dangerouslySetInnerHTML, không diễn giải markdown); nội dung dạng chỉ thị trong text capture không bao giờ được thực thi | Test prompt template + renderer (AC-03.8) |
| NFR-SEC-07 | Mã hoá đường truyền: HTTPS/TLS đến provider; ngoài lệnh dịch và tải model, không có luồng outbound nào khác; không telemetry trong MVP | Review network layer |
| NFR-SEC-08 | Không token/key/PII trong log ở mọi mức; redaction là một phần của provider layer | Test log |

## Tin cậy {#nfr-reliability}

| ID | Yêu cầu | Đo/kiểm |
|----|---------|---------|
| NFR-REL-01 | Lỗi provider (mạng/quota/key) không làm crash phiên: fallback theo thứ tự người dùng định, hết fallback thì báo lỗi hành động được | Test mô phỏng lỗi (AC-03.6) |
| NFR-REL-02 | Dừng phiên giải phóng tài nguyên về ngưỡng idle trong 60s; không rò rỉ qua nhiều phiên liên tiếp | Đo (AC-05.4) |
| NFR-REL-03 | Mất mạng: STT local vẫn chạy; OCR local (mặc định) vẫn chạy. Nếu backend OCR đám mây đang bật mà mất mạng hoặc provider lỗi, hệ thống báo trạng thái offline rõ ràng và tự động dùng backend OCR local làm fallback thay vì treo; phần dịch báo offline rõ ràng | E2e mô phỏng |
| NFR-REL-04 | Tải model gián đoạn: resume hoặc báo lỗi kèm thử lại; model tải xong được kiểm toàn vẹn trước khi dùng | Test luồng first-run |

## Khả dụng {#nfr-usability}

| ID | Yêu cầu | Đo/kiểm |
|----|---------|---------|
| NFR-USA-01 | WCAG 2.1 AA: tương phản chữ >= 4.5:1, thao tác đủ bằng bàn phím, focus hiển thị, aria-label cho icon button, tôn trọng reduced-motion | Audit a11y |
| NFR-USA-02 | Overlay đọc được trên mọi nền: lớp scrim theo token, độ mờ người dùng chỉnh được | Review UI (AC-04.3) |
| NFR-USA-03 | Human-in-the-loop hiển thị: bản dịch luôn kèm text nguồn, badge provider/model, nút copy và dịch lại; đoạn tin cậy thấp gắn flag | Review UI (BR-03, BR-05) |
| NFR-USA-04 | i18n Việt-Anh từ ngày đầu; không hardcode chuỗi; tiếng Việt đủ dấu | Lint i18n (AC-04.7) |
| NFR-USA-05 | UI xây từ primitives + design token, dark-first; không emoji, icon SVG lucide | Gate code review (design-system.md) |

## Mở rộng / chuyển đổi {#nfr-scalability}

| ID | Yêu cầu | Đo/kiểm |
|----|---------|---------|
| NFR-SCA-01 | Mọi thành phần phụ thuộc OS/provider nằm sau trait (`AudioSource`, `SpeechToText`, `ScreenCapturer`, `OcrEngine`, `TranslationProvider`) để Phase 4 (macOS/Linux) chỉ thay impl | Review kiến trúc |
| NFR-SCA-02 | Thêm provider LLM mới = thêm một module client implement trait chung, không sửa call site | Review kiến trúc |
| NFR-SCA-03 | Phiên bản dependency được pin; nâng cấp là commit chủ đích ghi vào tool-changelog | Review PR |
