import { Button, Dialog, PlainText } from "./ui";
import { t } from "../lib/i18n";
import type { I18nKey } from "../lib/i18n";
import { formatBytes } from "../lib/format";
import type { ConsentDisclosure } from "../lib/ipc";
import "./ConsentDialog.css";

export interface ConsentDialogProps {
  open: boolean;
  disclosure: ConsentDisclosure;
  /** Explicit grant action - the ONLY thing that opens the download gate. */
  onGrant: () => void;
  /** Decline / dismiss - closes without granting (Esc, backdrop, or button). */
  onDecline: () => void;
  /**
   * Title/intro i18n keys, so the same fail-closed disclosure serves both the
   * OCR (default) and the whisper STT model sets (FR-01). The disclosure fields
   * (host/size/files/destination) are always the accurate, per-set values.
   */
  titleKey?: I18nKey;
  introKey?: I18nKey;
}

/**
 * Fail-closed model-download disclosure (security-privacy.md). Names the host
 * (ModelScope / modelscope.cn), lists the artifact sizes and the on-disk
 * destination so the user consents with full knowledge. Every disclosure field
 * is untrusted DATA rendered through PlainText - never markup-interpreted.
 */
export function ConsentDialog({
  open,
  disclosure,
  onGrant,
  onDecline,
  titleKey = "consent.title",
  introKey = "consent.intro",
}: ConsentDialogProps) {
  return (
    <Dialog open={open} label={t(titleKey)} onClose={onDecline}>
      <h2 className="consent-dialog-title">{t(titleKey)}</h2>
      <p className="consent-dialog-intro">{t(introKey)}</p>

      <dl className="consent-dialog-fields">
        <div className="consent-dialog-row">
          <dt>{t("consent.hostLabel")}</dt>
          <dd>
            <PlainText text={disclosure.hostName} />
            {" ("}
            <PlainText text={disclosure.hostDomain} />
            {")"}
          </dd>
        </div>
        <div className="consent-dialog-row">
          <dt>{t("consent.destinationLabel")}</dt>
          <dd>
            <PlainText text={disclosure.destination} />
          </dd>
        </div>
        <div className="consent-dialog-row">
          <dt>{t("consent.totalSizeLabel")}</dt>
          <dd>{`~ ${formatBytes(disclosure.totalApproxSizeBytes)}`}</dd>
        </div>
      </dl>

      <span className="consent-dialog-artifacts-label">
        {t("consent.artifactsLabel")}
      </span>
      <ul className="consent-dialog-artifacts">
        {disclosure.artifacts.map((artifact) => (
          <li key={artifact.filename} className="consent-dialog-artifact">
            <PlainText text={artifact.filename} />
            <span className="consent-dialog-artifact-size">
              {formatBytes(artifact.approxSizeBytes)}
            </span>
          </li>
        ))}
      </ul>

      <div className="consent-dialog-actions">
        <Button onClick={onDecline}>{t("consent.decline")}</Button>
        <Button variant="primary" onClick={onGrant}>
          {t("consent.grant")}
        </Button>
      </div>
    </Dialog>
  );
}
