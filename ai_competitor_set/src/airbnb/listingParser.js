"use strict";

const { decodeRelayId } = require("./response");

function numberFromText(value, labelPattern) {
  const match = String(value || "").match(new RegExp(`([0-9]+(?:\\.[0-9]+)?)\\s+${labelPattern}\\b`, "i"));
  return match ? Number(match[1]) : null;
}

function localizedText(value) {
  return value?.localizedStringWithTranslationPreference ||
    value?.localizedString ||
    value?.source ||
    value?.text ||
    null;
}

function uniqueAmenities(presentation) {
  const groups = presentation?.amenities?.seeAllAmenitiesGroups ||
    presentation?.amenities?.previewAmenitiesGroups ||
    [];
  const seen = new Set();
  const amenities = [];

  for (const group of groups) {
    for (const item of group?.amenities || []) {
      const key = `${item?.icon || ""}:${String(item?.title || "").toLowerCase()}`;
      if (!item?.title || seen.has(key)) continue;
      seen.add(key);
      amenities.push({
        id: item.id || null,
        name: item.title,
        icon: item.icon || null,
        available: item.available !== false,
        category: group.title || null
      });
    }
  }

  return amenities;
}

function parseListingPayload(payload, expectedListingId = null) {
  const node = payload?.data?.node;
  const presentation = node?.pdpPresentation;

  if (!node || !presentation) {
    throw new Error("Invalid StaysPdpSections payload");
  }

  const overviewItems = presentation.overview?.items || [];
  const amenities = uniqueAmenities(presentation);
  const ratingStats = presentation.quality?.listingRatingStats?.overallRatingStats ||
    node.listingRatingStats?.overallRatingStats || {};
  const shareUrl = presentation.sharingConfig?.shareUrl || "";
  const urlId = shareUrl.match(/\/rooms\/(\d+)/)?.[1] || null;
  const relayId = decodeRelayId(payload?.variables?.id || payload?.variables?.demandStayListingId);
  const listingId = String(expectedListingId || urlId || relayId || "");

  if (!listingId) {
    throw new Error("Listing ID was not found in StaysPdpSections payload");
  }

  const bedrooms = overviewItems.map(item => numberFromText(item, "bedrooms?")).find(Number.isFinite) ?? null;
  const bathrooms = overviewItems.map(item => numberFromText(item, "baths?|bathrooms?")).find(Number.isFinite) ?? null;
  const beds = overviewItems.map(item => numberFromText(item, "beds?")).find(Number.isFinite) ?? null;
  const sleeps = node.personCapacity ?? presentation.personCapacity ??
    overviewItems.map(item => numberFromText(item, "guests?")).find(Number.isFinite) ?? null;
  const pool = amenities.some(item =>
    item.available && (item.icon === "SYSTEM_POOL" || /\bpool\b/i.test(item.name))
  );
  const bookIt = findBookItSection(payload);
  const priceLine = bookIt?.structuredDisplayPrice?.primaryLine;
  const totalStayPrice = parseMoney(priceLine?.price);
  const nights = bookIt?.selectedNights ||
    Number(String(priceLine?.qualifier || "").match(/([0-9]+)\s+nights?/i)?.[1]) ||
    null;

  return {
    listingId,
    listingUrl: `https://www.airbnb.com/rooms/${listingId}`,
    name: localizedText(presentation.title?.content) || localizedText(node.description?.name),
    latitude: node.location?.coordinate?.latitude ?? null,
    longitude: node.location?.coordinate?.longitude ?? null,
    bedrooms,
    bathrooms,
    beds,
    sleeps,
    propertyType: presentation.sharingConfig?.propertyType || presentation.overview?.title || node.spaceType || null,
    spaceType: node.spaceType || null,
    rating: ratingStats.ratingAverage ?? null,
    reviewCount: ratingStats.ratingCount == null ? null : Number(ratingStats.ratingCount),
    amenities,
    amenityNames: amenities.filter(item => item.available).map(item => item.name),
    pool,
    superhost: presentation.hostInfo?.passportData?.isSuperhost ?? null,
    guestFavorite: presentation.quality?.isGuestFavorite ?? node.contextualizedGuestFavorites?.isGuestFavorite ?? null,
    locationName: presentation.localizedLocation || null,
    imageUrl: presentation.sharingConfig?.imageUrl || null,
    pricing: {
      displayedPrice: priceLine?.accessibilityLabel || null,
      totalStayPrice,
      averageNightlyRate: totalStayPrice != null && nights ? totalStayPrice / nights : null,
      nights,
      currency: "USD"
    },
    metadata: {
      pdpType: presentation.pdpType || null,
      isNewListing: presentation.quality?.isNewListing ?? null,
      canInstantBook: findBookItValue(payload, "canInstantBook"),
      petsAllowed: findBookItValue(payload, "petsAllowed")
    }
  };
}

function findBookItValue(payload, key) {
  return findBookItSection(payload)?.[key] ?? null;
}

function findBookItSection(payload) {
  const sections = payload?.data?.presentation?.stayProductDetailPage?.sections?.sections || [];
  const section = sections.find(item => item?.section?.__typename === "BookItSection");
  return section?.section || null;
}

function parseMoney(value) {
  if (!value) return null;
  const amount = Number(String(value).replace(/[^0-9.,-]/g, "").replace(/,/g, ""));
  return Number.isFinite(amount) ? amount : null;
}

module.exports = { parseListingPayload };
