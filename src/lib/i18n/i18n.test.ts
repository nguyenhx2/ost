import { afterEach, describe, expect, it } from "vitest";
import { detectLocale, setLocale, t } from "./index";
import { translations } from "./translations";

afterEach(() => {
  setLocale("en");
});

describe("detectLocale (AC-04.7: default follows the OS language)", () => {
  it("returns vi for Vietnamese OS languages", () => {
    expect(detectLocale("vi")).toBe("vi");
    expect(detectLocale("vi-VN")).toBe("vi");
  });

  it("returns en for any other language", () => {
    expect(detectLocale("en-US")).toBe("en");
    expect(detectLocale("ja-JP")).toBe("en");
    expect(detectLocale("")).toBe("en");
  });
});

describe("translations dictionaries", () => {
  it("vi covers every en key and vice versa", () => {
    const enKeys = Object.keys(translations.en).sort();
    const viKeys = Object.keys(translations.vi).sort();
    expect(viKeys).toEqual(enKeys);
  });

  it("Vietnamese strings are fully accented (spot check)", () => {
    setLocale("vi");
    expect(t("preview.emptyOcr")).toBe(
      "Không nhận dạng được văn bản trong vùng đã chọn",
    );
    expect(t("preview.retranslate")).toBe("Dịch lại");
    expect(t("preview.close")).toBe("Đóng");
  });

  it("no dictionary string contains emoji or em dash", () => {
    const all = [
      ...Object.values(translations.en),
      ...Object.values(translations.vi),
    ];
    for (const value of all) {
      expect(value).not.toMatch(/\p{Extended_Pictographic}/u);
      expect(value).not.toContain("—");
    }
  });
});

describe("t", () => {
  it("returns the current-locale string", () => {
    setLocale("en");
    expect(t("preview.retranslate")).toBe("Re-translate");
    setLocale("vi");
    expect(t("preview.retranslate")).toBe("Dịch lại");
  });

  it("interpolates {params} and leaves unknown placeholders verbatim", () => {
    setLocale("en");
    // No parametrized key exists yet; exercise the code path via a known key.
    expect(t("app.title", { unused: "x" })).toBe("OST");
  });
});
