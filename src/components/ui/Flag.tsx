import cn from "../../assets/flags/cn.svg";
import de from "../../assets/flags/de.svg";
import es from "../../assets/flags/es.svg";
import fr from "../../assets/flags/fr.svg";
import gb from "../../assets/flags/gb.svg";
import id from "../../assets/flags/id.svg";
import inFlag from "../../assets/flags/in.svg";
import it from "../../assets/flags/it.svg";
import jp from "../../assets/flags/jp.svg";
import kr from "../../assets/flags/kr.svg";
import pt from "../../assets/flags/pt.svg";
import ru from "../../assets/flags/ru.svg";
import sa from "../../assets/flags/sa.svg";
import th from "../../assets/flags/th.svg";
import vn from "../../assets/flags/vn.svg";

/**
 * Self-hosted SVG flags only (design-system.md flag-SVG exception) - NO emoji
 * flags, NO CDN/external host. Assets copied from the MIT-licensed
 * flag-icons project into src/assets/flags/ (see the README there for
 * provenance). Keyed by ISO 3166-1 alpha-2 country code.
 */
const FLAGS: Record<string, string> = {
  CN: cn,
  DE: de,
  ES: es,
  FR: fr,
  GB: gb,
  ID: id,
  IN: inFlag,
  IT: it,
  JP: jp,
  KR: kr,
  PT: pt,
  RU: ru,
  SA: sa,
  TH: th,
  VN: vn,
};

export interface FlagProps {
  /** ISO 3166-1 alpha-2 country code, e.g. "GB", "JP". Flags represent
   * countries, not languages - callers pick a defensible per-language
   * mapping (src/lib/languages.ts). */
  country: string;
}

/**
 * Secondary, decorative visual next to a language name - never the sole
 * content (design-system.md, frontend.md a11y policy). Always `aria-hidden`:
 * the accessible name for "this option is language X" is carried by the
 * sibling text label, never by the flag alone. Unknown/unmapped codes render
 * nothing rather than a broken image.
 */
export function Flag({ country }: FlagProps) {
  const src = FLAGS[country.toUpperCase()];
  if (!src) {
    return null;
  }
  return (
    <img
      src={src}
      alt=""
      aria-hidden="true"
      className="ost-flag"
      draggable={false}
    />
  );
}
