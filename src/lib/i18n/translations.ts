/*
 * UI string dictionaries (AC-04.7): Vietnamese and English, 100% of user-facing
 * strings go through these keys. Vietnamese strings are fully accented.
 * The `en` dictionary is the canonical key set; `vi` must cover every key.
 */

const en = {
  "app.title": "OST",

  // SCR-02: region selection overlay
  "select.overlayLabel": "Select a screen region to translate",
  "select.hintMouse": "Drag to select a region - release or Enter to confirm",
  "select.hintKeyboard":
    "Keyboard: arrow keys move, Space anchors the region, Enter confirms, Esc cancels",
  "select.dimensionsLabel": "Selection size",

  // SCR-03: region translation preview overlay
  "preview.title": "Region translation",
  "preview.sourceLabel": "Source text",
  "preview.translationLabel": "Translation",
  "preview.waitingOcr": "Recognizing text...",
  "preview.translating": "Translating...",
  "preview.translationError":
    "Translation failed - please try again or switch provider",
  "preview.translationTimeout":
    "Translation timed out - please try again or switch provider",
  "preview.emptyOcr": "No text recognized in the selected region",
  "preview.lowConfidence": "Low confidence - the result may be inaccurate",
  "preview.copySource": "Copy source text",
  "preview.copyTranslation": "Copy translation",
  "preview.copied": "Copied to clipboard",
  "preview.retranslate": "Re-translate",
  "preview.pin": "Pin overlay",
  "preview.unpin": "Unpin overlay",
  "preview.close": "Close",
  "preview.liveUpdate": "Live update",
  "preview.opacity": "Background opacity",
  "preview.providerModel": "Provider and model",
  "preview.providerBadge": "Active provider and model",
  "preview.dragHandle": "Drag to reposition",
  "preview.moveHandle": "Move overlay (arrow keys while focused)",

  // SCR-04: Settings - providers and keys (FR-03)
  "settings.title": "Settings",
  "settings.providersHeading": "Providers and API keys",
  "settings.providersHint":
    "Keys are stored only in your operating system keychain - never in files, logs, or history.",
  "settings.keyLabel": "{provider} API key",
  "settings.keyPlaceholder": "Paste API key",
  "settings.statusConfigured": "Key configured",
  "settings.statusNotConfigured": "No key",
  "settings.save": "Save key",
  "settings.saving": "Saving...",
  "settings.check": "Check key",
  "settings.checking": "Checking...",
  "settings.remove": "Remove key",
  "settings.model": "Model",
  "settings.result.saved": "Key validated and saved",
  "settings.result.storedUnvalidated":
    "Key saved - live validation is not available for this provider yet",
  "settings.result.valid": "Key is valid",
  "settings.result.invalid":
    "Key is invalid - please check it and enter it again",
  "settings.error.network": "Network error - could not reach the provider",
  "settings.error.quota":
    "Provider quota or rate limit reached - please try again later",
  "settings.error.timeout": "The provider request timed out - please try again",
  "settings.error.config": "Provider configuration error",
  "settings.error.keychain": "Could not access the operating system keychain",
  "settings.error.invalidInput": "The key format is invalid",
  "settings.error.unknownProvider": "Unknown provider",
  "settings.error.notConfigured": "No key is configured for this provider",
  "settings.error.provider": "Provider error - please try again",
  "settings.activeHeading": "Active provider and model",
  "settings.defaultProvider": "Default provider",
  "settings.defaultModel": "Default model",
  "settings.fallbackHeading": "Fallback order",
  "settings.fallbackHint":
    "When the active provider fails, the next configured provider is tried in this order.",
  "settings.moveUp": "Move up",
  "settings.moveDown": "Move down",
  "settings.fallbackNoKey": "no key",

  // Shared primitives
  "ui.select.placeholder": "Choose...",
} as const;

