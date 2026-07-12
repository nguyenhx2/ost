import { useState } from "react";
import { Copy, Trash2 } from "lucide-react";
import { Badge, Button, Dialog, IconButton, PlainText } from "../components/ui";
import { useHistory } from "../hooks/useHistory";
import { getLocale, t } from "../lib/i18n";
import { formatTimestamp } from "../lib/format";
import type { HistoryEntry } from "../lib/history";
import "./HistoryView.css";

/** One saved translation row: source + translation (PlainText) + copy (AC-04.3). */
function HistoryRow({
  entry,
  copied,
  onCopy,
}: {
  entry: HistoryEntry;
  copied: boolean;
  onCopy: (entry: HistoryEntry) => void;
}) {
  const sessionLabel =
    entry.sessionType === "audio"
      ? t("history.sessionAudio")
      : t("history.sessionRegion");
  const langs =
    entry.sourceLanguage !== "" || entry.targetLanguage !== ""
      ? `${entry.sourceLanguage || "?"} ${t("history.langArrow")} ${
          entry.targetLanguage || "?"
        }`
      : "";
  const timestamp = formatTimestamp(entry.createdAt, getLocale());

  return (
    <li className="history-entry">
      <div className="history-entry-head">
        <Badge label={sessionLabel}>{sessionLabel}</Badge>
        {/* provider/model are opaque ids, not untrusted prose; still no markup. */}
        <span className="history-entry-provider">
          <PlainText text={`${entry.providerId} / ${entry.modelId}`} />
        </span>
        {langs !== "" ? (
          <span className="history-entry-langs">{langs}</span>
        ) : null}
        {timestamp !== "" ? (
          <span className="history-entry-time">{timestamp}</span>
        ) : null}
        <IconButton
          label={t("history.copyTranslation")}
          onClick={() => onCopy(entry)}
          disabled={entry.translatedText === ""}
        >
          <Copy size={16} aria-hidden="true" />
        </IconButton>
      </div>

      <div className="history-entry-body">
        <span className="history-entry-field-label">
          {t("history.sourceLabel")}
        </span>
        <p className="history-entry-text">
          <PlainText text={entry.sourceText} />
        </p>
        <span className="history-entry-field-label">
          {t("history.translationLabel")}
        </span>
        <p className="history-entry-text">
          <PlainText text={entry.translatedText} />
        </p>
      </div>

      <span className="history-entry-live" role="status" aria-live="polite">
        {copied ? t("history.copied") : ""}
      </span>
    </li>
  );
}

/**
 * Translation-history surface (FR-04, BR-06). Lists locally saved entries with a
 * per-entry copy control (AC-04.3, copy-only per AC-04.8) and an ALWAYS-visible
 * clear-all that wipes the store after an explicit confirm (AC-04.5). Built only
 * from UI primitives + tokens; every string is an i18n key; source/translation
 * render through PlainText (untrusted OCR/STT/provider text).
 */
export function HistoryView() {
  const history = useHistory();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const confirmClear = async () => {
    await history.clearAll();
    setConfirmOpen(false);
  };

  return (
    <main className="history">
      <header className="history-header">
        <div className="history-heading">
          <h1 className="history-title">{t("history.title")}</h1>
          <p className="history-subtitle">{t("history.subtitle")}</p>
        </div>
        {/* Clear-all is ALWAYS visible (AC-04.5), disabled only when empty. */}
        <Button
          variant="primary"
          onClick={() => setConfirmOpen(true)}
          disabled={history.entries.length === 0}
        >
          <Trash2 size={16} aria-hidden="true" />
          {t("history.clearAll")}
        </Button>
      </header>

      {history.entries.length === 0 ? (
        <p className="history-empty" role="status">
          {t("history.empty")}
        </p>
      ) : (
        <>
          <p className="history-count" aria-live="polite">
            {t("history.count", { count: history.entries.length })}
          </p>
          <ul className="history-list">
            {history.entries.map((entry) => (
              <HistoryRow
                key={entry.id}
                entry={entry}
                copied={history.copiedId === entry.id}
                onCopy={history.copyEntry}
              />
            ))}
          </ul>
        </>
      )}

      <Dialog
        open={confirmOpen}
        label={t("history.clearAllTitle")}
        onClose={() => setConfirmOpen(false)}
        closeLabel={t("history.close")}
      >
        <h2 className="history-confirm-title">{t("history.clearAllTitle")}</h2>
        <p className="history-confirm-body">{t("history.clearAllBody")}</p>
        <div className="history-confirm-actions">
          <Button onClick={() => setConfirmOpen(false)}>
            {t("history.cancel")}
          </Button>
          <Button variant="primary" onClick={() => void confirmClear()}>
            {t("history.clearAllConfirm")}
          </Button>
        </div>
      </Dialog>
    </main>
  );
}
