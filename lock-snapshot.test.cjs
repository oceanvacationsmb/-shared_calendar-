const { once } = require("node:events");
const { test } = require("node:test");
const assert = require("node:assert/strict");

test("lock snapshot imports require staff authorization and preserve newer readings", async t => {
  const env = {
    SUPABASE_URL: "https://snapshot-test.invalid",
    SUPABASE_SERVICE_ROLE_KEY: "test-storage-key",
    LOCK_SNAPSHOT_STAFF_KEY: "test-staff-key",
    TASK_STORAGE: ""
  };
  const originalEnv = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]]));
  Object.assign(process.env, env);
  t.after(() => {
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  const realFetch = globalThis.fetch;
  let record = { captured_at: null, locks: [] };
  let writes = 0;

  t.mock.method(globalThis, "fetch", async (resource, options) => {
    const url = new URL(resource);
    assert.equal(url.origin, env.SUPABASE_URL);
    assert.equal(url.pathname, "/rest/v1/calendar_lock_snapshot");
    assert.equal(url.searchParams.get("id"), "eq.1");
    assert.equal(options.headers.authorization, "Bearer test-storage-key");

    if (options.method !== "PATCH") return Response.json([record]);

    writes++;
    const incoming = JSON.parse(options.body);
    assert.equal(options.headers.prefer, "return=representation");
    assert.equal(url.searchParams.get("or"), `(captured_at.is.null,captured_at.lt.${incoming.captured_at})`);
    if (record.captured_at && record.captured_at >= incoming.captured_at) return Response.json([]);
    record = incoming;
    return Response.json([{ captured_at: record.captured_at }]);
  });

  const app = require("./server");
  const server = app.listen(0, "127.0.0.1");
  t.after(() => server.close());
  await once(server, "listening");
  const endpoint = `http://127.0.0.1:${server.address().port}/api/locks-status`;
  const post = (body, staffKey) => realFetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(staffKey === undefined ? {} : { "x-lock-snapshot-key": staffKey })
    },
    body: typeof body === "string" ? body : JSON.stringify(body)
  });

  const initial = await realFetch(endpoint);
  assert.equal(initial.headers.get("cache-control"), "no-store");
  assert.deepEqual(await initial.json(), { ok: true, capturedAt: null, locks: [] });

  const locks = [
    { listingId: "property-1", batteryPercent: 0, online: false },
    { listingId: "property-10", batteryPercent: 1, online: null },
    { listingId: "property-2", batteryPercent: null, online: true, batteryStatus: "low" },
    { listingId: "property-3", batteryPercent: null, online: false, batteryStatus: "unknown" }
  ];
  const snapshot = { capturedAt: "2020-06-01T12:00:00-04:00", locks };
  assert.equal((await post(snapshot)).status, 401);
  assert.equal((await post(snapshot, "different-key")).status, 401);

  const key = env.LOCK_SNAPSHOT_STAFF_KEY;
  assert.equal((await post("{ broken", key)).status, 400);
  assert.equal((await post(" ".repeat(129 * 1024), key)).status, 413);
  for (const invalid of [
    { ...snapshot, capturedAt: "2020-02-30T12:00:00Z" },
    { ...snapshot, capturedAt: "2020-06-01T12:00:00" },
    { ...snapshot, capturedAt: "9999-01-01T00:00:00Z" },
    { ...snapshot, locks: [locks[0], locks[0]] },
    { ...snapshot, locks: [{ ...locks[0], batteryPercent: 101 }] },
    { ...snapshot, locks: [{ ...locks[0], online: "false" }] },
    { ...snapshot, locks: [{ ...locks[0], batteryStatus: "unverified" }] },
    { ...snapshot, locks: [{ ...locks[0], code: "test" }] }
  ]) {
    assert.equal((await post(invalid, key)).status, 400);
  }
  assert.equal(writes, 0);

  const capturedAt = "2020-06-01T16:00:00.000Z";
  const saved = await post(snapshot, key);
  assert.equal(saved.status, 200);
  assert.deepEqual(await saved.json(), { ok: true, capturedAt, count: 4 });
  assert.equal((await post(snapshot, key)).status, 409);
  assert.equal((await post({ ...snapshot, capturedAt: "2020-05-30T12:00:00Z" }, key)).status, 409);
  assert.deepEqual(await (await realFetch(endpoint)).json(), { ok: true, capturedAt, locks });
});
