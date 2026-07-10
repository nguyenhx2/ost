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
  "select.sourceLanguage": "Source language",

  // Source-language options (BR-07)
  "lang.auto": "Auto-detect",
  "lang.vi": "Vietnamese",
  "lang.en": "English",
  "lang.ja": "Japanese",
  "lang.ko": "Korean",
  "lang.zh": "Chinese",

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
  "preview.ocrError":
    "Could not recognize text - the capture or OCR step failed. Please try selecting the region again",
  "preview.emptyOcr": "No text recognized in the selected region",
  "preview.lowConfidence": "Low confidence - the result may be inaccurate",
  "preview.degradedNotice":
    "Recognition for the selected source language is degraded: some diacritics may be dropped from the text below. This is NOT flagged as low confidence - review the result carefully.",
  "preview.degradedReasonLabel": "Missing character set",
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
  "settings.error.persist": "Could not save the setting - please try again",
  "settings.activeHeading": "Active provider and model",
  "settings.defaultProvider": "Default provider",
  "settings.fallbackHeading": "Fallback order",
  "settings.fallbackHint":
    "When the active provider fails, the next configured provider is tried in this order.",
  "settings.moveUp": "Move up",
  "settings.moveDown": "Move down",
  "settings.fallbackNoKey": "no key",

  // Model-download consent (fail-closed egress UX)
  "consent.title": "Download OCR model",
  "consent.intro":
    "OST needs to download the OCR recognition model before it can translate this region. The files below are fetched over HTTPS from the host named here. No captured content or keys are sent - only the model files are downloaded.",
  "consent.blocked":
    "OCR is blocked until the model download is allowed. No text can be recognized yet.",
  "consent.reopen": "Review model download",
  "consent.hostLabel": "Download host",
  "consent.destinationLabel": "Saved to",
  "consent.totalSizeLabel": "Approximate total size",
  "consent.artifactsLabel": "Files to download",
  "consent.grant": "Allow download",
  "consent.decline": "Not now",

  // Settings - model downloads (revoke consent, BR-08)
  "settings.modelsHeading": "Model downloads",
  "settings.modelsHint":
    "These model sets have been allowed to download. Revoking a consent takes effect immediately - the next time that model is needed, OST asks again before downloading anything.",
  "settings.modelsEmpty":
    "No model downloads have been allowed yet. You will be asked before the first download.",
  "settings.modelAllowed": "Download allowed",
  "settings.modelHostLabel": "Download host",
  "settings.modelRevoke": "Revoke consent",
  "settings.modelRevoking": "Revoking...",
  "settings.modelRevokeError": "Could not revoke consent - please try again",

  // SCR: Translation history (FR-04, BR-06)
  "history.title": "Translation history",
  "history.subtitle":
    "Completed translations are saved locally as text only - never keys, audio, or screenshots.",
  "history.empty":
    "No translations yet. Completed translations will appear here.",
  "history.count": "{count} entries",
  "history.sourceLabel": "Source text",
  "history.translationLabel": "Translation",
  "history.sessionAudio": "Audio",
  "history.sessionRegion": "Region",
  "history.langArrow": "to",
  "history.copyTranslation": "Copy translation",
  "history.copied": "Copied to clipboard",
  "history.clearAll": "Clear all history",
  "history.clearAllTitle": "Clear all history?",
  "history.clearAllBody":
    "This permanently deletes every saved translation from this device. This cannot be undone.",
  "history.clearAllConfirm": "Delete everything",
  "history.cancel": "Cancel",

  // Settings - translation history (AC-04.6)
  "settings.historyHeading": "Translation history",
  "settings.historyHint":
    "When on, every completed translation is saved locally as text only (no keys, audio, or screenshots). Turning it off stops recording immediately; turning it back on resumes.",
  "settings.historyToggle": "Record translation history",
  "settings.historyError":
    "Could not change the history setting - please try again",

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
  "select.sourceLanguage": "Ngôn ngữ nguồn",

  "lang.auto": "Tự phát hiện",
  "lang.vi": "Tiếng Việt",
  "lang.en": "Tiếng Anh",
  "lang.ja": "Tiếng Nhật",
  "lang.ko": "Tiếng Hàn",
  "lang.zh": "Tiếng Trung",

  "preview.title": "Dịch vùng màn hình",
  "preview.sourceLabel": "Văn bản nguồn",
  "preview.translationLabel": "Bản dịch",
  "preview.waitingOcr": "Đang nhận dạng văn bản...",
  "preview.translating": "Đang dịch...",
  "preview.translationError":
    "Dịch thất bại - vui lòng thử lại hoặc đổi provider",
  "preview.translationTimeout":
    "Dịch quá thời gian chờ - vui lòng thử lại hoặc đổi provider",
  "preview.ocrError":
    "Không nhận dạng được văn bản - bước chụp hoặc OCR đã thất bại. Vui lòng chọn lại vùng màn hình",
  "preview.emptyOcr": "Không nhận dạng được văn bản trong vùng đã chọn",
  "preview.lowConfidence": "Độ tin cậy thấp - kết quả có thể không chính xác",
  "preview.degradedNotice":
    "Khả năng nhận dạng cho ngôn ngữ nguồn đã chọn bị suy giảm: một số dấu phụ có thể bị rơi khỏi văn bản bên dưới. Đây KHÔNG được đánh dấu là độ tin cậy thấp - hãy kiểm tra kết quả cẩn thận.",
  "preview.degradedReasonLabel": "Bộ ký tự bị thiếu",
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
  "settings.error.persist": "Không lưu được cài đặt - vui lòng thử lại",
  "settings.activeHeading": "Provider và model đang hoạt động",
  "settings.defaultProvider": "Provider mặc định",
  "settings.fallbackHeading": "Thứ tự dự phòng",
  "settings.fallbackHint":
    "Khi provider đang hoạt động gặp lỗi, provider kế tiếp đã cấu hình sẽ được thử theo thứ tự này.",
  "settings.moveUp": "Đưa lên",
  "settings.moveDown": "Đưa xuống",
  "settings.fallbackNoKey": "chưa có key",

  "consent.title": "Tải mô hình OCR",
  "consent.intro":
    "OST cần tải mô hình nhận dạng OCR trước khi có thể dịch vùng này. Các tệp bên dưới được tải qua HTTPS từ máy chủ được nêu tên tại đây. Không có nội dung đã chụp hay khoá nào được gửi đi - chỉ tải các tệp mô hình.",
  "consent.blocked":
    "OCR bị chặn cho tới khi cho phép tải mô hình. Chưa thể nhận dạng văn bản.",
  "consent.reopen": "Xem lại việc tải mô hình",
  "consent.hostLabel": "Máy chủ tải về",
  "consent.destinationLabel": "Lưu vào",
  "consent.totalSizeLabel": "Tổng dung lượng ước tính",
  "consent.artifactsLabel": "Các tệp sẽ tải",
  "consent.grant": "Cho phép tải",
  "consent.decline": "Để sau",

  "settings.modelsHeading": "Tải mô hình",
  "settings.modelsHint":
    "Các bộ mô hình dưới đây đã được cho phép tải về. Thu hồi cho phép có hiệu lực ngay lập tức - lần sau khi cần mô hình đó, OST sẽ hỏi lại trước khi tải bất cứ thứ gì.",
  "settings.modelsEmpty":
    "Chưa có mô hình nào được cho phép tải. Bạn sẽ được hỏi trước lần tải đầu tiên.",
  "settings.modelAllowed": "Đã cho phép tải",
  "settings.modelHostLabel": "Máy chủ tải về",
  "settings.modelRevoke": "Thu hồi cho phép",
  "settings.modelRevoking": "Đang thu hồi...",
  "settings.modelRevokeError": "Không thu hồi được cho phép - vui lòng thử lại",

  "history.title": "Lịch sử dịch",
  "history.subtitle":
    "Các lượt dịch hoàn tất được lưu cục bộ chỉ dưới dạng văn bản - không bao giờ chứa key, âm thanh hay ảnh chụp.",
  "history.empty":
    "Chưa có lượt dịch nào. Các lượt dịch hoàn tất sẽ xuất hiện ở đây.",
  "history.count": "{count} mục",
  "history.sourceLabel": "Văn bản nguồn",
  "history.translationLabel": "Bản dịch",
  "history.sessionAudio": "Âm thanh",
  "history.sessionRegion": "Vùng màn hình",
  "history.langArrow": "sang",
  "history.copyTranslation": "Chép bản dịch",
  "history.copied": "Đã chép vào clipboard",
  "history.clearAll": "Xoá toàn bộ lịch sử",
  "history.clearAllTitle": "Xoá toàn bộ lịch sử?",
  "history.clearAllBody":
    "Thao tác này xoá vĩnh viễn mọi lượt dịch đã lưu trên thiết bị này và không thể hoàn tác.",
  "history.clearAllConfirm": "Xoá tất cả",
  "history.cancel": "Huỷ",

  "settings.historyHeading": "Lịch sử dịch",
  "settings.historyHint":
    "Khi bật, mỗi lượt dịch hoàn tất được lưu cục bộ chỉ dưới dạng văn bản (không có key, âm thanh hay ảnh chụp). Tắt sẽ dừng ghi ngay lập tức; bật lại thì ghi tiếp.",
  "settings.historyToggle": "Ghi lịch sử dịch",
  "settings.historyError":
    "Không thay đổi được cài đặt lịch sử - vui lòng thử lại",

  "ui.select.placeholder": "Chọn...",
};

export type I18nKey = keyof typeof en;
export type Locale = "vi" | "en";

export const translations: Record<Locale, Record<I18nKey, string>> = { en, vi };
