# Kiến trúc tổng quan - OST

Desktop app Tauri 2: Rust core sở hữu toàn bộ pipeline nặng; WebView (React) chỉ là bề mặt
tương tác. Windows-first, mọi thành phần phụ thuộc OS đều nằm sau trait để Phase 4 thay
impl cho macOS/Linux.

```mermaid
flowchart TB
    subgraph Frontend["WebView - React 19 (src/)"]
        UI[Settings + Tray menu UI]
        OV[Translation overlay]
        RS[Region-select overlay]
    end

    subgraph Core["Rust core (src-tauri/src/)"]
        SHELL[shell/ - windows, tray, global hotkeys]
        CMD[commands/ - thin IPC handlers]
        AUDIO[audio/ - WASAPI loopback, VAD, chunking]
        STT[stt/ - whisper.cpp local]
        CAP[capture/ - screen region capture]
        OCR[ocr/ - OCR engine - ADR pending]
        PROV[providers/ - TranslationProvider trait]
        KEYS[keys/ - keyring wrapper]
    end

    subgraph External["Ngoài máy (chỉ TEXT tối thiểu đi ra)"]
        GEM[Gemini API]
        ANT[Anthropic API]
        OAI[OpenAI API]
        ORT[OpenRouter API]
    end

    KC[(Windows Credential Manager)]

    UI -- IPC --> CMD
    OV -- events --> CMD
    RS -- region coords --> CMD
    CMD --> AUDIO --> STT --> PROV
    CMD --> CAP --> OCR --> PROV
    PROV --> GEM & ANT & OAI & ORT
    KEYS --- KC
    PROV --> KEYS
    SHELL --> OV
```

## Luồng dữ liệu

- **FR-01 audio**: loopback capture (chunk ~1-3s + VAD) -> whisper.cpp local (audio KHÔNG
  rời máy) -> text gốc -> providers/ dịch -> event -> overlay song ngữ.
- **FR-02 vùng màn hình**: chọn vùng (RS overlay) -> capture -> OCR -> hiển thị text nhận
  dạng ngay (preview) -> providers/ dịch -> cập nhật preview.
- **FR-03 keys**: Settings UI -> IPC -> keys/ -> Credential Manager. WebView chỉ nhận
  provider name + trạng thái masked, không bao giờ nhận giá trị key.

## Ràng buộc hiệu năng (FR-05, gate mọi merge vào pipeline)

| Chỉ số | Budget |
|--------|--------|
| Audio caption end-to-end | p95 < 3s |
| Region translate sau khi chọn vùng | p95 < 2s |
| Idle (không có phiên hoạt động) | RAM < 100MB, CPU < 1% |

Chi tiết stack: `.claude/rules/tech-stack.md`. Quyết định nền tảng: ADR-001..003.
