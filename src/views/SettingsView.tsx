import { useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Download,
  History,
  Keyboard,
  Play,
  ShieldCheck,
  ShieldOff,
  Square,
  Trash2,
} from "lucide-react";
import "./SettingsView.css";
import {
  Badge,
  Button,
  IconButton,
  Input,
  PlainText,
  ProgressBar,
  Select,
  Switch,
  Tabs,
  type SelectOption,
  type TabItem,
} from "../components/ui";
import { ConsentDialog } from "../components/ConsentDialog";
import { t } from "../lib/i18n";
import {
  isLocalModelPresetId,
  isProviderId,
  LOCAL_MODEL_PRESET_CUSTOM,
  LOCAL_MODEL_PRESETS,
  LOCAL_OPENAI_PROVIDER_ID,
  PROVIDER_META,
  PROVIDER_META_LIST,
  type ActiveProviderId,
  type ProviderId,
  type ProviderMeta,
} from "../lib/providers";
import {
  SOURCE_LANGUAGE_OPTIONS,
  TARGET_LANGUAGE_OPTIONS,
} from "../lib/languages";
import { activeModel } from "../lib/settings";
import {
  useProviderKeys,
  type KeyActionResult,
} from "../hooks/useProviderKeys";
import { useProviderSelection } from "../hooks/useProviderSelection";
import { useProviderPickerMetadata } from "../hooks/useProviderPickerMetadata";
import { useLocalProviderConnection } from "../hooks/useLocalProviderConnection";
import { useModelConsent, type RevokeState } from "../hooks/useModelConsent";
import { useHistorySettings } from "../hooks/useHistorySettings";
import { useAudioSession } from "../hooks/useAudioSession";
import { useHotkeys } from "../hooks/useHotkeys";
import { useSttModels, type UseSttModelsResult } from "../hooks/useSttModels";
import { resultMessage } from "./settingsMessages";
import {
  historyIpc,
  HOTKEY_ACTIONS,
  type HotkeyAction,
  type HotkeyErrorKind,
  type LocalProviderErrorKind,
  type ModelConsentStatus,
  type SttModelDeleteErrorKind,
  type SttModelSwitchErrorKind,
} from "../lib/ipc";
import { formatBytes } from "../lib/format";
import { STT_MODEL_LABEL_KEYS } from "../lib/sttModelLabels";
import type { I18nKey } from "../lib/i18n";

/** Per-action row label (AC-04.1); every string is an i18n key. */
const HOTKEY_LABEL_KEYS: Record<HotkeyAction, I18nKey> = {
  toggleAudio: "settings.hotkeyToggleAudio",
  regionSelect: "settings.hotkeyRegionSelect",
  toggleOverlay: "settings.hotkeyToggleOverlay",
};

/** Typed reconfigure error -> localized message key. */
const HOTKEY_ERROR_KEYS: Record<HotkeyErrorKind, I18nKey> = {
  invalidBinding: "settings.hotkeyErrorInvalidBinding",
  duplicate: "settings.hotkeyErrorDuplicate",
  conflict: "settings.hotkeyErrorConflict",
  store: "settings.hotkeyErrorStore",
};

/**
 * Cloud STT entries (FR-01.STT-6): always disabled with a "pending ADR-005"
 * note. NOT returned by `list_stt_models` (local tiers only) - these are
 * static rows the UI renders itself so users see the roadmap without any
 * functional path (no dead code pretending they work).
 */
const CLOUD_STT_ENTRIES: readonly { id: string; labelKey: I18nKey }[] = [
  { id: "cloud-google-stt", labelKey: "settings.sttCloudGoogle" },
  { id: "cloud-azure-speech", labelKey: "settings.sttCloudAzure" },
  { id: "cloud-openai-stt", labelKey: "settings.sttCloudOpenAi" },
];

const STT_SWITCH_ERROR_KEYS: Record<SttModelSwitchErrorKind, I18nKey> = {
  unknownModel: "settings.sttErrorUnknownModel",
  notAllowed: "settings.sttErrorNotAllowed",
  sessionActive: "settings.sttErrorSessionActive",
  download: "settings.sttErrorDownload",
  store: "settings.sttErrorStore",
  cancelled: "settings.sttErrorCancelled",
};

const STT_DELETE_ERROR_KEYS: Record<SttModelDeleteErrorKind, I18nKey> = {
  unknownModel: "settings.sttModelDeleteErrorUnknownModel",
  sessionActive: "settings.sttModelDeleteErrorSessionActive",
  io: "settings.sttModelDeleteErrorIo",
};

