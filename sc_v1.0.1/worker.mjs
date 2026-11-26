const snapshotPath = "lock-snapshot.json";
const batteryLabels = ["good", "low", "critical", "unknown"];
const jsonHeaders = { "cache-control": "no-store" };

function normalizeSnapshot(input) {
  const time = input?.capturedAt;
  if (typeof time !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/.test(time) ||
      !Number.isFinite(Date.parse(time)) || Date.parse(time) > Date.now() + 300000) {
    throw new Error("Supply a real observation time with an explicit timezone.");
  }
  if (!Array.isArray(input.locks) || input.locks.length < 1 || input.locks.length > 500) {
    throw new Error("Supply between 1 and 500 property readings.");
  }

  const keys = new Set();
  const locks = input.locks.map((row, index) => {
    const { listingId, propertyName, batteryPercent = null, batteryStatus = null, online } = row || {};
    const label = `Reading ${index + 1}`;
    const name = typeof propertyName === "string" ? propertyName.trim() : "";
    const id = typeof listingId === "string" ? listingId.trim() : "";
    if (Object.keys(row || {}).some(key => !["listingId", "propertyName", "batteryPercent", "batteryStatus", "online"].includes(key)) ||
        (id ? !/^[a-zA-Z0-9_-]{1,100}$/.test(id) : !name) || name.length > 160) {
      throw new Error(`${label} needs a calendar listing ID or exact property name and lock readings only.`);
    }
    if ((batteryPercent !== null && (!Number.isInteger(batteryPercent) || batteryPercent < 0 || batteryPercent > 100)) ||
        (batteryStatus !== null && !batteryLabels.includes(batteryStatus)) ||
        (online !== null && typeof online !== "boolean")) {
      throw new Error(`${label} contains an invalid battery or connection value.`);
    }

    const key = id ? `id:${id}` : `name:${name.toLowerCase()}`;
    if (keys.has(key)) throw new Error(`${label} repeats a property.`);
    keys.add(key);
    return { key, ...(id ? { listingId: id } : { propertyName: name }), batteryPercent, batteryStatus, online };
  }).sort((a, b) => a.key.localeCompare(b.key)).map(({ key, ...row }) => row);
  return { capturedAt: new Date(time).toISOString(), locks };
}

async function getSnapshot(bucket) {
  const object = await bucket.get(snapshotPath);
  return { etag: object?.etag, snapshot: object ? await object.json() : { capturedAt: null, locks: [] } };
}

async function updateSnapshot(bucket, values) {
  const next = normalizeSnapshot(values);
  for (let attempt = 0; attempt < 3; attempt++) {
    const { etag, snapshot } = await getSnapshot(bucket);
    if (snapshot.capturedAt && next.capturedAt <= snapshot.capturedAt) {
      return { changed: false, capturedAt: snapshot.capturedAt, reason: "newer_or_equal_snapshot" };
    }
    if (JSON.stringify(next.locks) === JSON.stringify(snapshot.locks)) {
      return { changed: false, capturedAt: snapshot.capturedAt, reason: "readings_unchanged" };
    }
    const onlyIf = etag ? new Headers({ "If-Match": `"${etag}"` }) : new Headers({ "If-None-Match": "*" });
    if (await bucket.put(snapshotPath, JSON.stringify(next), { onlyIf })) {
      return { changed: true, capturedAt: next.capturedAt, count: next.locks.length };
    }
  }
  throw new Error("The snapshot changed concurrently. Retry with the current complete readings.");
}

const toolSchemas = [
  {
    name: "read_lock_snapshot",
    description: "Read the last saved Ocean Vacations lock snapshot.",
    inputSchema: { type: "object", additionalProperties: false }
  },
  {
    name: "update_lock_snapshot",
    description: "Save the complete latest Guesty Locks Manager dashboard readings if they changed. Use exact calendar listing IDs or property names. Send battery and reachability only. Preserve the saved snapshot if the dashboard is inaccessible or incomplete.",
    inputSchema: {
      type: "object", additionalProperties: false, required: ["capturedAt", "locks"],
      properties: {
        capturedAt: { type: "string", description: "Actual observation time in ISO 8601 with timezone" },
        locks: { type: "array", minItems: 1, maxItems: 500, items: {
          type: "object", additionalProperties: false, required: ["online"],
          properties: {
            listingId: { type: "string" },
            propertyName: { type: "string" },
            batteryPercent: { type: ["integer", "null"], minimum: 0, maximum: 100 },
            batteryStatus: { enum: [...batteryLabels, null] },
            online: { type: ["boolean", "null"] }
          }
        } }
      }
    }
  }
];

async function mcp(request, bucket, authorized) {
  const body = await request.json();
  const reply = result => Response.json({ jsonrpc: "2.0", id: body.id ?? null, result }, { headers: jsonHeaders });
  const failure = (code, message) => Response.json({ jsonrpc: "2.0", id: body.id ?? null, error: { code, message } }, { headers: jsonHeaders });

  if (body.method === "server/discover") return reply({ supportedVersions: ["2026-07-28"], capabilities: { tools: {} } });
  if (body.method === "tools/list") return reply({ tools: toolSchemas });
  if (body.method !== "tools/call") return failure(-32601, "Unknown method");
  if (!authorized) return failure(-32000, "ChatGPT sign-in required");
  try {
    const name = body.params?.name;
    const result = name === "read_lock_snapshot" ? (await getSnapshot(bucket)).snapshot :
      name === "update_lock_snapshot" ? await updateSnapshot(bucket, body.params.arguments) : null;
    if (!result) return failure(-32602, "Unknown tool");
    return reply({ content: [{ type: "text", text: JSON.stringify(result) }] });
  } catch (error) {
    return reply({ isError: true, content: [{ type: "text", text: error.message }] });
  }
}

export function createWorker(assets) {
  return {
    async fetch(request, env) {
      const url = new URL(request.url);
      const signedIn = Boolean(request.headers.get("oai-authenticated-user-id"));
      if (url.pathname === "/mcp" && request.method === "POST") {
        const raw = await request.text();
        if (raw.length > 160000) return new Response("Request too large", { status: 413 });
        try {
          return await mcp(new Request(request.url, { method: "POST", body: raw }), env.BUCKET, signedIn);
        } catch {
          return new Response("Invalid MCP request", { status: 400 });
        }
      }
      if (!signedIn) return new Response("ChatGPT sign-in required", { status: 401, headers: jsonHeaders });
      if (request.method !== "GET" && request.method !== "HEAD") return new Response("Method not allowed", { status: 405 });
      if (url.pathname === "/api/lock-snapshot") {
        return Response.json((await getSnapshot(env.BUCKET)).snapshot, { headers: jsonHeaders });
      }
      if (url.pathname === "/" || url.pathname === "/sc_v1.0.1/" || url.pathname === "/calendar_all") {
        return Response.redirect(new URL("/calendar_all/?mode=report", url), 302);
      }
      const path = url.pathname === "/calendar_all/" ? "/calendar_all/index.html" : url.pathname;
      if (!Object.hasOwn(assets, path)) return new Response("Not found", { status: 404 });
      const asset = assets[path];
      return new Response(request.method === "HEAD" ? null : asset.text, {
        headers: { "content-type": asset.mime, "cache-control": "no-cache", "x-content-type-options": "nosniff" }
      });
    }
  };
}
