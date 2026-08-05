"use strict";

const { scoreCompetitor } = require("./similarity");
const { haversineKm } = require("./geo");

function addDays(dateString, days) {
  const date = new Date(`${dateString}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function sameNumber(left, right) {
  return Number.isFinite(left) && Number.isFinite(right) && left === right;
}

function exactMatch(subject, candidate) {
  return sameNumber(subject.bedrooms, candidate.bedrooms) &&
    sameNumber(subject.bathrooms, candidate.bathrooms) &&
    sameNumber(subject.sleeps, candidate.sleeps) &&
    candidate.pool === true &&
    candidate.petsAllowed === false &&
    candidate.heatedPool !== true &&
    candidate.spa === false;
}

async function mapConcurrent(items, concurrency, worker) {
  const results = new Array(items.length);
  let cursor = 0;

  async function run() {
    while (cursor < items.length) {
      const index = cursor++;
      try {
        results[index] = await worker(items[index], index);
      } catch (error) {
        results[index] = null;
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run));
  return results.filter(Boolean);
}

async function findBookableStay({ subject, provider, startDate, nights = 5, maxAttempts = 10, stepDays = 4 }) {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const checkIn = addDays(startDate, attempt * stepDays);
    const checkOut = addDays(checkIn, nights);
    const search = await provider.searchComparables(subject, { checkIn, checkOut });
    const ownResult = search.competitors.find(item =>
      item.listingId === subject.listingId && Number.isFinite(item.totalStayPrice)
    );

    if (ownResult) return { checkIn, checkOut, nights, ownResult };
  }

  throw new Error(`Airbnb did not return a bookable ${nights}-night stay for the subject listing in the scan window.`);
}

function buildRecommendation(ownTotal, competitors) {
  const prices = competitors.map(item => item.totalStayPrice).filter(Number.isFinite);
  if (!Number.isFinite(ownTotal) || prices.length < 2) {
    throw new Error("At least two exact-match competitor prices are required for a recommendation.");
  }

  const average = prices.reduce((sum, value) => sum + value, 0) / prices.length;
  const lowest = Math.min(...prices);
  const highest = Math.max(...prices);
  const marketDifferencePercent = (ownTotal - average) / average * 100;
  const adjustmentPercent = (average / ownTotal - 1) * 100;
  const absAdjustment = Math.abs(adjustmentPercent);
  const direction = adjustmentPercent < -0.25 ? "Lower" : adjustmentPercent > 0.25 ? "Raise" : "Keep";
  const action = direction === "Keep"
    ? "Keep current rates"
    : `${direction} rates by ${absAdjustment.toFixed(1)}%`;
  const position = marketDifferencePercent >= 0 ? "above" : "below";

  return {
    action,
    adjustmentPercent: Number(adjustmentPercent.toFixed(2)),
    marketDifferencePercent: Number(marketDifferencePercent.toFixed(2)),
    average: Number(average.toFixed(2)),
    lowest,
    highest,
    confidence: Math.min(96, 82 + competitors.length * 3),
    reason: `Your Airbnb total is ${Math.abs(marketDifferencePercent).toFixed(1)}% ${position} the average of ${competitors.length} exact-match properties for the same stay dates.`
  };
}

async function buildAirbnbOnlyAnalysis(options) {
  const {
    listingId,
    scanProvider,
    provider,
    startDate,
    nights = 5,
    limit = 5,
    candidatePoolSize = 18,
    enrichmentConcurrency = 3
  } = options;
  const subject = await provider.getListing(listingId);
  const stay = await findBookableStay({ subject, provider: scanProvider, startDate, nights });
  const search = await provider.searchComparables(subject, stay);
  const pricedSeeds = search.competitors
    .filter(item => item.listingId !== subject.listingId)
    .filter(item => Number.isFinite(item.totalStayPrice))
    .filter(item => sameNumber(item.bedrooms, subject.bedrooms))
    .filter(item => sameNumber(item.bathrooms, subject.bathrooms))
    .sort((left, right) => (haversineKm(subject, left) ?? Infinity) - (haversineKm(subject, right) ?? Infinity))
    .slice(0, candidatePoolSize);
  const enriched = await mapConcurrent(pricedSeeds, enrichmentConcurrency, async seed => {
    const detail = await provider.getListing(seed.listingId, stay);
    return { ...detail, ...seed, name: detail.name || seed.name, imageUrl: detail.imageUrl };
  });
  const competitors = enriched
    .filter(candidate => exactMatch(subject, candidate))
    .map(candidate => ({ ...candidate, ...scoreCompetitor(subject, candidate) }))
    .sort((left, right) => right.similarityScore - left.similarityScore || left.distanceKm - right.distanceKm)
    .slice(0, limit);

  if (competitors.length < 2) {
    throw new Error(`Only ${competitors.length} exact-match Airbnb properties were verified. The filter was not relaxed.`);
  }

  return {
    analyzedAt: new Date().toISOString(),
    source: "Airbnb listing and same-date Airbnb search responses",
    property: {
      ...subject,
      totalPrice: stay.ownResult.totalStayPrice,
      displayedPrice: stay.ownResult.displayedPrice,
      availableStay: {
        checkIn: stay.checkIn,
        checkOut: stay.checkOut,
        nights: stay.nights,
        status: `${stay.nights}-night stay accepted by Airbnb`,
        minimumNights: null
      }
    },
    competitors: competitors.map(item => ({
      ...item,
      stayStatus: `${stay.nights}-night stay accepted by Airbnb`,
      minimumNights: null
    })),
    recommendation: buildRecommendation(stay.ownResult.totalStayPrice, competitors),
    limitations: "Airbnb confirms that every displayed listing accepts these exact dates. Exact minimum-night rules are not exposed. Competitors advertising pool heat, spas, or pets are excluded; Airbnb does not always explicitly label an unheated pool. Totals are displayed pre-tax totals and may include mandatory fees; optional add-ons are excluded."
  };
}

module.exports = { addDays, buildAirbnbOnlyAnalysis, buildRecommendation, exactMatch, findBookableStay };
