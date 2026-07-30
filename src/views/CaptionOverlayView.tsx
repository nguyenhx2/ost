import { useState } from "react";
import {
  AlertTriangle,
  ClipboardCopy,
  Copy,
  List,
  MoreHorizontal,
  Move,
  Pause,
  Pin,
  PinOff,
  Play,
  Square,
  X,
} from "lucide-react";
import {
  Badge,
  Button,
  IconButton,
  OverlayPanel,
  PlainText,
  Popover,
  Slider,
  Tooltip,
} from "../components/ui";
import { ConsentDialog } from "../components/ConsentDialog";
import { CaptionTranscriptDialog } from "../components/CaptionTranscriptDialog";
import {
  useCaptionOverlay,
  parseCaptionRequest,
} from "../hooks/useCaptionOverlay";
import { t } from "../lib/i18n";
import { formatDurationMs } from "../lib/format";
import { languageLabelKey } from "../lib/languages";
import { STT_MODEL_LABEL_KEYS } from "../lib/sttModelLabels";
import "./CaptionOverlayView.css";

const OPACITY_MIN = 0.3;
const OPACITY_MAX = 1;
const OPACITY_STEP = 0.05;
const OPACITY_DEFAULT = 0.85;
/** CSS px per arrow-key press on the move handle (AC-04.3 keyboard path). */
const NUDGE_STEP = 16;

/**
 * SCR-01: live bilingual caption overlay (FR-01, AC-01.1/01.3/01.7, AC-03.5,
 * AC-04.3/04.8). Renders the latest `audio:caption` as source + translated text
 * (PlainText - untrusted DATA), the detected/pinned source language, the
 * active provider/model AND whisper STT model (human-in-the-loop.md model
 * transparency), a low-confidence flag, and distinct pause/resume/stop
 * controls alongside the always-on-top window's own pin/close. Everything is
 * keyboard operable; Esc dismisses unless pinned. Copy is the ONLY outbound
 * action.
 */
