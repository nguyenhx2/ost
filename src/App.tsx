import {
  Activity,
  Crop,
  History,
  Mic,
  Radio,
  Settings as SettingsIcon,
  ShieldCheck,
  Sparkles,
  Square,
  Zap,
} from "lucide-react";
import "./App.css";
import { Badge, Button, Select } from "./components/ui";
import { BrandMark } from "./components/BrandMark";
import { ProviderKeyNotice } from "./components/ProviderKeyNotice";
import { useAudioSession } from "./hooks/useAudioSession";
import { useHasAnyProviderKey } from "./hooks/useHasAnyProviderKey";
import { useHotkeys } from "./hooks/useHotkeys";
import { useProviderPickerMetadata } from "./hooks/useProviderPickerMetadata";
import { useProviderSelection } from "./hooks/useProviderSelection";
import { useRegionLanguageSettings } from "./hooks/useRegionLanguageSettings";
import { useSttModels } from "./hooks/useSttModels";
import { historyIpc, regionIpc, settingsIpc } from "./lib/ipc";
import { t } from "./lib/i18n";
import {
  SOURCE_LANGUAGE_OPTIONS,
  TARGET_LANGUAGE_OPTIONS,
} from "./lib/languages";
import { languageSelectOptions } from "./lib/languageSelectOptions";
import { isProviderId, PROVIDER_META } from "./lib/providers";
import { activeModel } from "./lib/settings";
import { STT_MODEL_LABEL_KEYS } from "./lib/sttModelLabels";

/**
 * Home screen (main window, FR-04 / TASK-028): the first surface the owner
 * sees, so it must give the app's core functions without hunting the tray.
 * Mirrors the tray menu + global hotkeys as one-click actions (region select,
 * audio session toggle, Settings, History) and shows status at a glance
 * (active provider/model, key configured, STT tier + downloaded, audio
 * running). Everything is composed from EXISTING hooks + the typed IPC
 * wrapper - no new backend surface. Human-in-the-loop: every action here
 * opens the app's OWN window/session; nothing is an automatic outbound
 * send/type/click (human-in-the-loop.md).
 */
