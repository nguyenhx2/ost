import { AlertTriangle, ClipboardCopy } from "lucide-react";
import { Badge, Button, Dialog, PlainText } from "./ui";
import { t } from "../lib/i18n";
import { languageLabelKey } from "../lib/languages";
import type { AudioCaptionPayload } from "../lib/ipc";
import "./CaptionTranscriptDialog.css";

export interface CaptionTranscriptDialogProps {
  open: boolean;
  /** Accumulated captions, already ordered by `sequence` (ascending). */
  captions: AudioCaptionPayload[];
  onClose: () => void;
  /** Copy every entry (source + translated text) to the clipboard. */
  onCopyAll: () => void;
}

/**
 * Full-transcript expanded view (item 3, the owner's biggest complaint: the
 * compact overlay only ever showed the LATEST caption, with no way to see the
 * accumulated conversation). Secondary to the default compact view - the
 * overlay window stays small; this is an on-demand Dialog, not a replacement.
 * Source/translated text is untrusted DATA (PlainText only, never markup).
 * The list uses `aria-live="polite"` so new entries are announced without
 * interrupting whatever the screen reader is doing (never `assertive`).
 */
export function CaptionTranscriptDialog({
  open,
  captions,
  onClose,
  onCopyAll,
}: CaptionTranscriptDialogProps) {
  return (
    <Dialog
      open={open}
      label={t("caption.transcriptTitle")}
      onClose={onClose}
      closeLabel={t("caption.close")}
    >
      <div className="caption-transcript-header">
        <h2 className="caption-transcript-title">
          {t("caption.transcriptTitle")}
        </h2>
        <Button onClick={onCopyAll} disabled={captions.length === 0}>
          <ClipboardCopy size={16} aria-hidden="true" />
          {t("caption.copyAll")}
        </Button>
      </div>

      {captions.length === 0 ? (
        <p className="caption-transcript-empty">
          {t("caption.transcriptEmpty")}
        </p>
      ) : (
        <ol
          className="caption-transcript-list"
          aria-live="polite"
          aria-atomic="false"
        >
          {captions.map((caption) => {
            const languageKey = languageLabelKey(caption.sourceLanguage);
            return (
              <li key={caption.sequence} className="caption-transcript-entry">
                <div className="caption-transcript-entry-meta">
                  <span className="caption-transcript-entry-language">
                    {languageKey ? (
                      t(languageKey)
                    ) : (
                      <PlainText text={caption.sourceLanguage} />
                    )}
                  </span>
                  {caption.lowConfidence ? (
                    <Badge variant="warning">
                      <AlertTriangle size={12} aria-hidden="true" />
                      {t("caption.lowConfidence")}
                    </Badge>
                  ) : null}
                </div>
                <p className="caption-transcript-source">
                  <PlainText text={caption.sourceText} />
                </p>
                <p className="caption-transcript-translation">
                  <PlainText text={caption.translatedText} />
                </p>
              </li>
            );
          })}
        </ol>
      )}
    </Dialog>
  );
}
