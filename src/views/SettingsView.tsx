import { useState } from "react";
import { ArrowDown, ArrowUp, ShieldCheck, Trash2 } from "lucide-react";
import "./SettingsView.css";
import { Badge, Button, IconButton, Input, Select } from "../components/ui";
import { t } from "../lib/i18n";
import {
  PROVIDER_META,
  PROVIDER_META_LIST,
  type ProviderId,
  type ProviderMeta,
} from "../lib/providers";
import {
  useProviderKeys,
  type KeyActionResult,
} from "../hooks/useProviderKeys";
import { useProviderSelection } from "../hooks/useProviderSelection";
import { resultMessage } from "./settingsMessages";

/** One provider's key entry / validate / remove row (AC-03.1). */
function ProviderKeyRow({
  meta,
  present,
  result,
  model,
  onSave,
  onCheck,
  onRemove,
  onModelChange,
}: {
  meta: ProviderMeta;
  present: boolean;
  result: KeyActionResult;
  model: string;
  onSave: (provider: ProviderId, key: string) => Promise<boolean>;
  onCheck: (provider: ProviderId) => void;
  onRemove: (provider: ProviderId) => void;
  onModelChange: (provider: ProviderId, model: string) => void;
}) {
  const [keyValue, setKeyValue] = useState("");
  const busy = result.type === "busy";
  const message = resultMessage(result);
  const messageId = `key-msg-${meta.id}`;

  const submit = async () => {
    if (keyValue.trim() === "") {
      return;
    }
    const cleared = await onSave(meta.id, keyValue);
    if (cleared) {
      setKeyValue("");
    }
  };

  return (
    <li className="settings-provider">
      <div className="settings-provider-head">
        <span className="settings-provider-name">{meta.displayName}</span>
        <Badge
          variant={present ? "default" : "warning"}
          label={
            present
              ? t("settings.statusConfigured")
              : t("settings.statusNotConfigured")
          }
        >
          {present ? (
            <>
              <ShieldCheck size={12} aria-hidden="true" />
              {t("settings.statusConfigured")}
            </>
          ) : (
            t("settings.statusNotConfigured")
          )}
        </Badge>
      </div>

      <div className="settings-provider-entry">
        <Input
          label={t("settings.keyLabel", { provider: meta.displayName })}
          type="password"
          value={keyValue}
          placeholder={t("settings.keyPlaceholder")}
          onChange={setKeyValue}
          invalid={result.type === "invalid"}
          describedById={message ? messageId : undefined}
          disabled={busy}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              void submit();
            }
          }}
        />
        <div className="settings-provider-actions">
          <Button
            variant="primary"
            onClick={() => void submit()}
            disabled={busy || keyValue.trim() === ""}
          >
            {busy ? t("settings.saving") : t("settings.save")}
          </Button>
          {meta.supportsValidation ? (
            <Button
              onClick={() => onCheck(meta.id)}
              disabled={busy || !present}
            >
              {t("settings.check")}
            </Button>
          ) : null}
          <IconButton
            label={t("settings.remove")}
            onClick={() => onRemove(meta.id)}
            disabled={busy || !present}
          >
            <Trash2 size={16} aria-hidden="true" />
          </IconButton>
        </div>
      </div>

      <div className="settings-provider-model">
        <span className="settings-field-label" id={`model-label-${meta.id}`}>
          {t("settings.model")}
        </span>
        <Select
          label={t("settings.model")}
          value={model}
          options={meta.models.map((m) => ({ value: m.id, label: m.label }))}
          onChange={(value) => onModelChange(meta.id, value)}
        />
      </div>

      {message ? (
        <p
          id={messageId}
          className={`settings-message settings-message--${message.tone}`}
          role="status"
          aria-live="polite"
        >
          {t(message.key)}
        </p>
      ) : null}
    </li>
  );
}

/**
 * Settings surface (SCR-04, FR-03): provider key entry/validation/removal,
 * default provider + per-provider model, and fallback order. Built only from UI
 * primitives + tokens (design-system.md); every string is an i18n key.
 */
export function SettingsView() {
  const keys = useProviderKeys();
  const selection = useProviderSelection();

  const order = selection.settings.fallbackOrder;

  return (
    <main className="settings">
      <h1 className="settings-title">{t("settings.title")}</h1>

      {selection.error ? (
        <p
          className="settings-message settings-message--danger"
          role="alert"
          aria-live="assertive"
        >
          {t("settings.error.persist")}
        </p>
      ) : null}

      <section
        className="settings-section"
        aria-labelledby="settings-providers-heading"
      >
        <h2 id="settings-providers-heading">
          {t("settings.providersHeading")}
        </h2>
        <p className="settings-hint">{t("settings.providersHint")}</p>
        <ul className="settings-provider-list">
          {PROVIDER_META_LIST.map((meta) => (
            <ProviderKeyRow
              key={meta.id}
              meta={meta}
              present={keys.statuses[meta.id]}
              result={keys.results[meta.id]}
              model={selection.settings.models[meta.id]}
              onSave={keys.saveKey}
              onCheck={(id) => void keys.checkKey(id)}
              onRemove={(id) => void keys.removeKey(id)}
              onModelChange={(id, m) => void selection.setProviderModel(id, m)}
            />
          ))}
        </ul>
      </section>

      <section
        className="settings-section"
        aria-labelledby="settings-active-heading"
      >
        <h2 id="settings-active-heading">{t("settings.activeHeading")}</h2>
        <div className="settings-field">
          <span className="settings-field-label" id="default-provider-label">
            {t("settings.defaultProvider")}
          </span>
          <Select
            label={t("settings.defaultProvider")}
            value={selection.settings.defaultProvider}
            options={PROVIDER_META_LIST.map((m) => ({
              value: m.id,
              label: m.displayName,
            }))}
            onChange={(value) =>
              void selection.setDefaultProvider(value as ProviderId)
            }
          />
        </div>
      </section>

      <section
        className="settings-section"
        aria-labelledby="settings-fallback-heading"
      >
        <h2 id="settings-fallback-heading">{t("settings.fallbackHeading")}</h2>
        <p className="settings-hint">{t("settings.fallbackHint")}</p>
        <ol className="settings-fallback-list">
          {order.map((id, index) => (
            <li key={id} className="settings-fallback-item">
              <span className="settings-fallback-rank" aria-hidden="true">
                {index + 1}
              </span>
              <span className="settings-fallback-name">
                {PROVIDER_META[id].displayName}
              </span>
              {keys.statuses[id] ? null : (
                <Badge variant="warning" label={t("settings.fallbackNoKey")}>
                  {t("settings.fallbackNoKey")}
                </Badge>
              )}
              <span className="settings-fallback-controls">
                <IconButton
                  label={t("settings.moveUp")}
                  onClick={() => void selection.moveFallback(index, "up")}
                  disabled={index === 0}
                >
                  <ArrowUp size={16} aria-hidden="true" />
                </IconButton>
                <IconButton
                  label={t("settings.moveDown")}
                  onClick={() => void selection.moveFallback(index, "down")}
                  disabled={index === order.length - 1}
                >
                  <ArrowDown size={16} aria-hidden="true" />
                </IconButton>
              </span>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
