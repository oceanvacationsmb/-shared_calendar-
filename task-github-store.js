const { randomUUID } = require("node:crypto");

function emptyStore() {
  const names = values => values.map(name => ({ id: randomUUID(), name }));
  return {
    version: 1,
    tasks: [],
    vendors: names(["Andre", "Ashley", "Isaac", "Dennis", "Paradise HVAC", "Stainley"]),
    creators: names(["Zack", "Isaac", "Ashley"])
  };
}

class GitHubTaskStore {
  constructor({ repository, token, branch = "main", path = "calendar-data/tasks.json", fetchImpl = fetch }) {
    if (!/^[\w.-]+\/[\w.-]+$/.test(repository || "") || !token) {
      throw new Error("Configure TASK_GITHUB_REPOSITORY and TASK_GITHUB_TOKEN on the server.");
    }
    this.url = `https://api.github.com/repos/${repository}/contents/${path.split("/").map(encodeURIComponent).join("/")}`;
    this.token = token;
    this.branch = branch;
    this.fetch = fetchImpl;
    this.queue = Promise.resolve();
    this.readCache = null;
    this.readPending = null;
    this.readGeneration = 0;
  }

  async request(url, options = {}) {
    const response = await this.fetch(url, {
      ...options,
      signal: AbortSignal.timeout(15000),
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${this.token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
        ...options.headers
      }
    });
    return response;
  }

  async read(fresh = false) {
    if (!fresh && this.readCache && this.readCache.expires > Date.now()) {
      return structuredClone(this.readCache.value);
    }
    if (!fresh && this.readPending) return structuredClone(await this.readPending);
    const generation = this.readGeneration;
    const pending = this.readRemote().then(value => {
      if (generation === this.readGeneration) this.readCache = { value, expires: Date.now() + 15000 };
      return value;
    });
    if (!fresh) this.readPending = pending;
    try { return structuredClone(await pending); }
    finally { if (this.readPending === pending) this.readPending = null; }
  }

  async readRemote() {
    const response = await this.request(`${this.url}?ref=${encodeURIComponent(this.branch)}`);
    if (!response.ok) {
      throw new Error(`GitHub task storage could not be read (${response.status}). Check repository, branch, file and token permissions.`);
    }
    const file = await response.json();
    if (!file.content || file.encoding !== "base64") throw new Error("Task file is missing or too large for GitHub storage.");
    const data = JSON.parse(Buffer.from(file.content.replace(/\s/g, ""), "base64").toString("utf8"));
    if (data.version !== 1 || ![data.tasks, data.vendors, data.creators].every(Array.isArray)) {
      throw new Error("Invalid task file format; existing data was not overwritten.");
    }
    return { data, sha: file.sha };
  }

  update(change) {
    const operation = this.queue.then(async () => {
      for (let attempt = 0; attempt < 4; attempt++) {
        const { data, sha } = await this.read(true);
        const result = change(data);
        const serialized = JSON.stringify(data, null, 2) + "\n";
        if (Buffer.byteLength(serialized) > 700000) throw new Error("Task storage is full. Archive old tasks before adding more attachments.");
        const response = await this.request(this.url, {
          method: "PUT",
          body: JSON.stringify({
            message: "Update calendar tasks",
            content: Buffer.from(serialized).toString("base64"),
            sha,
            branch: this.branch
          })
        });
        if (response.status === 409) continue;
        if (!response.ok) throw new Error(`Task save failed (${response.status}); no successful save was confirmed.`);
        this.readGeneration++;
        this.readCache = null;
        this.readPending = null;
        return result;
      }
      throw new Error("Another user updated tasks. Please retry your change.");
    });
    this.queue = operation.catch(() => {});
    return operation;
  }
}

