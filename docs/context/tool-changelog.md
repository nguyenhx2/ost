# Tool changelog - OST

Nhật ký thay đổi dependency/tool/infra (cái gì, vì sao, kiểm chứng thế nào).

## 2026-07-10

- Installer + auto-update FR-05 (TASK-020, infra): them dependency truc tiep PIN
  `tauri-plugin-updater = "=2.10.1"` (keo `minisign-verify`, `zip`, `tar`; feature
  `rustls-tls` khop reqwest, KHONG native-tls). Wire plugin desktop-only trong
  `src-tauri/src/lib.rs` (`tauri_plugin_updater::Builder::new().build()`), khong tu
  dong check/apply - update van la hanh dong user khoi xuong. Config bundler Windows
  trong `tauri.conf.json`: productName "OST", publisher, category, install NSIS
  `currentUser` + WiX en-US, `createUpdaterArtifacts: true`, target `all` (Windows =
  NSIS + MSI). Block `plugins.updater`: endpoints (GitHub releases `latest.json`) +
  `pubkey` la PLACEHOLDER ro rang - owner phai chay `tauri signer generate` tao keypair
  that va nap private key vao Actions secrets TRUOC lan release ky dau tien. KHONG tao,
  KHONG commit key that nao; KHONG publish/tag/chay release. Them workflow GATED
  `.github/workflows/release.yml`: CHI `workflow_dispatch` (owner bam tay, nhap xac nhan
  "release"), fail-closed neu thieu `TAURI_SIGNING_PRIVATE_KEY`, build+sign qua
  `tauri-apps/tauri-action` roi tao release DRAFT (owner review + publish tay). KHONG
  chay tren push/tag/PR, KHONG dung/lam yeu `ci.yml` `lint-and-test`. Cai lai toolchain
  whisper (CMake 4.3.4 + LLVM 19.1.7 + LIBCLANG_PATH) giong ci.yml vi release build cung
  compile whisper. Kiem chung THUC TE (reuse warm target D:	15, vcvars64 + Ninja `-j 2`):
  `cargo check` xanh (Finished, tauri-plugin-updater 2.10.1 compile OK), `cargo clippy
  --manifest-path src-tauri/Cargo.toml -j 2 -- -D warnings` sach, `cargo fmt --check`
  sach; `tauri.conf.json` valid JSON, `release.yml`/`ci.yml` valid YAML. Refs: FR-05,
  TASK-020.

- STT local FR-01 (TASK-014, ADR-002): them dependency truc tiep `whisper-rs = "=0.14.4"`
  (keo `whisper-rs-sys 0.13.1` build bundled whisper.cpp qua CMake/Ninja + bindgen). CPU-only
  (KHONG bat feature GPU) cho MVP Windows; chi TEXT transcribe roi module, audio o RAM
  (AC-01.6/BR-01). Model `ggml-*.bin` tai luc first-run vao user-cache (`.gitignore` `*.bin`,
  KHONG commit), route qua consent gate CHUNG `src-tauri/src/models/` (KHONG tao gate thu 2).
  Them feature `stt-live` (off mac dinh, KHONG chay CI) cho test inference model that tu
  `OST_WHISPER_TEST_MODEL`. Kiem chung THUC TE tren host dev (C: day 100% -> dat
  `CARGO_TARGET_DIR=D:/t14` path ngan tranh MAX_PATH; `LIBCLANG_PATH=C:\Program Files\LLVM\bin`
  pin LLVM 19.1.7; `CMAKE_GENERATOR=Ninja` 1.13.2; cmake 4.3.4; wrapper vcvars64 `-j 2`):
  whisper-rs-sys compile xanh (exit 0), `cargo fmt --check` sach, `cargo clippy --all-targets
  -j 2 -- -D warnings` sach, `cargo test -j 2` xanh (module stt: xem session log TASK-014).
  Refs: FR-01, TASK-014, ADR-002.