export function CaptionOverlayView() {
  const [request] = useState(() =>
    parseCaptionRequest(
      typeof window !== "undefined" ? window.location.search : "",
    ),
  );
  const overlay = useCaptionOverlay(request);
  const [opacity, setOpacity] = useState(OPACITY_DEFAULT);
  const [transcriptOpen, setTranscriptOpen] = useState(false);

  const { state, copied, pinned, consentDialogOpen } = overlay;
  const caption = state.caption;
  const sessionState = state.sessionState;

  const providerBadgeText = caption
    ? `${caption.provider} / ${caption.model}`
    : `${request.provider} / ${request.model}`;

  // Item 1 (owner-reported: never knew which model was running): the caption
  // itself is authoritative once one has arrived; before that, fall back to
  // the AT-MOUNT status snapshot (`useCaptionOverlay`'s separate effect) so
  // the badge is populated well before the first caption can arrive.
  const sttModelId = caption?.sttModel ?? state.status?.sttModelId ?? null;
  const sttLabelKey = sttModelId ? STT_MODEL_LABEL_KEYS[sttModelId] : undefined;
  const sttModelLabel = sttModelId
    ? sttLabelKey
      ? t(sttLabelKey)
      : (state.status?.sttModelLabel ?? sttModelId)
    : null;

  const languageCode = caption?.sourceLanguage ?? "";
  const languageKey = languageLabelKey(languageCode);

  // Item 3 (owner-reported "tốc độ xử lí chậm"): a small, unobtrusive latency
  // readout - instrumentation only, no thresholds/alarms - tucked into the
  // "more options" popover rather than the always-visible surface.
  const timingText = caption
    ? t("caption.timingLabel", {
        capture: formatDurationMs(caption.captureToChunkMs),
        stt: formatDurationMs(caption.sttMs),
        translate: formatDurationMs(caption.translateMs),
      })
    : null;

  // Session controls (pause/resume/stop) only make sense once there is an
  // actual session to control - never while blocked on a start error or an
  // undeclined consent gate.
  const sessionControlsVisible =
    state.startError === null &&
    !(overlay.consentDisclosure && !consentDialogOpen);

  return (
    <div
      className="caption-overlay"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          overlay.dismiss();
        }
      }}
    >
      <OverlayPanel label={t("caption.title")} scrimOpacity={opacity}>
        <header className="caption-overlay-header" data-tauri-drag-region>
          <h1 className="caption-overlay-title" data-tauri-drag-region>
            {t("caption.title")}
          </h1>
          <div className="caption-overlay-badges">
            <Badge label={t("caption.providerBadge")}>
              {providerBadgeText}
            </Badge>
            {sttModelLabel !== null ? (
              <Badge label={t("caption.sttModelBadge")}>{sttModelLabel}</Badge>
            ) : null}
          </div>
          {/*
           * Progressive disclosure (owner complaint: overlays crammed with
           * controls). Only the highest-frequency actions stay always
           * visible - copy translation/pause/stop/transcript in the docked
           * control bar below, plus pin/close here; the keyboard move handle,
           * secondary "copy source", opacity, and the latency readout move
           * behind this ONE overflow affordance - same placement/icon as the
           * region overlay's, so the two overlays read as one product.
           */}
          <Popover
            label={t("caption.moreOptions")}
            icon={<MoreHorizontal size={16} aria-hidden="true" />}
          >
            <div className="ost-popover-row">
              <Tooltip text={t("caption.sourceLabel")}>
                <IconButton
                  label={t("caption.sourceLabel")}
                  onClick={overlay.copySource}
                  disabled={caption === null}
                >
                  <Copy size={16} aria-hidden="true" />
                </IconButton>
              </Tooltip>
              <Tooltip text={t("caption.moveHandle")}>
                <IconButton
                  label={t("caption.moveHandle")}
                  onKeyDown={(e) => {
                    const steps: Record<string, [number, number]> = {
                      ArrowLeft: [-NUDGE_STEP, 0],
                      ArrowRight: [NUDGE_STEP, 0],
                      ArrowUp: [0, -NUDGE_STEP],
                      ArrowDown: [0, NUDGE_STEP],
                    };
                    const step = steps[e.key];
                    if (step) {
                      e.preventDefault();
                      overlay.nudge(step[0], step[1]);
                    }
                  }}
                >
                  <Move size={16} aria-hidden="true" />
                </IconButton>
              </Tooltip>
            </div>
            <Slider
              label={t("caption.opacity")}
              value={opacity}
              min={OPACITY_MIN}
              max={OPACITY_MAX}
              step={OPACITY_STEP}
              onChange={setOpacity}
            />
            {timingText !== null ? (
              <p className="caption-overlay-timing">{timingText}</p>
            ) : null}
          </Popover>
          <Tooltip text={pinned ? t("caption.unpin") : t("caption.pin")}>
            <IconButton
              label={pinned ? t("caption.unpin") : t("caption.pin")}
              pressed={pinned}
              onClick={overlay.togglePin}
            >
              {pinned ? (
                <PinOff size={16} aria-hidden="true" />
              ) : (
                <Pin size={16} aria-hidden="true" />
              )}
            </IconButton>
          </Tooltip>
          <Tooltip text={t("caption.close")}>
            <IconButton label={t("caption.close")} onClick={overlay.close}>
              <X size={16} aria-hidden="true" />
            </IconButton>
          </Tooltip>
        </header>

        {/*
         * The ONE contained scroll region on this surface (owner complaint:
         * long content must scroll, never get squeezed illegible). Header
         * above and controls below are docked (flex-shrink: 0 in CSS) so
         * only this body competes for space - see CaptionOverlayView.css.
         */}
        <div className="caption-overlay-body">
          {state.startError && state.startError.kind === "noProviderKey" ? (
            <div className="caption-overlay-blocked" role="alert">
              <span>{t("caption.noProviderKey")}</span>
              <Button onClick={overlay.openSettings}>
                {t("caption.openSettings")}
              </Button>
            </div>
          ) : null}

          {state.startError &&
          state.startError.kind === "localNotConfigured" ? (
            // Owner-reported bug: an empty/invalid local server URL used to
            // surface only as the generic "could not start" copy below.
            // Distinct, actionable notice instead (human-in-the-loop.md).
            <div className="caption-overlay-blocked" role="alert">
              <span>{t("caption.localNotConfigured")}</span>
              <span className="caption-overlay-hint">
                {t("caption.localNotConfiguredHint")}
              </span>
              <Button onClick={overlay.openSettings}>
                {t("caption.openSettings")}
              </Button>
            </div>
          ) : null}

          {state.startError &&
          state.startError.kind !== "noProviderKey" &&
          state.startError.kind !== "localNotConfigured" ? (
            <div className="caption-overlay-blocked" role="alert">
              <span>{t("caption.startError")}</span>
              <Button onClick={overlay.retry}>{t("caption.retry")}</Button>
            </div>
          ) : null}

          {/* Consent declined: captions stay blocked until the whisper download is
              allowed. Offer a way back to the disclosure (human-in-the-loop.md). */}
          {overlay.consentDisclosure && !consentDialogOpen ? (
            <div className="caption-overlay-blocked" role="alert">
              <span>{t("caption.modelBlocked")}</span>
              <Button onClick={overlay.reopenConsent}>
                {t("consent.reopen")}
              </Button>
            </div>
          ) : null}

          {/* Item 2 (owner complaint: no way to pause/stop): a status line
              distinct from the "waiting" placeholder, visible whenever the
              session itself is not (or no longer) actively running. */}
          {sessionControlsVisible && sessionState === "paused" ? (
            <p className="caption-overlay-status" role="status">
              {t("caption.pausedNotice")}
            </p>
          ) : null}

          {sessionControlsVisible && sessionState === "stopped" ? (
            <p className="caption-overlay-status" role="status">
              {t("caption.stoppedNotice")}
            </p>
          ) : null}

          {caption === null &&
          sessionState === "running" &&
          state.startError === null &&
          !(overlay.consentDisclosure && !consentDialogOpen) ? (
            <p className="caption-overlay-status" role="status">
              {t("caption.waiting")}
            </p>
          ) : null}

          {caption !== null ? (
            <div className="caption-overlay-meta">
              <span className="caption-overlay-language">
                {caption.sourceLanguageAutoDetected
                  ? t("caption.detectedLanguage")
                  : t("caption.pinnedLanguage")}
                {": "}
                <span className="caption-overlay-language-value">
                  {languageKey ? (
                    t(languageKey)
                  ) : (
                    <PlainText text={languageCode} />
                  )}
                </span>
              </span>
              {caption.lowConfidence ? (
                <Badge variant="warning">
                  <AlertTriangle size={12} aria-hidden="true" />
                  {t("caption.lowConfidence")}
                </Badge>
              ) : null}
            </div>
          ) : null}

          {caption !== null ? (
            <section className="caption-overlay-section">
              <span className="caption-overlay-section-label">
                {t("caption.sourceLabel")}
              </span>
              <p className="caption-overlay-text">
                <PlainText text={caption.sourceText} />
              </p>
            </section>
          ) : null}

          {caption !== null ? (
            <section className="caption-overlay-section">
              <span className="caption-overlay-section-label">
                {t("caption.translationLabel")}
              </span>
              <p className="caption-overlay-text caption-overlay-translation">
                <PlainText text={caption.translatedText} />
              </p>
            </section>
          ) : null}

          {state.chunkError ? (
            <p className="caption-overlay-error" role="alert">
              <AlertTriangle size={14} aria-hidden="true" />
              {/* Own localized copy only - the raw diagnostic string is DATA. */}
              {t("caption.error")}
            </p>
          ) : null}
        </div>

        {/*
         * Docked control bar (owner complaint: controls must not eat the
         * panel) - fixed at the bottom, outside the scrolling body above.
         * Copy translation, pause/resume, stop, and the full-transcript
         * trigger are the highest-frequency actions (item 2/3) and stay
         * always visible; everything else lives in the header's "more
         * options" popover.
         */}
        <div className="caption-overlay-controls">
          <Tooltip text={t("caption.copy")}>
            <IconButton
              label={t("caption.copy")}
              onClick={overlay.copyTranslation}
              disabled={caption === null}
            >
              <ClipboardCopy size={16} aria-hidden="true" />
            </IconButton>
          </Tooltip>

          {sessionControlsVisible && sessionState !== "stopped" ? (
            <Tooltip
              text={
                sessionState === "paused"
                  ? t("caption.resume")
                  : t("caption.pause")
              }
            >
              <IconButton
                label={
                  sessionState === "paused"
                    ? t("caption.resume")
                    : t("caption.pause")
                }
                pressed={sessionState === "paused"}
                onClick={
                  sessionState === "paused" ? overlay.resume : overlay.pause
                }
              >
                {sessionState === "paused" ? (
                  <Play size={16} aria-hidden="true" />
                ) : (
                  <Pause size={16} aria-hidden="true" />
                )}
              </IconButton>
            </Tooltip>
          ) : null}

          {sessionControlsVisible && sessionState !== "stopped" ? (
            <Tooltip text={t("caption.stop")}>
              <IconButton label={t("caption.stop")} onClick={overlay.stop}>
                <Square size={16} aria-hidden="true" />
              </IconButton>
            </Tooltip>
          ) : null}

          <Tooltip text={t("caption.viewTranscript")}>
            <IconButton
              label={t("caption.viewTranscript")}
              onClick={() => setTranscriptOpen(true)}
            >
              <List size={16} aria-hidden="true" />
            </IconButton>
          </Tooltip>
        </div>

        <span
          className="caption-overlay-live-region"
          role="status"
          aria-live="polite"
        >
          {copied !== null ? t("caption.copied") : ""}
        </span>
      </OverlayPanel>

      {overlay.consentDisclosure ? (
        <ConsentDialog
          open={consentDialogOpen}
          disclosure={overlay.consentDisclosure}
          onGrant={overlay.grantConsent}
          onDecline={overlay.declineConsent}
          titleKey="consent.whisperTitle"
          introKey="consent.whisperIntro"
        />
      ) : null}

      <CaptionTranscriptDialog
        open={transcriptOpen}
        captions={state.captions}
        onClose={() => setTranscriptOpen(false)}
        onCopyAll={overlay.copyTranscript}
      />
    </div>
  );
}
