"use strict";

const { scoreCompetitor } = require("./similarity");
const { haversineKm } = require("./geo");

class CompetitorSetEngine {
  constructor(provider, options = {}) {
    if (!provider) throw new Error("A listing data provider is required");
    this.provider = provider;
    this.limit = options.limit || 30;
    this.enrichmentConcurrency = options.enrichmentConcurrency || 3;
    this.candidatePoolSize = options.candidatePoolSize || Math.max(this.limit + 10, this.limit);
    this.requirePricing = Boolean(options.requirePricing);
  }

  async build({ listingId, checkIn = null, checkOut = null }) {
    if (!/^\d+$/.test(String(listingId || ""))) {
      throw new Error("listingId must be a numeric Airbnb listing ID");
    }

    const subject = await this.provider.getListing(String(listingId));
    const discovery = await this.provider.searchComparables(subject, { checkIn, checkOut });
    const discoveredSeeds = discovery.competitors.filter(item => item.listingId !== subject.listingId);
    const seeds = discoveredSeeds
      .filter(item => !this.requirePricing || item.totalStayPrice != null)
      .sort((a, b) => preliminaryCompare(subject, a, b))
      .slice(0, this.candidatePoolSize);
    const enriched = await mapWithConcurrency(
      seeds,
      this.enrichmentConcurrency,
      async seed => {
        try {
          const detail = await this.provider.getListing(seed.listingId, {
            checkIn,
            checkOut,
            adults: subject.sleeps
          });
          return { ...seed, ...detail, pricing: pricingFromSources(seed, detail) };
        } catch (error) {
          return { seed, enrichmentError: error.message || "Listing enrichment failed" };
        }
      }
    );

    const competitors = enriched
      .filter(candidate => !candidate.enrichmentError)
      .map(candidate => ({ ...candidate, ...scoreCompetitor(subject, candidate) }))
      .sort((a, b) => b.similarityScore - a.similarityScore || (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity))
      .slice(0, this.limit)
      .map(candidate => ({
        listingId: candidate.listingId,
        listingUrl: candidate.listingUrl,
        name: candidate.name,
        similarityScore: candidate.similarityScore,
        scoreComponents: candidate.components,
        distanceKm: candidate.distanceKm,
        bedrooms: candidate.bedrooms,
        bathrooms: candidate.bathrooms,
        sleeps: candidate.sleeps,
        propertyType: candidate.propertyType,
        rating: candidate.rating,
        reviewCount: candidate.reviewCount,
        displayedPrice: candidate.pricing.displayedPrice,
        totalStayPrice: candidate.pricing.totalStayPrice,
        averageNightlyRate: candidate.pricing.averageNightlyRate,
        currency: candidate.pricing.currency || "USD"
      }));

    return {
      generatedAt: new Date().toISOString(),
      subject,
      search: {
        checkIn,
        checkOut,
        discoveredCount: discoveredSeeds.length,
        enrichmentCandidateCount: seeds.length
      },
      enrichmentFailures: enriched
        .filter(item => item.enrichmentError)
        .map(item => ({ listingId: item.seed.listingId, message: item.enrichmentError })),
      competitorCount: competitors.length,
      competitors
    };
  }
}

function preliminaryCompare(subject, a, b) {
  const aBedroomDelta = Math.abs((a.bedrooms ?? -99) - subject.bedrooms);
  const bBedroomDelta = Math.abs((b.bedrooms ?? -99) - subject.bedrooms);
  if (aBedroomDelta !== bBedroomDelta) return aBedroomDelta - bBedroomDelta;

  const aDistance = haversineKm(subject, a) ?? Infinity;
  const bDistance = haversineKm(subject, b) ?? Infinity;
  if (aDistance !== bDistance) return aDistance - bDistance;
  return (b.rating ?? 0) - (a.rating ?? 0);
}

function pricingFromSources(seed, detail) {
  return {
    displayedPrice: seed.displayedPrice ?? detail?.pricing?.displayedPrice ?? null,
    totalStayPrice: seed.totalStayPrice ?? detail?.pricing?.totalStayPrice ?? null,
    averageNightlyRate: seed.averageNightlyRate ?? detail?.pricing?.averageNightlyRate ?? null,
    currency: seed.currency || detail?.pricing?.currency || "USD"
  };
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const output = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      output[index] = await mapper(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return output;
}

module.exports = { CompetitorSetEngine, mapWithConcurrency };
