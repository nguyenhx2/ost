import { describe, expect, it } from "vitest";
import { formatBytes, formatTimestamp } from "./format";

describe("formatBytes", () => {
  it("formats megabyte-scale sizes with one decimal", () => {
    expect(formatBytes(12_300_000)).toBe("11.7 MB");
    expect(formatBytes(7_700_000)).toBe("7.3 MB");
  });

  it("formats kilobyte-scale sizes", () => {
    expect(formatBytes(2048)).toBe("2.0 KB");
  });

  it("formats byte-scale sizes", () => {
    expect(formatBytes(512)).toBe("512 B");
  });

  it("guards non-finite and non-positive inputs", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(-1)).toBe("0 B");
    expect(formatBytes(Number.NaN)).toBe("0 B");
  });
});

describe("formatTimestamp", () => {
  it("formats a valid ISO string in the given locale", () => {
    const out = formatTimestamp("2026-07-10T10:15:00.000Z", "en");
    expect(out).not.toBe("");
    // Locale-dependent exact form varies by platform ICU; assert it is non-empty
    // and does not leak the raw ISO string.
    expect(out).not.toContain("T10:15");
  });

  it("returns an empty string for empty or invalid input", () => {
    expect(formatTimestamp("", "en")).toBe("");
    expect(formatTimestamp("not-a-date", "en")).toBe("");
  });
});