function taskRouter(store) {
  const router = require("express").Router();
  const route = fn => async (req, res) => {
    try { res.json({ ok: true, ...await fn(req) }); }
    catch (error) { res.status(error.status || 503).json({ ok: false, message: error.message }); }
  };
  const invalid = message => { const error = new Error(message); error.status = 400; throw error; };
  const text = (value, max = 10000) => String(value || "").trim().slice(0, max);
  const findTask = (data, id) => {
    const task = data.tasks.find(item => item.id === id);
    if (!task) { const error = new Error("Task not found"); error.status = 404; throw error; }
    return task;
  };
  for (const [suffix, collection, singular] of [["vendors", "vendors", "vendor"], ["creators", "creators", "creator"]]) {
    const path = `/calendar-task-${suffix}`;
    router.get(path, route(async () => ({ [collection]: (await store.read()).data[collection].sort((a, b) => a.name.localeCompare(b.name)) })));
    router.post(path, route(async req => {
      const name = text(req.body.name, 200);
      if (!name) invalid("Name is required");
      return store.update(data => {
        let entry = data[collection].find(item => item.name.toLowerCase() === name.toLowerCase());
        if (!entry) { entry = { id: randomUUID(), name }; data[collection].push(entry); }
        return { [singular]: entry };
      });
    }));
  }
  router.patch("/calendar-task-creators/:id", route(async req => {
    const name = text(req.body.name, 200);
    if (!name) invalid("Name is required");
    return store.update(data => {
      const creator = data.creators.find(item => item.id === req.params.id);
      if (!creator) invalid("Creator not found");
      creator.name = name;
      return { creator };
    });
  }));
  router.delete("/calendar-task-creators/:id", route(async req => store.update(data => {
    data.creators = data.creators.filter(item => item.id !== req.params.id);
    return { deleted: req.params.id };
  })));
  router.get("/calendar-tasks", route(async req => {
    const status = req.query.status === "completed" ? "completed" : "open";
    const { data } = await store.read();
    return { tasks: data.tasks.filter(task => task.status === status).sort((a, b) =>
      String(b.completed_at || b.created_at).localeCompare(String(a.completed_at || a.created_at))) };
  }));
  router.post("/calendar-tasks", route(async req => {
    const listingId = text(req.body.listingId, 200);
    const taskText = text(req.body.taskText);
    if (!listingId || !taskText) invalid("Property and task text are required");
    const media = [];
    for (const file of Array.isArray(req.body.mediaFiles) ? req.body.mediaFiles : []) {
      // Small images remain part of the same atomic Git commit. No Supabase calls.
      if (!/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(file.dataUrl || "")) {
        invalid("GitHub task storage supports PNG, JPEG, WebP and GIF images only.");
      }
      if (file.dataUrl.length > 150000) invalid("Please use an image smaller than approximately 100 KB.");
      media.push({ id: randomUUID(), file_name: text(file.name, 200), file_url: file.dataUrl, media_kind: "image", uploaded_for: "open" });
    }
    return store.update(data => {
      const task = {
        id: randomUUID(), listing_id: listingId, property_name: text(req.body.propertyName, 200),
        task_text: taskText, assignee_name: text(req.body.assigneeName, 200) || null,
        created_by_name: text(req.body.createdByName, 200) || null,
        status: "open", created_at: new Date().toISOString(), completed_at: null, media
      };
      data.tasks.push(task);
      return { task };
    });
  }));
  router.patch("/calendar-tasks/:id", route(async req => {
    const taskText = text(req.body.taskText);
    if (!taskText) invalid("Task text is required");
    return store.update(data => {
      const task = findTask(data, req.params.id);
      Object.assign(task, { task_text: taskText, assignee_name: text(req.body.assigneeName, 200) || null,
        created_by_name: text(req.body.createdByName, 200) || null });
      return { task };
    });
  }));
  router.delete("/calendar-tasks/:id", route(async req => store.update(data => {
    const task = findTask(data, req.params.id);
    if (req.query.hard === "true") {
      data.tasks = data.tasks.filter(item => item.id !== task.id);
      return { deleted: task.id };
    }
    Object.assign(task, { status: "completed", completed_at: new Date().toISOString(), completed_by_name: task.assignee_name });
    return { completed: task.id, task };
  })));
  return router;
}

module.exports = { GitHubTaskStore, taskRouter, emptyStore };
