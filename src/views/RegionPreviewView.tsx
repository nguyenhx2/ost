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
  Select,
  Slider,
  Switch,
  Tooltip,
} from "../components/ui";
import { ConsentDialog } from "../components/ConsentDialog";
import { useRegionPreview } from "../hooks/useRegionPreview";
import { t } from "../lib/i18n";
import { PROVIDER_MODEL_OPTIONS, providerOptionLabel } from "../lib/providers";
import "./RegionPreviewView.css";

const OPACITY_MIN = 0.3;
const OPACITY_MAX = 1;
const OPACITY_STEP = 0.05;
const OPACITY_DEFAULT = 0.85;
/** CSS px per arrow-key press on the move handle (AC-04.3 keyboard path). */
const NUDGE_STEP = 16;

/**
 * SCR-03: translation preview overlay (AC-02.3/6/7/8/9, AC-04.3).
 * Two-phase rendering: source text as soon as OCR arrives, translation on its
 * own event. Everything is keyboard operable; Esc dismisses unless pinned.
 */
export function RegionPreviewView() {
  const preview = useRegionPreview();
  const [opacity, setOpacity] = useState(OPACITY_DEFAULT);

  const { state, copied, pinned, liveUpdate, option, consentDialogOpen } =
    preview;

  const providerBadgeText =
    state.provider && state.model
      ? `${state.provider} / ${state.model}`
      : providerOptionLabel(option);

  return (
    <div
      className="region-preview"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          preview.dismiss();
        }
      }}
    >
      <OverlayPanel label={t("preview.title")} scrimOpacity={opacity}>
        <header className="region-preview-header" data-tauri-drag-region>
          {/* data-tauri-drag-region: pointer drag-to-reposition (AC-04.3). */}
          <h1 className="region-preview-title" data-tauri-drag-region>
            {t("preview.title")}
          </h1>
          <Badge label={t("preview.providerBadge")}>{providerBadgeText}</Badge>
          <Tooltip text={t("preview.moveHandle")}>
            <IconButton
              label={t("preview.moveHandle")}
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
                  preview.nudge(step[0], step[1]);
                }
              }}
            >
              <Move size={16} aria-hidden="true" />
            </IconButton>
          </Tooltip>
          <Tooltip text={pinned ? t("preview.unpin") : t("preview.pin")}>
            <IconButton
              label={pinned ? t("preview.unpin") : t("preview.pin")}
              pressed={pinned}
              onClick={preview.togglePin}
            >
              {pinned ? (
                <PinOff size={16} aria-hidden="true" />
              ) : (
                <Pin size={16} aria-hidden="true" />
              )}
            </IconButton>
          </Tooltip>
          <Tooltip text={t("preview.close")}>
            <IconButton label={t("preview.close")} onClick={preview.close}>
              <X size={16} aria-hidden="true" />
            </IconButton>
          </Tooltip>
        </header>

        {state.status === "waitingOcr" ? (
          <p className="region-preview-status" role="status">
            {t("preview.waitingOcr")}
          </p>
        ) : null}

        {state.status === "empty" ? (
          <p className="region-preview-status" role="status">
            {t("preview.emptyOcr")}
          </p>
        ) : null}

        {state.sourceText !== "" ? (
          <section className="region-preview-section">
            <span className="region-preview-section-label">
              {t("preview.sourceLabel")}
            </span>
            {state.lowConfidence ? (
              <Badge variant="warning">
                <AlertTriangle size={12} aria-hidden="true" />
                {t("preview.lowConfidence")}
              </Badge>
            ) : null}
            {state.fidelity.kind === "degraded" ? (
              // AC-02.6: STANDING degraded-fidelity notice. Renders whenever
              // fidelity is degraded, INDEPENDENT of lowConfidence, because the
              // dropped diacritics are not caught by the confidence flag
              // (human-in-the-loop.md). The reason is untrusted DATA (PlainText).
              <div className="region-preview-degraded" role="status">
                <AlertTriangle size={14} aria-hidden="true" />
                <div className="region-preview-degraded-body">
                  <span>{t("preview.degradedNotice")}</span>
                  <span className="region-preview-degraded-reason">
                    {t("preview.degradedReasonLabel")}
                    {": "}
                    <PlainText text={state.fidelity.reason} />
                  </span>
                </div>
              </div>
            ) : null}
            <p className="region-preview-text">
              <PlainText text={state.sourceText} />
            </p>
          </section>
        ) : null}

        {state.status === "translating" ? (
          <p className="region-preview-status" role="status">
            {t("preview.translating")}
          </p>
        ) : null}

        {state.status === "failed" ? (
          <p className="region-preview-error" role="alert">
            <AlertTriangle size={14} aria-hidden="true" />
            {/* Own localized copy only - the raw diagnostic string is DATA. */}
            {state.failureReason === "ocr"
              ? t("preview.ocrError")
              : state.failureReason === "timeout"
                ? t("preview.translationTimeout")
                : t("preview.translationError")}
          </p>
        ) : null}

        {state.status === "consentRequired" && !consentDialogOpen ? (
          <div className="region-preview-blocked" role="status">
            <AlertTriangle size={14} aria-hidden="true" />
            <div className="region-preview-blocked-body">
              <span>{t("consent.blocked")}</span>
              <Button onClick={preview.reopenConsent}>
                {t("consent.reopen")}
              </Button>
            </div>
          </div>
        ) : null}

        {state.translation !== null ? (
          <section className="region-preview-section">
            <span className="region-preview-section-label">
              {t("preview.translationLabel")}
            </span>
            <p className="region-preview-text">
              <PlainText text={state.translation} />
            </p>
          </section>
        ) : null}

        <div className="region-preview-controls">
          <Select
            label={t("preview.providerModel")}
            options={PROVIDER_MODEL_OPTIONS.map((o) => ({
              value: o.id,
              label: providerOptionLabel(o),
            }))}
            value={option.id}
            onChange={(id) => {
              const next = PROVIDER_MODEL_OPTIONS.find((o) => o.id === id);
              if (next) {
                preview.setOption(next);
              }
            }}
          />
          <Button
            variant="primary"
            onClick={preview.retranslate}
            disabled={state.sourceText === ""}
          >
            {t("preview.retranslate")}
          </Button>
          <Tooltip text={t("preview.copySource")}>
            <IconButton
              label={t("preview.copySource")}
              onClick={preview.copySource}
              disabled={state.sourceText === ""}
            >
              <Copy size={16} aria-hidden="true" />
            </IconButton>
          </Tooltip>
          <Tooltip text={t("preview.copyTranslation")}>
            <IconButton
              label={t("preview.copyTranslation")}
              onClick={preview.copyTranslation}
              disabled={state.translation === null}
            >
              <ClipboardCopy size={16} aria-hidden="true" />
            </IconButton>
          </Tooltip>
          <Switch
            checked={liveUpdate}
            onChange={preview.setLiveUpdate}
            label={t("preview.liveUpdate")}
          />
          <Slider
            label={t("preview.opacity")}
            value={opacity}
            min={OPACITY_MIN}
            max={OPACITY_MAX}
            step={OPACITY_STEP}
            onChange={setOpacity}
          />
        </div>

        <span
          className="region-preview-live-region"
          role="status"
          aria-live="polite"
        >
          {copied !== null ? t("preview.copied") : ""}
        </span>
      </OverlayPanel>

      {preview.consentDisclosure ? (
        <ConsentDialog
          open={consentDialogOpen}
          disclosure={preview.consentDisclosure}
          onGrant={preview.grantConsent}
          onDecline={preview.declineConsent}
        />
      ) : null}
    </div>
  );
}
