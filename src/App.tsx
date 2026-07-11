import {
  Crop,
  History,
  Mic,
  Settings as SettingsIcon,
  ShieldCheck,
  Square,
} from "lucide-react";
import "./App.css";
import { Badge, Button, Select } from "./components/ui";
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
        <h1 className="home-title">{t("app.title")}</h1>
        <p className="home-subtitle">{t("home.subtitle")}</p>
      </header>

      <section className="home-section" aria-labelledby="home-status-heading">
        <h2 id="home-status-heading">{t("home.statusHeading")}</h2>
        <ul className="home-status-list">
          <li className="home-status-item">
            <span className="home-status-label">{t("home.providerLabel")}</span>
            <Badge label={t("home.providerLabel")}>
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
              {audio.running ? t("home.audioRunning") : t("home.audioIdle")}
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
        <h2 id="home-actions-heading">{t("home.actionsHeading")}</h2>
        <ul className="home-action-list">
          <li className="home-action">
            <span className="home-action-label">{t("home.actionRegion")}</span>
            {hotkeys.config ? (
              <Badge label={t("home.hotkeyLabel")}>
                {hotkeys.config.regionSelect}
              </Badge>
            ) : null}
            {/* Item 3: language pickers default the NEXT region selection
                anywhere in the app (select overlay + preview dialog read the
                same persisted preference, useRegionLanguageSettings). */}
            <Select
              label={t("home.regionSourceLanguage")}
              options={SOURCE_LANGUAGE_OPTIONS.map((o) => ({
                value: o.value,
                label: t(o.labelKey),
              }))}
              value={regionLanguage.settings.sourceLanguage}
              onChange={regionLanguage.setSourceLanguage}
            />
            <Select
              label={t("home.regionTargetLanguage")}
              options={TARGET_LANGUAGE_OPTIONS.map((o) => ({
                value: o.value,
                label: t(o.labelKey),
              }))}
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
          </li>

          <li className="home-action">
            <span className="home-action-label">{t("home.actionAudio")}</span>
            {hotkeys.config ? (
              <Badge label={t("home.hotkeyLabel")}>
                {hotkeys.config.toggleAudio}
              </Badge>
            ) : null}
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
            {audio.running ? (
              <Badge label={t("home.audioRunning")}>
                {t("home.audioRunning")}
              </Badge>
            ) : null}
          </li>

          <li className="home-action">
            <span className="home-action-label">
              {t("home.actionSettings")}
            </span>
            <Button onClick={() => void settingsIpc.open()}>
              <SettingsIcon size={16} aria-hidden="true" />
              {t("home.actionSettingsCta")}
            </Button>
          </li>

          <li className="home-action">
            <span className="home-action-label">{t("home.actionHistory")}</span>
            <Button onClick={() => void historyIpc.open()}>
              <History size={16} aria-hidden="true" />
              {t("home.actionHistoryCta")}
            </Button>
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
