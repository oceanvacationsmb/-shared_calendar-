const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json());

const GUESTY_CLIENT_ID = process.env.GUESTY_CLIENT_ID;
const GUESTY_CLIENT_SECRET = process.env.GUESTY_CLIENT_SECRET;

function todayString() {
  const d = new Date();

  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function addDays(dateString, days) {
  const d = new Date(dateString + "T00:00:00");
  d.setDate(d.getDate() + days);

  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

async function getGuestyToken() {
  const response = await fetch("https://booking.guesty.com/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: GUESTY_CLIENT_ID,
      client_secret: GUESTY_CLIENT_SECRET
    })
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(JSON.stringify({
      status: response.status,
      guestyError: data
    }));
  }

  return data.access_token;
}

async function guestyGet(token, url) {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      accept: "application/json",
      authorization: `Bearer ${token}`
    }
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(JSON.stringify({
      status: response.status,
      url,
      guestyError: data
    }));
  }

  return data;
}

function normalizeListings(rawData) {
  let list = [];

  if (Array.isArray(rawData)) list = rawData;
  else if (Array.isArray(rawData.results)) list = rawData.results;
  else if (Array.isArray(rawData.data)) list = rawData.data;
  else if (Array.isArray(rawData.listings)) list = rawData.listings;

  return list
    .map(item => {
      const listingId =
        item._id ||
        item.id ||
        item.listingId ||
        item.listing_id;

      const nickname =
        item.nickname ||
        item.nickName ||
        item.internalName ||
        item.title ||
        item.name ||
        item.publicName ||
        listingId;

      return {
        listingId,
        nickname
      };
    })
    .filter(item => item.listingId)
    .sort((a, b) => String(a.nickname).localeCompare(String(b.nickname)));
}

async function getAllListings(token) {
  const url = "https://booking.guesty.com/api/listings?limit=100";
  const rawData = await guestyGet(token, url);
  return normalizeListings(rawData);
}

async function getListingCalendar(token, listingId, from, to) {
  const url = `https://booking.guesty.com/api/listings/${listingId}/calendar?from=${from}&to=${to}`;
  return await guestyGet(token, url);
}

function getCalendarDays(rawData) {
  if (Array.isArray(rawData)) return rawData;
  if (Array.isArray(rawData.days)) return rawData.days;
  if (Array.isArray(rawData.calendar)) return rawData.calendar;
  if (Array.isArray(rawData.data)) return rawData.data;
  if (Array.isArray(rawData.results)) return rawData.results;
  return [];
}

function getDayDate(day) {
  return (
    day.date ||
    day.day ||
    day.startDate ||
    day.start ||
    day.calendarDate ||
    null
  );
}

function isBookedDay(day) {
  const status = String(
    day.status ||
    day.availability ||
    day.available ||
    day.type ||
    ""
  ).toLowerCase();

  if (day.reservationId || day.reservation || day.bookingId || day.booking) return true;
  if (day.isAvailable === false) return true;
  if (day.available === false) return true;
  if (day.booked === true) return true;

  return (
    status.includes("booked") ||
    status.includes("reserved") ||
    status.includes("occupied") ||
    status.includes("unavailable")
  );
}

function normalizeBookingsFromCalendar(rawData) {
  const days = getCalendarDays(rawData)
    .map(day => ({
      date: getDayDate(day),
      booked: isBookedDay(day)
    }))
    .filter(day => day.date)
    .sort((a, b) => a.date.localeCompare(b.date));

  const bookings = [];
  let currentBooking = null;

  for (const day of days) {
    if (day.booked && !currentBooking) {
      currentBooking = {
        checkIn: day.date,
        checkOut: addDays(day.date, 1)
      };
      continue;
    }

    if (day.booked && currentBooking) {
      currentBooking.checkOut = addDays(day.date, 1);
      continue;
    }

    if (!day.booked && currentBooking) {
      bookings.push(currentBooking);
      currentBooking = null;
    }
  }

  if (currentBooking) bookings.push(currentBooking);

  return bookings;
}

function buildDailyEvents(bookings, from, to) {
  const days = [];
  let date = from;

  while (date < to) {
    const checkout = bookings.find(b => b.checkOut === date);
    const checkin = bookings.find(b => b.checkIn === date);
    const stay = bookings.find(b => date > b.checkIn && date < b.checkOut);

    let events = [];

    if (checkout && checkin) {
      events.push({
        date,
        type: "turnover",
        label: "Checkout / Check-in"
      });
    } else {
      if (checkout) {
        events.push({
          date,
          type: "checkout",
          label: "Checkout"
        });
      }

      if (checkin) {
        events.push({
          date,
          type: "checkin",
          label: "Check-in"
        });
      }

      if (stay) {
        events.push({
          date,
          type: "stay",
          label: "Guest stay"
        });
      }
    }

    days.push({
      date,
      events
    });

    date = addDays(date, 1);
  }

  return days;
}

app.get("/", (req, res) => {
  res.json({
    ok: true,
    message: "Shared Calendar API is working"
  });
});

app.get("/api/test-guesty-auth", async (req, res) => {
  try {
    const token = await getGuestyToken();

    res.json({
      ok: true,
      message: "Guesty auth connected",
      tokenPreview: token ? token.substring(0, 12) + "..." : null
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      message: err.message
    });
  }
});

app.get("/api/test-listings", async (req, res) => {
  try {
    const token = await getGuestyToken();
    const listings = await getAllListings(token);

    res.json({
      ok: true,
      count: listings.length,
      listings
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      message: err.message
    });
  }
});

app.get("/api/shared-calendar", async (req, res) => {
  try {
    const token = await getGuestyToken();

    const start = req.query.start || todayString();
    const end = req.query.end || addDays(start, 14);

    const listings = await getAllListings(token);
    const properties = [];

    for (const listing of listings) {
      try {
        const rawCalendar = await getListingCalendar(
          token,
          listing.listingId,
          start,
          end
        );

        const bookings = normalizeBookingsFromCalendar(rawCalendar);
        const days = buildDailyEvents(bookings, start, end);

        properties.push({
          nickname: listing.nickname,
          name: listing.nickname,
          listingId: listing.listingId,
          bookings,
          days
        });
      } catch (err) {
        properties.push({
          nickname: listing.nickname,
          name: listing.nickname,
          listingId: listing.listingId,
          error: true,
          message: err.message,
          bookings: [],
          days: buildDailyEvents([], start, end)
        });
      }
    }

    res.json({
      ok: true,
      start,
      end,
      count: properties.length,
      properties
    });
  } catch (err) {
    console.error("Shared calendar error:", err);

    res.status(500).json({
      ok: false,
      message: err.message || "Shared calendar failed"
    });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Shared Calendar API running on port ${PORT}`);
});
