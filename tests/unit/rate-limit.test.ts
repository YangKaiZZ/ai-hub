import { describe, expect, it } from "vitest";
import { clientIdentifier } from "@/lib/rate-limit";

function request(headers: Record<string, string>) {
  return new Request("https://aihub.example.com/api/auth/login", { method: "POST", headers });
}

describe("clientIdentifier", () => {
  it("prefers the header Cloudflare controls over the one clients can prepend to", () => {
    const req = request({ "cf-connecting-ip": "203.0.113.7", "x-forwarded-for": "198.51.100.9, 203.0.113.7" });
    expect(clientIdentifier(req)).toBe("203.0.113.7");
  });

  it("falls back to the first forwarded hop when Cloudflare is not in front", () => {
    expect(clientIdentifier(request({ "x-forwarded-for": "198.51.100.9, 10.0.0.1" }))).toBe("198.51.100.9");
  });

  it("falls back to x-real-ip, then to a fixed local bucket", () => {
    expect(clientIdentifier(request({ "x-real-ip": "198.51.100.22" }))).toBe("198.51.100.22");
    expect(clientIdentifier(request({}))).toBe("local");
  });

  it("ignores an empty or whitespace-only forwarded header", () => {
    expect(clientIdentifier(request({ "x-forwarded-for": "  ", "x-real-ip": "198.51.100.5" }))).toBe("198.51.100.5");
  });
});
