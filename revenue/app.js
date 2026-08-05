const API_URL = "https://shared-calendar-api.onrender.com/api/revenue-analysis";
const $ = id => document.getElementById(id);
const analyzeBtn = $("analyzeBtn");
const statusEl = $("status");
const errorEl = $("error");
const dashboardEl = $("dashboard");
const money = value => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
const shortDate = value => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));

function escapeHtml(value) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function facts(poolHeatLabel = "No pool heat advertised") {
  return ["Private pool", poolHeatLabel, "No spa", "No pets"];
}

function render(data) {
  const property = data.property;
  const stay = property.availableStay;
  $("propertyName").textContent = property.name;
  $("propertyImage").src = property.imageUrl || "";
  $("propertyImage").alt = `${property.name} main photo`;
  $("propertyFacts").innerHTML = [`${property.bedrooms} BR`, `${property.bathrooms} baths`, `Sleeps ${property.sleeps}`, ...facts("Pool not heated")].map(value => `<span>${escapeHtml(value)}</span>`).join("");
  $("stayDates").textContent = `${shortDate(stay.checkIn)} – ${shortDate(stay.checkOut)}`;
  $("stayNights").textContent = `${stay.nights} nights`;
  $("minimumStay").textContent = `${stay.status}; exact minimum-night rule is not exposed`;
  $("myPrice").textContent = money(property.totalPrice);
  $("competitorCount").textContent = String(data.competitors.length);
  $("competitorList").innerHTML = data.competitors.map((item, index) => `
    <div class="competitor">
      <img class="competitor-image" src="${escapeHtml(item.imageUrl || "")}" alt="">
      <div class="competitor-copy">
        <a href="${escapeHtml(item.listingUrl)}" target="_blank" rel="noopener">${escapeHtml(item.name || `Competitor ${index + 1}`)}</a>
        <small>${escapeHtml(item.bedrooms)} BR · ${escapeHtml(item.bathrooms)} baths · sleeps ${escapeHtml(item.sleeps)} · ${escapeHtml(item.distanceKm)} km</small>
        <div class="fact-row compact">${facts().map(value => `<span>${value}</span>`).join("")}</div>
        <small>${escapeHtml(item.stayStatus)} · exact minimum not exposed</small>
      </div>
      <div class="competitor-price"><strong>${money(item.totalStayPrice)}</strong><small>same-date total</small></div>
    </div>`).join("");
  $("averagePrice").textContent = money(data.recommendation.average);
  $("lowestPrice").textContent = money(data.recommendation.lowest);
  $("highestPrice").textContent = money(data.recommendation.highest);
  $("recommendation").textContent = data.recommendation.action;
  $("reason").textContent = data.recommendation.reason;
  $("confidence").textContent = `${data.recommendation.confidence}%`;
  $("analyzedAt").textContent = `Live analysis: ${new Date(data.analyzedAt).toLocaleString()}`;
  $("limitation").textContent = data.limitations || "";
  dashboardEl.classList.remove("hidden");
}

async function analyze() {
  analyzeBtn.disabled = true;
  analyzeBtn.textContent = "Analyzing…";
  errorEl.classList.add("hidden");
  statusEl.textContent = "Scanning Airbnb availability, then verifying exact-match competitors for the same dates…";
  try {
    const response = await fetch(`${API_URL}?v=${Date.now()}`, { method: "POST", cache: "no-store" });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error([data.message, data.limitation].filter(Boolean).join(" "));
    render(data);
    statusEl.textContent = "Live Airbnb analysis complete.";
  } catch (error) {
    errorEl.textContent = error.message || "Analysis failed.";
    errorEl.classList.remove("hidden");
    statusEl.textContent = "Live analysis could not be completed.";
  } finally {
    analyzeBtn.disabled = false;
    analyzeBtn.textContent = "Analyze";
  }
}

analyzeBtn.addEventListener("click", analyze);
