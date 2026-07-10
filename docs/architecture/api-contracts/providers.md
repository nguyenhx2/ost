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

Cả 4 provider đều đã có client (Gemini từ TASK-006; Anthropic, OpenAI, OpenRouter từ
TASK-010) - mỗi client là một module implement trait, KHÔNG sửa trait, resolve qua
`factory::build_provider` (NFR-SCA-02).

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

- Cả 4 client hiện trả DANH SÁCH PIN tối thiểu, hard-code có chú thích rõ trong module
  tương ứng (`PINNED_<PROVIDER>_MODELS`):
  - Gemini: `gemini-2.5-flash`, `gemini-2.5-pro`, `gemini-2.0-flash`.
  - Anthropic: `claude-3-5-sonnet-latest`, `claude-3-5-haiku-latest`, `claude-3-opus-latest`.
  - OpenAI: `gpt-4o`, `gpt-4o-mini`, `gpt-4-turbo`.
  - OpenRouter: `openai/gpt-4o`, `anthropic/claude-3.5-sonnet`, `google/gemini-2.5-flash`
    (id namespaced `vendor/model`).
- `model_id` vẫn là chuỗi opaque: user nhập model ngoài danh sách vẫn hợp lệ; không có
  default nào bị bake vào logic dịch.
- Khi chốt nguồn catalog (API động vs danh sách curated), cập nhật mục này cùng PR.
- Tham số `key: Option<&ApiKey>` tồn tại vì một số provider yêu cầu auth để list model;
  cả 4 client hiện bỏ qua tham số này (danh sách pin tĩnh).

## Factory (`src-tauri/src/providers/factory.rs`)

`build_provider(provider: ProviderId) -> Result<Box<dyn TranslationProvider>, ProviderError>`
là NƠI DUY NHẤT map `ProviderId` sang client cụ thể. Cả command key (validate/store) lẫn
router fallback tương lai (AC-03.6) dựng client qua đây, nên thêm provider = một match arm,
zero call-site (NFR-SCA-02). Enum đóng trên 4 provider nên factory là total: chỉ lỗi khi
build client thất bại (`ProviderError::Config`), không bao giờ vì provider lạ.

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

## Anthropic client (`src-tauri/src/providers/anthropic.rs`)

| Thao tác | Endpoint |
|----------|----------|
| translate | `POST {base}/v1/messages` (`stream: false`) |
| translate_stream | `POST {base}/v1/messages` (`stream: true`, SSE) |
| validate_key | `GET {base}/v1/models?limit=1` |

- Key đi trong header `x-api-key`; mọi request kèm header bắt buộc
  `anthropic-version: 2023-06-01`. Key KHÔNG BAO GIỜ trong URL.
- Instruction tin cậy vào kênh `system`; data block không tin cậy là message `user` duy
  nhất (AC-03.8). `max_tokens` bắt buộc = 4096.
- Response: chuỗi các content block `type: "text"`; stream dùng event
  `content_block_delta` với `delta.type == "text_delta"`.
- Base production: `https://api.anthropic.com`.

## OpenAI client (`src-tauri/src/providers/openai.rs`)

| Thao tác | Endpoint |
|----------|----------|
| translate | `POST {base}/v1/chat/completions` (`stream: false`) |
| translate_stream | `POST {base}/v1/chat/completions` (`stream: true`, SSE) |
| validate_key | `GET {base}/v1/models` |

- Key đi trong header `Authorization: Bearer <key>`, KHÔNG BAO GIỜ trong URL.
- Instruction tin cậy là message `system`; data block không tin cậy là message `user`
  (AC-03.8). Response lấy `choices[0].message.content`; stream lấy
  `choices[0].delta.content`; sentinel `data: [DONE]` được bỏ qua.
- Base production: `https://api.openai.com`.
- Wire schema + helper HTTP (retry, error mapping, SSE parse, validate outcome) dùng chung
  cho OpenRouter (surface tương thích OpenAI).

## OpenRouter client (`src-tauri/src/providers/openrouter.rs`)

| Thao tác | Endpoint |
|----------|----------|
| translate | `POST {base}/v1/chat/completions` (`stream: false`) |
| translate_stream | `POST {base}/v1/chat/completions` (`stream: true`, SSE) |
| validate_key | `GET {base}/v1/auth/key` |

- Surface tương thích OpenAI: tái dùng wire schema + helper của `openai.rs`; chỉ sở hữu
  base URL (`/api` prefix), endpoint `validate_key`, và identity riêng.
- Key đi trong header `Authorization: Bearer <key>`, KHÔNG BAO GIỜ trong URL.
- `validate_key` dùng `GET /v1/auth/key` (yêu cầu auth, trả metadata của chính key) - lệnh
  tối thiểu đúng nghĩa (khác model list vốn public).
- SSE parser bỏ qua keep-alive comment (`: OPENROUTER PROCESSING`). `model_id` namespaced
  `vendor/model` được validate chấp nhận dấu `/` và `:`.
- Base production: `https://openrouter.ai/api`.

## Testing (testing.md)

- Mọi HTTP provider mock bằng wiremock; KHÔNG có lệnh gọi API thật trong test/CI.
- Keyring được mock qua trait `KeyBackend`; round-trip Windows Credential Manager thật là
  manual smoke test.
- Smoke test live (nếu có) chỉ chạy opt-in sau cờ env `OST_TEST_*`, không bao giờ chạy
  mặc định trong CI.