const vi: Record<I18nKey, string> = {
  "app.title": "OST",

  "select.overlayLabel": "Chọn vùng màn hình để dịch",
  "select.hintMouse":
    "Kéo chuột để chọn vùng - thả chuột hoặc Enter để xác nhận",
  "select.hintKeyboard":
    "Bàn phím: phím mũi tên di chuyển, Space neo vùng chọn, Enter xác nhận, Esc huỷ",
  "select.dimensionsLabel": "Kích thước vùng chọn",

  "preview.title": "Dịch vùng màn hình",
  "preview.sourceLabel": "Văn bản nguồn",
  "preview.translationLabel": "Bản dịch",
  "preview.waitingOcr": "Đang nhận dạng văn bản...",
  "preview.translating": "Đang dịch...",
  "preview.translationError":
    "Dịch thất bại - vui lòng thử lại hoặc đổi provider",
  "preview.translationTimeout":
    "Dịch quá thời gian chờ - vui lòng thử lại hoặc đổi provider",
  "preview.emptyOcr": "Không nhận dạng được văn bản trong vùng đã chọn",
  "preview.lowConfidence": "Độ tin cậy thấp - kết quả có thể không chính xác",
  "preview.copySource": "Chép văn bản nguồn",
  "preview.copyTranslation": "Chép bản dịch",
  "preview.copied": "Đã chép vào clipboard",
  "preview.retranslate": "Dịch lại",
  "preview.pin": "Ghim overlay",
  "preview.unpin": "Bỏ ghim overlay",
  "preview.close": "Đóng",
  "preview.liveUpdate": "Tự cập nhật",
  "preview.opacity": "Độ mờ nền",
  "preview.providerModel": "Provider và model",
  "preview.providerBadge": "Provider và model đang dịch",
  "preview.dragHandle": "Kéo để đổi vị trí",
  "preview.moveHandle": "Di chuyển overlay (phím mũi tên khi đang focus)",

  "settings.title": "Cài đặt",
  "settings.providersHeading": "Provider và API key",
  "settings.providersHint":
    "Key chỉ được lưu trong keychain của hệ điều hành - không bao giờ nằm trong tập tin, log hay lịch sử.",
  "settings.keyLabel": "API key của {provider}",
  "settings.keyPlaceholder": "Dán API key",
  "settings.statusConfigured": "Đã có key",
  "settings.statusNotConfigured": "Chưa có key",
  "settings.save": "Lưu key",
  "settings.saving": "Đang lưu...",
  "settings.check": "Kiểm tra key",
  "settings.checking": "Đang kiểm tra...",
  "settings.remove": "Xoá key",
  "settings.model": "Model",
  "settings.result.saved": "Key hợp lệ và đã được lưu",
  "settings.result.storedUnvalidated":
    "Đã lưu key - provider này chưa hỗ trợ kiểm tra trực tiếp",
  "settings.result.valid": "Key hợp lệ",
  "settings.result.invalid":
    "Key không hợp lệ - vui lòng kiểm tra lại và nhập lần nữa",
  "settings.error.network": "Lỗi mạng - không kết nối được tới provider",
  "settings.error.quota":
    "Provider đã hết hạn mức hoặc bị giới hạn tần suất - vui lòng thử lại sau",
  "settings.error.timeout":
    "Yêu cầu tới provider quá thời gian chờ - vui lòng thử lại",
  "settings.error.config": "Lỗi cấu hình provider",
  "settings.error.keychain": "Không truy cập được keychain của hệ điều hành",
  "settings.error.invalidInput": "Định dạng key không hợp lệ",
  "settings.error.unknownProvider": "Provider không xác định",
  "settings.error.notConfigured": "Provider này chưa được cấu hình key",
  "settings.error.provider": "Lỗi provider - vui lòng thử lại",
  "settings.activeHeading": "Provider và model đang hoạt động",
  "settings.defaultProvider": "Provider mặc định",
  "settings.defaultModel": "Model mặc định",
  "settings.fallbackHeading": "Thứ tự dự phòng",
  "settings.fallbackHint":
    "Khi provider đang hoạt động gặp lỗi, provider kế tiếp đã cấu hình sẽ được thử theo thứ tự này.",
  "settings.moveUp": "Đưa lên",
  "settings.moveDown": "Đưa xuống",
  "settings.fallbackNoKey": "chưa có key",

  "ui.select.placeholder": "Chọn...",
};

export type I18nKey = keyof typeof en;
export type Locale = "vi" | "en";

export const translations: Record<Locale, Record<I18nKey, string>> = { en, vi };
