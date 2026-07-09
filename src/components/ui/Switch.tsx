export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Visible text label; also the accessible name. */
  label: string;
  disabled?: boolean;
}

/** Toggle switch primitive (role="switch", keyboard operable). */
export function Switch({ checked, onChange, label, disabled }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
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
