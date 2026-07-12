import { useState } from "react";
import {
  AlertTriangle,
  ClipboardCopy,
  Copy,
  Move,
  Pin,
  PinOff,
  X,
} from "lucide-react";
import {
  Badge,
  Button,
  IconButton,
  OverlayPanel,
  PlainText,
  Slider,
  Tooltip,
} from "../components/ui";
import { ConsentDialog } from "../components/ConsentDialog";
import {
  useCaptionOverlay,
  parseCaptionRequest,
} from "../hooks/useCaptionOverlay";
import { t } from "../lib/i18n";
import { languageLabelKey } from "../lib/languages";
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
 * (PlainText - untrusted DATA), the detected/pinned source language, a
 * provider/model badge, and a low-confidence flag. Everything is keyboard
 * operable; Esc dismisses unless pinned. Copy is the ONLY outbound action.
 */
export function CaptionOverlayView() {
  const [request] = useState(() =>
    parseCaptionRequest(
      typeof window !== "undefined" ? window.location.search : "",
    ),
  );
  const overlay = useCaptionOverlay(request);
  const [opacity, setOpacity] = useState(OPACITY_DEFAULT);

  const { state, copied, pinned, consentDialogOpen } = overlay;
  const caption = state.caption;

  const providerBadgeText = caption
    ? `${caption.provider} / ${caption.model}`
    : `${request.provider} / ${request.model}`;

  const languageCode = caption?.sourceLanguage ?? "";
  const languageKey = languageLabelKey(languageCode);

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
          <Badge label={t("caption.providerBadge")}>{providerBadgeText}</Badge>
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

          {caption === null &&
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

        {/* Docked control bar (owner complaint: controls must not eat the
            panel) - fixed at the bottom, outside the scrolling body above. */}
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
          <Tooltip text={t("caption.sourceLabel")}>
            <IconButton
              label={t("caption.sourceLabel")}
              onClick={overlay.copySource}
              disabled={caption === null}
            >
              <Copy size={16} aria-hidden="true" />
            </IconButton>
          </Tooltip>
          <Slider
            label={t("caption.opacity")}
            value={opacity}
            min={OPACITY_MIN}
            max={OPACITY_MAX}
            step={OPACITY_STEP}
            onChange={setOpacity}
          />
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
    </div>
  );
}