const LOCAL_PROVIDER_ERROR_KEYS: Record<LocalProviderErrorKind, I18nKey> = {
  invalidBaseUrl: "settings.localErrorInvalidBaseUrl",
  localServerUnreachable: "settings.localErrorUnreachable",
  network: "settings.localErrorNetwork",
  timeout: "settings.localErrorTimeout",
  provider: "settings.localErrorProvider",
};

/** Resolves a catalog id's display label through the i18n mapping, falling
 * back to the core's English string for an unknown/future id. */
function sttModelLabel(id: string, fallback: string): string {
  const key = STT_MODEL_LABEL_KEYS[id];
  return key ? t(key) : fallback;
}

/**
 * Speech-to-text engine section (FR-01, TASK-026 part C, AC-01.8). Lists the
 * local whisper tiers (hardware-gated, with a Tooltip reason on disabled
 * entries) plus the static cloud-STT rows (always disabled, pending ADR-005).
 * Switching reuses the shared BR-08 consent-download dialog, extended with a
 * live progress bar; a mid-session switch is rejected with a clear message.
 * Takes the shared `stt` hook instance (lifted to `SettingsView`) so an
 * in-flight download's progress survives a tab switch, not just a dropdown
 * change (TASK-034).
 */
function SttEngineSection({ stt }: { stt: UseSttModelsResult }) {
  const current = stt.models.find((m) => m.current) ?? null;
  // Tracks which model id THIS section's "current pick" progress bar reflects
  // (set when the user just confirmed a download) - the per-id `downloads`
  // map itself is what actually persists across a dropdown change or a tab
  // switch (TASK-034); this is only which one to show inline here.
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const download = confirmingId ? stt.downloads[confirmingId] : undefined;

  const options: SelectOption[] = [
    ...stt.models.map((m) => ({
      value: m.id,
      label:
        sttModelLabel(m.id, m.label) +
        (m.current ? ` (${t("settings.sttCurrent")})` : ""),
      disabled: !m.allowedByProbe,
      disabledReason: !m.allowedByProbe
        ? t(m.requiresCuda ? "settings.sttReasonCuda" : "settings.sttReasonRam")
        : undefined,
    })),
    ...CLOUD_STT_ENTRIES.map((entry) => ({
      value: entry.id,
      label: t(entry.labelKey),
      disabled: true,
      disabledReason: t("settings.sttReasonPendingAdr"),
    })),
  ];

  return (
    <section
      className="settings-section"
      aria-labelledby="settings-stt-heading"
    >
      <h2 id="settings-stt-heading">{t("settings.sttHeading")}</h2>
      <p className="settings-hint">{t("settings.sttHint")}</p>

      {!stt.loading ? (
        <div className="settings-field">
          <span className="settings-field-label" id="stt-engine-label">
            {t("settings.sttEngineLabel")}
          </span>
          <Select
            label={t("settings.sttEngineLabel")}
            value={current?.id ?? ""}
            options={options}
            onChange={(value) => stt.selectModel(value)}
          />
        </div>
      ) : null}

      {current ? (
        <div className="settings-model-meta">
          <span className="settings-field-label">
            {t("settings.sttSizeLabel")}
          </span>
          <span className="settings-model-host">
            {`${formatBytes(current.approxDownloadBytes)} / ${formatBytes(
              current.approxRamBytes,
            )}`}
          </span>
          {current.downloaded ? (
            <Badge variant="success" label={t("settings.sttDownloaded")}>
              <ShieldCheck size={12} aria-hidden="true" />
              {t("settings.sttDownloaded")}
            </Badge>
          ) : null}
        </div>
      ) : null}

      {download ? (
        <div className="settings-field">
          <ProgressBar
            label={t("settings.sttDownloadProgress")}
            value={
              download.progress && download.progress.totalBytes > 0
                ? (download.progress.downloadedBytes /
                    download.progress.totalBytes) *
                  100
                : 0
            }
          />
          {download.progress ? (
            <p className="settings-hint" role="status" aria-live="polite">
              {`${formatBytes(download.progress.downloadedBytes)} / ${formatBytes(
                download.progress.totalBytes,
              )}`}
            </p>
          ) : null}
        </div>
      ) : null}

      {stt.error ? (
        <p
          className="settings-message settings-message--danger"
          role="alert"
          aria-live="assertive"
        >
          {t(STT_SWITCH_ERROR_KEYS[stt.error])}
        </p>
      ) : null}

      {stt.pendingConsent ? (
        <ConsentDialog
          open
          disclosure={stt.pendingConsent.disclosure}
          onGrant={() => {
            setConfirmingId(stt.pendingConsent?.modelId ?? null);
            stt.confirmDownload();
          }}
          onDecline={stt.cancelConsent}
          titleKey="consent.sttSwitchTitle"
          introKey="consent.sttSwitchIntro"
        />
      ) : null}
    </section>
  );
}

