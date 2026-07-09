---
title: "04 - Luong nghiep vu"
sidebar_label: "04 Business flows"
description: "Cac luong nghiep vu dau-cuoi cua OST duoi dang so do Mermaid."
tags: [specs, flows]
---

# 04 - Luồng nghiệp vụ {#business-flows}

Bốn luồng đầu-cuối cốt lõi. Chi tiết yêu cầu tại
[05-functional-requirements.md](05-functional-requirements.md); màn hình tương ứng tại
[10-ui-ux-wireframes.md](10-ui-ux-wireframes.md).

## BF-01: Dịch audio hệ thống trực tiếp (FR-01) {#bf-01}

```mermaid
flowchart LR
    HK["Người dùng bấm hotkey / tray: bắt đầu phiên audio"] --> CAP["Capture WASAPI loopback"]
    CAP --> VAD["VAD + cắt chunk ~1-3s (bỏ khoảng lặng)"]
    VAD --> STT["whisper.cpp local: chunk -> text nguồn (audio KHÔNG rời máy)"]
    STT --> CONF{"Độ tin cậy đủ ngưỡng?"}
    CONF -- "Thấp" --> FLAG["Gắn confidence flag"]
    CONF -- "Đủ" --> TR["Provider layer: dịch text -> ngôn ngữ đích"]
    FLAG --> TR
    TR --> OV["Overlay phụ đề song ngữ + badge provider/model"]
    OV --> ACT["Người dùng: đọc / copy / pin / dừng phiên"]
```

- Ngôn ngữ nguồn: whisper tự nhận diện, hoặc dùng ngôn ngữ người dùng đã ghim (BR-07).
- Chỉ TEXT đã transcribe được gửi đến provider (BR-01).

## BF-02: Dịch vùng màn hình có preview (FR-02) {#bf-02}

```mermaid
flowchart LR
    HK["Hotkey / tray: chọn vùng"] --> SEL["Overlay chọn vùng toàn màn hình - kéo chuột chọn hình chữ nhật"]
    SEL --> ESC{"Esc?"}
    ESC -- "Có" --> CANCEL["Huỷ, không capture gì"]
    ESC -- "Không, chốt vùng" --> CAPT["Capture vùng (chỉ trong RAM)"]
    CAPT --> OCR["OCR: ảnh -> text nguồn"]
    OCR --> EMPTY{"Có text?"}
    EMPTY -- "Không" --> NOTXT["Preview báo: không nhận dạng được text - không gọi LLM"]
    EMPTY -- "Có" --> PREV["Preview hiển thị text nguồn ngay"]
    PREV --> TR["Provider layer dịch"]
    TR --> UPD["Preview cập nhật bản dịch + badge provider/model"]
    UPD --> LIVE["Chế độ live: capture lại khi nội dung vùng đổi -> lặp OCR/dịch"]
```

## BF-03: Thiết lập provider và API key (FR-03) {#bf-03}

```mermaid
flowchart LR
    ST["Mở Settings > Providers"] --> IN["Nhập/sửa API key cho provider"]
    IN --> IPC["IPC (key chỉ đi một chiều WebView -> Rust)"]
    IPC --> KR["keys/ ghi vào Windows Credential Manager"]
    KR --> MASK["WebView chỉ nhận lại: tên provider + trạng thái masked"]
    MASK --> VAL["Người dùng bấm kiểm tra key: 1 lệnh gọi tối thiểu -> báo hợp lệ/không"]
    VAL --> MODEL["Chọn model + thứ tự fallback + provider đang hoạt động"]
```

## BF-04: Lần chạy đầu - chọn model whisper (FR-01) {#bf-04}

```mermaid
flowchart LR
    FIRST["Lần chạy đầu tiên"] --> HW["App dò phần cứng: GPU / RAM"]
    HW --> SUG["Gợi ý model whisper phù hợp"]
    SUG --> OK{"Người dùng xác nhận?"}
    OK -- "Đổi lựa chọn" --> PICK["Người dùng chọn model khác"] --> OK
    OK -- "Xác nhận" --> DL["Tải model vào models/ (hiện tiến độ)"]
    DL --> READY["Sẵn sàng dịch audio; model đổi được sau trong Settings"]
```

## BF-05: Vòng đời lịch sử dịch (FR-04) {#bf-05}

```mermaid
flowchart LR
    RES["Mỗi lượt dịch hoàn tất (audio hoặc vùng)"] --> ON{"Lịch sử đang bật? (mặc định: bật)"}
    ON -- "Tắt" --> SKIP["Không ghi gì"]
    ON -- "Bật" --> SAVE["Ghi local TEXT-ONLY: nguồn, dịch, provider/model, thời điểm, loại phiên"]
    SAVE --> VIEW["Người dùng xem lịch sử, copy lại"]
    VIEW --> CLR["Nút xoá toàn bộ (luôn hiển thị) -> xoá sạch"]
    VIEW --> OFF["Tắt lịch sử trong Settings -> ngừng ghi"]
```

Không bao giờ ghi audio, ảnh chụp hay key vào lịch sử (BR-06,
[NFR-SEC-04](07-non-functional-requirements.md#nfr-security)).