- Toolchain build STT native (ADR-002, chuan bi cho TASK-014/FR-01): cai host prereq cho
  `whisper-rs 0.14.4 -> whisper-rs-sys 0.13.1`. Truoc do build fail vi thieu (1) libclang
  cho bindgen, (2) `cmake.exe`. Da cai qua winget: **CMake 4.3.4** (Kitware.CMake) va
  **LLVM/libclang 19.1.7** (LLVM.LLVM). LIBCLANG_PATH = `C:\Program Files\LLVM\bin`. Ban dau
  cai LLVM 22.1.8 (latest) nhung bindgen 0.71.1 (do whisper-rs-sys keo vao) sinh binding sai
  voi libclang >= 21: `whisper_full_params` bi emit thanh opaque size-1, layout-assert
  `size_of - 264` overflow -> **PIN LLVM 19.x** (bindgen 0.71 compat). Prebuilt `src/bindings.rs`
  cua crate la Linux-only (glibc `_IO_FILE`) nen KHONG dung duoc tren Windows MSVC -> buoc phai
  chay bindgen. Them **Ninja 1.13.2** (Ninja-build.Ninja) vi generator mac dinh "Visual Studio
  18 2026" cua CMake fail compiler-ID tren host dev (VS 18 Enterprise preview); ep
  `CMAKE_GENERATOR=Ninja` (dung cl.exe tu vcvars64). Kiem chung THUC TE: build
  `whisper-rs-sys 0.13.1` trong probe co lap `C:\wp\whisper-probe` (path ngan tranh MAX_PATH
  C1041 tren PDB) qua wrapper vcvars64 `-j 2`: `Finished dev profile ... in 2m 02s` (xanh).
  CI (`.github/workflows/ci.yml`): them 3 step cai CMake 4.3.4 + LLVM 19.1.7 (choco, pin) va
  set LIBCLANG_PATH truoc cac step cargo; windows-latest tu locate MSVC nen KHONG can vcvars
  wrapper nhu host dev. KHONG lam yeu/bo qua check nao. Refs: ADR-002, TASK-014, FR-01.
- Audio capture FR-01 (TASK-013, FR-01): them dependency Windows-only cho WASAPI loopback
  sau trait `AudioSource`. Pin chinh xac, target-gated: `[target.'cfg(windows)'.dependencies]
  wasapi = "=0.23.0"` (mo default render endpoint o che do loopback capture; tra ve buffer
  in-memory, KHONG ghi dia - AC-01.6/BR-01). Chi la impl Windows dau tien; macOS/Linux la
  Phase-4 swap sau cung trait. VAD nang luong + chunking + session la Rust thuan, khong them
  dep. `tracing` (san co) dung cho log loi capture (khong bao gio chua audio). Kiem chung:
  `cargo fmt --check` sach; `cargo clippy --all-targets -j 2 -- -D warnings` sach (wasapi
  0.23.0 compile OK); `cargo test -j 2` 143 passed/0 failed/1 ignored (rieng module audio 19
  passed). Refs: FR-01, TASK-013.

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

- Phím tắt toàn cục + tray + cửa sổ Lịch sử (TASK-017, FR-04): KHÔNG thêm dependency mới -
  `tauri-plugin-global-shortcut = "2.3.2"` (đã pin từ TASK-008) nay được dùng cho TOÀN BỘ bộ
  phím tắt cấu hình được (toggle audio / chọn vùng / hiện-ẩn overlay) thay vì chỉ region-select.
  Đăng ký động lúc chạy qua `app.global_shortcut().register/unregister_all` (không pre-register
  trong builder); cấu hình lưu bằng `tauri-plugin-store` (`settings.json`, khoá `hotkeys`, chỉ
  chuỗi accelerator). Bộ mặc định OI-04: `Ctrl+Alt+A`/`Ctrl+Alt+R`/`Ctrl+Alt+O`. Xung đột đăng
  ký được xử lý mềm (rollback + lỗi có kiểu, không crash). Kiểm chứng: `cargo fmt --check` sạch;
  `cargo clippy --all-targets -j 2 -- -D warnings` sạch; `npm run test`/`lint`/`tsc` xanh.
  Refs: FR-04, TASK-017, OI-04.
