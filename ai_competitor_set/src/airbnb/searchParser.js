"use strict";

const { decodeRelayId } = require("./response");

function parseMoney(value) {
  if (!value) return null;
  const normalized = String(value).replace(/[^0-9.,-]/g, "").replace(/,/g, "");
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : null;
}

function contentNumber(result, type, label) {
  const lines = result?.structuredContent?.primaryLine || [];
  const item = lines.find(line => line?.type === type && new RegExp(`\\b${label}\\b`, "i").test(line?.body || ""));
  const number = String(item?.body || "").match(/[0-9]+(?:\.[0-9]+)?/)?.[0];
  return number == null ? null : Number(number);
}

function parseRating(result) {
  const localized = String(result?.avgRatingLocalized || "");
  const label = String(result?.avgRatingA11yLabel || "");
  const rating = localized.match(/[0-9]+(?:\.[0-9]+)?/)?.[0];
  const reviews = label.match(/([0-9,]+)\s+reviews?/i)?.[1];
  return {
    rating: rating == null ? null : Number(rating),
    reviewCount: reviews == null ? null : Number(reviews.replace(/,/g, ""))
  };
}

function parseSearchResult(result) {
  const listingId = decodeRelayId(result?.demandStayListing?.id);
  if (!listingId) return null;

  const priceLine = result?.structuredDisplayPrice?.primaryLine;
  const totalStayPrice = parseMoney(priceLine?.discountedPrice || priceLine?.price);
  const nights = Number(
    String(result?.structuredDisplayPrice?.primaryLine?.qualifier || "").match(/([0-9]+)\s+nights?/i)?.[1]
  ) || null;
  const rating = parseRating(result);

  return {
    listingId,
    listingUrl: `https://www.airbnb.com/rooms/${listingId}`,
    name: result?.nameLocalized?.localizedStringWithTranslationPreference || result?.subtitle || result?.title || null,
    latitude: result?.demandStayListing?.location?.coordinate?.latitude ?? null,
    longitude: result?.demandStayListing?.location?.coordinate?.longitude ?? null,
    bedrooms: contentNumber(result, "BEDINFO", "bedrooms?"),
    beds: contentNumber(result, "BEDINFO", "beds?"),
    bathrooms: contentNumber(result, "BATHROOMINFO", "baths?|bathrooms?"),
    rating: rating.rating,
    reviewCount: rating.reviewCount,
    displayedPrice: result?.structuredDisplayPrice?.primaryLine?.accessibilityLabel || null,
    totalStayPrice,
    averageNightlyRate: totalStayPrice != null && nights ? totalStayPrice / nights : null,
    nights,
    superhost: (result?.badges || []).some(badge => badge?.loggingContext?.badgeType === "SUPERHOST"),
    raw: result
  };
}

function parseSearchPayload(payload) {
  const staysSearch = payload?.data?.presentation?.staysSearch;
  if (!staysSearch) throw new Error("Invalid StaysSearch payload");

  const combined = [
    ...(staysSearch.results?.searchResults || []),
    ...(staysSearch.mapResults?.mapSearchResults || [])
  ];
  const byId = new Map();

  for (const result of combined) {
    const parsed = parseSearchResult(result);
    if (!parsed) continue;
    const existing = byId.get(parsed.listingId);
    byId.set(parsed.listingId, existing ? { ...parsed, ...existing } : parsed);
  }

  return {
    competitors: [...byId.values()],
    pageCursors: staysSearch.results?.paginationInfo?.pageCursors || [],
    totalInViewport: staysSearch.mapResults?.staysInViewport ?? null
  };
}

module.exports = { parseMoney, parseSearchPayload, parseSearchResult };
