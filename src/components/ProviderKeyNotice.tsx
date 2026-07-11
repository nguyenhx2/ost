import { AlertTriangle } from "lucide-react";
import { Button } from "./ui";
import { settingsIpc } from "../lib/ipc";
import { t, type I18nKey } from "../lib/i18n";
import "./ProviderKeyNotice.css";

export interface ProviderKeyNoticeProps {
  /** i18n key for the actionable message (never a raw string). */
  messageKey: I18nKey;
  /** i18n key for the "open Settings" button label. */
  ctaKey: I18nKey;
}

/**
 * Shared "no provider key configured" notice (TASK-025 established this
 * pattern on region preview / caption overlay: a distinct, actionable message
 * with a one-click Open Settings affordance, never the generic failure
 * copy - human-in-the-loop.md provider transparency). Factored out here so the
 * home screen (TASK-028) reuses the SAME affordance instead of inventing a
 * second one. Opens Settings through the typed IPC wrapper only.
 */
export function ProviderKeyNotice({
  messageKey,
  ctaKey,
}: ProviderKeyNoticeProps) {
  return (
    <div className="ost-key-notice" role="alert">
      <AlertTriangle size={14} aria-hidden="true" />
      <div className="ost-key-notice-body">
        <span>{t(messageKey)}</span>
        <Button onClick={() => void settingsIpc.open()}>{t(ctaKey)}</Button>
      </div>
    </div>
  );
}
