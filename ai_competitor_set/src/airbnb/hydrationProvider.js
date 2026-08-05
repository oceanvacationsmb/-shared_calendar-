"use strict";

const { extractDeferredState, getOperationPayload } = require("./response");
const { parseListingPayload } = require("./listingParser");
const { parseSearchPayload } = require("./searchParser");

class AirbnbHydrationProvider {
  constructor(options = {}) {
    this.fetch = options.fetch || globalThis.fetch;
    this.userAgent = options.userAgent || "Mozilla/5.0 (compatible; AICompetitorSet/0.1; research)";
    this.searchRadiusKm = options.searchRadiusKm || 15;
    this.maxSearchPages = options.maxSearchPages || 3;
    this.maxAttempts = options.maxAttempts || 3;
  }

  async getListing(listingId, context = {}) {
    const payload = await this.#loadOperation(
      buildListingUrl(listingId, context),
      "StaysPdpSections"
    );
    return parseListingPayload(payload, listingId);
  }

  async searchComparables(subject, dates = {}) {
    const firstUrl = buildSearchUrl(subject, { ...dates, radiusKm: this.searchRadiusKm });
    const firstPayload = await this.#loadOperation(firstUrl, "StaysSearch");
    const firstPage = parseSearchPayload(firstPayload);
    const byId = new Map(firstPage.competitors.map(item => [item.listingId, item]));
    const cursors = firstPage.pageCursors.slice(1, this.maxSearchPages);

    for (const cursor of cursors) {
      const pageUrl = buildSearchUrl(subject, {
        ...dates,
        radiusKm: this.searchRadiusKm,
        cursor
      });
      const page = parseSearchPayload(await this.#loadOperation(pageUrl, "StaysSearch"));
      page.competitors.forEach(item => byId.set(item.listingId, item));
    }

    return {
      ...firstPage,
      competitors: [...byId.values()]
    };
  }

  async #loadOperation(url, operationName) {
    if (typeof this.fetch !== "function") throw new Error("No fetch implementation is available");
    let lastError;

    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      try {
        const response = await this.fetch(url, {
          method: "GET",
          headers: {
            accept: "text/html,application/xhtml+xml",
            "user-agent": this.userAgent
          },
          redirect: "follow"
        });

        if (!response.ok) {
          const error = new Error(`Airbnb returned HTTP ${response.status} for ${operationName}`);
          error.retryable = response.status === 429 || response.status >= 500;
          throw error;
        }

        const html = await response.text();
        return getOperationPayload(extractDeferredState(html), operationName);
      } catch (error) {
        lastError = error;
        if (attempt === this.maxAttempts || error.retryable === false) break;
        await new Promise(resolve => setTimeout(resolve, 500 * 2 ** (attempt - 1)));
      }
    }

    throw lastError;
  }
}

function buildListingUrl(listingId, context = {}) {
  const url = new URL(`https://www.airbnb.com/rooms/${encodeURIComponent(listingId)}`);
  if (context.checkIn) url.searchParams.set("check_in", context.checkIn);
  if (context.checkOut) url.searchParams.set("check_out", context.checkOut);
  if (context.adults) url.searchParams.set("adults", String(context.adults));
  return url.toString();
}

function buildSearchUrl(subject, options = {}) {
  if (![subject?.latitude, subject?.longitude].every(Number.isFinite)) {
    throw new Error("Coordinates are required to discover comparable listings");
  }

  const radiusKm = options.radiusKm || 15;
  const latDelta = radiusKm / 111.32;
  const lngDelta = radiusKm / (111.32 * Math.cos(subject.latitude * Math.PI / 180));
  const url = new URL("https://www.airbnb.com/s/homes");
  const params = url.searchParams;

  params.append("refinement_paths[]", "/homes");
  params.set("search_by_map", "true");
  params.set("search_type", "user_map_move");
  params.set("room_types[]", "Entire home/apt");
  params.set("min_bedrooms", String(subject.bedrooms));
  params.set("adults", String(subject.sleeps));
  params.set("ne_lat", String(subject.latitude + latDelta));
  params.set("ne_lng", String(subject.longitude + lngDelta));
  params.set("sw_lat", String(subject.latitude - latDelta));
  params.set("sw_lng", String(subject.longitude - lngDelta));
  params.set("zoom_level", "12");
  if (subject.pool) params.append("amenities[]", "7");
  if (options.checkIn) params.set("check_in", options.checkIn);
  if (options.checkOut) params.set("check_out", options.checkOut);
  if (options.cursor) {
    params.set("pagination_search", "true");
    params.set("cursor", options.cursor);
  }

  return url.toString();
}

module.exports = { AirbnbHydrationProvider, buildListingUrl, buildSearchUrl };
