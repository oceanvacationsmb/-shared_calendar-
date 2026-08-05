"use strict";

const { haversineKm } = require("./geo");

const DEFAULT_WEIGHTS = Object.freeze({
  bedrooms: 30,
  capacity: 20,
  propertyType: 15,
  amenities: 15,
  distance: 15,
  rating: 5
});

function normalizedText(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function numericSimilarity(a, b, tolerance) {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.max(0, 1 - Math.abs(a - b) / tolerance);
}

function amenitySimilarity(subject, candidate) {
  const left = new Set((subject?.amenityNames || []).map(normalizedText).filter(Boolean));
  const right = new Set((candidate?.amenityNames || []).map(normalizedText).filter(Boolean));
  if (!left.size || !right.size) return 0;

  const intersection = [...left].filter(value => right.has(value)).length;
  const union = new Set([...left, ...right]).size;
  return intersection / union;
}

function scoreCompetitor(subject, candidate, weights = DEFAULT_WEIGHTS) {
  const distanceKm = haversineKm(subject, candidate);
  const bedroomScore = subject.bedrooms === candidate.bedrooms ? 1 :
    numericSimilarity(subject.bedrooms, candidate.bedrooms, 3);
  const capacityScore = numericSimilarity(subject.sleeps, candidate.sleeps, 8);
  const propertyTypeScore = normalizedText(subject.propertyType) === normalizedText(candidate.propertyType) ? 1 : 0;
  const amenitiesScore = amenitySimilarity(subject, candidate);
  const distanceScore = distanceKm == null ? 0 : Math.exp(-distanceKm / 8);
  const ratingScore = numericSimilarity(subject.rating, candidate.rating, 2);

  const components = {
    bedrooms: bedroomScore * weights.bedrooms,
    capacity: capacityScore * weights.capacity,
    propertyType: propertyTypeScore * weights.propertyType,
    amenities: amenitiesScore * weights.amenities,
    distance: distanceScore * weights.distance,
    rating: ratingScore * weights.rating
  };

  return {
    similarityScore: Number(Object.values(components).reduce((sum, value) => sum + value, 0).toFixed(2)),
    distanceKm: distanceKm == null ? null : Number(distanceKm.toFixed(3)),
    components: Object.fromEntries(
      Object.entries(components).map(([key, value]) => [key, Number(value.toFixed(2))])
    )
  };
}

module.exports = {
  DEFAULT_WEIGHTS,
  amenitySimilarity,
  scoreCompetitor
};
