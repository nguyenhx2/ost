/*
 * UI string dictionaries (AC-04.7): Vietnamese and English, 100% of user-facing
 * strings go through these keys. Vietnamese strings are fully accented.
 * The `en` dictionary is the canonical key set; `vi` must cover every key.
 */

const en = {
  "app.title": "OST",

  // Home screen (main window, FR-04 TASK-028)
  "home.subtitle": "Live audio and screen translation",
  "home.statusHeading": "Status",
  "home.providerLabel": "Active provider and model",
  "home.sttLabel": "Speech-to-text model",
  "home.sttDownloaded": "Downloaded",
  "home.sttNotDownloaded": "Not downloaded yet",
  "home.audioSessionLabel": "Audio session",
  "home.audioRunning": "Running",
  "home.audioIdle": "Not running",
  "home.noProviderKey":
    "No provider key is configured yet - open Settings to add one",
  "home.openSettings": "Open Settings",
  "home.actionsHeading": "Quick actions",
  "home.hotkeyLabel": "Hotkey",
  "home.actionRegion": "Translate a screen region",
  "home.actionRegionCta": "Select region",
  "home.actionAudio": "Start / stop live audio translation",
  "home.actionAudioStart": "Start",
  "home.actionAudioStop": "Stop",
  "home.actionSettings": "Settings",
  "home.actionSettingsCta": "View Settings",
  "home.actionHistory": "History",
  "home.actionHistoryCta": "Open History",
  "home.audioStartError":
    "Could not start the audio session - please try again",
  "home.regionSourceLanguage": "Region source language",
  "home.regionTargetLanguage": "Region target language",

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
  "lang.es": "Spanish",
  "lang.fr": "French",
  "lang.de": "German",
  "lang.ru": "Russian",
  "lang.pt": "Portuguese",
  "lang.it": "Italian",
  "lang.th": "Thai",
  "lang.id": "Indonesian",
  "lang.ar": "Arabic",
  "lang.hi": "Hindi",

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
  "preview.noProviderKey":
    "No provider key is configured - open Settings to add one",
  "preview.localNotConfigured":
    "The local server URL is not set up - open Settings to set it",
  "preview.localNotConfiguredHint":
    "The URL must be loopback-only, e.g. http://127.0.0.1:1234",
  "preview.openSettings": "Open Settings",
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
  "preview.opacity": "Background opacity",
  "preview.providerModel": "Provider and model",
  "preview.providerBadge": "Active provider and model",
  "preview.dragHandle": "Drag to reposition",
  "preview.moveHandle": "Move overlay (arrow keys while focused)",
  "preview.reselect": "Select new region",
  "preview.sourceLanguage": "Source language",
  "preview.targetLanguage": "Target language",
  "preview.layoutStacked": "Stacked layout (source above translation)",
  "preview.layoutColumns":
    "Side-by-side layout (source and translation in columns)",
  "preview.pasteSourceHint": "Paste or type text here to translate",

  // SCR-01: live caption overlay (FR-01)
  "caption.title": "Live captions",
  "caption.sourceLabel": "Heard",
  "caption.translationLabel": "Translation",
  "caption.waiting": "Listening for speech...",
  "caption.lowConfidence": "Low confidence - this caption may be inaccurate",
  "caption.detectedLanguage": "Detected language",
  "caption.pinnedLanguage": "Source language (pinned)",
  "caption.error":
    "A caption could not be produced - the session is still running",
  "caption.noProviderKey":
    "No provider key is configured - open Settings to add one",
  "caption.localNotConfigured":
    "The local server URL is not set up - open Settings to set it",
  "caption.localNotConfiguredHint":
    "The URL must be loopback-only, e.g. http://127.0.0.1:1234",
  "caption.startError": "Could not start the audio session - please try again",
  "caption.modelBlocked":
    "The speech model download must be allowed before captions can start.",
  "caption.openSettings": "Open Settings",
  "caption.copy": "Copy caption",
  "caption.copied": "Copied to clipboard",
  "caption.pin": "Pin overlay",
  "caption.unpin": "Unpin overlay",
  "caption.close": "Stop and close",
  "caption.opacity": "Background opacity",
  "caption.moveHandle": "Move overlay (arrow keys while focused)",
  "caption.providerBadge": "Active provider and model",
  "caption.retry": "Retry",

  // Whisper STT model-download consent (reuses the shared disclosure dialog)
  "consent.whisperTitle": "Download speech-to-text model",
  "consent.whisperIntro":
    "OST needs to download the local speech-to-text (whisper) model before it can translate live audio. The files below are fetched over HTTPS from the host named here. No captured audio or keys are sent - audio never leaves your machine; only the model files are downloaded.",

  // SCR-04: Settings - providers and keys (FR-03)
  "settings.title": "Settings",
  "settings.tablistLabel": "Settings sections",
  "settings.tabProviders": "Providers and keys",
  "settings.tabStt": "Speech-to-text",
  "settings.tabLocalLlm": "Local LLM",
  "settings.tabHotkeys": "Hotkeys",
  "settings.tabGeneral": "History and general",
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
  "consent.close": "Close (does not start the download)",

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
  "history.close": "Close",

  // Settings - translation history (AC-04.6)
  "settings.historyHeading": "Translation history",
  "settings.historyHint":
    "When on, every completed translation is saved locally as text only (no keys, audio, or screenshots). Turning it off stops recording immediately; turning it back on resumes.",
  "settings.historyToggle": "Record translation history",
  "settings.historyError":
    "Could not change the history setting - please try again",
  "settings.historyOpen": "Open history window",

  // Settings - global hotkeys (FR-04, AC-04.1)
  "settings.hotkeysHeading": "Global hotkeys",
  "settings.hotkeysHint":
    "These shortcuts work even when another app is focused. Choose Change, then press a key combination that includes Ctrl, Alt, or the Windows key. Press Escape to cancel.",
  "settings.hotkeyToggleAudio": "Start or stop the audio session",
  "settings.hotkeyRegionSelect": "Select a screen region",
  "settings.hotkeyToggleOverlay": "Show or hide the active overlay",
  "settings.hotkeyChange": "Change",
  "settings.hotkeyRecording": "Press a key combination (Escape to cancel)",
  "settings.hotkeyCancel": "Cancel",
  "settings.hotkeyCurrent": "Current shortcut",
  "settings.hotkeyErrorInvalidBinding":
    "That combination is not valid - include Ctrl, Alt, or the Windows key with a letter or key",
  "settings.hotkeyErrorDuplicate":
    "That combination is already used by another OST hotkey - choose a different one",
  "settings.hotkeyErrorConflict":
    "That combination is already in use by another app - choose a different one",
  "settings.hotkeyErrorStore": "Could not save the hotkey - please try again",

  // Settings - live audio translation (FR-01, AC-01.4/01.5/01.8)
  "settings.audioHeading": "Live audio translation",
  "settings.audioHint":
    "Translate live system audio. Speech-to-text runs locally on your machine; only the transcribed and translated text is sent to your chosen provider.",
  "settings.audioSourceLanguage": "Source language",
  "settings.audioTargetLanguage": "Target language",
  "settings.audioProvider": "Uses the active provider and model: {provider}",
  "settings.audioRecommendedModel": "Recommended speech model",
  "settings.audioModelReady": "Speech model download allowed",
  "settings.audioModelNotReady":
    "The speech model has not been downloaded yet. Allow the download now, or you will be asked when the first session starts.",
  "settings.audioReviewDownload": "Review model download",
  "settings.audioStart": "Start audio session",
  "settings.audioStop": "Stop audio session",
  "settings.audioRunning": "Audio session running",
  "settings.audioStartError":
    "Could not start the audio session - please try again",

  // Settings - STT engine picker (FR-01, TASK-026 part C)
  "settings.sttHeading": "Speech-to-text engine",
  "settings.sttHint":
    "Choose the local speech-recognition model used for live audio translation. Speech-to-text always runs on your machine - audio never leaves it.",
  "settings.sttEngineLabel": "Speech-to-text engine",
  "settings.sttCurrent": "current",
  "settings.sttSizeLabel": "Download size / RAM",
  "settings.sttDownloaded": "Downloaded",
  "settings.sttDownloadProgress": "Model download progress",
  "settings.sttModelTiny": "Tiny",
  "settings.sttModelBase": "Base (recommended)",
  "settings.sttModelSmall": "Small",
  "settings.sttModelLargeTurbo": "Large v3 turbo",
  "settings.sttModelLargeV3": "Large v3",
  "settings.sttCloudGoogle": "Google Cloud STT (cloud)",
  "settings.sttCloudAzure": "Azure AI Speech (cloud)",
  "settings.sttCloudOpenAi": "OpenAI speech-to-text (cloud)",
  "settings.sttReasonCuda": "Requires a compatible CUDA GPU",
  "settings.sttReasonRam": "Not enough RAM on this machine for this tier",
  "settings.sttReasonPendingAdr":
    "Pending ADR-005 owner approval - cloud speech-to-text is not available yet",
  "settings.sttErrorUnknownModel": "Unknown speech-to-text model",
  "settings.sttErrorNotAllowed":
    "This tier is not allowed on the current hardware",
  "settings.sttErrorSessionActive":
    "Cannot change the speech-to-text engine while an audio session is running - stop the session first",
  "settings.sttErrorDownload": "The model download failed - please try again",
  "settings.sttErrorStore":
    "Could not save the speech-to-text engine choice - please try again",
  "settings.sttErrorCancelled": "The model download was cancelled",

  // Settings - STT downloaded-model management list (TASK-034)
  "settings.sttModelsListHeading": "Downloaded models",
  "settings.sttModelsListHint":
    "Speech-to-text models stored on this machine. Delete one to free up disk space, then download it again whenever you need it.",
  "settings.sttModelListDownloaded": "Downloaded",
  "settings.sttModelListNotDownloaded": "Not downloaded",
  "settings.sttModelListDownload": "Download",
  "settings.sttModelListRedownload": "Re-download",
  "settings.sttModelListDelete": "Delete",
  "settings.sttModelListDeleting": "Deleting...",
  "settings.sttModelListCancel": "Cancel download",
  "settings.sttModelListCancelling": "Cancelling...",
  "settings.sttModelListProgress": "{model} download progress",
  "settings.sttModelDeleteErrorUnknownModel":
    "Unknown speech-to-text model - please refresh",
  "settings.sttModelDeleteErrorSessionActive":
    "Cannot delete a model while an audio session is running - stop the session first",
  "settings.sttModelDeleteErrorIo":
    "Could not delete the model file - please try again",

  // Settings - Local LLM tab: managed engine (ADR-006)
  "settings.llmServerHeading": "Managed local LLM engine",
  "settings.llmServerHint":
    "OST can download a translation GGUF model and manage a local llama-server process for you, on a loopback-only port - no cloud key needed. Start it, then use it for translation below.",
  "settings.llmServerStatusLabel": "Server status",
  "settings.llmServerRunning": "Running",
  "settings.llmServerRunningWithModel": "Running: {model}",
  "settings.llmServerStopped": "Not running",
  "settings.llmServerUseAsProvider":
    "Use for translation (sets this as the active provider)",
  "settings.llmServerUseAsProviderActive":
    "This is the active translation provider",
  "settings.llmBinaryHint":
    "The llama-server program was not found. Place it at ~/.ost/bin/llama-server(.exe), add it to your PATH, or set the OST_LLAMA_SERVER_PATH environment variable to its full path, then try again.",
  "settings.llmServerErrorUnknownModel": "Unknown local-LLM model",
  "settings.llmServerErrorNotDownloaded":
    "This model must be downloaded before starting the server",
  "settings.llmServerErrorBinaryNotFound":
    "The llama-server program was not found",
  "settings.llmServerErrorSpawnFailed":
    "Could not start the local server - please try again",
  "settings.llmServerErrorExitedDuringStartup":
    "The local server exited unexpectedly while starting - check the GPU/driver setup and try again",
  "settings.llmServerErrorReadinessTimeout":
    "The local server did not become ready in time - please try again",
  "settings.llmServerErrorStopFailed":
    "Could not stop the local server - please try again",

  "settings.llmModelsHeading": "Local LLM models",
  "settings.llmModelsHint":
    "Translation models OST can download and run locally. Download one, then start the server with it - only one model runs at a time.",
  "settings.llmModelDefault": "Default",
  "settings.llmModelRunning": "Running",
  "settings.llmModelSizeLabel": "Download size / RAM",
  "settings.llmModelListDownloaded": "Downloaded",
  "settings.llmModelListNotDownloaded": "Not downloaded",
  "settings.llmModelListDownload": "Download",
  "settings.llmModelListDelete": "Delete",
  "settings.llmModelListDeleting": "Deleting...",
  "settings.llmModelListCancel": "Cancel download",
  "settings.llmModelListCancelling": "Cancelling...",
  "settings.llmModelListProgress": "{model} download progress",
  "settings.llmModelStart": "Start server",
  "settings.llmModelStarting": "Starting...",
  "settings.llmModelStop": "Stop server",
  "settings.llmModelStopping": "Stopping...",
  "settings.llmModelErrorUnknownModel": "Unknown local-LLM model",
  "settings.llmModelErrorDownload":
    "The model download failed - please try again",
  "settings.llmModelErrorCancelled": "The model download was cancelled",
  "settings.llmModelErrorSessionActive":
    "Cannot change this model while the local server is running it - stop the server first",
  "settings.llmModelErrorIo":
    "Could not delete the model file - please try again",

  // Settings - local OpenAI-compatible translation provider (FR-03.CUSTOM-1..5)
  "settings.localBaseUrlLabel": "Local server address (base_url)",
  "settings.localBaseUrlPlaceholder": "http://127.0.0.1:1234",
  "settings.localModelLabel": "Model id",
  "settings.localModelPlaceholder": "e.g. the model name loaded in LM Studio",
  "settings.localCheckConnection": "Check connection",
  "settings.localChecking": "Checking...",
  "settings.localCheckOk": "Connected - the local server answered",
  "settings.localErrorInvalidBaseUrl":
    "Only a loopback address (127.0.0.1 / localhost) is accepted",
  "settings.localErrorUnreachable":
    "The local server is not running - start it and try again",
  "settings.localErrorNetwork":
    "Network error - could not reach the local server",
  "settings.localErrorTimeout": "The local server request timed out",
  "settings.localErrorProvider": "Unexpected response from the local server",
  "settings.providerGroupCloud": "Cloud LLM",
  "settings.providerGroupLocal": "Local LLM",
  "settings.localModelPresetLabel": "Local model preset",
  "settings.localModelPresetCustom": "Custom (enter model id below)",
  "settings.localPresetHyMt27b":
    "Hy-MT2 7B (Q4_K_M, ~4.6GB) - default translation engine",
  "settings.localPresetQwen314b":
    "Qwen3 14B (Q4_K_M, ~9GB) - context, glossary, markdown",
  "settings.localPresetHyMt230b":
    "Hy-MT2 30B-A3B (Q4, ~18GB) - batch translation only",

  // Consent dialog (Settings-time STT model switch, TASK-026 part C)
  "consent.sttSwitchTitle": "Download this speech-to-text tier",
  "consent.sttSwitchIntro":
    "OST needs to download this speech-to-text model before switching to it. The file below is fetched over HTTPS from the host named here. No captured audio or keys are sent - audio never leaves your machine; only the model file is downloaded.",

  // Consent dialog (managed local-LLM GGUF download, ADR-006)
  "consent.llmDownloadTitle": "Download this local LLM translation model",
  "consent.llmDownloadIntro":
    "OST needs to download this GGUF model before it can run the managed local translation server. The file below is fetched over HTTPS from the host named here. No captured content or keys are sent - only the model file is downloaded, and it stays on this machine.",

  // Shared primitives
  "ui.select.placeholder": "Choose...",
} as const;

