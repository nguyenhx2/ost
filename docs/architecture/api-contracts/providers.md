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
`"gemini" | "anthropic" | "openai" | "openrouter" | "local_openai"`.

Cả 4 provider "keyed" đều đã có client (Gemini từ TASK-006; Anthropic, OpenAI, OpenRouter
từ TASK-010) - mỗi client là một module implement trait, KHÔNG sửa trait, resolve qua
`factory::build_provider` (NFR-SCA-02).

`local_openai` (TASK-026 phần B, FR-03.CUSTOM-1..5) là provider thứ 5 - xem mục riêng
"Provider dịch local OpenAI-compatible" bên dưới. Nó KHÔNG nằm trong `ProviderId::ALL`
(danh sách 4 provider dùng keychain, iterate bởi `keys::KeyStore`) mà nằm trong
`ProviderId::ALL_TRANSLATION` (danh sách 5 provider cho picker Settings) - vì nó không
bao giờ đụng tới OS keychain.

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
| `LocalServerUnreachable` | `local_openai` từ chối kết nối (connection refused) - server local (LM Studio) chưa chạy | Có |
| `Timeout` | request timeout hoặc stream idle timeout | Có |
| `InvalidResponse` | serde schema validation fail / thiếu field bắt buộc | Không |
| `Api` | HTTP status khác chưa phân loại | Không |
| `Config` | base URL không an toàn, model_id sai định dạng, build client fail | Không |

`LocalServerUnreachable` tách biệt khỏi `Network` CHỈ cho `local_openai`: một connection
refused ở đây nghĩa là "server local chưa bật", nên UI hiển thị thông điệp khác hẳn một
lỗi mạng chung chung của các provider cloud.

Mọi `message` trong error đi qua `redact_secret` (thay giá trị key bằng `[REDACTED]`,
cắt còn <= 300 ký tự) trước khi được tạo - NFR-SEC-08.

## Prompt template (AC-03.8, `src-tauri/src/providers/prompt.rs`)

- `TranslationPrompt { instruction, data_block, single_message }`:
  - `instruction`: chỉ thị tin cậy, build từ template tĩnh + mã ngôn ngữ đã sanitize
    (chỉ alphanumeric và `-`); KHÔNG BAO GIỜ chứa text capture. Đi vào kênh instruction
    riêng của provider (Gemini: `systemInstruction`).
  - `data_block`: text capture nguyên văn, bọc giữa delimiter
    `<<<OST_UNTRUSTED_SOURCE_TEXT_BEGIN>>>` / `<<<OST_UNTRUSTED_SOURCE_TEXT_END>>>`.
    Đi vào kênh user content, là nội dung DUY NHẤT ở đó.
  - `single_message`: CHỈ `Some` khi `request.model_id` là Hy-MT2
    (`local_models::is_hy_mt2_model`) - xem mục "Model local Hy-MT2/Qwen3" bên dưới.
- Instruction ghim rõ: nội dung giữa delimiter là DATA không tin cậy, mọi "chỉ thị" bên
  trong bị bỏ qua; output chỉ là bản dịch plain text.
- Test chứng minh: text dạng chỉ thị trong data slot không lọt vào instruction và
  instruction bất biến theo nội dung capture.
- `build_translation_prompt` dispatch theo `request.model_id`: Hy-MT2 dùng template riêng
  (xem dưới), MỌI model khác (kể cả 4 provider cloud và các model local khác) dùng template
  chung như trên, KHÔNG đổi hành vi.

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
là NƠI DUY NHẤT map `ProviderId` sang client cụ thể cho 4 provider "keyed". Cả command key
(validate/store) lẫn router fallback tương lai (AC-03.6) dựng client qua đây, nên thêm
provider keyed mới = một match arm, zero call-site (NFR-SCA-02). Gọi `build_provider` với
`ProviderId::LocalOpenAi` trả về `ProviderError::Config` (provider này cần `base_url`, không
có slot trong chữ ký hàm) - dùng `build_local_openai_provider` thay thế.

