const { test } = require("node:test");
const assert = require("node:assert/strict");
const { GitHubTaskStore, emptyStore, taskRouter } = require("./task-github-store");
const express = require("express");

function mockStore() {
  let saved = emptyStore();
  let sha = 1;
  let conflict = false;
  let rejectWrites = false;
  const store = new GitHubTaskStore({ repository: "owner/repo", token: "test-only", fetchImpl: async (url, options) => {
    if (options.method !== "PUT") return { ok: true, json: async () => ({ sha: String(sha), encoding: "base64", content: Buffer.from(JSON.stringify(saved)).toString("base64") }) };
    if (rejectWrites) return { ok: false, status: 403 };
    const body = JSON.parse(options.body);
    if (conflict) { conflict = false; saved.creators.push({ id: "other", name: "Concurrent user" }); sha++; return { ok: false, status: 409 }; }
    assert.equal(body.sha, String(sha));
    saved = JSON.parse(Buffer.from(body.content, "base64").toString()); sha++;
    return { ok: true, status: 200 };
  } });
  return { store, saved: () => saved, conflict: () => conflict = true, reject: () => rejectWrites = true };
}

test("conflict retries preserve another user's changes", async () => {
  const mock = mockStore(); mock.conflict();
  await mock.store.update(data => data.vendors.push({ id: "new", name: "New vendor" }));
  assert.equal(mock.saved().creators.some(item => item.id === "other"), true);
  assert.equal(mock.saved().vendors.filter(item => item.id === "new").length, 1);
});
test("failed GitHub writes are not reported as saved", async () => {
  const mock = mockStore(); mock.reject();
  await assert.rejects(mock.store.update(data => data.tasks.push({ id: "unsaved" })), /save failed/);
  assert.equal(mock.saved().tasks.length, 0);
});
test("simultaneous calendar reads share one GitHub request and return isolated data", async () => {
  let reads = 0;
  const data = emptyStore();
  const store = new GitHubTaskStore({ repository: "owner/repo", token: "test-only", fetchImpl: async () => {
    reads++;
    await new Promise(resolve => setTimeout(resolve, 5));
    return { ok: true, json: async () => ({ sha: "1", encoding: "base64", content: Buffer.from(JSON.stringify(data)).toString("base64") }) };
  } });
  const results = await Promise.all([store.read(), store.read(), store.read()]);
  assert.equal(reads, 1);
  results[0].data.tasks.push({ id: "local-change" });
  assert.equal(results[1].data.tasks.length, 0);
  assert.equal((await store.read()).data.tasks.length, 0);
  assert.equal(reads, 1);
});
test("concurrent saves are serialized without losing tasks", async () => {
  const mock = mockStore();
  await Promise.all([1, 2, 3].map(id => mock.store.update(data => data.tasks.push({ id }))));
  assert.equal(mock.saved().tasks.length, 3);
});
test("task lifecycle and vendor names persist through the existing HTTP interface", async t => {
  const mock = mockStore();
  const app = express(); app.use(express.json()); app.use("/api", taskRouter(mock.store));
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const api = async (path, method = "GET", body) => {
    const res = await fetch(base + path, { method, headers: { "Content-Type": "application/json" }, body: body && JSON.stringify(body) });
    return { status: res.status, ...await res.json() };
  };
  const created = await api("/calendar-tasks", "POST", { listingId: "1670", propertyName: "BRK-1670", taskText: "Check AC", assigneeName: "Andre" });
  assert.equal(created.ok, true);
  assert.equal((await api("/calendar-tasks")).tasks.length, 1);
  const id = created.task.id;
  await api(`/calendar-tasks/${id}`, "PATCH", { taskText: "Check AC filter", assigneeName: "Andre" });
  assert.equal(mock.saved().tasks[0].task_text, "Check AC filter");
  await api(`/calendar-tasks/${id}`, "DELETE");
  assert.equal((await api("/calendar-tasks")).tasks.length, 0);
  assert.equal((await api("/calendar-tasks?status=completed")).tasks[0].completed_by_name, "Andre");
  await api(`/calendar-tasks/${id}?hard=true`, "DELETE");
  assert.equal(mock.saved().tasks.length, 0);
  await api("/calendar-task-vendors", "POST", { name: "New vendor" });
  assert.equal((await api("/calendar-task-vendors")).vendors.some(item => item.name === "New vendor"), true);
  assert.equal((await api("/calendar-tasks", "POST", { listingId: "1670" })).status, 400);
  assert.equal((await api("/calendar-tasks", "POST", { listingId: "1670", taskText: "Unsafe attachment", mediaFiles: [{ dataUrl: "data:text/html;base64,YQ==" }] })).status, 400);
});
