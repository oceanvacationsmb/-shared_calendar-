const API_URL="https://shared-calendar-api.onrender.com/api/revenue-analysis",$=id=>document.getElementById(id),btn=$("analyzeBtn");
const money=n=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:0}).format(n);
const date=d=>new Intl.DateTimeFormat("en-US",{month:"short",day:"numeric",timeZone:"UTC"}).format(new Date(d+"T00:00:00Z"));
const esc=v=>String(v??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
function render(data){
  const p=data.property;$("propertyImage").src=p.imageUrl;$("propertyName").textContent=p.name;
  const learned=[`<span title="Bedrooms">🛏️ ${p.bedrooms}</span>`,`<span title="Bathrooms">🛁 ${p.bathrooms}</span>`,`<span title="Guests">👥 ${p.sleeps}</span>`,p.pool===true?`<span title="Pool">🏊</span>`:"",p.heatedPool===true?`<span title="Heated pool">🔥🏊</span>`:p.heatedPool===false?`<span title="Pool not heated">❄️🏊</span>`:"",p.spa===true?`<span title="Spa">♨️</span>`:p.spa===false?`<span title="No spa">🚫♨️</span>`:"",p.petsAllowed===true?`<span title="Pets allowed">🐾</span>`:p.petsAllowed===false?`<span title="No pets">🚫🐾</span>`:"",`<span title="Amenities learned">✓ ${p.amenityCount}</span>`].filter(Boolean);
  $("propertyFacts").innerHTML=learned.join("");
  $("dateGrid").innerHTML=data.analyses.map(a=>`<article class="date-card">
    <div class="date-head"><div><b>${date(a.checkIn)} – ${date(a.checkOut)}</b><small>${a.nights} nights</small></div><div class="mine"><small>MY TOTAL</small><strong>${money(a.myTotal)}</strong></div></div>
    <div class="comps">${a.competitors.map(c=>`<a href="${esc(c.listingUrl)}" target="_blank" title="${esc(c.name)}"><img src="${esc(c.imageUrl)}" alt=""><span>${esc(c.name)}</span><b>${money(c.totalStayPrice)}</b></a>`).join("")}</div>
    <div class="range"><span>↓ ${money(a.recommendation.lowest)}</span><strong>Ø ${money(a.recommendation.average)}</strong><span>↑ ${money(a.recommendation.highest)}</span></div>
    <div class="advice ${a.recommendation.adjustmentPercent<0?"down":"up"}"><span>${a.recommendation.adjustmentPercent<0?"↘":"↗"}</span><b>${esc(a.recommendation.action)}</b><small>${Math.abs(a.recommendation.marketDifferencePercent).toFixed(1)}% ${a.recommendation.marketDifferencePercent>=0?"above":"below"} market</small></div>
  </article>`).join("");
  $("analyzedAt").textContent=new Date(data.analyzedAt).toLocaleString();$("limitation").textContent=data.limitations;$("dashboard").classList.remove("hidden");
}
btn.onclick=async()=>{const listingId=$("listingId").value.trim();btn.disabled=true;btn.textContent="Learning…";$("error").classList.add("hidden");$("status").textContent="Learning this listing, then matching competitors and dates…";try{const r=await fetch(`${API_URL}?v=${Date.now()}`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({listingId}),cache:"no-store"}),d=await r.json();if(!r.ok||!d.ok)throw Error(d.message||"Analysis failed");render(d);$("status").textContent="Listing learned. Live comparison complete."}catch(e){$("error").textContent=e.message;$("error").classList.remove("hidden");$("status").textContent="Could not complete the scan."}finally{btn.disabled=false;btn.textContent="Analyze"}};