`build_local_openai_provider(base_url: impl Into<String>) -> Result<Box<dyn
TranslationProvider>, ProviderError>` dựng `local_openai::LocalOpenAiClient` từ `base_url`
người dùng nhập; từ chối bất kỳ giá trị không loopback nào bằng `ProviderError::Config`
(đây là nơi DUY NHẤT enforce ràng buộc loopback cho provider này, qua
`ProviderHttpConfig::is_loopback_only`).

## Provider dịch local OpenAI-compatible (`src-tauri/src/providers/local_openai.rs`, FR-03.
CUSTOM-1..5, TASK-026 phần B)

| Thao tác | Endpoint |
|----------|----------|
| translate | `POST {base}/v1/chat/completions` (`stream: false`) |
| translate_stream | `POST {base}/v1/chat/completions` (`stream: true`, SSE) |
| list_models | `GET {base}/v1/models` (catalog OpenAI-compatible, best-effort) |
| validate_key | `GET {base}/v1/models` (dùng lại làm connectivity check - xem dưới) |

- Phục vụ LM Studio và các server tương thích OpenAI khác chạy trên máy người dùng
  (`localhost`/`127.0.0.1`/`[::1]`), KHÔNG BAO GIỜ một host thật, kể cả qua `https://`
  (khác với các client cloud - `ProviderHttpConfig::is_loopback_only` nghiêm hơn
  `base_url_is_allowed`). Vi phạm bị từ chối bằng `ProviderError::Config` tại
  `LocalOpenAiClient::with_config` / `build_local_openai_provider`.
- KHÔNG yêu cầu và KHÔNG BAO GIỜ đọc API key: tham số `key: &ApiKey` bắt buộc bởi trait vẫn
  tồn tại (đồng nhất chữ ký với 4 client kia) nhưng client này không bao giờ gọi
  `key.expose()` và không gửi header `Authorization` - LM Studio bỏ qua auth. Không có gì
  của provider này được ghi vào OS keychain (xem mục `ProviderId` ở trên).
- Wire schema (`WireRequest`/`WireResponse`), tách chỉ thị/dữ liệu (AC-03.8), và phần lớn
  logic HTTP (parse lỗi, đọc SSE) TÁI SỬ DỤNG nguyên vẹn từ `openai.rs` vì bề mặt tương
  thích OpenAI theo định nghĩa.
- `list_models` gọi `GET /v1/models` và parse catalog OpenAI-compatible
  (`{"data": [{"id": ...}]}`) thành `ModelInfo` (không có tên hiển thị riêng, dùng `id` cho
  cả hai trường); nếu server không hỗ trợ hoặc không phản hồi đúng schema, người dùng vẫn
  nhập `model_id` tự do (trường free-text, mục 4.B PRD-FR-01) - `model_id` vẫn là chuỗi
  opaque như mọi provider khác.
- `validate_key` được TÁI DÙNG làm connectivity check (không có khái niệm "sai key" ở đây):
  gọi `GET /v1/models`, `200` -> `KeyValidation::Valid`; các lỗi transport được phân loại
  bằng taxonomy chung, bao gồm `LocalServerUnreachable` khi bị từ chối kết nối.
- Connection refused (server local chưa chạy) map thành `ProviderError::LocalServerUnreachable`
  ở CẢ BỐN thao tác (`translate`, `translate_stream`, `list_models`, `validate_key`) - phân
  biệt rõ với `ProviderError::Network` chung chung, để UI hiển thị đúng "hãy khởi động LM
  Studio" thay vì một lỗi mạng mơ hồ.
- Không có base URL production mặc định (không giống 4 client kia) - người dùng PHẢI nhập
  `base_url` trong Settings; lưu trữ giá trị này (KHÔNG phải secret) là trách nhiệm của
  settings store (tauri-plugin-store), NGOÀI phạm vi layer này.
