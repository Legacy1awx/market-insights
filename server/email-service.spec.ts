import { describe, expect, it } from "vitest";
import {
  createEmailToken,
  createUnsubscribeToken,
  createVerificationCode,
  escapeEmailHtml,
  hashEmailSecret,
} from "./email-service";

describe("email security helpers", () => {
  it("creates cryptographically random one-time codes", () => {
    expect(createVerificationCode()).toMatch(/^\d{6}$/);
  });

  it("creates opaque management tokens", () => {
    expect(createEmailToken()).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("hashes secrets deterministically without returning them", () => {
    const first = hashEmailSecret(
      "token",
      "a-secret-at-least-32-characters-long",
    );
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(
      hashEmailSecret("token", "a-secret-at-least-32-characters-long"),
    ).toBe(first);
    expect(first).not.toContain("token");
  });

  it("signs unsubscribe links with a timestamp", () => {
    const [subscriberId, issuedAt, signature] = createUnsubscribeToken(
      "419efb74-f5bd-4a2f-83b8-6819d2f5edcd",
      "a-secret-at-least-32-characters-long",
    ).split(".");
    expect(subscriberId).toBe("419efb74-f5bd-4a2f-83b8-6819d2f5edcd");
    expect(issuedAt).toMatch(/^\d{13}$/);
    expect(signature).toMatch(/^[a-f0-9]{64}$/);
  });

  it("escapes dynamic HTML text", () => {
    expect(escapeEmailHtml(`<script a="b">'&`)).toBe(
      "&lt;script a=&quot;b&quot;&gt;&#39;&amp;",
    );
  });
});
