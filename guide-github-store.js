const crypto = require('node:crypto');
const express = require('express');

function failure(status, message) { return Object.assign(new Error(message), { status }); }
function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function equalSecret(a, b) {
  const hash = value => crypto.createHash('sha256').update(String(value || '')).digest();
  return crypto.timingSafeEqual(hash(a), hash(b));
}
class GuideStore {
  constructor({ token, repository = 'oceanvacationsmb/House_Rules', branch = 'main', request = fetch }) {
    this.token = token; this.repository = repository; this.branch = branch; this.request = request;
  }
  async github(method, body) {
    const url = `https://api.github.com/repos/${this.repository}/contents/data.js`;
    const response = await this.request(method === 'GET' ? `${url}?ref=${encodeURIComponent(this.branch)}` : url, {
      method, headers: { Authorization: `Bearer ${this.token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(25000)
    });
    if (!response.ok) throw failure(response.status === 409 || response.status === 422 ? 409 : 502,
      response.status === 401 || response.status === 403 ? 'GitHub access needs attention. Your draft has not been published.' : 'GitHub could not complete the request. Please retry.');
    return response.json();
  }
  async read() {
    const file = await this.github('GET');
    const source = Buffer.from(file.content, 'base64').toString('utf8');
    const json = source.trim().replace(/^const\s+PROPERTY_GUIDES\s*=\s*/, '').replace(/;\s*$/, '');
    const data = JSON.parse(json);
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw failure(502, 'Invalid guide data in GitHub.');
    return { data, sha: file.sha };
  }
  async save(slug, property, baseProperty) {
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(slug) || !property || property.slug !== slug || !Array.isArray(property.sections) || property.sections.length > 100 || Buffer.byteLength(JSON.stringify(property)) > 150000)
      throw failure(400, 'Invalid property guide.');
    for (let attempt = 0; attempt < 3; attempt++) {
      const current = await this.read();
      if (!current.data[slug]) throw failure(404, 'Property not found in GitHub.');
      if (same(current.data[slug], property)) return { property, unchanged: true };
      if (!same(current.data[slug], baseProperty)) throw failure(409, 'This property was changed in another session. Export your draft before reloading to review the latest version.');
      // Merge only this property into the latest file, preserving all other guides.
      current.data[slug] = property;
      const content = Buffer.from('const PROPERTY_GUIDES = ' + JSON.stringify(current.data, null, 2) + ';\n').toString('base64');
      try {
        const result = await this.github('PUT', { branch: this.branch, sha: current.sha, content, message: `Update ${slug} house rules from admin` });
        return { property, commit: result.commit.sha, url: result.commit.html_url };
      } catch (error) { if (error.status !== 409 || attempt === 2) throw error; }
    }
  }
}
function guideRouter({ token = process.env.GUIDE_GITHUB_TOKEN, password = process.env.GUIDE_ADMIN_PASSWORD, repository = process.env.GUIDE_GITHUB_REPOSITORY, branch = process.env.GUIDE_GITHUB_BRANCH, store } = {}) {
  const router = express.Router();
  router.use(express.json({ limit: '350kb' }));
  const ready = Boolean(token && password);
  store = store || new GuideStore({ token, repository, branch });
  const sign = value => crypto.createHmac('sha256', token || 'unconfigured').update(value).digest('base64url');
  const attempts = new Map();
  router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.get('/status', (req, res) => res.json({ ready }));
  router.post('/session', (req, res) => {
    if (!ready) return res.status(503).json({ error: 'GitHub publishing has not been configured yet.' });
    const key = req.ip;
    const now = Date.now();
    for (const [ip, entry] of attempts) if (now > entry.until) attempts.delete(ip);
    const attempt = attempts.get(key) || { count: 0, until: now + 15 * 60 * 1000 };
    if (attempt.count >= 10) return res.status(429).json({ error: 'Too many login attempts. Try again in 15 minutes.' });
    if (!equalSecret(req.body?.password, password)) { attempt.count++; attempts.set(key, attempt); return res.status(401).json({ error: 'Incorrect admin password.' }); }
    attempts.delete(key);
    const value = Buffer.from(JSON.stringify({ expires: now + 12 * 60 * 60 * 1000, nonce: crypto.randomBytes(16).toString('hex') })).toString('base64url');
    res.json({ session: value + '.' + sign(value) });
  });
  router.use((req, res, next) => {
    if (!ready) return res.status(503).json({ error: 'GitHub publishing has not been configured yet.' });
    try {
      const [value, signature] = String(req.headers.authorization || '').replace(/^Bearer /, '').split('.');
      if (!signature || !equalSecret(signature, sign(value)) || JSON.parse(Buffer.from(value, 'base64url').toString()).expires < Date.now()) throw new Error();
      next();
    } catch { res.status(401).json({ error: 'Please sign in again. Your draft is kept in this browser.' }); }
  });
  router.get('/data', async (req, res) => { try { res.json(await store.read()); } catch (error) { res.status(error.status || 502).json({ error: error.message }); } });
  router.put('/properties/:slug', express.json({ limit: '350kb' }), async (req, res) => {
    try { res.json(await store.save(req.params.slug, req.body?.property, req.body?.baseProperty)); }
    catch (error) { res.status(error.status || 502).json({ error: error.message }); }
  });
  return router;
}
module.exports = { GuideStore, guideRouter };
