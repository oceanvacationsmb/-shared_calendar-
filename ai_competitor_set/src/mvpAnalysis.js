"use strict";

function calendarDays(payload) {
  const candidates = [
    payload,
    payload?.data,
    payload?.results,
    payload?.calendar,
    payload?.days,
    payload?.data?.days,
    payload?.data?.calendar,
    payload?.data?.results
  ];
  return (candidates.find(Array.isArray) || [])
    .map(day => ({ ...day, date: String(day?.date || "") }))
    .filter(day => /^\d{4}-\d{2}-\d{2}$/.test(day.date))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function dayPrice(day) {
  const candidates = [day?.price, day?.rate, day?.nightlyRate, day?.listingPrice];
  const price = candidates.map(Number).find(Number.isFinite);
  return price ?? null;
}

function isAvailable(day) {
  return String(day?.status || "").toLowerCase() === "available" && dayPrice(day) != null;
}

function addDays(dateString, amount) {
  const date = new Date(`${dateString}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function findAvailableStay(payload, nights = 5) {
  const byDate = new Map(calendarDays(payload).map(day => [day.date, day]));

  for (const startDate of byDate.keys()) {
    const stayDays = Array.from({ length: nights }, (_, index) => byDate.get(addDays(startDate, index)));
    if (!stayDays.every(isAvailable)) continue;

    return {
      checkIn: startDate,
      checkOut: addDays(startDate, nights),
      nights,
      nightlyPrices: stayDays.map(dayPrice),
      totalPrice: stayDays.reduce((sum, day) => sum + dayPrice(day), 0)
    };
  }

  return null;
}

function recommendation(myPrice, competitors) {
  const prices = competitors.map(item => item.totalStayPrice).filter(Number.isFinite);
  if (prices.length < 2) {
    throw new Error("At least two same-date competitor prices are required");
  }

  const average = prices.reduce((sum, price) => sum + price, 0) / prices.length;
  const lowest = Math.min(...prices);
  const highest = Math.max(...prices);
  const difference = myPrice - average;
  const percentage = average ? difference / average * 100 : 0;
  const roundedChange = Math.round(Math.abs(difference) / 25) * 25;
  const action = percentage > 2
    ? `Lower by $${roundedChange}`
    : percentage < -2
      ? `Raise by $${roundedChange}`
      : "Keep price";
  const direction = percentage >= 0 ? "above" : "below";
  const averageSimilarity = competitors.reduce((sum, item) => sum + item.similarityScore, 0) / competitors.length;
  const spreadRatio = average ? (highest - lowest) / average : 1;
  const confidence = Math.max(50, Math.min(95,
    Math.round(58 + prices.length * 5 + averageSimilarity * 0.18 - spreadRatio * 20)
  ));

  return {
    action,
    reason: `You are currently ${Math.abs(percentage).toFixed(1)}% ${direction} the average comparable property for the exact same stay dates.`,
    confidence,
    average: Math.round(average),
    lowest,
    highest,
    difference: Math.round(difference),
    percentage: Number(percentage.toFixed(2))
  };
}

async function buildLiveAnalysis({
  guestyProperty,
  airbnbListingId,
  competitorEngine,
  nights = 5
}) {
  const stay = findAvailableStay(guestyProperty.calendar, nights);
  if (!stay) {
    throw new Error(`No ${nights}-night Guesty availability with valid nightly prices was found`);
  }

  const set = await competitorEngine.build({
    listingId: airbnbListingId,
    checkIn: stay.checkIn,
    checkOut: stay.checkOut
  });
  const competitors = set.competitors
    .filter(item => Number.isFinite(item.totalStayPrice))
    .slice(0, 5);

  if (competitors.length < 2) {
    throw new Error(
      "Airbnb returned fewer than two priced comparable properties for these exact stay dates"
    );
  }

  return {
    analyzedAt: new Date().toISOString(),
    property: {
      guestyListingId: guestyProperty.listing.id,
      airbnbListingId,
      name: guestyProperty.listing.displayName || guestyProperty.listing.title,
      availableStay: stay,
      totalPrice: stay.totalPrice
    },
    competitors,
    recommendation: recommendation(stay.totalPrice, competitors),
    limitations: [
      "Guesty price is the sum of calendar nightly rates; Airbnb displayed totals may include additional fees, so fee parity is not yet verified.",
      set.enrichmentFailures?.length
        ? `${set.enrichmentFailures.length} Airbnb candidates could not be enriched and were excluded.`
        : null
    ].filter(Boolean).join(" ")
  };
}

module.exports = {
  buildLiveAnalysis,
  calendarDays,
  findAvailableStay,
  recommendation
};
