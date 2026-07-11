import { useState } from "react";
import {
  ArrowDown,
  ArrowUp,
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
  type SelectOption,
} from "../components/ui";
import { ConsentDialog } from "../components/ConsentDialog";
import { t } from "../lib/i18n";
import {
  isProviderId,
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
import { useSttModels } from "../hooks/useSttModels";
import { resultMessage } from "./settingsMessages";
import {
  historyIpc,
  HOTKEY_ACTIONS,
  type HotkeyAction,
  type HotkeyErrorKind,
  type LocalProviderErrorKind,
  type ModelConsentStatus,
  type SttModelSwitchErrorKind,
} from "../lib/ipc";
import { formatBytes } from "../lib/format";
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
 * STT engine picker (FR-01, TASK-026 part C). This is a SEPARATE picker from
 * the FR-03 translation-provider one below - never shared state, never a
 * shared list (PRD-FR-01-stt-backend-options section 3 "Ranh giới hai bộ
 * chọn"). i18n owns the tier display names (the core's `label` is an English
 * fallback only, used for unknown/future ids).
 */
const STT_MODEL_LABEL_KEYS: Partial<Record<string, I18nKey>> = {
  tiny: "settings.sttModelTiny",
  base: "settings.sttModelBase",
  small: "settings.sttModelSmall",
  "large-v3-turbo": "settings.sttModelLargeTurbo",
  "large-v3": "settings.sttModelLargeV3",
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
};

const LOCAL_PROVIDER_ERROR_KEYS: Record<LocalProviderErrorKind, I18nKey> = {
  invalidBaseUrl: "settings.localErrorInvalidBaseUrl",
  localServerUnreachable: "settings.localErrorUnreachable",
  network: "settings.localErrorNetwork",
  timeout: "settings.localErrorTimeout",
  provider: "settings.localErrorProvider",
};

/**
 * Speech-to-text engine section (FR-01, TASK-026 part C, AC-01.8). Lists the
 * local whisper tiers (hardware-gated, with a Tooltip reason on disabled
 * entries) plus the static cloud-STT rows (always disabled, pending ADR-005).
 * Switching reuses the shared BR-08 consent-download dialog, extended with a
 * live progress bar; a mid-session switch is rejected with a clear message.
 */
function SttEngineSection() {
  const stt = useSttModels();
  const current = stt.models.find((m) => m.current) ?? null;

  const options: SelectOption[] = [
    ...stt.models.map((m) => ({
      value: m.id,
      label:
        (STT_MODEL_LABEL_KEYS[m.id]
          ? t(STT_MODEL_LABEL_KEYS[m.id]!)
          : m.label) + (m.current ? ` (${t("settings.sttCurrent")})` : ""),
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
            <Badge variant="default" label={t("settings.sttDownloaded")}>
              <ShieldCheck size={12} aria-hidden="true" />
              {t("settings.sttDownloaded")}
            </Badge>
          ) : null}
        </div>
      ) : null}

      {stt.phase === "downloading" ? (
        <div className="settings-field">
          <ProgressBar
            label={t("settings.sttDownloadProgress")}
            value={
              stt.progress && stt.progress.totalBytes > 0
                ? (stt.progress.downloadedBytes / stt.progress.totalBytes) * 100
                : 0
            }
          />
          {stt.progress ? (
            <p className="settings-hint" role="status" aria-live="polite">
              {`${formatBytes(stt.progress.downloadedBytes)} / ${formatBytes(
                stt.progress.totalBytes,
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
          onGrant={stt.confirmDownload}
          onDecline={stt.cancelConsent}
          titleKey="consent.sttSwitchTitle"
          introKey="consent.sttSwitchIntro"
        />
      ) : null}
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
        <Badge
          variant={present ? "default" : "warning"}
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
 */
export function SettingsView() {
  const keys = useProviderKeys();
  const selection = useProviderSelection();
  const consent = useModelConsent();
  const history = useHistorySettings();
  const audio = useAudioSession();
  const picker = useProviderPickerMetadata();
  const localConn = useLocalProviderConnection();

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

  const activeProviderOptions: SelectOption[] =
    picker.metadata.length > 0
      ? picker.metadata.map((m) => ({
          value: m.provider_id,
          label: m.display_name,
        }))
      : PROVIDER_META_LIST.map((m) => ({ value: m.id, label: m.displayName }));

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
              onSave={keys.saveKey}
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

      <SttEngineSection />

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

      <HotkeysSection />
    </main>
  );
}
