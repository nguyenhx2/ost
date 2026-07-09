# Provider contract - `TranslationProvider` (FR-03)

Chủ sở hữu: llm-integration-dev. File này mô tả contract của provider layer
(`src-tauri/src/providers/`) và key storage (`src-tauri/src/keys/`). Mọi thay đổi
contract phải cập nhật file này TRONG CÙNG PR (docs-workflow.md).

Nguồn: FR-03 (AC-03.2, AC-03.3, AC-03.4, AC-03.7, AC-03.8), NFR-SEC-01/02/05/06/07/08,
NFR-SCA-02, ADR-003, data model 08.

## Nguyên tắc bất biến

1. KHÔNG thành phần nào ngoài `src-tauri/src/providers/` được nói chuyện HTTP với
   provider LLM (tech-stack.md). Cả hai pipeline (FR-01 audio, FR-02 screen) chỉ gọi qua
   trait `TranslationProvider`.
2. API key CHỈ nằm trong OS keychain, đi qua `src-tauri/src/keys/`. Giá trị key không bao
   giờ xuất hiện trong settings store, log, error, IPC payload, hay bất kỳ file nào
   (AC-03.2). WebView chỉ thấy `ProviderKeyStatus { provider_id, key_present }` (AC-03.3).
3. Thêm provider mới (Anthropic, OpenAI, OpenRouter) = thêm một module client implement
   trait, KHÔNG sửa trait, KHÔNG sửa call site (NFR-SCA-02).
4. Text capture (STT/OCR) là DATA không tin cậy: prompt tách chỉ thị/dữ liệu tường minh;
   response được serde-schema-validate trước khi dùng (AC-03.8, NFR-SEC-06).

## `ProviderId`

Enum serde string cố định (data model 08 - KHÔNG đổi):
`"gemini" | "anthropic" | "openai" | "openrouter"`.

TASK-006 chỉ ship client Gemini; ba provider còn lại là module follow-up.

## Trait `TranslationProvider` (Rust, `src-tauri/src/providers/traits.rs`)

```rust
#[async_trait]
pub trait TranslationProvider: Send + Sync {
    fn id(&self) -> ProviderId;

    async fn translate(
        &self,
        request: &TranslationRequest,
        key: &ApiKey,
    ) -> Result<TranslationResult, ProviderError>;

    async fn translate_stream(
        &self,
        request: &TranslationRequest,
        key: &ApiKey,
    ) -> Result<TranslationStream, ProviderError>;

    async fn list_models(&self, key: Option<&ApiKey>) -> Result<Vec<ModelInfo>, ProviderError>;

    async fn validate_key(&self, key: &ApiKey) -> Result<KeyValidation, ProviderError>;
}

pub type TranslationStream =
    Pin<Box<dyn Stream<Item = Result<TranslationChunk, ProviderError>> + Send>>;
```

### Kiểu dữ liệu

| Kiểu | Trường | Ghi chú |
|------|--------|---------|
| `TranslationRequest` | `model_id: String`, `source_language: Option<String>`, `target_language: String`, `text: String` | `model_id` là chuỗi opaque, KHÔNG có default trong logic; `text` là DATA không tin cậy |
| `TranslationResult` | `provider_id`, `model_id`, `translated_text` | Mang provider/model THỰC TẾ đã dịch (badge UI, AC-03.5); render plain text |
| `TranslationChunk` | `text_delta: String` | Delta text theo thứ tự của stream |
| `ModelInfo` | `id`, `display_name` | `id` = `model_id` opaque |
| `KeyValidation` | `Valid` \| `Invalid { reason }` | `reason` đã redact, không bao giờ chứa key |

### Hành vi `validate_key` (AC-03.4)

- Đúng MỘT lệnh gọi tối thiểu, KHÔNG retry (test wiremock assert `expect(1)`).
- Kết quả typed: key sai -> `Ok(Invalid { reason })`; lỗi transport (mạng/timeout) ->
  `Err(...)` - không được nhầm thành "key không hợp lệ".
- Gemini dùng `GET /v1beta/models?pageSize=1` làm lệnh gọi tối thiểu.

### Streaming

- `translate_stream` trả stream các `TranslationChunk` sau khi headers được xác nhận
  thành công; lỗi HTTP (auth/quota/...) trả về `Err` typed TRƯỚC khi stream bắt đầu.
- Lỗi giữa stream (mạng, schema, idle timeout) là item `Err` cuối cùng của stream.
- Mỗi SSE event được serde-schema-validate trước khi dùng.

## Taxonomy lỗi `ProviderError` (`src-tauri/src/providers/error.rs`)

| Variant | Khi nào | Fallback trigger (AC-03.6, router là task sau) |
|---------|---------|------------------------------------------------|
| `Auth` | 401/403, hoặc Gemini 400 "API key not valid" | Có |
| `Quota` | HTTP 429 | Có |
| `Network` | DNS/connect/TLS/reset | Có |
| `Timeout` | request timeout hoặc stream idle timeout | Có |
| `InvalidResponse` | serde schema validation fail / thiếu field bắt buộc | Không |
| `Api` | HTTP status khác chưa phân loại | Không |
| `Config` | base URL không an toàn, model_id sai định dạng, build client fail | Không |

Mọi `message` trong error đi qua `redact_secret` (thay giá trị key bằng `[REDACTED]`,
cắt còn <= 300 ký tự) trước khi được tạo - NFR-SEC-08.

## Prompt template (AC-03.8, `src-tauri/src/providers/prompt.rs`)

