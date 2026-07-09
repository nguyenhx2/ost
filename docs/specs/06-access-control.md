---
title: "06 - Phan quyen truy cap"
sidebar_label: "06 Access control"
description: "Mo hinh phan quyen cua OST: mot nguoi dung local va ranh gioi truy cap key giua WebView va Rust core."
tags: [specs, access-control, security]
---

# 06 - Phân quyền truy cập {#access-control}

OST là ứng dụng desktop đơn người dùng, không tài khoản, không server. Chỉ có MỘT vai trò
con người: **người dùng local** (chủ phiên đăng nhập Windows). Không có phân quyền nhiều
vai trò; phần quan trọng của mục này là **ranh giới truy cập giữa các thành phần phần mềm**
theo ADR-003.

## Vai trò con người

| Vai trò | Quyền |
|---------|-------|
| Người dùng local | Toàn quyền CRUD với dữ liệu của chính mình: key (qua Settings), cấu hình, lịch sử dịch, phiên dịch. Key được OS cô lập theo từng user Windows (Credential Manager per-user). |

## Ma trận truy cập theo thành phần (ranh giới tin cậy)

| Dữ liệu | WebView (React) | Rust core (`src-tauri/`) | OS keychain | Provider LLM |
|---------|-----------------|--------------------------|-------------|--------------|
| API key (giá trị) | KHÔNG BAO GIỜ đọc; chỉ ghi một chiều khi người dùng nhập (WebView -> IPC -> `keys/`) | Chỉ module `keys/` đọc/ghi/xoá; provider layer nhận key tại thời điểm gọi, không log | Nơi lưu DUY NHẤT | Nhận trong header auth qua HTTPS, theo từng lệnh gọi |
| Trạng thái key (masked) | Đọc (tên provider + có/không có key) | Tạo và phát qua IPC | - | - |
| Audio buffer / ảnh chụp | KHÔNG truy cập (không đi qua IPC) | Chỉ trong RAM của pipeline phiên | - | KHÔNG BAO GIỜ gửi |
| Text nguồn (STT/OCR) + bản dịch | Đọc để render (plain text, sanitized) | Tạo, xử lý | - | Chỉ TEXT tối thiểu gửi đi |
| Lịch sử dịch (text-only) | Đọc/hiển thị; lệnh xoá qua IPC | Ghi/đọc/xoá file local | - | KHÔNG gửi |
| Cấu hình (settings JSON) | Đọc/ghi qua IPC | Sở hữu qua tauri-plugin-store; KHÔNG BAO GIỜ chứa key | - | - |

Quy tắc bất biến (BR-02, [NFR-SEC-01..03](07-non-functional-requirements.md#nfr-security)):

- Không tồn tại lệnh IPC nào trả giá trị key về WebView.
- Tauri command handler validate mọi input IPC tại biên ([NFR-SEC-05](07-non-functional-requirements.md#nfr-security)).
- Text từ capture là dữ liệu không tin cậy: render plain text, không diễn giải markup/lệnh
  ([NFR-SEC-06](07-non-functional-requirements.md#nfr-security)).

## RACI (gọn)

| Việc | Người dùng | Rust core | WebView |
|------|-----------|-----------|---------|
| Nhập/xoá key | R+A | R (thực thi vào keychain) | C (form nhập) |
| Bật/dừng phiên dịch | R+A | R (pipeline) | I (hiển thị) |
| Chấp nhận/dùng bản dịch | R+A (human-in-the-loop, BR-03) | I | I |
| Xoá lịch sử | R+A | R (xoá file) | C (nút xoá) |
