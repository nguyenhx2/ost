import { describe, expect, it } from "vitest";
import { isValidLocalBaseUrl } from "./localProvider";

describe("isValidLocalBaseUrl", () => {
  it("rejects an empty string", () => {
    expect(isValidLocalBaseUrl("")).toBe(false);
    expect(isValidLocalBaseUrl("   ")).toBe(false);
  });

  it("rejects a malformed URL", () => {
    expect(isValidLocalBaseUrl("not a url")).toBe(false);
  });

  it("accepts loopback IPv4 over http", () => {
    expect(isValidLocalBaseUrl("http://127.0.0.1:1234")).toBe(true);
  });

  it("accepts localhost over http", () => {
    expect(isValidLocalBaseUrl("http://localhost:8080")).toBe(true);
  });

  it("accepts loopback IPv6 over http", () => {
    expect(isValidLocalBaseUrl("http://[::1]:1234")).toBe(true);
  });

  it("accepts loopback over https", () => {
    expect(isValidLocalBaseUrl("https://127.0.0.1:1234")).toBe(true);
  });

  it("rejects a non-loopback host even over https", () => {
    expect(isValidLocalBaseUrl("https://example.com")).toBe(false);
    expect(isValidLocalBaseUrl("http://example.com")).toBe(false);
  });

  it("rejects a non-http(s) scheme", () => {
    expect(isValidLocalBaseUrl("ftp://127.0.0.1")).toBe(false);
  });

  it("rejects embedded userinfo even when it looks like loopback", () => {
    expect(isValidLocalBaseUrl("http://localhost:8080@evil.com")).toBe(false);
    expect(isValidLocalBaseUrl("http://127.0.0.1@evil.com")).toBe(false);
  });
});
