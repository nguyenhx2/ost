# Tool changelog - OST

Nhật ký thay đổi dependency/tool/infra (cái gì, vì sao, kiểm chứng thế nào).

## 2026-07-10

- Tich hop pipeline FR-02 (TASK-007, FR-02): them dependency moi. `xcap = "=0.9.6"` (chup
  vung man hinh sau trait `ScreenCapturer`; default-features, KHONG feature png/save nen
  khong ghi dia). `tauri-plugin-store = "=2.4.3"` (luu co dong thuan tai model trong
  facility `src-tauri/src/models/`, flags/names only - KHONG bao gio secret).
  `sha2 = "=0.10.9"` + `hex = "=0.4.3"` (xac minh SHA256 cho consumer tu tai). Tat ca
  pin chinh xac. Kiem chung: `cargo fmt --check` sach, `cargo clippy --all-targets -- -D
  warnings` sach, `cargo test -j 2` 109 passed.

- Spike R2 OCR (TASK-007, FR-02, ADR-004 R2): vòng đo thứ hai để đóng khoảng cách chất
  lượng tiếng Việt của R1 (0.741/0.727 < bar 0.85). KHÔNG thêm/đổi dependency nào - chỉ
  dùng lại `oar-ocr = "=0.8.0"` + `image = "=0.25.8"` sẵn có. Thay đổi harness (feature
  `ocr-spike`): thêm `ModelSet::MAIN_SERVER` (rec server `pp-ocrv5_server_rec.onnx` +
  dict `ppocrv5_dict.txt`, giữ mobile det để cô lập chi phí rec), helper `upscale()`
  (Lanczos3), fixture `vi_charset_probe()`, harness mới `tests/ocr_spike_r2.rs`
  (env-gate `OST_OCR_SPIKE_R2=1`). Model server ONNX (~80MB) tải từ ModelScope vào cache
  oar-ocr (KHÔNG commit). Kiểm chứng: `cargo clippy --features ocr-spike --tests --benches
  -- -D warnings` sạch; `cargo fmt` sạch; R2 harness chạy release xanh.
  Kết quả R2 (máy dev này, release):
  - CHARSET PROBE (quyết định): crop vi lớn/sạch 96px, ref có 6 glyph tổ hợp U+1E00-U+1EFF;
    latin rec phát ra 0 glyph tổ hợp ở 1x/2x/3x (hyp "Ting Vit rt đp và d đc khó"). Dict
    `ppocrv5_latin_dict.txt` (837 token) có đ/ơ/ư/à nhưng KHÔNG có block U+1E00-U+1EFF. Trần
    lý thuyết (0.741/0.727) khớp đúng số đo R1 tới 3 chữ số. => CHARSET GAP, KHÔNG phải DPI.
  - UPSCALE (Lanczos3) trên latin mobile rec: vi-general 1.0x=0.741 / 1.5x=0.667 /
    2.0x=0.667 / 3.0x=0.704; vi-subtitle phẳng 0.727 mọi mức. Upscale KHÔNG cải thiện (còn
    hơi giảm do ringing). Bác bỏ giả thuyết DPI.
  - SERVER main rec vs mobile main: server p95=1404.5ms (VƯỢT budget 700ms ~2x) vs mobile
    229.3ms; server còn regress EN nhỏ (en-400x100 0.639) + JA subtitle (0.889) so mobile
    1.000; vi trên server (dict CJK) tệ hơn (0.593/0.636). Download rec server 80.59MB vs
    mobile 15.80MB (delta +64.79MB). RAM active server phình. oar-ocr 0.8.0 KHÔNG có bản
    latin/Vietnamese server rec - chỉ có latin MOBILE.
  - Tái đo R1: EN/JA/ja-vertical/low-DPI/ko/zh = 1.000 (không đổi), latency mobile p95=210ms,
    confidence 0.967-1.000, lazy-load 10.4MB, session đơn 104.6MB, idle sau drop 38.0MB.
    Không có gì regress so R1.
  KẾT LUẬN: trong stack PP-OCRv5/oar-ocr 0.8.0 KHÔNG có cấu hình nào đạt vi>=0.85; đây là
  bài toán CHỌN MODEL (charset), không phải tiền xử lý. Escalate owner. Giữ cấu hình R1
  (PP-OCRv5 mobile: main+latin+korean) làm khuyến nghị. Refs: FR-02, TASK-007, ADR-004.

