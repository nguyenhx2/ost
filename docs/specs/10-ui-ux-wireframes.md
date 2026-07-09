---
title: "10 - UI/UX theo man hinh"
sidebar_label: "10 UI/UX"
description: "Ghi chu tung man hinh cua OST va cac FR ma man hinh phuc vu."
tags: [specs, ui, ux]
---

# 10 - UI/UX theo màn hình {#ui-ux}

Chuẩn chung cho MỌI màn hình: dựng từ primitives + design token, dark-first, không emoji,
icon lucide SVG, i18n Việt-Anh, WCAG 2.1 AA
([NFR-USA](07-non-functional-requirements.md#nfr-usability)); text AI render plain text
(sanitized). Wireframe chi tiết sẽ nằm trong PRD từng FR.

## SCR-01: Overlay phụ đề audio {#scr-01}

Phục vụ: [FR-01](05-functional-requirements.md#fr-01), [FR-04](05-functional-requirements.md#fr-04).

- Cửa sổ always-on-top, nền scrim chỉnh độ mờ, kéo đổi vị trí, đọc được trên mọi nền.
- Hiển thị: text nguồn + bản dịch (song ngữ), ngôn ngữ nguồn nhận diện (AC-01.3), badge
  provider/model (AC-03.5), confidence flag cho đoạn tin cậy thấp (AC-01.7).
- Điều khiển: pin, copy (nguồn/bản dịch), dừng phiên, ẩn; đủ bàn phím (AC-04.3).

## SCR-02: Overlay chọn vùng {#scr-02}

Phục vụ: [FR-02](05-functional-requirements.md#fr-02).

- Lớp phủ toàn màn hình mờ; kéo chuột vẽ hình chữ nhật; hiện kích thước vùng khi kéo.
- Esc huỷ tức thì (AC-02.1); Enter/thả chuột chốt vùng.

## SCR-03: Preview overlay vùng dịch {#scr-03}

Phục vụ: [FR-02](05-functional-requirements.md#fr-02), [FR-04](05-functional-requirements.md#fr-04).

- Hiện text OCR ngay khi có (AC-02.3), bản dịch cập nhật sau; trạng thái "không nhận dạng
  được text" khi OCR trống (AC-02.7); flag vùng nhận dạng kém (AC-02.6).
- Điều khiển: copy, re-translate (đổi được provider/model trước khi gửi lại - AC-02.8),
  pin, đóng, bật/tắt live update; badge provider/model (AC-03.5).

## SCR-04: Settings - Provider và API key {#scr-04}

Phục vụ: [FR-03](05-functional-requirements.md#fr-03).

- Danh sách 4 provider; mỗi dòng: trạng thái masked (đã có key/chưa), nhập/cập nhật/xoá
  key, chọn model, nút kiểm tra key (AC-03.1..AC-03.4).
- Chọn provider hoạt động + sắp thứ tự fallback (kéo-thả hoặc nút lên/xuống) (AC-03.6).
- Ô nhập key kiểu password, không bao giờ hiển thị lại giá trị đã lưu.

## SCR-05: Settings - Ngôn ngữ, model, hotkey, lịch sử {#scr-05}

Phục vụ: [FR-01](05-functional-requirements.md#fr-01), [FR-04](05-functional-requirements.md#fr-04).

- Ngôn ngữ nguồn: auto (mặc định) / ghim thủ công (AC-01.4); ngôn ngữ đích mặc định tiếng
  Việt (AC-01.5); ngôn ngữ UI vi/en (AC-04.7).
- Model whisper: model hiện tại, đổi model (tải mới cần xác nhận - AC-01.8).
- Gán lại hotkey cho 3 hành động (AC-04.1); bật/tắt lịch sử dịch (AC-04.6).

## SCR-06: Cửa sổ lịch sử dịch {#scr-06}

Phục vụ: [FR-04](05-functional-requirements.md#fr-04).

- Danh sách bản ghi text-only: nguồn, dịch, provider/model, loại phiên, thời điểm
  (AC-04.4); copy từng bản ghi.
- Nút "xoá toàn bộ" luôn nhìn thấy, kèm xác nhận (AC-04.5).

## SCR-07: Menu tray {#scr-07}

Phục vụ: [FR-04](05-functional-requirements.md#fr-04), [FR-05](05-functional-requirements.md#fr-05).

- Mục tối thiểu: bật/dừng phiên audio, chọn vùng dịch, mở Settings, mở Lịch sử, thoát hẳn
  (AC-04.2); trạng thái phiên hiển thị trong menu/icon.

## SCR-08: First-run - chọn và tải model whisper {#scr-08}

Phục vụ: [FR-01](05-functional-requirements.md#fr-01).

- Hiện kết quả dò phần cứng (GPU/RAM) + model gợi ý kèm kích thước; người dùng đổi lựa
  chọn được; tải chỉ bắt đầu sau xác nhận (AC-01.8, BR-08); thanh tiến độ + thử lại khi
  gián đoạn (NFR-REL-04); cho phép hoãn (FR-02/FR-03 vẫn dùng được).

## Truy vết màn hình -> FR

| Màn hình | FR |
|----------|----|
| SCR-01 | FR-01, FR-04 |
| SCR-02 | FR-02 |
| SCR-03 | FR-02, FR-04 |
| SCR-04 | FR-03 |
| SCR-05 | FR-01, FR-04 |
| SCR-06 | FR-04 |
| SCR-07 | FR-04, FR-05 |
| SCR-08 | FR-01 |
