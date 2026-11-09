const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { GuideStore, guideRouter } = require('./guide-github-store');
const property = { slug: '1670', propertyName: '1670', sections: [{ title: 'Parking', details: '3 spaces' }] };
test('commits one property and preserves other property changes', async () => {
  const data = { '1670': property, '7500': { sections: ['another editors changes'] } };
  let write;
  const store = new GuideStore({ token: 'test', request: async (url, options) => {
    if (options.method === 'GET') return { ok: true, json: async () => ({ sha: 'latest', content: Buffer.from('const PROPERTY_GUIDES = ' + JSON.stringify(data) + ';').toString('base64') }) };
    write = JSON.parse(options.body); return { ok: true, json: async () => ({ commit: { sha: 'saved', html_url: 'commit' } }) };
  } });
  const changed = { ...property, propertyName: 'Updated' };
  const result = await store.save('1670', changed, property);
  assert.equal(result.commit, 'saved'); assert.equal(write.sha, 'latest');
  const text = Buffer.from(write.content, 'base64').toString();
  const saved = JSON.parse(text.replace(/^const PROPERTY_GUIDES = /, '').replace(/;\n$/, ''));
  assert.deepEqual(saved['7500'], data['7500']); assert.deepEqual(saved['1670'], changed);
});
test('rejects stale edits to the same property without writing', async () => {
  const store = new GuideStore({ token: 'test' });
  store.read = async () => ({ data: { '1670': { ...property, propertyName: 'Other editor' } } });
  await assert.rejects(store.save('1670', { ...property, propertyName: 'My edit' }, property), { status: 409 });
});
test('authentication rejects browser-only unlock and accepts server login', async t => {
  const app = express();
  app.use('/guides', guideRouter({ token: 'test-token', password: 'private-test-password', store: { read: async () => ({ data: { '1670': property } }) } }));
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  t.after(() => server.close()); const url = `http://127.0.0.1:${server.address().port}/guides`;
  assert.equal((await fetch(url + '/data')).status, 401);
  assert.equal((await fetch(url + '/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'wrong' }) })).status, 401);
  const login = await fetch(url + '/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'private-test-password' }) });
  assert.equal(login.status, 200); const { session } = await login.json();
  const read = await fetch(url + '/data', { headers: { Authorization: 'Bearer ' + session } });
  assert.equal(read.status, 200); assert.equal((await read.json()).data['1670'].propertyName, '1670');
});