/**
 * Downloaded speech-to-text model management list (Settings, TASK-034, owner
 * ask 3): every catalog tier the hardware allows, its approximate size, and a
 * DOWNLOADED/NOT DOWNLOADED status - with a per-row Delete (frees disk space;
 * consent stays granted so a later re-download never re-prompts) and a
 * Download/Re-download control that reuses the SAME consent-gated switch flow
 * as the picker above. Local LLM model management is a separate, deferred tab
 * (owner ask: do not block on the pending architecture decision).
 */
function SttModelManagementSection({ stt }: { stt: UseSttModelsResult }) {
  const visible = stt.models.filter((m) => m.allowedByProbe);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());

  const handleDelete = (modelId: string) => {
    setDeletingIds((prev) => new Set(prev).add(modelId));
    void stt.deleteModel(modelId).finally(() => {
      setDeletingIds((prev) => {
        const next = new Set(prev);
        next.delete(modelId);
        return next;
      });
    });
  };

  return (
    <section
      className="settings-section"
      aria-labelledby="settings-stt-models-heading"
    >
      <h2 id="settings-stt-models-heading">
        {t("settings.sttModelsListHeading")}
      </h2>
      <p className="settings-hint">{t("settings.sttModelsListHint")}</p>

      <ul className="settings-provider-list">
        {visible.map((m) => {
          const label = sttModelLabel(m.id, m.label);
          const download = stt.downloads[m.id];
          const deleting = deletingIds.has(m.id);
          return (
            <li key={m.id} className="settings-provider">
              <div className="settings-provider-head">
                <span className="settings-provider-name">{label}</span>
                <Badge
                  variant={m.downloaded ? "success" : "default"}
                  label={
                    m.downloaded
                      ? t("settings.sttModelListDownloaded")
                      : t("settings.sttModelListNotDownloaded")
                  }
                >
                  {m.downloaded ? (
                    <>
                      <ShieldCheck size={12} aria-hidden="true" />
                      {t("settings.sttModelListDownloaded")}
                    </>
                  ) : (
                    t("settings.sttModelListNotDownloaded")
                  )}
                </Badge>
              </div>

              <div className="settings-model-meta">
                <span className="settings-field-label">
                  {t("settings.sttSizeLabel")}
                </span>
                <span className="settings-model-host">
                  {formatBytes(m.approxDownloadBytes)}
                </span>
              </div>

              {download ? (
                <div className="settings-field">
                  <ProgressBar
                    label={t("settings.sttModelListProgress", { model: label })}
                    value={
                      download.progress && download.progress.totalBytes > 0
                        ? (download.progress.downloadedBytes /
                            download.progress.totalBytes) *
                          100
                        : 0
                    }
                  />
                </div>
              ) : null}

              <div className="settings-provider-actions">
                {download ? (
                  <Button
                    onClick={() => stt.cancelDownload(m.id)}
                    disabled={download.cancelling}
                  >
                    {download.cancelling
                      ? t("settings.sttModelListCancelling")
                      : t("settings.sttModelListCancel")}
                  </Button>
                ) : !m.downloaded ? (
                  <Button onClick={() => stt.selectModel(m.id)}>
                    <Download size={16} aria-hidden="true" />
                    {t("settings.sttModelListDownload")}
                  </Button>
                ) : null}
                <IconButton
                  label={
                    deleting
                      ? t("settings.sttModelListDeleting")
                      : t("settings.sttModelListDelete")
                  }
                  onClick={() => handleDelete(m.id)}
                  disabled={!m.downloaded || Boolean(download) || deleting}
                >
                  <Trash2 size={16} aria-hidden="true" />
                </IconButton>
              </div>
            </li>
          );
        })}
      </ul>

      {stt.deleteError ? (
        <p
          className="settings-message settings-message--danger"
          role="alert"
          aria-live="assertive"
        >
          {t(STT_DELETE_ERROR_KEYS[stt.deleteError])}
        </p>
      ) : null}
    </section>
  );
}

/**
 * Local LLM tab (Settings, TASK-034 owner ask 3): model download/removal
 * management is DEFERRED pending an architecture decision - this is a clearly
 * labelled placeholder rather than a half-built feature. The local
 * OpenAI-compatible server CONNECTION itself is already configured under the
 * "Providers and keys" tab (base_url / model id / connection check), so this
 * tab only covers the still-missing piece.
 */