## 2026-07-09

- Bootstrap workspace AI-agent bằng skill `project-bootstrap` (greenfield): tạo `.claude/`
  (settings + 6 hooks PowerShell + 13 rules + 15 agents + 10 commands), cây `docs/`,
  CLAUDE.md / AGENTS.md / README.md, `.env.example`, CI skeleton, git init nhánh `main`
  với identity local `nguyenhx2 <nguyenhx1@gmail.com>`. Kiểm chứng: hooks test bằng JSON
  payload (block exit 2 / allow exit 0); smoke test vòng đời task trên TASK-001.
- Môi trường dev ghi nhận: Windows 11, Node v22.17.0, git 2.48.1; Rust toolchain CHƯA có
  (TASK-001).
- Thêm dependency trực tiếp `url = "2.5.8"` (src-tauri) - trước đây là transitive dep qua
  reqwest, nay pin trực tiếp để `providers/config.rs::base_url_is_allowed` parse host bằng
  `url` crate thay vì tách chuỗi thủ công (chặn kiểu userinfo `http://localhost:8080@evil.com`
  bypass loopback check). Kiểm chứng: `cargo clippy -- -D warnings` sạch, `cargo test` xanh
  (thêm test userinfo/ipv6/malformed). Refs: FR-03, TASK-006.
- Spike R1 OCR (TASK-007, FR-02): thêm dependency `src-tauri` cho engine OCR local
  PaddleOCR PP-OCRv5 (ADR-004). Pin chính xác: `oar-ocr = "=0.8.0"` (feature `auto-download`,
  kéo theo `ort 2.0.0-rc.12` prebuilt binary qua `download-binaries` lúc build),
  `image = "=0.25.8"` (khớp `imageproc 0.27` yêu cầu `^0.25.8`). Fixture render chỉ cho
  spike (optional, sau feature `ocr-spike`): `ab_glyph = "=0.2.31"`, `imageproc = "=0.27.0"`
  (default-features off, feature `text`). Dev-dependency benchmark: `criterion = "=0.5.1"`.
  Model ONNX (~40MB) tải từ ModelScope vào cache của oar-ocr (KHÔNG nằm trong repo, KHÔNG
  commit). Kiểm chứng: `cargo clippy --all-targets --features ocr-spike -- -D warnings` sạch;
  `cargo fmt --check` sạch; unit test `ocr::engine` xanh; spike harness đo latency p95=277ms
  (<=700ms), EN/JA/ja-vertical/low-DPI/ko/zh accuracy=1.000, per-line confidence có sẵn,
  lazy load + idle RAM đạt NFR-PERF-03; Vietnamese 0.73-0.74 (rớt dấu thanh dày) escalate.
  Refs: FR-02, TASK-007, ADR-004.
- Chốt engine OCR (ADR-004, Accepted 2026-07-09): `.claude/rules/tech-stack.md` đổi dòng OCR
  từ "OPEN DECISION" sang PaddleOCR PP-OCRv5 mobile chạy ONNX Runtime qua `oar-ocr` + `ort`,
  local và mặc định, sau trait `OcrEngine`; Windows.Media.Ocr làm fallback/opt-in EN-JA
  nhanh; backend đám mây opt-in theo BR-09. Các dependency `oar-ocr` và `ort` CHƯA được thêm
  vào `src-tauri/Cargo.toml` - chúng sẽ được pin trong spike R1 của TASK-007, và spike đó là
  gate: nếu OCR-stage p95 > 700ms thì quyết định phải xem lại. Refs: FR-02, TASK-005,
  TASK-007, ADR-004.

