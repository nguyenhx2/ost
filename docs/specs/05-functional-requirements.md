---
title: "05 - Yeu cau chuc nang"
sidebar_label: "05 Functional requirements"
description: "FR-01..FR-05 voi tieu chi chap nhan danh so, use case va user story cua OST."
tags: [specs, functional-requirements, use-cases, user-stories]
---

# 05 - Yêu cầu chức năng {#functional-requirements}

Mỗi FR có: mô tả, Input/Output, phân vai AI vs con người, quy tắc nghiệp vụ liên quan
(BR-NN trong [business-rules.md](../context/business-rules.md)) và tiêu chí chấp nhận đánh
số, quan sát và kiểm thử được. Ngân sách hiệu năng là con số bắt buộc
([NFR-PERF](07-non-functional-requirements.md#nfr-performance)).

## Bảng tóm tắt (MoSCoW)

| FR | Tên | Ưu tiên | Use case | User story |
|----|-----|---------|----------|------------|
| [FR-01](#fr-01) | Dịch audio hệ thống trực tiếp | Must | UC-01, UC-02 | US-01..US-04 |
| [FR-02](#fr-02) | Dịch vùng màn hình có preview | Must | UC-03 | US-05, US-06 |
| [FR-03](#fr-03) | Đa provider AI bằng API key | Must | UC-04 | US-07, US-08 |
| [FR-04](#fr-04) | Tương tác tối đa | Must | UC-05, UC-06 | US-09..US-12 |
| [FR-05](#fr-05) | Chạy ngầm + hiệu năng | Must | UC-01, UC-03, UC-06 | US-13 |

---

## FR-01: Dịch audio hệ thống trực tiếp {#fr-01}

**Mô tả.** Người dùng bật một phiên audio; hệ thống bắt audio đang phát ra loa/tai nghe
(WASAPI loopback), cắt chunk bằng VAD, chuyển thành text bằng whisper.cpp chạy local
(ADR-002), gửi TEXT đến provider LLM đang chọn để dịch, và hiển thị phụ đề song ngữ
(text nguồn + bản dịch) trên overlay always-on-top. Luồng: [BF-01](04-business-flows.md#bf-01).

**Input.** Stream audio hệ thống (loopback); cấu hình: ngôn ngữ nguồn (auto hoặc ghim),
ngôn ngữ đích (mặc định tiếng Việt), model whisper, provider/model LLM đang hoạt động.

**Output.** Sự kiện phụ đề: `{text nguồn, bản dịch, ngôn ngữ nhận diện, confidence flag,
provider/model, thời điểm}` render lên overlay ([SCR-01](10-ui-ux-wireframes.md#scr-01));
một bản ghi lịch sử text-only nếu lịch sử đang bật.

**AI làm gì / con người làm gì.**

- AI: nhận diện tiếng nói (whisper local), nhận diện ngôn ngữ nguồn (khi ở chế độ auto),
  dịch text (LLM provider). Kết quả chỉ là ĐỀ XUẤT hiển thị.
- Con người: bật/dừng phiên, ghim ngôn ngữ nguồn khi auto sai, chọn ngôn ngữ đích, chọn
  model whisper (xác nhận tải), đọc/copy/pin/bỏ qua phụ đề. Không có hành động tự động nào
  phát sinh từ bản dịch (BR-03).

**Quy tắc nghiệp vụ.** BR-01 (audio không rời máy, không ghi đĩa), BR-03 (đề xuất, không
hành động), BR-04 (budget), BR-05 (flag độ tin cậy thấp), BR-06 (lịch sử), BR-07 (ngôn
ngữ), BR-08 (model tải sau xác nhận).

**Tiêu chí chấp nhận.**

1. AC-01.1: Khi người dùng bật phiên audio (hotkey hoặc tray), overlay phụ đề xuất hiện và
   phụ đề đầu tiên hiển thị khi có tiếng nói trong audio hệ thống.
2. AC-01.2: Độ trễ đầu-cuối (âm thanh phát ra -> phụ đề dịch hiển thị) đạt p95 < 3s, đo
   trên phiên liên tục >= 10 phút bằng benchmark tự động.
3. AC-01.3: Mặc định whisper tự nhận diện ngôn ngữ nguồn; ngôn ngữ nhận diện được hiển thị
   trên overlay.
4. AC-01.4: Người dùng có thể ghim (override) ngôn ngữ nguồn trong Settings; khi đã ghim,
   pipeline dùng đúng ngôn ngữ ghim và không auto-detect nữa; bỏ ghim quay lại auto.
5. AC-01.5: Ngôn ngữ đích cấu hình được trong Settings; giá trị mặc định là tiếng Việt (vi).
6. AC-01.6: Audio thô không bao giờ được ghi xuống đĩa và không bao giờ nằm trong payload
   mạng; chỉ text đã transcribe được gửi đến provider (kiểm bằng integration test + audit).
7. AC-01.7: Đoạn STT có độ tin cậy dưới ngưỡng được gắn confidence flag hiển thị rõ trên
   overlay, không đoán im lặng.
8. AC-01.8: Lần chạy đầu, app dò phần cứng (GPU/RAM) và gợi ý model whisper; việc tải model
   chỉ bắt đầu sau khi người dùng xác nhận; model đổi được sau trong Settings
   ([BF-04](04-business-flows.md#bf-04)).
9. AC-01.9: Khoảng lặng (VAD không phát hiện tiếng nói) không sinh phụ đề và không phát
   sinh lệnh gọi LLM.
10. AC-01.10: Dừng phiên (hotkey/tray/nút trên overlay) ngừng capture trong <= 1s và giải
    phóng tài nguyên phiên.
11. AC-01.11: Nếu chưa có provider nào cấu hình key, việc bật phiên hiển thị thông báo lỗi
    hành động được (dẫn đến Settings), không crash.

---

## FR-02: Dịch vùng màn hình có preview {#fr-02}

**Mô tả.** Người dùng kích hoạt chọn vùng; một overlay chọn vùng phủ màn hình cho phép kéo
chọn hình chữ nhật bất kỳ; hệ thống capture vùng đó (chỉ trong RAM), OCR ra text, hiển thị
ngay text nguồn trong preview overlay, rồi cập nhật bản dịch từ provider. Ở chế độ live,
vùng được capture lại khi nội dung thay đổi và preview cập nhật theo. Luồng:
[BF-02](04-business-flows.md#bf-02). Engine OCR là quyết định mở
([OI-01](11-assumptions-constraints.md#oi-01)).

**Input.** Toạ độ vùng chọn; ảnh capture vùng (in-memory); cấu hình ngôn ngữ đích,
provider/model.

**Output.** Preview overlay ([SCR-03](10-ui-ux-wireframes.md#scr-03)) chứa: text nguồn OCR,
bản dịch, confidence flag cho vùng nhận dạng kém, badge provider/model, các nút copy /
re-translate / pin / đóng; bản ghi lịch sử text-only nếu đang bật.

**AI làm gì / con người làm gì.**

- AI: OCR nhận dạng text, dịch text. Kết quả là đề xuất hiển thị.
- Con người: chọn/huỷ vùng, đọc preview, copy, yêu cầu dịch lại, đổi provider/model, đóng
  hoặc ghim preview.

**Quy tắc nghiệp vụ.** BR-01 (ảnh chụp: mặc định không rời máy - OCR local; chỉ TEXT rời máy, trừ khi người dùng bật OCR đám mây opt-in theo BR-09 thì chỉ crop đã thu nhỏ rời máy), BR-03, BR-04, BR-05, BR-06, BR-09.

**Tiêu chí chấp nhận.**

1. AC-02.1: Kích hoạt (hotkey/tray) mở overlay chọn vùng phủ toàn màn hình; kéo chuột chọn
   được hình chữ nhật bất kỳ; thả chuột hoặc phím Enter chốt vùng
   ([SCR-02](10-ui-ux-wireframes.md#scr-02)); phím Esc huỷ mà không capture gì.
2. AC-02.2: Từ lúc chốt vùng đến lúc bản dịch hiển thị trong preview đạt p95 < 2s (đo bằng
   benchmark tự động).
3. AC-02.3: Text nguồn OCR hiển thị trong preview ngay khi nhận dạng xong, không chờ bản
   dịch; bản dịch cập nhật vào preview khi provider trả về.
4. AC-02.4: Chế độ live: khi nội dung vùng thay đổi, preview cập nhật (OCR + dịch lại)
   trong p95 < 2s tính từ thay đổi được phát hiện.
5. AC-02.5: Ảnh chụp màn hình chỉ tồn tại trong RAM của phiên, không ghi xuống đĩa. Với backend OCR local (mặc định) ảnh không rời máy; chỉ TEXT OCR được gửi đến provider. Với backend OCR đám mây do người dùng bật (consent per-backend theo BR-09): chỉ crop vùng đã chọn đã thu nhỏ + loại metadata rời máy đến provider đó, không bao giờ gửi toàn màn hình (kiểm bằng test + audit).
6. AC-02.6: Vùng OCR có độ nhận dạng kém được gắn confidence flag hiển thị rõ. Backend cung cấp confidence theo dòng (`PerLine`) dùng ngưỡng hiệu chỉnh (OI-07). Backend không cung cấp confidence (`Unavailable`, ví dụ Windows.Media.Ocr hoặc đường multimodal-LLM) hiển thị banner cố định 'bản nhận dạng chưa kiểm chứng' thay vì đoán im lặng (giữ đúng BR-05). Ngoài ra, mỗi backend OCR phải khai báo độ trung thực (fidelity) theo từng ngôn ngữ nguồn: `Full` khi backend biểu diễn được đầy đủ chữ viết của ngôn ngữ đó, hoặc `Degraded{reason}` khi backend đang hoạt động không biểu diễn được chữ viết của ngôn ngữ nguồn (ví dụ PP-OCRv5/oar-ocr với tiếng Việt: rec dict thiếu dải diacritic tổ hợp U+1E00-U+1EFF nên dấu thanh bị rơi trong khi confidence vẫn cao ~0.97 và KHÔNG bị ngưỡng `PerLine` bắt); khi ngôn ngữ nguồn đang hoạt động ở trạng thái `Degraded`, preview hiển thị một notice cố định cảnh báo rằng dấu tiếng Việt có thể bị rơi và lỗi này không được confidence flag báo, notice này độc lập với cờ confidence theo dòng và giữ đúng BR-05 (không đoán im lặng đối với một lỗi hệ thống mà tín hiệu confidence không phản ánh).
7. AC-02.7: Nếu OCR không tìm thấy text, preview hiển thị trạng thái "không nhận dạng được
   text" và không có lệnh gọi LLM nào được phát.
8. AC-02.8: Nút re-translate gửi lại đúng text OCR hiện tại để dịch lại (cho phép đổi
   provider/model trước khi gửi).
9. AC-02.9: Preview overlay có đủ: text nguồn, bản dịch, badge provider/model, nút copy,
   re-translate, pin, đóng; tất cả thao tác được bằng bàn phím.

---

## FR-03: Đa provider AI bằng API key {#fr-03}

**Mô tả.** Người dùng cung cấp API key cho một hoặc nhiều provider: Gemini, Anthropic
(Claude), OpenAI, OpenRouter. Mọi lệnh gọi LLM đi qua một trait chung
(`TranslationProvider`) trong provider layer. Key lưu DUY NHẤT trong OS keychain qua
keyring (ADR-003). Người dùng chọn model cho từng provider, chọn provider đang hoạt động
và thứ tự fallback. Luồng: [BF-03](04-business-flows.md#bf-03).

**Input.** API key nhập từ Settings; lựa chọn model; thứ tự fallback; hành động kiểm tra
key.

**Output.** Trạng thái masked cho từng provider (đã có key / chưa); kết quả kiểm tra key
(hợp lệ / không); cấu hình provider/model đang hoạt động dùng chung cho FR-01/FR-02.

**AI làm gì / con người làm gì.**

- AI: thực hiện lệnh dịch qua provider được chọn; không tự chọn provider ngoài thứ tự
  fallback người dùng đã định.
- Con người: nhập/xoá key, chọn model, đặt provider hoạt động và thứ tự fallback, chạy
  kiểm tra key.

**Quy tắc nghiệp vụ.** BR-02 (key chỉ trong keychain, WebView chỉ thấy masked), BR-03.

**Tiêu chí chấp nhận.**

1. AC-03.1: Settings liệt kê đúng 4 provider (Gemini, Anthropic, OpenAI, OpenRouter); mỗi
   provider có thao tác nhập/cập nhật/xoá key và chọn model.
2. AC-03.2: Key chỉ được ghi vào OS keychain qua module `keys/`; test khẳng định key không
   xuất hiện trong settings store, log, thông báo lỗi hay bất kỳ file nào.
3. AC-03.3: Payload IPC gửi về WebView chỉ chứa tên provider + trạng thái masked; không có
   đường IPC nào trả về giá trị key.
4. AC-03.4: Hành động "kiểm tra key" do người dùng bấm thực hiện đúng một lệnh gọi tối
   thiểu đến provider và báo kết quả hợp lệ/không hợp lệ kèm lý do lỗi an toàn (không lộ
   key trong thông báo).
5. AC-03.5: Provider/model đang hoạt động chọn được trong Settings và luôn hiển thị trên
   mọi bề mặt kết quả (overlay phụ đề, preview vùng); đổi provider/model chỉ mất một tương
   tác từ bề mặt kết quả.
6. AC-03.6: Người dùng định nghĩa được thứ tự fallback; khi provider hoạt động trả lỗi
   (mạng/quota/key), hệ thống thử provider kế tiếp trong thứ tự và badge hiển thị đúng
   provider thực tế đã dịch; hết fallback thì báo lỗi hành động được.
7. AC-03.7: Xoá key gỡ key khỏi keychain; provider đó chuyển trạng thái chưa cấu hình và bị
   loại khỏi fallback cho đến khi có key mới.
8. AC-03.8: Prompt dịch tách rõ chỉ thị và dữ liệu (text capture là DATA không tin cậy);
   response provider được schema-validate trước khi dùng; bản dịch render dạng plain text
   (anti-injection, [NFR-SEC-06](07-non-functional-requirements.md#nfr-security)).

---

## FR-04: Tương tác tối đa {#fr-04}

**Mô tả.** Ứng dụng điều khiển được hoàn toàn từ nền: global hotkeys, menu tray, overlay
tương tác (pin/copy/dismiss/kéo vị trí/chỉnh độ mờ), lịch sử dịch text-only bật mặc định
(BR-06), giao diện i18n Việt-Anh. Luồng lịch sử: [BF-05](04-business-flows.md#bf-05).

**Input.** Hotkey, click tray, thao tác trên overlay, thao tác trong màn lịch sử, cấu hình
trong Settings (hotkey, ngôn ngữ UI, bật/tắt lịch sử).

**Output.** Hành vi UI tương ứng; kho lịch sử local text-only; chuỗi UI theo ngôn ngữ chọn.

**AI làm gì / con người làm gì.**

- AI: không có vai trò trong FR này ngoài việc cung cấp nội dung hiển thị; mọi tương tác là
  của con người. Bản dịch không bao giờ tự gửi/click/gõ vào ứng dụng khác (BR-03).
- Con người: toàn bộ thao tác điều khiển.

**Quy tắc nghiệp vụ.** BR-03, BR-06 (lịch sử bật mặc định, text-only, xoá được, tắt được).

**Tiêu chí chấp nhận.**

1. AC-04.1: Ba hành động tối thiểu có global hotkey hoạt động khi ứng dụng khác đang focus:
   bật/dừng phiên audio, kích hoạt chọn vùng, ẩn/hiện overlay; hotkey cấu hình lại được
   trong Settings (bộ phím mặc định: [OI-04](11-assumptions-constraints.md#oi-04)).
2. AC-04.2: Icon tray luôn hiện khi app chạy; menu tray có tối thiểu: bật/dừng phiên audio,
   chọn vùng dịch, mở Settings, mở Lịch sử, thoát hẳn; đóng cửa sổ chỉ thu về tray, không
   thoát app.
3. AC-04.3: Overlay hỗ trợ: pin (giữ hiển thị cố định), copy (chép text nguồn hoặc bản dịch
   vào clipboard), dismiss (đóng), kéo đổi vị trí, chỉnh độ mờ nền; toàn bộ thao tác được
   bằng bàn phím (không cần chuột).
4. AC-04.4: Lịch sử dịch BẬT MẶC ĐỊNH; mỗi lượt dịch hoàn tất được ghi local dưới dạng
   text-only: text nguồn, bản dịch, ngôn ngữ nguồn, ngôn ngữ đích, provider/model, loại
   phiên (audio/region), thời điểm - danh sách trường chuẩn là từ điển dữ liệu
   [HISTORY_ENTRY](08-data-model.md#data-model); không bao giờ chứa audio, ảnh chụp hay key.
5. AC-04.5: Màn lịch sử có nút "xoá toàn bộ" luôn nhìn thấy; bấm (kèm xác nhận) xoá sạch
   kho lịch sử trên đĩa.
6. AC-04.6: Người dùng tắt được lịch sử trong Settings; khi tắt, không lượt dịch nào được
   ghi thêm; bật lại thì ghi tiếp.
7. AC-04.7: UI có hai ngôn ngữ Việt và Anh; mặc định theo ngôn ngữ hiển thị của hệ điều
   hành - tiếng Việt nếu OS đang là tiếng Việt, ngược lại là tiếng Anh - và đổi được trong
   Settings; 100% chuỗi hiển thị qua i18n key, tiếng Việt đủ dấu.
8. AC-04.8: Copy chỉ đưa text vào clipboard; không tồn tại chức năng tự gửi/tự gõ/tự click
   vào ứng dụng khác.

---

## FR-05: Chạy ngầm + hiệu năng {#fr-05}

**Mô tả.** Ứng dụng sống ở tray, không cần cửa sổ chính khi hoạt động; mọi việc nặng
(capture, STT, OCR, LLM I/O) chạy trên task/thread Rust riêng, không bao giờ trên UI
thread. Ngân sách hiệu năng là tiêu chí chấp nhận và gate mọi merge vào pipeline (BR-04).

**Input.** Trạng thái phiên (đang chạy / idle); tài nguyên máy.

**Output.** Mức dùng tài nguyên đo được; độ trễ pipeline đo được (benchmark trong CI).

**AI làm gì / con người làm gì.**

- AI: không có vai trò; đây là yêu cầu chất lượng vận hành của hệ thống.
- Con người: có thể xem trạng thái phiên từ tray; thoát hẳn app từ tray.

**Quy tắc nghiệp vụ.** BR-04.

**Tiêu chí chấp nhận.**

1. AC-05.1: Ở trạng thái idle (không phiên nào chạy, app ở tray), tiến trình dùng RAM
   < 100MB và CPU < 1%, đo trung bình trên cửa sổ 5 phút.
2. AC-05.2: Độ trễ audio đầu-cuối p95 < 3s (trùng AC-01.2) và độ trễ dịch vùng p95 < 2s
   (trùng AC-02.2) được đo bằng benchmark tự động; vượt budget là fail review/CI.
3. AC-05.3: Capture, STT, OCR và LLM I/O chạy trên task/thread riêng; UI/overlay không bị
   block (không khung hình treo do pipeline - kiểm bằng test không có blocking call trong
   async context và e2e overlay vẫn phản hồi khi phiên đang chạy).
4. AC-05.4: Sau khi dừng mọi phiên, mức dùng tài nguyên trở về ngưỡng idle của AC-05.1
   trong vòng 60s (tài nguyên phiên được giải phóng, không rò rỉ).
5. AC-05.5: Benchmark độ trễ (criterion) cho đường STT chunk chạy trong CI; hồi quy vượt
   budget làm pipeline đỏ và chặn merge.

---

## Use cases {#use-cases}

| UC | Tên | Actor | FR liên quan |
|----|-----|-------|--------------|
| [UC-01](#uc-01) | Bật/dừng phiên dịch audio | Người dùng | FR-01, FR-04, FR-05 |
| [UC-02](#uc-02) | Chọn model whisper lần chạy đầu | Người dùng | FR-01 |
| [UC-03](#uc-03) | Dịch vùng màn hình với preview | Người dùng | FR-02, FR-04, FR-05 |
| [UC-04](#uc-04) | Quản lý provider và API key | Người dùng | FR-03 |
| [UC-05](#uc-05) | Xem và xoá lịch sử dịch | Người dùng | FR-04 |
| [UC-06](#uc-06) | Điều khiển nền qua tray và hotkey | Người dùng | FR-04, FR-05 |

### UC-01: Bật/dừng phiên dịch audio {#uc-01}

- Tiền điều kiện: đã có model whisper, có ít nhất một provider có key hợp lệ.
- Luồng chính: bấm hotkey/tray -> overlay phụ đề xuất hiện -> phụ đề song ngữ cập nhật theo
  audio -> bấm dừng -> capture ngừng <= 1s, tài nguyên giải phóng.
- Luồng thay thế: chưa có key -> thông báo lỗi dẫn đến Settings (AC-01.11); đoạn tin cậy
  thấp -> hiển thị kèm confidence flag (AC-01.7).
- Hậu điều kiện: nếu lịch sử bật, các lượt dịch được ghi text-only.

### UC-02: Chọn model whisper lần chạy đầu {#uc-02}

- Tiền điều kiện: lần chạy đầu, chưa có model trong `models/`.
- Luồng chính: app dò GPU/RAM -> gợi ý model -> người dùng xác nhận (hoặc chọn model khác)
  -> tải về kèm tiến độ -> sẵn sàng ([BF-04](04-business-flows.md#bf-04)).
- Luồng thay thế: người dùng hoãn -> FR-01 chưa dùng được, FR-02/FR-03 vẫn hoạt động.
- Hậu điều kiện: model đổi được sau trong Settings (AC-01.8).

### UC-03: Dịch vùng màn hình với preview {#uc-03}

- Tiền điều kiện: có provider có key hợp lệ.
- Luồng chính: hotkey/tray -> kéo chọn vùng -> preview hiện text OCR ngay -> bản dịch cập
  nhật (p95 < 2s) -> live update khi vùng đổi -> copy/re-translate/pin/đóng.
- Luồng thay thế: Esc huỷ chọn (AC-02.1); OCR trống -> báo "không nhận dạng được text",
  không gọi LLM (AC-02.7).
- Hậu điều kiện: lượt dịch ghi lịch sử text-only nếu đang bật.

### UC-04: Quản lý provider và API key {#uc-04}

- Luồng chính: mở Settings -> nhập key cho provider -> key vào keychain, UI hiện trạng thái
  masked -> kiểm tra key (1 lệnh gọi tối thiểu) -> chọn model, provider hoạt động, thứ tự
  fallback.
- Luồng thay thế: xoá key -> provider về trạng thái chưa cấu hình (AC-03.7); key sai ->
  báo không hợp lệ, không lộ key (AC-03.4).

### UC-05: Xem và xoá lịch sử dịch {#uc-05}

- Luồng chính: mở Lịch sử từ tray/Settings -> xem danh sách lượt dịch (text nguồn, bản
  dịch, provider/model, thời điểm) -> copy lại khi cần -> nút xoá toàn bộ luôn hiển thị.
- Luồng thay thế: tắt lịch sử trong Settings -> ngừng ghi (AC-04.6).

### UC-06: Điều khiển nền qua tray và hotkey {#uc-06}

- Luồng chính: app khởi động về tray -> mọi hành động chính kích hoạt được bằng hotkey khi
  app khác đang focus hoặc qua menu tray -> đóng cửa sổ chỉ thu về tray -> thoát hẳn qua
  menu tray.
- Hậu điều kiện: idle đạt budget AC-05.1.

## User stories {#user-stories}

| US | Là... tôi muốn... để... | FR | AC liên quan |
|----|-------------------------|----|--------------|
| US-01 {#us-01} | Là người xem video ngoại ngữ, tôi muốn phụ đề dịch song ngữ hiện theo thời gian thực cho mọi audio trên máy, để hiểu nội dung mà không đổi ứng dụng phát | FR-01 | AC-01.1, AC-01.2 |
| US-02 {#us-02} | Là người dùng, tôi muốn whisper tự nhận diện ngôn ngữ nguồn nhưng vẫn ghim thủ công được khi nhận diện sai, để phụ đề luôn đúng ngôn ngữ | FR-01 | AC-01.3, AC-01.4 |
| US-03 {#us-03} | Là người dùng Việt, tôi muốn ngôn ngữ đích mặc định là tiếng Việt và đổi được, để không phải cấu hình lại từ đầu | FR-01 | AC-01.5 |
| US-04 {#us-04} | Là người dùng mới, tôi muốn app gợi ý model whisper hợp với máy và chỉ tải khi tôi xác nhận, để không tốn băng thông/dung lượng ngoài ý muốn | FR-01 | AC-01.8 |
| US-05 {#us-05} | Là người chơi game/đọc UI ngoại ngữ, tôi muốn quét chọn một vùng màn hình và thấy bản dịch trong preview gần như tức thì, để không phải chụp-upload thủ công | FR-02 | AC-02.1..AC-02.3 |
| US-06 {#us-06} | Là người dùng, tôi muốn preview vùng tự cập nhật khi nội dung vùng thay đổi, để theo dõi hội thoại/log đang chạy | FR-02 | AC-02.4 |
| US-07 {#us-07} | Là người dùng trả phí API, tôi muốn key của tôi chỉ nằm trong keychain của OS và không bao giờ hiện lại ở đâu khác, để không bị đánh cắp | FR-03 | AC-03.2, AC-03.3 |
| US-08 {#us-08} | Là người dùng, tôi muốn chọn provider/model và thứ tự fallback, để phiên dịch không đứt khi một provider lỗi và tôi luôn biết provider nào vừa dịch | FR-03 | AC-03.5, AC-03.6 |
| US-09 {#us-09} | Là người dùng đa nhiệm, tôi muốn điều khiển mọi thứ bằng hotkey và tray khi app chạy ngầm, để không phải rời ứng dụng đang dùng | FR-04 | AC-04.1, AC-04.2 |
| US-10 {#us-10} | Là người dùng, tôi muốn pin overlay, copy kết quả và đóng nhanh bằng bàn phím, để dùng kết quả dịch theo cách của tôi | FR-04 | AC-04.3, AC-04.8 |
| US-11 {#us-11} | Là người dùng, tôi muốn lịch sử dịch text-only tự lưu local, xem lại được, xoá sạch được một nút và tắt hẳn được, để cân bằng tiện lợi và riêng tư | FR-04 | AC-04.4..AC-04.6 |
| US-12 {#us-12} | Là người dùng, tôi muốn UI tiếng Việt hoặc tiếng Anh tuỳ chọn, để dùng ngôn ngữ tôi thạo | FR-04 | AC-04.7 |
| US-13 {#us-13} | Là người dùng để app chạy nền cả ngày, tôi muốn app gần như không tốn tài nguyên khi idle và không làm giật máy khi dịch, để yên tâm bật thường trực | FR-05 | AC-05.1..AC-05.4 |

## Ma trận truy vết {#traceability}

| FR | UC | US | Màn hình ([10](10-ui-ux-wireframes.md)) | Khả thi ([12](12-technical-feasibility.md#feasibility-table)) |
|----|----|----|------------------------------------------|----------------------------------------------------------------|
| [FR-01](#fr-01) | UC-01, UC-02 | US-01..US-04 | SCR-01, SCR-05, SCR-08 | Dòng FR-01 |
| [FR-02](#fr-02) | UC-03 | US-05, US-06 | SCR-02, SCR-03 | Dòng FR-02 |
| [FR-03](#fr-03) | UC-04 | US-07, US-08 | SCR-04 | Dòng FR-03 |
| [FR-04](#fr-04) | UC-05, UC-06 | US-09..US-12 | SCR-01, SCR-03, SCR-05, SCR-06, SCR-07 | Dòng FR-04 |
| [FR-05](#fr-05) | UC-01, UC-03, UC-06 | US-13 | SCR-07 | Dòng FR-05 |