function LocalLlmSection() {
  return (
    <section
      className="settings-section"
      aria-labelledby="settings-local-llm-heading"
    >
      <h2 id="settings-local-llm-heading">
        {t("settings.localLlmModelsHeading")}
      </h2>
      <p className="settings-hint">{t("settings.localLlmModelsPlaceholder")}</p>
    </section>
  );
}

/**
 * Global-hotkey configuration (AC-04.1): one row per action showing the current
 * binding and a Change control that records the next chord. Rust owns
 * registration/persistence; a rejected binding surfaces a localized error and
 * keeps the previous set. Built from primitives + tokens only.
 */
function HotkeysSection() {
  const hotkeys = useHotkeys();

  return (
    <section
      className="settings-section"
      aria-labelledby="settings-hotkeys-heading"
    >
      <h2 id="settings-hotkeys-heading">{t("settings.hotkeysHeading")}</h2>
      <p className="settings-hint">{t("settings.hotkeysHint")}</p>

      {hotkeys.config ? (
        <ul className="settings-hotkey-list">
          {HOTKEY_ACTIONS.map((action) => {
            const recording = hotkeys.recording === action;
            const binding = hotkeys.config ? hotkeys.config[action] : "";
            return (
              <li key={action} className="settings-hotkey">
                <span className="settings-hotkey-label">
                  {t(HOTKEY_LABEL_KEYS[action])}
                </span>
                <Badge label={t("settings.hotkeyCurrent")}>{binding}</Badge>
                {recording ? (
                  <>
                    <span
                      className="settings-hotkey-recording"
                      role="status"
                      aria-live="polite"
                    >
                      {t("settings.hotkeyRecording")}
                    </span>
                    <Button onClick={hotkeys.cancelRecording}>
                      {t("settings.hotkeyCancel")}
                    </Button>
                  </>
                ) : (
                  <Button onClick={() => hotkeys.startRecording(action)}>
                    <Keyboard size={16} aria-hidden="true" />
                    {t("settings.hotkeyChange")}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      ) : null}

      {hotkeys.error ? (
        <p
          className="settings-message settings-message--danger"
          role="alert"
          aria-live="assertive"
        >
          {t(HOTKEY_ERROR_KEYS[hotkeys.error.kind])}
        </p>
      ) : null}
    </section>
  );
}

/** One provider's key entry / validate / remove row (AC-03.1). */
function ProviderKeyRow({
  meta,
  present,
  result,
  model,
  onSave,
  onCheck,
  onRemove,
  onModelChange,
}: {
  meta: ProviderMeta;
  present: boolean;
  result: KeyActionResult;
  model: string;
  onSave: (provider: ProviderId, key: string) => Promise<boolean>;
  onCheck: (provider: ProviderId) => void;
  onRemove: (provider: ProviderId) => void;
  onModelChange: (provider: ProviderId, model: string) => void;
}) {
  const [keyValue, setKeyValue] = useState("");
  const busy = result.type === "busy";
  const message = resultMessage(result);
  const messageId = `key-msg-${meta.id}`;

  const submit = async () => {
    if (keyValue.trim() === "") {
      return;
    }
    const cleared = await onSave(meta.id, keyValue);
    if (cleared) {
      setKeyValue("");
    }
  };

  return (
    <li className="settings-provider">
      <div className="settings-provider-head">
        <span className="settings-provider-name">{meta.displayName}</span>
        {/*
         * A configured key gets a distinct SUCCESS colour (owner ask: "hiển
         * thị key đã được cấu hình" - a clear configured indicator, never the
         * key value itself). Uses the semantic --color-success token via the
         * Badge primitive's `success` variant - not a hardcoded hex
         * (design-system.md).
         */}
        <Badge
          variant={present ? "success" : "warning"}
          label={
            present
              ? t("settings.statusConfigured")
              : t("settings.statusNotConfigured")
          }
        >
          {present ? (
            <>
              <ShieldCheck size={12} aria-hidden="true" />
              {t("settings.statusConfigured")}
            </>
          ) : (
            t("settings.statusNotConfigured")
          )}
        </Badge>
      </div>

      <div className="settings-provider-entry">
        <Input
          label={t("settings.keyLabel", { provider: meta.displayName })}
          type="password"
          value={keyValue}
          placeholder={t("settings.keyPlaceholder")}
          onChange={setKeyValue}
          invalid={result.type === "invalid"}
          describedById={message ? messageId : undefined}
          disabled={busy}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              void submit();
            }
          }}
        />
        <div className="settings-provider-actions">
          <Button
            variant="primary"
            onClick={() => void submit()}
            disabled={busy || keyValue.trim() === ""}
          >
            {busy ? t("settings.saving") : t("settings.save")}
          </Button>
          {meta.supportsValidation ? (
            <Button
              onClick={() => onCheck(meta.id)}
              disabled={busy || !present}
            >
              {t("settings.check")}
            </Button>
          ) : null}
          <IconButton
            label={t("settings.remove")}
            onClick={() => onRemove(meta.id)}
            disabled={busy || !present}
          >
            <Trash2 size={16} aria-hidden="true" />
          </IconButton>
        </div>
      </div>

      <div className="settings-provider-model">
        <span className="settings-field-label" id={`model-label-${meta.id}`}>
          {t("settings.model")}
        </span>
        <Select
          label={t("settings.model")}
          value={model}
          options={meta.models.map((m) => ({ value: m.id, label: m.label }))}
          onChange={(value) => onModelChange(meta.id, value)}
        />
      </div>

      {message ? (
        <p
          id={messageId}
          className={`settings-message settings-message--${message.tone}`}
          role="status"
          aria-live="polite"
        >
          {t(message.key)}
        </p>
      ) : null}
    </li>
  );
}

/**
 * One consented model set with a revoke control (BR-08, TASK-012). Revoking
 * flips the persisted flag; the fail-closed gate is Rust-side, so the NEXT
 * download re-prompts. `displayName`/host are untrusted DATA -> PlainText.
 */
function ModelConsentRow({
  status,
  revokeState,
  onRevoke,
}: {
  status: ModelConsentStatus;
  revokeState: RevokeState;
  onRevoke: (modelSetId: string) => void;
}) {
  const busy = revokeState === "busy";
  const { disclosure } = status;
  const messageId = `model-msg-${status.modelSetId}`;
  const hasError = revokeState === "error";

  return (
    <li className="settings-provider">
      <div className="settings-provider-head">
        <span className="settings-provider-name">
          <PlainText text={disclosure.displayName} />
        </span>
        <Badge variant="default" label={t("settings.modelAllowed")}>
          <ShieldCheck size={12} aria-hidden="true" />
          {t("settings.modelAllowed")}
        </Badge>
      </div>

      <div className="settings-model-meta">
        <span className="settings-field-label">
          {t("settings.modelHostLabel")}
        </span>
        <span className="settings-model-host">
          <PlainText text={disclosure.hostName} />
          {" ("}
          <PlainText text={disclosure.hostDomain} />
          {")"}
        </span>
      </div>

      <div className="settings-provider-actions">
        <IconButton
          label={busy ? t("settings.modelRevoking") : t("settings.modelRevoke")}
          onClick={() => onRevoke(status.modelSetId)}
          disabled={busy}
        >
          <ShieldOff size={16} aria-hidden="true" />
        </IconButton>
      </div>

      {hasError ? (
        <p
          id={messageId}
          className="settings-message settings-message--danger"
          role="status"
          aria-live="polite"
        >
          {t("settings.modelRevokeError")}
        </p>
      ) : null}
    </li>
  );
}

/**
 * Settings surface (SCR-04, FR-03/FR-04): provider key entry/validation/removal,
 * default provider + per-provider model, fallback order, and model-download
 * consent revocation (FR-02/BR-08). Built only from UI primitives + tokens
 * (design-system.md); every string is an i18n key.
 *
 * Grouped into keyboard-accessible TABS (owner ask, TASK-034): Providers and
 * keys, Speech-to-text, Local LLM (placeholder, deferred), Hotkeys, History
 * and general. The STT model-switcher hook is instantiated ONCE here (not per
 * tab) so an in-flight download's progress survives a TAB switch too, not
 * just a dropdown change within the Speech-to-text tab.
 */
export function SettingsView() {
  const keys = useProviderKeys();
  const selection = useProviderSelection();
  const consent = useModelConsent();
  const history = useHistorySettings();
  const audio = useAudioSession();
  const picker = useProviderPickerMetadata();
  const localConn = useLocalProviderConnection();
  const stt = useSttModels();
  const [activeTab, setActiveTab] = useState("providers");

  const order = selection.settings.fallbackOrder;
  const grantedModels = consent.statuses.filter((s) => s.granted);

  const activeProvider = selection.settings.defaultProvider;
  const activeProviderModel = activeModel(selection.settings);
  const isLocalProviderActive = activeProvider === LOCAL_OPENAI_PROVIDER_ID;

  /** Provider transparency (human-in-the-loop.md): the active-provider display
   * name resolves through the picker metadata first (it covers the local
   * provider too), falling back to the static keyed-provider catalog while
   * the metadata call is still loading. */
  const activeProviderDisplayName =
    picker.metadata.find((m) => m.provider_id === activeProvider)
      ?.display_name ??
    (isProviderId(activeProvider)
      ? PROVIDER_META[activeProvider].displayName
      : activeProvider);

  /* Cloud LLM vs Local LLM (owner ask: don't bury local under a generic
   * dropdown row). `Select` has no optgroup concept (design-system.md - no
   * new primitive needed for this), so the split is rendered with
   * non-selectable header rows using the EXISTING `disabled` option affordance
   * (shown, but skipped by keyboard nav / ignored on click, same as the
   * hardware-gated STT tiers above). */
  const cloudProviderOptions: SelectOption[] =
    picker.metadata.length > 0
      ? picker.metadata
          .filter((m) => m.provider_id !== LOCAL_OPENAI_PROVIDER_ID)
          .map((m) => ({ value: m.provider_id, label: m.display_name }))
      : PROVIDER_META_LIST.map((m) => ({ value: m.id, label: m.displayName }));

  const localProviderOptions: SelectOption[] = picker.metadata
    .filter((m) => m.provider_id === LOCAL_OPENAI_PROVIDER_ID)
    .map((m) => ({ value: m.provider_id, label: m.display_name }));

  const activeProviderOptions: SelectOption[] = [
    {
      value: "__group_cloud__",
      label: t("settings.providerGroupCloud"),
      disabled: true,
    },
    ...cloudProviderOptions,
    ...(localProviderOptions.length > 0
      ? [
          {
            value: "__group_local__",
            label: t("settings.providerGroupLocal"),
            disabled: true,
          },
          ...localProviderOptions,
        ]
      : []),
  ];

  const providersTab = (
    <>
      <section
        className="settings-section"
        aria-labelledby="settings-providers-heading"
      >
        <h2 id="settings-providers-heading">
          {t("settings.providersHeading")}
        </h2>
        <p className="settings-hint">{t("settings.providersHint")}</p>
        <ul className="settings-provider-list">
          {PROVIDER_META_LIST.map((meta) => (
            <ProviderKeyRow
              key={meta.id}
              meta={meta}
              present={keys.statuses[meta.id]}
              result={keys.results[meta.id]}
              model={selection.settings.models[meta.id]}
              onSave={async (id, value) => {
                const cleared = await keys.saveKey(id, value);
                // Adding a key while the ACTIVE provider has no key is a dead
                // end: every translation still routes to the keyless provider
                // and fails with a generic error. Make the provider you just
                // configured the active one. The local OpenAI-compatible
                // provider needs no key, so never switch away from it.
                const active = selection.settings.defaultProvider;
                const activeNeedsKey = isProviderId(active);
                if (cleared && activeNeedsKey && !keys.statuses[active]) {
                  await selection.setDefaultProvider(id);
                }
                return cleared;
              }}
              onCheck={(id) => void keys.checkKey(id)}
              onRemove={(id) => void keys.removeKey(id)}
              onModelChange={(id, m) => void selection.setProviderModel(id, m)}
            />
          ))}
        </ul>
      </section>

      <section
        className="settings-section"
        aria-labelledby="settings-active-heading"
      >
        <h2 id="settings-active-heading">{t("settings.activeHeading")}</h2>
        <div className="settings-field">
          <span className="settings-field-label" id="default-provider-label">
            {t("settings.defaultProvider")}
          </span>
          <Select
            label={t("settings.defaultProvider")}
            value={selection.settings.defaultProvider}
            options={activeProviderOptions}
            onChange={(value) => {
              localConn.reset();
              void selection.setDefaultProvider(value as ActiveProviderId);
            }}
          />
        </div>

        {isLocalProviderActive ? (
          <div className="settings-field settings-local-provider">
            <Input
              label={t("settings.localBaseUrlLabel")}
              value={selection.settings.localOpenAi.baseUrl}
              placeholder={t("settings.localBaseUrlPlaceholder")}
              onChange={(v) => void selection.setLocalOpenAiBaseUrl(v)}
            />
            <div className="settings-field">
              <span
                className="settings-field-label"
                id="local-model-preset-label"
              >
                {t("settings.localModelPresetLabel")}
              </span>
              <Select
                label={t("settings.localModelPresetLabel")}
                value={
                  isLocalModelPresetId(selection.settings.localOpenAi.modelId)
                    ? selection.settings.localOpenAi.modelId
                    : LOCAL_MODEL_PRESET_CUSTOM
                }
                options={[
                  ...LOCAL_MODEL_PRESETS.map((preset) => ({
                    value: preset.id,
                    label: `${preset.id} - ${t(preset.hintKey)}`,
                  })),
                  {
                    value: LOCAL_MODEL_PRESET_CUSTOM,
                    label: t("settings.localModelPresetCustom"),
                  },
                ]}
                onChange={(value) => {
                  if (value !== LOCAL_MODEL_PRESET_CUSTOM) {
                    void selection.setLocalOpenAiModelId(value);
                  }
                }}
              />
            </div>
            <Input
              label={t("settings.localModelLabel")}
              value={selection.settings.localOpenAi.modelId}
              placeholder={t("settings.localModelPlaceholder")}
              onChange={(v) => void selection.setLocalOpenAiModelId(v)}
            />
            <div className="settings-provider-actions">
              <Button
                onClick={() =>
                  void localConn.check(selection.settings.localOpenAi.baseUrl)
                }
                disabled={
                  localConn.state.status === "checking" ||
                  selection.settings.localOpenAi.baseUrl.trim() === ""
                }
              >
                {localConn.state.status === "checking"
                  ? t("settings.localChecking")
                  : t("settings.localCheckConnection")}
              </Button>
            </div>
            {localConn.state.status === "ok" ? (
              <p
                className="settings-message settings-message--ok"
                role="status"
                aria-live="polite"
              >
                {t("settings.localCheckOk")}
              </p>
            ) : null}
            {localConn.state.status === "error" ? (
              <p
                className="settings-message settings-message--danger"
                role="alert"
                aria-live="assertive"
              >
                {t(LOCAL_PROVIDER_ERROR_KEYS[localConn.state.kind])}
              </p>
            ) : null}
          </div>
        ) : null}
      </section>

      <section
        className="settings-section"
        aria-labelledby="settings-fallback-heading"
      >
        <h2 id="settings-fallback-heading">{t("settings.fallbackHeading")}</h2>
        <p className="settings-hint">{t("settings.fallbackHint")}</p>
        <ol className="settings-fallback-list">
          {order.map((id, index) => (
            <li key={id} className="settings-fallback-item">
              <span className="settings-fallback-rank" aria-hidden="true">
                {index + 1}
              </span>
              <span className="settings-fallback-name">
                {PROVIDER_META[id].displayName}
              </span>
              {keys.statuses[id] ? null : (
                <Badge variant="warning" label={t("settings.fallbackNoKey")}>
                  {t("settings.fallbackNoKey")}
                </Badge>
              )}
              <span className="settings-fallback-controls">
                <IconButton
                  label={t("settings.moveUp")}
                  onClick={() => void selection.moveFallback(index, "up")}
                  disabled={index === 0}
                >
                  <ArrowUp size={16} aria-hidden="true" />
                </IconButton>
                <IconButton
                  label={t("settings.moveDown")}
                  onClick={() => void selection.moveFallback(index, "down")}
                  disabled={index === order.length - 1}
                >
                  <ArrowDown size={16} aria-hidden="true" />
                </IconButton>
              </span>
            </li>
          ))}
        </ol>
      </section>
    </>
  );

  const sttTab = (
    <>
      <SttEngineSection stt={stt} />
      <SttModelManagementSection stt={stt} />

      <section
        className="settings-section"
        aria-labelledby="settings-audio-heading"
      >
        <h2 id="settings-audio-heading">{t("settings.audioHeading")}</h2>
        <p className="settings-hint">{t("settings.audioHint")}</p>

        <div className="settings-field">
          <span className="settings-field-label" id="audio-source-label">
            {t("settings.audioSourceLanguage")}
          </span>
          <Select
            label={t("settings.audioSourceLanguage")}
            value={audio.sourceLanguage}
            options={SOURCE_LANGUAGE_OPTIONS.map((o) => ({
              value: o.value,
              label: t(o.labelKey),
            }))}
            onChange={audio.setSourceLanguage}
          />
        </div>

        <div className="settings-field">
          <span className="settings-field-label" id="audio-target-label">
            {t("settings.audioTargetLanguage")}
          </span>
          <Select
            label={t("settings.audioTargetLanguage")}
            value={audio.targetLanguage}
            options={TARGET_LANGUAGE_OPTIONS.map((o) => ({
              value: o.value,
              label: t(o.labelKey),
            }))}
            onChange={audio.setTargetLanguage}
          />
        </div>

        <p className="settings-hint">
          {t("settings.audioProvider", {
            provider: activeProviderDisplayName,
          })}
        </p>

        <div className="settings-model-meta">
          <span className="settings-field-label">
            {t("settings.audioRecommendedModel")}
          </span>
          {audio.whisper && audio.whisper.granted ? (
            <>
              <span className="settings-model-host">
                <PlainText text={audio.whisper.disclosure.displayName} />
              </span>
              <Badge variant="default" label={t("settings.audioModelReady")}>
                <ShieldCheck size={12} aria-hidden="true" />
                {t("settings.audioModelReady")}
              </Badge>
            </>
          ) : (
            <span className="settings-model-host">
              {audio.whisper ? (
                <PlainText text={audio.whisper.disclosure.displayName} />
              ) : null}
            </span>
          )}
        </div>

        {!audio.whisperLoading && (!audio.whisper || !audio.whisper.granted) ? (
          <div className="settings-field">
            <p className="settings-hint" role="status" aria-live="polite">
              {t("settings.audioModelNotReady")}
            </p>
            <Button onClick={audio.openConsent} disabled={!audio.whisper}>
              {t("settings.audioReviewDownload")}
            </Button>
          </div>
        ) : null}

        <div className="settings-provider-actions">
          {audio.running ? (
            <Button variant="primary" onClick={audio.stop}>
              <Square size={16} aria-hidden="true" />
              {t("settings.audioStop")}
            </Button>
          ) : (
            <Button
              variant="primary"
              onClick={() => audio.start(activeProvider, activeProviderModel)}
            >
              <Play size={16} aria-hidden="true" />
              {t("settings.audioStart")}
            </Button>
          )}
          {audio.running ? (
            <Badge variant="default" label={t("settings.audioRunning")}>
              {t("settings.audioRunning")}
            </Badge>
          ) : null}
        </div>

        {audio.error === "start" ? (
          <p
            className="settings-message settings-message--danger"
            role="alert"
            aria-live="assertive"
          >
            {t("settings.audioStartError")}
          </p>
        ) : null}

        {audio.whisper ? (
          <ConsentDialog
            open={audio.consentDialogOpen}
            disclosure={audio.whisper.disclosure}
            onGrant={audio.grantConsent}
            onDecline={audio.declineConsent}
            titleKey="consent.whisperTitle"
            introKey="consent.whisperIntro"
          />
        ) : null}
      </section>
    </>
  );

  const generalTab = (
    <>
      <section
        className="settings-section"
        aria-labelledby="settings-models-heading"
      >
        <h2 id="settings-models-heading">{t("settings.modelsHeading")}</h2>
        <p className="settings-hint">{t("settings.modelsHint")}</p>
        {grantedModels.length === 0 ? (
          <p className="settings-hint" role="status" aria-live="polite">
            {t("settings.modelsEmpty")}
          </p>
        ) : (
          <ul className="settings-provider-list">
            {grantedModels.map((status) => (
              <ModelConsentRow
                key={status.modelSetId}
                status={status}
                revokeState={consent.revokeState[status.modelSetId] ?? "idle"}
                onRevoke={(id) => void consent.revoke(id)}
              />
            ))}
          </ul>
        )}
      </section>

      <section
        className="settings-section"
        aria-labelledby="settings-history-heading"
      >
        <h2 id="settings-history-heading">{t("settings.historyHeading")}</h2>
        <p className="settings-hint">{t("settings.historyHint")}</p>
        <Switch
          checked={history.enabled}
          onChange={(next) => void history.setEnabled(next)}
          label={t("settings.historyToggle")}
          disabled={history.loading}
        />
        <div className="settings-provider-actions">
          <Button onClick={() => void historyIpc.open()}>
            <History size={16} aria-hidden="true" />
            {t("settings.historyOpen")}
          </Button>
        </div>
        {history.error ? (
          <p
            className="settings-message settings-message--danger"
            role="status"
            aria-live="polite"
          >
            {t("settings.historyError")}
          </p>
        ) : null}
      </section>
    </>
  );

  const tabs: TabItem[] = [
    {
      id: "providers",
      label: t("settings.tabProviders"),
      content: providersTab,
    },
    { id: "stt", label: t("settings.tabStt"), content: sttTab },
    {
      id: "localLlm",
      label: t("settings.tabLocalLlm"),
      content: <LocalLlmSection />,
    },
    {
      id: "hotkeys",
      label: t("settings.tabHotkeys"),
      content: <HotkeysSection />,
    },
    { id: "general", label: t("settings.tabGeneral"), content: generalTab },
  ];

  return (
    <main className="settings">
      <h1 className="settings-title">{t("settings.title")}</h1>

      {selection.error ? (
        <p
          className="settings-message settings-message--danger"
          role="alert"
          aria-live="assertive"
        >
          {t("settings.error.persist")}
        </p>
      ) : null}

      <Tabs
        items={tabs}
        activeId={activeTab}
        onChange={setActiveTab}
        label={t("settings.tablistLabel")}
      />
    </main>
  );
}