const vi: Record<I18nKey, string> = {
  "app.title": "OST",

  "home.subtitle": "Dịch âm thanh và màn hình theo thời gian thực",
  "home.statusHeading": "Trạng thái",
  "home.providerLabel": "Provider và model đang hoạt động",
  "home.sttLabel": "Mô hình chuyển giọng nói thành văn bản",
  "home.sttDownloaded": "Đã tải",
  "home.sttNotDownloaded": "Chưa tải",
  "home.audioSessionLabel": "Phiên âm thanh",
  "home.audioRunning": "Đang chạy",
  "home.audioIdle": "Chưa chạy",
  "home.noProviderKey": "Chưa cấu hình khoá provider - mở Cài đặt để thêm khoá",
  "home.openSettings": "Mở Cài đặt",
  "home.actionsHeading": "Thao tác nhanh",
  "home.hotkeyLabel": "Phím tắt",
  "home.actionRegion": "Dịch một vùng màn hình",
  "home.actionRegionCta": "Chọn vùng",
  "home.actionAudio": "Bắt đầu / dừng dịch âm thanh trực tiếp",
  "home.actionAudioStart": "Bắt đầu",
  "home.actionAudioStop": "Dừng",
  "home.actionSettings": "Cài đặt",
  "home.actionSettingsCta": "Xem Cài đặt",
  "home.actionHistory": "Lịch sử",
  "home.actionHistoryCta": "Mở Lịch sử",
  "home.audioStartError":
    "Không bắt đầu được phiên âm thanh - vui lòng thử lại",
  "home.regionSourceLanguage": "Ngôn ngữ nguồn cho vùng",
  "home.regionTargetLanguage": "Ngôn ngữ đích cho vùng",

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
  "lang.es": "Tiếng Tây Ban Nha",
  "lang.fr": "Tiếng Pháp",
  "lang.de": "Tiếng Đức",
  "lang.ru": "Tiếng Nga",
  "lang.pt": "Tiếng Bồ Đào Nha",
  "lang.it": "Tiếng Ý",
  "lang.th": "Tiếng Thái",
  "lang.id": "Tiếng Indonesia",
  "lang.ar": "Tiếng Ả Rập",
  "lang.hi": "Tiếng Hindi",

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
  "preview.noProviderKey":
    "Chưa cấu hình khoá provider - mở Cài đặt để thêm khoá",
  "preview.localNotConfigured":
    "Chưa thiết lập địa chỉ máy chủ cục bộ - mở Cài đặt để thiết lập",
  "preview.localNotConfiguredHint":
    "Địa chỉ phải là loopback, ví dụ http://127.0.0.1:1234",
  "preview.openSettings": "Mở Cài đặt",
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
  "preview.opacity": "Độ mờ nền",
  "preview.providerModel": "Provider và model",
  "preview.providerBadge": "Provider và model đang dịch",
  "preview.dragHandle": "Kéo để đổi vị trí",
  "preview.moveHandle": "Di chuyển overlay (phím mũi tên khi đang focus)",
  "preview.reselect": "Chọn vùng mới",
  "preview.sourceLanguage": "Ngôn ngữ nguồn",
  "preview.targetLanguage": "Ngôn ngữ đích",
  "preview.layoutStacked": "Bố cục xếp chồng (nguồn phía trên bản dịch)",
  "preview.layoutColumns": "Bố cục song song (nguồn và bản dịch theo hai cột)",
  "preview.pasteSourceHint": "Dán hoặc nhập văn bản vào đây để dịch",

  "caption.title": "Phụ đề trực tiếp",
  "caption.sourceLabel": "Nghe được",
  "caption.translationLabel": "Bản dịch",
  "caption.waiting": "Đang lắng nghe lời nói...",
  "caption.lowConfidence":
    "Độ tin cậy thấp - phụ đề này có thể không chính xác",
  "caption.detectedLanguage": "Ngôn ngữ phát hiện",
  "caption.pinnedLanguage": "Ngôn ngữ nguồn (đã ghim)",
  "caption.error": "Không tạo được phụ đề - phiên vẫn đang chạy",
  "caption.noProviderKey":
    "Chưa cấu hình khoá provider - mở Cài đặt để thêm khoá",
  "caption.localNotConfigured":
    "Chưa thiết lập địa chỉ máy chủ cục bộ - mở Cài đặt để thiết lập",
  "caption.localNotConfiguredHint":
    "Địa chỉ phải là loopback, ví dụ http://127.0.0.1:1234",
  "caption.startError": "Không bắt đầu được phiên âm thanh - vui lòng thử lại",
  "caption.modelBlocked":
    "Cần cho phép tải mô hình giọng nói trước khi bắt đầu tạo phụ đề.",
  "caption.openSettings": "Mở Cài đặt",
  "caption.copy": "Chép phụ đề",
  "caption.copied": "Đã chép vào clipboard",
  "caption.pin": "Ghim overlay",
  "caption.unpin": "Bỏ ghim overlay",
  "caption.close": "Dừng và đóng",
  "caption.opacity": "Độ mờ nền",
  "caption.moveHandle": "Di chuyển overlay (phím mũi tên khi đang focus)",
  "caption.providerBadge": "Provider và model đang dịch",
  "caption.retry": "Thử lại",

  "consent.whisperTitle": "Tải mô hình chuyển giọng nói thành văn bản",
  "consent.whisperIntro":
    "OST cần tải mô hình chuyển giọng nói thành văn bản (whisper) cục bộ trước khi có thể dịch âm thanh trực tiếp. Các tệp bên dưới được tải qua HTTPS từ máy chủ được nêu tên tại đây. Không có âm thanh đã chụp hay khoá nào được gửi đi - âm thanh không bao giờ rời khỏi máy của bạn; chỉ tải các tệp mô hình.",

  "settings.title": "Cài đặt",
  "settings.tablistLabel": "Các mục cài đặt",
  "settings.tabProviders": "Provider và key",
  "settings.tabStt": "Chuyển giọng nói thành văn bản",
  "settings.tabLocalLlm": "LLM cục bộ",
  "settings.tabHotkeys": "Phím tắt",
  "settings.tabGeneral": "Lịch sử và chung",
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
  "consent.close": "Đóng (không bắt đầu tải)",

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
  "history.close": "Đóng",

  "settings.historyHeading": "Lịch sử dịch",
  "settings.historyHint":
    "Khi bật, mỗi lượt dịch hoàn tất được lưu cục bộ chỉ dưới dạng văn bản (không có key, âm thanh hay ảnh chụp). Tắt sẽ dừng ghi ngay lập tức; bật lại thì ghi tiếp.",
  "settings.historyToggle": "Ghi lịch sử dịch",
  "settings.historyError":
    "Không thay đổi được cài đặt lịch sử - vui lòng thử lại",
  "settings.historyOpen": "Mở cửa sổ lịch sử",

  "settings.hotkeysHeading": "Phím tắt toàn cục",
  "settings.hotkeysHint":
    "Các phím tắt này hoạt động ngay cả khi ứng dụng khác đang được focus. Chọn Đổi, rồi nhấn tổ hợp phím có kèm Ctrl, Alt hoặc phím Windows. Nhấn Escape để huỷ.",
  "settings.hotkeyToggleAudio": "Bắt đầu hoặc dừng phiên âm thanh",
  "settings.hotkeyRegionSelect": "Chọn vùng màn hình",
  "settings.hotkeyToggleOverlay": "Hiện hoặc ẩn overlay đang hoạt động",
  "settings.hotkeyChange": "Đổi",
  "settings.hotkeyRecording": "Nhấn tổ hợp phím (Escape để huỷ)",
  "settings.hotkeyCancel": "Huỷ",
  "settings.hotkeyCurrent": "Phím tắt hiện tại",
  "settings.hotkeyErrorInvalidBinding":
    "Tổ hợp không hợp lệ - hãy kèm Ctrl, Alt hoặc phím Windows cùng một chữ cái hoặc phím",
  "settings.hotkeyErrorDuplicate":
    "Tổ hợp này đã dùng cho một phím tắt OST khác - hãy chọn tổ hợp khác",
  "settings.hotkeyErrorConflict":
    "Tổ hợp này đang được ứng dụng khác sử dụng - hãy chọn tổ hợp khác",
  "settings.hotkeyErrorStore": "Không lưu được phím tắt - vui lòng thử lại",

  "settings.audioHeading": "Dịch âm thanh trực tiếp",
  "settings.audioHint":
    "Dịch âm thanh hệ thống trực tiếp. Chuyển giọng nói thành văn bản chạy cục bộ trên máy của bạn; chỉ văn bản đã phiên âm và đã dịch được gửi tới provider bạn chọn.",
  "settings.audioSourceLanguage": "Ngôn ngữ nguồn",
  "settings.audioTargetLanguage": "Ngôn ngữ đích",
  "settings.audioProvider": "Dùng provider và model đang hoạt động: {provider}",
  "settings.audioRecommendedModel": "Mô hình giọng nói khuyến nghị",
  "settings.audioModelReady": "Đã cho phép tải mô hình giọng nói",
  "settings.audioModelNotReady":
    "Mô hình giọng nói chưa được tải. Cho phép tải ngay bây giờ, hoặc bạn sẽ được hỏi khi phiên đầu tiên bắt đầu.",
  "settings.audioReviewDownload": "Xem lại việc tải mô hình",
  "settings.audioStart": "Bắt đầu phiên âm thanh",
  "settings.audioStop": "Dừng phiên âm thanh",
  "settings.audioRunning": "Phiên âm thanh đang chạy",
  "settings.audioStartError":
    "Không bắt đầu được phiên âm thanh - vui lòng thử lại",

  "settings.sttHeading": "Chuyển giọng nói thành văn bản",
  "settings.sttHint":
    "Chọn mô hình nhận dạng giọng nói cục bộ dùng để dịch âm thanh trực tiếp. Chuyển giọng nói thành văn bản luôn chạy trên máy của bạn - âm thanh không bao giờ rời khỏi máy.",
  "settings.sttEngineLabel": "Engine chuyển giọng nói thành văn bản",
  "settings.sttCurrent": "đang dùng",
  "settings.sttSizeLabel": "Dung lượng tải / RAM",
  "settings.sttDownloaded": "Đã tải",
  "settings.sttDownloadProgress": "Tiến độ tải mô hình",
  "settings.sttModelTiny": "Tiny",
  "settings.sttModelBase": "Base (khuyến nghị)",
  "settings.sttModelSmall": "Small",
  "settings.sttModelLargeTurbo": "Large v3 turbo",
  "settings.sttModelLargeV3": "Large v3",
  "settings.sttCloudGoogle": "Google Cloud STT (đám mây)",
  "settings.sttCloudAzure": "Azure AI Speech (đám mây)",
  "settings.sttCloudOpenAi": "OpenAI speech-to-text (đám mây)",
  "settings.sttReasonCuda": "Yêu cầu GPU CUDA tương thích",
  "settings.sttReasonRam": "Máy không đủ RAM cho tầng model này",
  "settings.sttReasonPendingAdr":
    "Đang chờ chủ dự án duyệt ADR-005 - STT đám mây chưa khả dụng",
  "settings.sttErrorUnknownModel": "Model chuyển giọng nói không xác định",
  "settings.sttErrorNotAllowed":
    "Tầng model này không được phép trên phần cứng hiện tại",
  "settings.sttErrorSessionActive":
    "Không thể đổi engine chuyển giọng nói khi phiên âm thanh đang chạy - hãy dừng phiên trước",
  "settings.sttErrorDownload": "Tải mô hình thất bại - vui lòng thử lại",
  "settings.sttErrorStore":
    "Không lưu được lựa chọn engine chuyển giọng nói - vui lòng thử lại",
  "settings.sttErrorCancelled": "Đã huỷ tải mô hình",

  "settings.sttModelsListHeading": "Các model đã tải",
  "settings.sttModelsListHint":
    "Các model chuyển giọng nói thành văn bản đang lưu trên máy này. Xoá một model để giải phóng dung lượng, rồi tải lại bất cứ khi nào cần.",
  "settings.sttModelListDownloaded": "Đã tải",
  "settings.sttModelListNotDownloaded": "Chưa tải",
  "settings.sttModelListDownload": "Tải về",
  "settings.sttModelListRedownload": "Tải lại",
  "settings.sttModelListDelete": "Xoá",
  "settings.sttModelListDeleting": "Đang xoá...",
  "settings.sttModelListCancel": "Huỷ tải",
  "settings.sttModelListCancelling": "Đang huỷ...",
  "settings.sttModelListProgress": "Tiến độ tải {model}",
  "settings.sttModelDeleteErrorUnknownModel":
    "Model chuyển giọng nói không xác định - vui lòng tải lại trang",
  "settings.sttModelDeleteErrorSessionActive":
    "Không thể xoá model khi phiên âm thanh đang chạy - hãy dừng phiên trước",
  "settings.sttModelDeleteErrorIo":
    "Không xoá được tệp model - vui lòng thử lại",

  "settings.llmServerHeading": "Engine LLM cục bộ có quản lý",
  "settings.llmServerHint":
    "OST có thể tự tải model dịch dạng GGUF và tự quản lý một tiến trình llama-server cho bạn, trên một cổng chỉ loopback - không cần key đám mây. Khởi động rồi dùng nó để dịch bên dưới.",
  "settings.llmServerStatusLabel": "Trạng thái máy chủ",
  "settings.llmServerRunning": "Đang chạy",
  "settings.llmServerRunningWithModel": "Đang chạy: {model}",
  "settings.llmServerStopped": "Chưa chạy",
  "settings.llmServerUseAsProvider":
    "Dùng để dịch (đặt làm provider đang hoạt động)",
  "settings.llmServerUseAsProviderActive":
    "Đây là provider dịch đang hoạt động",
  "settings.llmBinaryHint":
    "Không tìm thấy chương trình llama-server. Hãy đặt tệp tại ~/.ost/bin/llama-server(.exe), thêm vào PATH, hoặc đặt biến môi trường OST_LLAMA_SERVER_PATH trỏ tới đường dẫn đầy đủ của nó, rồi thử lại.",
  "settings.llmServerErrorUnknownModel": "Model LLM cục bộ không xác định",
  "settings.llmServerErrorNotDownloaded":
    "Phải tải model này trước khi khởi động máy chủ",
  "settings.llmServerErrorBinaryNotFound":
    "Không tìm thấy chương trình llama-server",
  "settings.llmServerErrorSpawnFailed":
    "Không khởi động được máy chủ local - vui lòng thử lại",
  "settings.llmServerErrorExitedDuringStartup":
    "Máy chủ local thoát bất ngờ khi đang khởi động - kiểm tra GPU/driver rồi thử lại",
  "settings.llmServerErrorReadinessTimeout":
    "Máy chủ local không sẵn sàng kịp thời gian - vui lòng thử lại",
  "settings.llmServerErrorStopFailed":
    "Không dừng được máy chủ local - vui lòng thử lại",

  "settings.llmModelsHeading": "Model LLM cục bộ",
  "settings.llmModelsHint":
    "Các model dịch OST có thể tải và chạy cục bộ. Tải một model rồi khởi động máy chủ với model đó - chỉ một model chạy tại một thời điểm.",
  "settings.llmModelDefault": "Mặc định",
  "settings.llmModelRunning": "Đang chạy",
  "settings.llmModelSizeLabel": "Dung lượng tải / RAM",
  "settings.llmModelListDownloaded": "Đã tải",
  "settings.llmModelListNotDownloaded": "Chưa tải",
  "settings.llmModelListDownload": "Tải về",
  "settings.llmModelListDelete": "Xoá",
  "settings.llmModelListDeleting": "Đang xoá...",
  "settings.llmModelListCancel": "Huỷ tải",
  "settings.llmModelListCancelling": "Đang huỷ...",
  "settings.llmModelListProgress": "Tiến độ tải {model}",
  "settings.llmModelStart": "Khởi động máy chủ",
  "settings.llmModelStarting": "Đang khởi động...",
  "settings.llmModelStop": "Dừng máy chủ",
  "settings.llmModelStopping": "Đang dừng...",
  "settings.llmModelErrorUnknownModel": "Model LLM cục bộ không xác định",
  "settings.llmModelErrorDownload": "Tải model thất bại - vui lòng thử lại",
  "settings.llmModelErrorCancelled": "Đã huỷ tải model",
  "settings.llmModelErrorSessionActive":
    "Không thể đổi model này khi máy chủ local đang chạy nó - hãy dừng máy chủ trước",
  "settings.llmModelErrorIo": "Không xoá được tệp model - vui lòng thử lại",

  "settings.localBaseUrlLabel": "Địa chỉ máy chủ local (base_url)",
  "settings.localBaseUrlPlaceholder": "http://127.0.0.1:1234",
  "settings.localModelLabel": "Id model",
  "settings.localModelPlaceholder": "ví dụ: tên model đã nạp trong LM Studio",
  "settings.localCheckConnection": "Kiểm tra kết nối",
  "settings.localChecking": "Đang kiểm tra...",
  "settings.localCheckOk": "Đã kết nối - máy chủ local đã phản hồi",
  "settings.localErrorInvalidBaseUrl":
    "Chỉ chấp nhận địa chỉ loopback (127.0.0.1 / localhost)",
  "settings.localErrorUnreachable":
    "Máy chủ local chưa chạy - hãy khởi động rồi thử lại",
  "settings.localErrorNetwork":
    "Lỗi mạng - không kết nối được tới máy chủ local",
  "settings.localErrorTimeout": "Yêu cầu tới máy chủ local quá thời gian chờ",
  "settings.localErrorProvider": "Phản hồi bất thường từ máy chủ local",
  "settings.providerGroupCloud": "LLM đám mây",
  "settings.providerGroupLocal": "LLM cục bộ",
  "settings.localModelPresetLabel": "Model cục bộ dựng sẵn",
  "settings.localModelPresetCustom": "Tuỳ chỉnh (nhập id model bên dưới)",
  "settings.localPresetHyMt27b":
    "Hy-MT2 7B (Q4_K_M, ~4.6GB) - công cụ dịch mặc định",
  "settings.localPresetQwen314b":
    "Qwen3 14B (Q4_K_M, ~9GB) - ngữ cảnh, thuật ngữ, markdown",
  "settings.localPresetHyMt230b":
    "Hy-MT2 30B-A3B (Q4, ~18GB) - chỉ dùng cho dịch hàng loạt",

  "consent.sttSwitchTitle": "Tải tầng model chuyển giọng nói này",
  "consent.sttSwitchIntro":
    "OST cần tải mô hình chuyển giọng nói thành văn bản này trước khi chuyển sang dùng nó. Tệp bên dưới được tải qua HTTPS từ máy chủ được nêu tên tại đây. Không có âm thanh đã chụp hay khoá nào được gửi đi - âm thanh không bao giờ rời khỏi máy của bạn; chỉ tải tệp mô hình.",

  "consent.llmDownloadTitle": "Tải model dịch LLM cục bộ này",
  "consent.llmDownloadIntro":
    "OST cần tải tệp GGUF này trước khi có thể chạy máy chủ dịch LLM cục bộ có quản lý. Tệp bên dưới được tải qua HTTPS từ máy chủ được nêu tên tại đây. Không có nội dung đã chụp hay khoá nào được gửi đi - chỉ tải tệp model, và tệp này ở lại trên máy của bạn.",

  "ui.select.placeholder": "Chọn...",
};

export type I18nKey = keyof typeof en;
export type Locale = "vi" | "en";

export const translations: Record<Locale, Record<I18nKey, string>> = { en, vi };