- `TranslationPrompt { instruction, data_block }`:
  - `instruction`: chỉ thị tin cậy, build từ template tĩnh + mã ngôn ngữ đã sanitize
    (chỉ alphanumeric và `-`); KHÔNG BAO GIỜ chứa text capture. Đi vào kênh instruction
    riêng của provider (Gemini: `systemInstruction`).
  - `data_block`: text capture nguyên văn, bọc giữa delimiter
    `<<<OST_UNTRUSTED_SOURCE_TEXT_BEGIN>>>` / `<<<OST_UNTRUSTED_SOURCE_TEXT_END>>>`.
    Đi vào kênh user content, là nội dung DUY NHẤT ở đó.
- Instruction ghim rõ: nội dung giữa delimiter là DATA không tin cậy, mọi "chỉ thị" bên
  trong bị bỏ qua; output chỉ là bản dịch plain text.
- Test chứng minh: text dạng chỉ thị trong data slot không lọt vào instruction và
  instruction bất biến theo nội dung capture.

## Key storage (`src-tauri/src/keys/`, ADR-003)

```rust
pub struct KeyStore; // new_os_keychain() | with_backend(Arc<dyn KeyBackend>)
// store_key / retrieve_key / delete_key / key_status / all_statuses - đều async,
// backend keyring (blocking) chạy qua tokio::task::spawn_blocking (NFR-PERF-04).
```

- `ApiKey`: newtype redacting - `Debug` in `ApiKey([REDACTED])`, không có `Display`,
  không implement `Serialize`/`Deserialize` => giá trị key KHÔNG THỂ đi qua serde/IPC
  theo cấu trúc kiểu (AC-03.2, AC-03.3). Đọc giá trị chỉ qua `expose()` (giới hạn ở
  header HTTP và backend keychain).
- `ProviderKeyStatus { provider_id, key_present }` là kiểu DUY NHẤT về key được phép
  serialize cho WebView.
- `delete_key` idempotent; xoá xong `key_status` trả `key_present: false` (AC-03.7).

### Quy ước đặt tên keychain (PLACEHOLDER ĐÃ CHỐT - giữ ổn định)

| Thuộc tính | Giá trị |
|-----------|---------|
| service | `ost.provider-api-key` (hằng `KEYCHAIN_SERVICE`) |
| account | serde string của provider: `gemini` / `anthropic` / `openai` / `openrouter` |

Đổi quy ước này sẽ làm mồ côi credential đã lưu - coi như frozen; nếu buộc phải đổi thì
cần migration và ADR.

## Resilience defaults (PLACEHOLDER - có thể tune qua `ProviderHttpConfig`)

| Tham số | Default | Ghi chú |
|---------|---------|---------|
| `request_timeout` | 30s | Tổng budget một request non-streaming (và pha header của streaming) |
| `connect_timeout` | 10s | TCP/TLS |
| `stream_idle_timeout` | 30s | Khoảng lặng tối đa giữa hai chunk của stream |
| `max_retries` | 2 | Chỉ retry lỗi mạng và HTTP 5xx; timeout KHÔNG retry; `validate_key` KHÔNG BAO GIỜ retry |
| `retry_backoff` | 200ms | Exponential: lần thử N ngủ `retry_backoff * 2^N` |

Không có retry vô hạn, không có background work khi idle. Giá trị default là placeholder
bảo thủ; tinh chỉnh theo benchmark NFR-PERF ở task sau.

## HTTPS (NFR-SEC-07)

`ProviderHttpConfig.base_url` phải là `https://`; `http://` chỉ được chấp nhận với
loopback (`127.0.0.1`, `localhost`, `[::1]`) phục vụ wiremock trong test. Client từ chối
cấu hình khác bằng `ProviderError::Config`.

## `list_models` (PLACEHOLDER - nguồn danh sách model là open item)

- Gemini hiện trả DANH SÁCH PIN tối thiểu, hard-code có chú thích rõ trong
  `gemini.rs` (`PINNED_GEMINI_MODELS`): `gemini-2.5-flash`, `gemini-2.5-pro`,
  `gemini-2.0-flash`.
- `model_id` vẫn là chuỗi opaque: user nhập model ngoài danh sách vẫn hợp lệ; không có
  default nào bị bake vào logic dịch.
- Khi chốt nguồn catalog (API động vs danh sách curated), cập nhật mục này cùng PR.
- Tham số `key: Option<&ApiKey>` tồn tại vì một số provider yêu cầu auth để list model;
  Gemini hiện bỏ qua tham số này.

## Gemini client (`src-tauri/src/providers/gemini.rs`)

| Thao tác | Endpoint |
|----------|----------|
| translate | `POST {base}/v1beta/models/{model_id}:generateContent` |
| translate_stream | `POST {base}/v1beta/models/{model_id}:streamGenerateContent?alt=sse` |
| validate_key | `GET {base}/v1beta/models?pageSize=1` |

- Key đi trong header `x-goog-api-key`, KHÔNG BAO GIỜ trong URL (URL có thể bị log).
- Base production: `https://generativelanguage.googleapis.com`.
- Log của layer chỉ chứa: provider id, model id, status, số ký tự (KHÔNG log nội dung
  text capture/bản dịch, không log header). Message lỗi đã redact.

## Testing (testing.md)

- Mọi HTTP provider mock bằng wiremock; KHÔNG có lệnh gọi API thật trong test/CI.
- Keyring được mock qua trait `KeyBackend`; round-trip Windows Credential Manager thật là
  manual smoke test.
- Smoke test live (nếu có) chỉ chạy opt-in sau cờ env `OST_TEST_*`, không bao giờ chạy
  mặc định trong CI.