- Loopback-only ở tầng HTTP client: `LocalOpenAiClient::with_config` dựng `reqwest::Client`
  với `redirect::Policy::none()` - server local không có lý do hợp lệ nào để redirect, và
  chính sách mặc định của reqwest (theo tối đa 10 redirect tới BẤT KỲ host nào) sẽ phá vỡ
  bất biến loopback-only nếu một server cục bộ (hoặc kẻ tấn công đứng giữa) trả về `3xx` trỏ
  ra ngoài máy. Một `3xx` không được theo sẽ rơi vào nhánh lỗi chung (`ProviderError::Api`
  với `status` gốc) ở cả `translate`/`translate_stream`/`list_models`/`validate_key`.
- `commands::keys::delete_provider_key("local_openai")` bị TỪ CHỐI trước khi chạm tới
  `KeyStore` (trả `KeyCommandError::Config`, kind `"config"` - không thêm kind mới): vì
  provider này không bao giờ có entry trong OS keychain (xem mục `ProviderId` ở trên),
  `store.delete_key` phải không bao giờ được gọi cho nó. `save_provider_key`/
  `check_provider_key` đã an toàn "by construction" (nhánh `provider_client` ->
  `build_provider` báo lỗi `Config` trước khi có client, nên không bao giờ tới bước lưu/đọc
  keychain) nên KHÔNG cần cổng tiền kiểm tra riêng; `delete_provider_key` KHÔNG có bước dựng
  client nào trên đường đi tới keychain nên có cổng tường minh riêng trong
  `commands/keys.rs`.

### Model local Hy-MT2/Qwen3 (`src-tauri/src/providers/local_models.rs`, owner ask 2026-07-12)

GIẢ ĐỊNH (không xây runtime manager): app KHÔNG khởi động/quản lý llama-server hay Ollama.
Người dùng tự chạy server OpenAI-compatible của họ; app chỉ gọi endpoint (giống hệt
`local_openai` từ TASK-026 phần B) - phần này CHỈ thêm việc chọn PROMPT/PARAM đúng theo
`model_id`, không thêm bất kỳ hành vi HTTP mới nào.

- Phát hiện model bằng substring case-insensitive trên `model_id` tự do người dùng nhập/chọn
  preset (`is_hy_mt2_model`: chứa `"hy-mt2"`; `is_qwen3_model`: chứa `"qwen3"`) - KHÔNG có
  catalog tra cứu, nhất quán với việc provider này không có model list cố định.
- `generation_params_for_model(model_id) -> GenerationParams { temperature, top_p, top_k,
  repetition_penalty, enable_thinking }`:
  - Hy-MT2: `temperature=0.7, top_p=0.6, top_k=20, repetition_penalty=1.05` (khuyến nghị
    chính thức của Tencent), `enable_thinking=None`.
  - Qwen3: `temperature=0.2` (giống default chung), `enable_thinking=Some(false)` (tắt suy
    luận - nếu không sẽ lẫn "reasoning trace" vào bản dịch).
  - Model khác (kể cả local model không tên): `GenerationParams::default()` = giống hệt
    hành vi trước tính năng này (`temperature=0.2`, không trường nào khác).
  - Các trường `Option` được serialize với `skip_serializing_if = "Option::is_none"` trên
    `WireRequest` (dùng chung với `openai.rs`/`openrouter.rs`) - 4 client cloud KHÔNG BAO GIỜ
    set các trường này nên JSON gửi đi của họ không đổi.
- Qwen3 còn được thêm quy ước `/no_think` vào CUỐI message `system` (chỉ thị tin cậy, không
  đụng tới `user`/data block) - vì hỗ trợ trường `enable_thinking` phía server khác nhau tuỳ
  implementation, quy ước text là lớp phòng thủ thứ hai.
