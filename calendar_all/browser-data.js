const calendarBrowserData = (() => {
  const reportMode = new URLSearchParams(location.search).get("mode") === "report";
  const prefix = reportMode ? "ocean-report-preview" : "ocean-calendar";
  const reportKeyName = `${prefix}:report-key`;

  function read(name, fallback) {
    return JSON.parse(localStorage.getItem(`${prefix}:${name}`)) ?? fallback;
  }

  function write(name, value) {
    localStorage.setItem(`${prefix}:${name}`, JSON.stringify(value));
  }

  function setReportLink(input) {
    let url;
    try {
      url = new URL(input.trim());
    } catch {
      throw new Error("Paste the complete Guesty shared reservation report link.");
    }
    const key = url.searchParams.get("apiKey")?.trim();
    if (url.origin !== "https://report.guesty.com" || url.pathname !== "/apps/reservations" || !key) {
      throw new Error("Use a Guesty shared reservation report link containing an apiKey.");
    }
    sessionStorage.setItem(reportKeyName, key);
  }

  async function loadReport(start, end) {
    const key = sessionStorage.getItem(reportKeyName);
    if (!key) throw new Error("Enter your Guesty shared reservation report link above.");
    const properties = new Map();
    const pageSize = 100;
    for (let page = 0; page < 50; page++) {
      const url = new URL("https://report.guesty.com/api/shared-reservations-reports");
      url.search = new URLSearchParams({ timezone: "America/New_York", skip: page * pageSize, limit: pageSize });
      const response = await fetch(url, {
        headers: { authorization: key },
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(30000)
      });
      if (!response.ok) throw new Error(`Guesty report returned HTTP ${response.status}. Check the report link.`);
      const rows = reportRows(await response.json());
      for (const row of rows) {
        const id = field(row, "listingId") ?? field(row, "listing._id") ?? row.listing?._id ?? row.listing?.id;
        const name = field(row, "listing.nickname") ?? field(row, "listingNickname") ?? field(row, "nickname") ??
          row.listing?.nickname ?? row.listing?.title ?? row.listing?.name ?? id;
        if (!id || !name) continue;
        const listingId = String(id);
        const listingCity = field(row, "listing.address.city") ?? field(row, "listing.city") ??
          field(row, "address.city") ?? row.listing?.address?.city ?? row.listing?.city ?? "";
        if (!properties.has(listingId)) {
          properties.set(listingId, { listingId, nickname: String(name), listingCity, city: listingCity, bookings: [] });
        }
        const checkIn = String(field(row, "checkInDate") ?? row.checkIn ?? "").slice(0, 10);
        const checkOut = String(field(row, "checkOutDate") ?? row.checkOut ?? "").slice(0, 10);
        if (String(field(row, "status")).toLowerCase() === "confirmed" &&
            /^\d{4}-\d{2}-\d{2}$/.test(checkIn) && /^\d{4}-\d{2}-\d{2}$/.test(checkOut) &&
            checkIn < end && checkOut > start && checkIn < checkOut) {
          properties.get(listingId).bookings.push({ checkIn, checkOut, listingCity });
        }
      }
      if (rows.length < pageSize) {
        const result = [...properties.values()].sort((a, b) => a.nickname.localeCompare(b.nickname));
        for (const property of result) {
          property.bookings.sort((a, b) => a.checkIn.localeCompare(b.checkIn));
        }
        return { properties: result };
      }
    }
    throw new Error("The report is too large to load. Use a report with a shorter date range.");
  }

  function field(row, name) {
    const value = row?.[name];
    return value && typeof value === "object" ? value.children ?? value.value ?? value.text ?? value.label ?? value.id : value;
  }

  function reportRows(data) {
    if (Array.isArray(data)) return data;
    const fields = ["data", "results", "reservations", "items", "rows"];
    const direct = fields.map(key => data?.[key]).find(Array.isArray);
    if (direct) return direct;
    const nested = fields.flatMap(outer => fields.map(inner => data?.[outer]?.[inner])).find(Array.isArray);
    if (nested) return nested;
    throw new Error("The Guesty report returned an unrecognized format.");
  }

  return { reportMode, read, write, setReportLink, loadReport };
})();
