import { describe, expect, it } from "vitest";
import { ApiError } from "@/shared/api/httpClient";
import { formatClock, getAuthErrorMessage, getRetryAfterSeconds } from "./errors";

const limited = (details?: Record<string, unknown>) => new ApiError(429, "limite_intentos_excedido", "x", details);

describe("formatClock", () => {
  it("shows minutes and seconds", () => {
    expect(formatClock(272)).toBe("4:32");
    expect(formatClock(60)).toBe("1:00");
    expect(formatClock(9)).toBe("0:09");
  });
});

describe("getRetryAfterSeconds", () => {
  it("reads the wait time from the attempt limit error", () => {
    expect(getRetryAfterSeconds(limited({ retry_after_seconds: 90 }))).toBe(90);
  });

  it("returns null when the server did not send it or the error is another one", () => {
    expect(getRetryAfterSeconds(limited())).toBeNull();
    expect(getRetryAfterSeconds(new ApiError(401, "pin_invalido", "x", { retry_after_seconds: 5 }))).toBeNull();
    expect(getRetryAfterSeconds(new Error("boom"))).toBeNull();
  });
});

describe("getAuthErrorMessage with the attempt limit", () => {
  it("includes the wait time when it is known", () => {
    expect(getAuthErrorMessage(limited({ retry_after_seconds: 272 }))).toContain("4:32");
  });

  it("falls back to the general message when it is not", () => {
    expect(getAuthErrorMessage(limited())).toContain("unos minutos");
  });
});