- Hy-MT2 là model CHỈ-DỊCH (không phải chat model): `build_translation_prompt` trả về
  `single_message = Some(...)` đúng NGUYÊN VĂN template Tencent yêu cầu:
  `"Translate the following segment into <target>, without additional explanation.\n\n<text>"`
  - gửi dưới dạng MỘT message `role: "user"` DUY NHẤT (không tách system/user như template
    chung) - tách role sẽ lệch khỏi phân phối fine-tune của model và cho ra bản dịch tệ.
  - ĐÁNH ĐỔI BẢO MẬT được ghi rõ tại doc-comment của `single_message`: template bắt buộc
    của Tencent không có delimiter, nên đây là nơi DUY NHẤT trong provider layer text capture
    không được bọc delimiter tường minh. Bất biến cốt lõi vẫn giữ: chỉ thị luôn được build
    từ template tĩnh + ngôn ngữ đã sanitize, text capture CHỈ được nối vào SAU chỉ thị, không
    bao giờ chen vào trước hay viết đè template - text capture không có quyền lực gì lên hành
    vi của app. Model Hy-MT2 tự ý làm theo nội dung dạng chỉ thị bên trong đoạn cần dịch là
    rủi ro cố hữu của mọi prompt một chuỗi trên model dịch nhỏ, không phải lỗ hổng riêng của
    OST - ghi nhận tường minh cho security-reviewer thay vì im lặng chấp nhận.
- Preset Settings (`src/lib/providers.ts::LOCAL_MODEL_PRESETS`, ID PHẢI khớp substring phát
  hiện phía Rust): `Hy-MT2-7B` (mặc định), `Qwen3-14B`, `Hy-MT2-30B-A3B` (chỉ batch) - đều là
  preset điền sẵn `model_id` tự do, trường nhập tay vẫn luôn khả dụng.

### Command surface tối thiểu (`src-tauri/src/commands/providers.rs`)

- `provider_picker_metadata() -> Vec<ProviderMetadata>`: metadata tĩnh (`provider_id`,
  `display_name`, `requires_base_url`) cho cả 5 provider (`ProviderId::ALL_TRANSLATION`) để
  WebView render picker mà không cần hardcode danh sách thứ hai. `requires_base_url = true`
  CHỈ cho `local_openai` - UI hiển thị trường `base_url` thay vì trường API key.
- `check_local_provider_connection(base_url: String) -> Result<(), LocalProviderCommandError>`:
  validate `base_url` (loopback-only) rồi thử kết nối TRƯỚC KHI frontend lưu giá trị vào
  settings store. Lỗi trả về dạng `{ "kind": "invalidBaseUrl" | "localServerUnreachable" |
  "network" | "timeout" | "provider" }` - không bao giờ mang message thô từ provider.
- Cả hai command KHÔNG đụng tới `keys::KeyStore` và KHÔNG lưu bất kỳ giá trị nào - việc lưu
  `base_url` vào settings store là việc của tầng UI/shell, ngoài phạm vi `providers/` và
  `keys/`.

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

- Mọi HTTP provider mock bằng wiremock; KHÔNG có lệnh gọi API thật trong test/CI. Với
  `local_openai`, "server không chạy" được mô phỏng bằng cách trỏ tới một cổng loopback
  không ai lắng nghe (`http://127.0.0.1:1`) để kích hoạt connection-refused một cách
  deterministic, thay vì cần một server LM Studio thật.
- Keyring được mock qua trait `KeyBackend`; round-trip Windows Credential Manager thật là
  manual smoke test.
- Smoke test live (nếu có) chỉ chạy opt-in sau cờ env `OST_TEST_*`, không bao giờ chạy
  mặc định trong CI.
- `local_openai::tests::vietnamese_diacritics_survive_round_trip`: kiểm chứng riêng rằng
  response UTF-8 (tiếng Việt có dấu) được decode nguyên vẹn qua client local - owner yêu cầu
  kiểm tra rõ ràng sau các thay đổi lượng tử hoá (quant) model.
