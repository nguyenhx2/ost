export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Visible text label; also the accessible name. */
  label: string;
  disabled?: boolean;
  /**
   * Links an explanatory `Tooltip` (design-system.md: no raw `title=`) - the
   * `Tooltip` primitive clones its child with this prop, so the switch must
   * forward it to the underlying button.
   */
  "aria-describedby"?: string;
}

/** Toggle switch primitive (role="switch", keyboard operable). */
export function Switch({
  checked,
  onChange,
  label,
  disabled,
  "aria-describedby": describedBy,
}: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-describedby={describedBy}
      className="ost-switch"
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span>{label}</span>
      <span className="ost-switch-track" aria-hidden="true">
        <span className="ost-switch-thumb" />
      </span>
    </button>
  );
}
