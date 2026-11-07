# GitHub task storage

The browser keeps the existing task interface. The server commits tasks, vendor
names and creator names to one JSON file using GitHub's Contents API. Existing
Supabase tasks are not migrated. Failed writes return an error; they are never
reported as saved. SHA conflicts are retried against the latest file.

## Setup

1. Choose a repository, preferably private. Existing public calendar API access
   remains unchanged: a private Git repository alone does not restrict calendar
   visitors from reading tasks through the API. Do not enter secrets in tasks.
2. Create `calendar-data/tasks.json` using the `emptyStore()` export in
   `task-github-store.js`. It includes the original vendor and creator defaults.
3. Create a fine-grained GitHub token limited to that repository with Contents
   read/write permission. Store it only in the Render service environment.
4. Set these server environment variables and redeploy:

       TASK_STORAGE=github
       TASK_GITHUB_REPOSITORY=OWNER/REPOSITORY
       TASK_GITHUB_BRANCH=main
       TASK_GITHUB_TOKEN=<server-side secret>

   `TASK_GITHUB_PATH` optionally overrides `calendar-data/tasks.json`.
   If storing in the calendar source repository, use a separate data branch and
   set `TASK_GITHUB_BRANCH` to it to avoid redeploying on every task save.

5. Verify creating, editing and completing a disposable task in the calendar.
   Confirm the corresponding Git commits and reload to verify persistence.

## Limits

Intended for a small team's task volume, not high-frequency writes. Each save is
a commit; deleted text remains in Git history. Completed tasks are retained until
explicitly deleted. Small image attachments are supported (approximately 100 KB
each); videos are not. The whole JSON file is limited to 700 KB to stay below the
Contents API inline-read limit. Archive data before reaching this limit.

Run tests with `node --test task-github-store.test.cjs`.