function App() {
  const selection = useProviderSelection();
  const picker = useProviderPickerMetadata();
  const keyStatus = useHasAnyProviderKey();
  const stt = useSttModels();
  const audio = useAudioSession();
  const hotkeys = useHotkeys();
  const regionLanguage = useRegionLanguageSettings();

  const activeProvider = selection.settings.defaultProvider;
  const activeProviderModel = activeModel(selection.settings);

  /** Provider transparency (human-in-the-loop.md): resolve the display name
   * through the picker metadata first (covers the local provider too),
   * falling back to the static keyed-provider catalog while it loads -
   * mirrors SettingsView's identical resolution. */
  const activeProviderDisplayName =
    picker.metadata.find((m) => m.provider_id === activeProvider)
      ?.display_name ??
    (isProviderId(activeProvider)
      ? PROVIDER_META[activeProvider].displayName
      : activeProvider);

  const currentSttModel = stt.models.find((m) => m.current) ?? null;
  const sttLabelKey = currentSttModel
    ? STT_MODEL_LABEL_KEYS[currentSttModel.id]
    : undefined;
  const sttLabel = currentSttModel
    ? sttLabelKey
      ? t(sttLabelKey)
      : currentSttModel.label
    : null;

  const handleToggleAudio = () => {
    if (audio.running) {
      audio.stop();
    } else {
      audio.start(activeProvider, activeProviderModel);
    }
  };

  return (
    <main className="home">
      <header className="home-header">
        <h1 className="home-title">
          <BrandMark className="home-title-mark" />
          {t("app.title")}
        </h1>
        <p className="home-subtitle">{t("home.subtitle")}</p>
      </header>

      <section className="home-section" aria-labelledby="home-status-heading">
        <h2 id="home-status-heading">
          <Activity size={16} aria-hidden="true" />
          {t("home.statusHeading")}
        </h2>
        <ul className="home-status-list">
          <li className="home-status-item">
            <span className="home-status-label">{t("home.providerLabel")}</span>
            <Badge label={t("home.providerLabel")}>
              <Sparkles size={12} aria-hidden="true" />
              {`${activeProviderDisplayName} / ${activeProviderModel}`}
            </Badge>
          </li>

          {!stt.loading && sttLabel !== null ? (
            <li className="home-status-item">
              <span className="home-status-label">{t("home.sttLabel")}</span>
              <span className="home-status-value">{sttLabel}</span>
              <Badge
                variant={currentSttModel?.downloaded ? "default" : "warning"}
                label={
                  currentSttModel?.downloaded
                    ? t("home.sttDownloaded")
                    : t("home.sttNotDownloaded")
                }
              >
                {currentSttModel?.downloaded ? (
                  <>
                    <ShieldCheck size={12} aria-hidden="true" />
                    {t("home.sttDownloaded")}
                  </>
                ) : (
                  t("home.sttNotDownloaded")
                )}
              </Badge>
            </li>
          ) : null}

          <li className="home-status-item">
            <span className="home-status-label">
              {t("home.audioSessionLabel")}
            </span>
            <Badge
              variant={audio.running ? "default" : "warning"}
              label={
                audio.running ? t("home.audioRunning") : t("home.audioIdle")
              }
            >
              {audio.running ? (
                <>
                  <Radio size={12} aria-hidden="true" />
                  {t("home.audioRunning")}
                </>
              ) : (
                t("home.audioIdle")
              )}
            </Badge>
          </li>
        </ul>

        {!keyStatus.loading && !keyStatus.hasKey ? (
          <ProviderKeyNotice
            messageKey="home.noProviderKey"
            ctaKey="home.openSettings"
          />
        ) : null}
      </section>

      <section className="home-section" aria-labelledby="home-actions-heading">
        <h2 id="home-actions-heading">
          <Zap size={16} aria-hidden="true" />
          {t("home.actionsHeading")}
        </h2>
        <ul className="home-action-list">
          <li className="home-action">
            <div className="home-action-info">
              <span className="home-action-label">
                {t("home.actionRegion")}
              </span>
              {hotkeys.config ? (
                <Badge label={t("home.hotkeyLabel")}>
                  {hotkeys.config.regionSelect}
                </Badge>
              ) : null}
            </div>
            {/* Item 3: language pickers default the NEXT region selection
                anywhere in the app (select overlay + preview dialog read the
                same persisted preference, useRegionLanguageSettings). Kept on
                their own row so the primary CTA button reads as the one
                visual endpoint of this action, not one control among five. */}
            <div className="home-action-controls">
              <Select
                label={t("home.regionSourceLanguage")}
                options={languageSelectOptions(SOURCE_LANGUAGE_OPTIONS)}
                value={regionLanguage.settings.sourceLanguage}
                onChange={regionLanguage.setSourceLanguage}
              />
              <Select
                label={t("home.regionTargetLanguage")}
                options={languageSelectOptions(TARGET_LANGUAGE_OPTIONS)}
                value={regionLanguage.settings.targetLanguage}
                onChange={regionLanguage.setTargetLanguage}
              />
              <Button
                variant="primary"
                onClick={() => void regionIpc.startSelection()}
              >
                <Crop size={16} aria-hidden="true" />
                {t("home.actionRegionCta")}
              </Button>
            </div>
          </li>

          <li className="home-action">
            <div className="home-action-info">
              <span className="home-action-label">{t("home.actionAudio")}</span>
              {hotkeys.config ? (
                <Badge label={t("home.hotkeyLabel")}>
                  {hotkeys.config.toggleAudio}
                </Badge>
              ) : null}
              {audio.running ? (
                <Badge label={t("home.audioRunning")}>
                  <Radio size={12} aria-hidden="true" />
                  {t("home.audioRunning")}
                </Badge>
              ) : null}
            </div>
            <div className="home-action-controls">
              <Button variant="primary" onClick={handleToggleAudio}>
                {audio.running ? (
                  <>
                    <Square size={16} aria-hidden="true" />
                    {t("home.actionAudioStop")}
                  </>
                ) : (
                  <>
                    <Mic size={16} aria-hidden="true" />
                    {t("home.actionAudioStart")}
                  </>
                )}
              </Button>
            </div>
          </li>

          <li className="home-action">
            <div className="home-action-info">
              <span className="home-action-label">
                {t("home.actionSettings")}
              </span>
            </div>
            <div className="home-action-controls">
              <Button onClick={() => void settingsIpc.open()}>
                <SettingsIcon size={16} aria-hidden="true" />
                {t("home.actionSettingsCta")}
              </Button>
            </div>
          </li>

          <li className="home-action">
            <div className="home-action-info">
              <span className="home-action-label">
                {t("home.actionHistory")}
              </span>
            </div>
            <div className="home-action-controls">
              <Button onClick={() => void historyIpc.open()}>
                <History size={16} aria-hidden="true" />
                {t("home.actionHistoryCta")}
              </Button>
            </div>
          </li>
        </ul>

        {audio.error === "start" ? (
          <p
            className="home-message home-message--danger"
            role="alert"
            aria-live="assertive"
          >
            {t("home.audioStartError")}
          </p>
        ) : null}
      </section>
    </main>
  );
}

export default App;
