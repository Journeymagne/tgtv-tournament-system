import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  api,
  API_ORIGIN,
  ApiError,
  assetUrl,
  request,
} from "../src/api/client";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("login uses the selected origin and native credential store without manual token headers", async () => {
  let call: { input: string; options: RequestInit } | undefined;
  globalThis.fetch = async (input, options = {}) => {
    call = { input: String(input), options };
    return Response.json({ user: { id: 7, name: "LocalPreviewAdmin" } });
  };
  const session = await api.login("LocalPreviewAdmin", "synthetic-test-only");
  assert.equal(session.user?.id, 7);
  assert.equal(call?.input, `${API_ORIGIN}/api/login`);
  assert.equal(call?.options.credentials, "include");
  assert.equal(call?.options.method, "POST");
  assert.deepEqual(JSON.parse(String(call?.options.body)), {
    name: "LocalPreviewAdmin",
    password: "synthetic-test-only",
  });
  assert.equal(new Headers(call?.options.headers).get("authorization"), null);
  assert.equal(new Headers(call?.options.headers).get("cookie"), null);
});

test("absolute destinations, network-path references, and path escape never reach fetch", async () => {
  let count = 0;
  globalThis.fetch = async () => {
    count++;
    return Response.json({});
  };
  for (const path of [
    "https://untrusted.invalid/api/login",
    "//untrusted.invalid/api/login",
    "/api/../login",
    "/api/%2e%2e/login",
    "/api/\\untrusted.invalid",
    "/api/me#fragment",
  ]) {
    await assert.rejects(
      request(path),
      (error: unknown) =>
        error instanceof ApiError && error.code === "configuration",
    );
  }
  assert.equal(count, 0);
  assert.throws(() => api.game("../users"), ApiError);
  assert.throws(() => api.game(0), ApiError);
});

test("503 result response marks unknown write outcome and sends exactly once", async () => {
  let count = 0;
  globalThis.fetch = async () => {
    count++;
    return Response.json({ error: "Unavailable" }, { status: 503 });
  };
  await assert.rejects(
    api.submitResult(7, {
      scores: { "4": { crit: 4, kill: 2, tac: 3, primary: "crit" } },
    }),
    (error: unknown) =>
      error instanceof ApiError &&
      error.status === 503 &&
      error.writeOutcomeUnknown,
  );
  assert.equal(count, 1);
});

test("network failure during mutation is ambiguous and never automatically retried", async () => {
  let count = 0;
  globalThis.fetch = async () => {
    count++;
    throw new TypeError("Network unavailable");
  };
  await assert.rejects(
    api.confirmResult(7),
    (error: unknown) =>
      error instanceof ApiError &&
      error.code === "network" &&
      error.writeOutcomeUnknown,
  );
  assert.equal(count, 1);
});

test("read timeout aborts transport and does not pretend a write occurred", async () => {
  let count = 0;
  globalThis.fetch = async (_input, options = {}) => {
    count++;
    return new Promise<Response>((_resolve, reject) =>
      options.signal?.addEventListener(
        "abort",
        () => reject(new Error("Abort")),
        { once: true },
      ),
    );
  };
  await assert.rejects(
    request("/api/me", { timeoutMs: 5 }),
    (error: unknown) =>
      error instanceof ApiError &&
      error.code === "timeout" &&
      !error.writeOutcomeUnknown,
  );
  assert.equal(count, 1);
});

test("409 preserves conflict status without advertising mutation success", async () => {
  const pairingWarningReview = {
    warningKey: "round-warning-key",
    warnings: [{ kind: "rematch" }],
  };
  globalThis.fetch = async () =>
    Response.json(
      { error: "Round changed", pairingWarningReview },
      { status: 409 },
    );
  await assert.rejects(
    api.pairingAction(5, 9, "shield", { memberId: 13, revision: 2 }),
    (error: unknown) =>
      error instanceof ApiError &&
      error.code === "conflict" &&
      error.message === "Round changed" &&
      !error.writeOutcomeUnknown &&
      JSON.stringify(error.details.pairingWarningReview) ===
        JSON.stringify(pairingWarningReview),
  );
});

test("rate limit exposes Retry-After to UI without repeated authentication attempts", async () => {
  globalThis.fetch = async () =>
    Response.json(
      { error: "Try later" },
      { status: 429, headers: { "Retry-After": "900" } },
    );
  await assert.rejects(
    api.login("synthetic", "synthetic"),
    (error: unknown) =>
      error instanceof ApiError &&
      error.retryAfter === 900 &&
      error.code === "rate_limit",
  );
});

test("invalid JSON after mutation remains an unknown outcome", async () => {
  globalThis.fetch = async () =>
    new Response("<html>gateway</html>", { status: 200 });
  await assert.rejects(
    api.rejectResult(7),
    (error: unknown) =>
      error instanceof ApiError &&
      error.code === "invalid_response" &&
      error.writeOutcomeUnknown,
  );
});

test("proxy result keys and notification server timestamps are forwarded unchanged", async () => {
  const bodies: unknown[] = [];
  globalThis.fetch = async (_input, options = {}) => {
    bodies.push(JSON.parse(String(options.body)));
    return Response.json({});
  };
  const scores = {
    "-15": { crit: 3, kill: 4, tac: 2, primary: "kill" as const },
    "8": { crit: 2, kill: 4, tac: 2, primary: "crit" as const },
  };
  await api.submitResult(77, { scores });
  await api.setNotificationRead({ through: "2026-11-11T12:13:14.000Z" });
  await api.confirmResult(77, "a".repeat(64));
  assert.deepEqual(bodies, [
    { scores },
    { through: "2026-11-11T12:13:14.000Z" },
    { expectedResultRevision: "a".repeat(64) },
  ]);
});

test("asset helper never authorizes arbitrary remote image hosts", () => {
  assert.equal(
    assetUrl("/api/users/7/avatar"),
    `${API_ORIGIN}/api/users/7/avatar`,
  );
  for (const path of [
    "https://untrusted.invalid/avatar",
    "//untrusted.invalid/avatar",
    "data:image/png;base64,xyz",
    "javascript:alert(1)",
  ])
    assert.equal(assetUrl(path), undefined);
});

test("XLSX export preserves binary data and requires the authenticated export route", async () => {
  let count = 0;
  globalThis.fetch = async (_input, options = {}) => {
    count++;
    assert.equal(options.credentials, "include");
    return new Response(new Uint8Array([80, 75, 3, 4]), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      },
    });
  };
  const result = await api.download("/api/admin/tournaments/7/export.xlsx");
  assert.deepEqual([...result.bytes], [80, 75, 3, 4]);
  await assert.rejects(api.download("/api/users/7/avatar"), ApiError);
  assert.equal(count, 1);
});
