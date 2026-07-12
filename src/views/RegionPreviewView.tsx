import { useState } from "react";
import {
  AlertTriangle,
  ClipboardCopy,
  Columns2,
  Copy,
  Crop,
  Move,
  Pin,
  PinOff,
  Rows2,
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
  Spinner,
  Textarea,
  Tooltip,
} from "../components/ui";
import { ConsentDialog } from "../components/ConsentDialog";
import { useRegionPreview } from "../hooks/useRegionPreview";
import { t } from "../lib/i18n";
import {
  SOURCE_LANGUAGE_OPTIONS,
  TARGET_LANGUAGE_OPTIONS,
} from "../lib/languages";
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

  const {
    state,
    copied,
    pinned,
    option,
    consentDialogOpen,
    sourceLanguage,
    targetLanguage,
    layout,
    sourceDraft,
  } = preview;

  const providerBadgeText =
    state.provider && state.model
      ? `${state.provider} / ${state.model}`
      : providerOptionLabel(option);

  // The catalog is a static placeholder; the provider the user configured in
  // Settings (e.g. openrouter, or the local OpenAI-compatible server) may not
  // be in it. Always offer the active option so the Select can display it and
  // the user is never silently switched back to a provider they never chose.
  const selectableOptions = PROVIDER_MODEL_OPTIONS.some(
    (o) => o.id === option.id,
  )
    ? PROVIDER_MODEL_OPTIONS
    : [option, ...PROVIDER_MODEL_OPTIONS];

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
          <Tooltip text={t("preview.reselect")}>
            <IconButton
              label={t("preview.reselect")}
              onClick={preview.reselect}
            >
              <Crop size={16} aria-hidden="true" />
            </IconButton>
          </Tooltip>
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

        {/*
         * The ONE contained scroll region on this surface (owner complaint:
         * long content must scroll, never get squeezed illegible). Header
         * above and controls below are fixed/docked (flex-shrink: 0 in CSS)
         * so only this body competes for space - see RegionPreviewView.css.
         */}
        <div className="region-preview-body">
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

          {state.status === "failed" && state.failureReason === "noKey" ? (
            // Distinct, actionable notice - NEVER the generic failure copy
            // (human-in-the-loop.md, provider transparency).
            <div className="region-preview-blocked" role="alert">
              <AlertTriangle size={14} aria-hidden="true" />
              <div className="region-preview-blocked-body">
                <span>{t("preview.noProviderKey")}</span>
                <Button onClick={preview.openSettings}>
                  {t("preview.openSettings")}
                </Button>
              </div>
            </div>
          ) : null}

          {state.status === "failed" &&
          state.failureReason === "localNotConfigured" ? (
            // Owner-reported bug: an empty/invalid local server URL used to
            // fall through to the generic failure copy below. Distinct,
            // actionable notice instead (human-in-the-loop.md).
            <div className="region-preview-blocked" role="alert">
              <AlertTriangle size={14} aria-hidden="true" />
              <div className="region-preview-blocked-body">
                <span>{t("preview.localNotConfigured")}</span>
                <span className="region-preview-hint">
                  {t("preview.localNotConfiguredHint")}
                </span>
                <Button onClick={preview.openSettings}>
                  {t("preview.openSettings")}
                </Button>
              </div>
            </div>
          ) : null}

          {state.status === "failed" &&
          state.failureReason !== "noKey" &&
          state.failureReason !== "localNotConfigured" ? (
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

          {/*
           * Owner item 1: the source and translation as two columns
           * (`layout === "columns"`) or stacked (the original layout). The
           * `@container` query in RegionPreviewView.css degrades a too-narrow
           * window back to stacked regardless of the user's choice, so the
           * columns never get squeezed illegible.
           */}
          <div
            className={
              layout === "columns"
                ? "region-preview-columns region-preview-columns--side-by-side"
                : "region-preview-columns"
            }
          >
            <section className="region-preview-section">
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
              {/*
               * Owner item 2: the source is a PASTE/EDIT target, not just an
               * OCR display - pasting or editing text here translates it
               * through the exact same path as OCR-captured text
               * (useRegionPreview.pasteSourceText/commitSourceEdit). Pasted
               * plain text is untrusted DATA (agent-guardrails.md): the
               * Textarea intercepts the paste event and inserts ONLY the
               * text/plain payload, never richly-formatted clipboard content.
               */}
              <Textarea
                label={t("preview.sourceLabel")}
                value={sourceDraft}
                onChange={preview.setSourceDraft}
                onPasteText={preview.pasteSourceText}
                onBlur={preview.commitSourceEdit}
                placeholder={t("preview.pasteSourceHint")}
                rows={4}
              />
            </section>

            <section className="region-preview-section">
              <span className="region-preview-section-label">
                {t("preview.translationLabel")}
              </span>
              {state.status === "translating" ? (
                // Owner complaint 1a: a visible loading indicator, not just
                // text - "translating" must be obvious while a (possibly
                // slow) streaming response is still in flight. `Spinner`
                // carries the one role="status" announcement; the label text
                // beside it is purely visual (not itself an aria-live
                // duplicate).
                <p className="region-preview-status region-preview-status--loading">
                  <Spinner label={t("preview.translating")} />
                  <span aria-hidden="true">{t("preview.translating")}</span>
                </p>
              ) : null}
              {state.translation !== null ? (
                <p className="region-preview-text">
                  <PlainText text={state.translation} />
                </p>
              ) : null}
            </section>
          </div>
        </div>

        {/* Docked control bar (owner complaint: controls must not eat the
            panel) - fixed at the bottom, outside the scrolling body above. */}
        <div className="region-preview-controls">
          {/* Owner item 1: layout toggle (stacked vs side-by-side), persisted
              via useRegionPreview/regionLayoutSettings. */}
          <Tooltip text={t("preview.layoutStacked")}>
            <IconButton
              label={t("preview.layoutStacked")}
              pressed={layout === "stacked"}
              onClick={() => preview.setLayout("stacked")}
            >
              <Rows2 size={16} aria-hidden="true" />
            </IconButton>
          </Tooltip>
          <Tooltip text={t("preview.layoutColumns")}>
            <IconButton
              label={t("preview.layoutColumns")}
              pressed={layout === "columns"}
              onClick={() => preview.setLayout("columns")}
            >
              <Columns2 size={16} aria-hidden="true" />
            </IconButton>
          </Tooltip>
          <Select
            label={t("preview.sourceLanguage")}
            options={SOURCE_LANGUAGE_OPTIONS.map((o) => ({
              value: o.value,
              label: t(o.labelKey),
            }))}
            value={sourceLanguage}
            onChange={preview.setSourceLanguage}
          />
          <Select
            label={t("preview.targetLanguage")}
            options={TARGET_LANGUAGE_OPTIONS.map((o) => ({
              value: o.value,
              label: t(o.labelKey),
            }))}
            value={targetLanguage}
            onChange={preview.setTargetLanguage}
          />
          <Select
            label={t("preview.providerModel")}
            options={selectableOptions.map((o) => ({
              value: o.id,
              label: providerOptionLabel(o),
            }))}
            value={option.id}
            onChange={(id) => {
              const next = selectableOptions.find((o) => o.id === id);
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
