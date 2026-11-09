# House Rules publishing

The existing API hosts `/api/guides`. Publishing stays disabled until both secrets are configured:

- `GUIDE_GITHUB_TOKEN`: fine-grained GitHub credential, Contents read/write on `oceanvacationsmb/House_Rules` only.
- `GUIDE_ADMIN_PASSWORD`: a new private admin password, different from the former password embedded in public JavaScript.
- Optional: `GUIDE_GITHUB_REPOSITORY` (defaults to `oceanvacationsmb/House_Rules`) and `GUIDE_GITHUB_BRANCH` (defaults to `main`).

The client exchanges the private password for a 12-hour signed session. GitHub credentials remain on the server. Each write reads the latest `data.js`, checks that the same property has not changed since it was loaded, and commits only that property's edits. Changes to other properties are preserved. GitHub Pages publishes the commit in its usual deployment process.

The admin opens authoritative data from GitHub after login. Browser drafts remain recoverable via the existing export function, but do not silently replace the published version. Errors are shown as not published. A conflict requires reviewing the latest version before overwriting it.

Run `node --test guide-github-store.test.cjs` to check authentication, property-specific writes, and conflict handling.
