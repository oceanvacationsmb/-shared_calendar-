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

function findDateArrays(obj, found = []) {
  if (!obj || typeof obj !== "object") return found;

  if (Array.isArray(obj)) {
    const hasDateObjects = obj.some(item => {
      if (!item || typeof item !== "object") return false;

      return Boolean(
        item.date ||
        item.day ||
        item.startDate ||
        item.start ||
        item.calendarDate
      );
    });

    if (hasDateObjects) found.push(obj);

    obj.forEach(item => findDateArrays(item, found));
    return found;
  }

  Object.values(obj).forEach(value => findDateArrays(value, found));
  return found;
}

function getCalendarDays(rawData) {
  const arrays = findDateArrays(rawData);

  if (!arrays.length) return [];

  arrays.sort((a, b) => b.length - a.length);
  return arrays[0];
}

function cleanDate(value) {
  if (!value) return null;
  return String(value).substring(0, 10);
}

function getDayDate(day) {
  return cleanDate(
    day.date ||
    day.day ||
    day.startDate ||
    day.start ||
    day.calendarDate ||
    null
  );
}

function getBookingKey(day) {
  const reservation =
    day.reservation ||
    day.booking ||
    day.reservationData ||
    day.bookingData ||
    day.reservationInfo ||
    day.bookingInfo ||
    null;

  return (
    day.reservationId ||
    day.reservation_id ||
    day.bookingId ||
    day.booking_id ||
    day.confirmationCode ||
    day.confirmation_code ||
    day.blockId ||
    day.block_id ||
    day.guestyReservationId ||
    day.guesty_reservation_id ||
    reservation?._id ||
    reservation?.id ||
    reservation?.reservationId ||
    reservation?.bookingId ||
    reservation?.confirmationCode ||
    null
  );
}

function isBookedDay(day) {
  const status = String(
    day.status ||
    day.availability ||
    day.type ||
    day.reason ||
    day.blockType ||
    day.block_type ||
    ""
  ).toLowerCase();

  const availableValue =
    day.available ??
    day.isAvailable ??
    day.availabilityStatus;

  if (getBookingKey(day)) return true;
  if (day.reservation || day.booking || day.reservationData || day.bookingData) return true;

  if (availableValue === false) return true;
  if (day.booked === true) return true;
  if (day.isBooked === true) return true;
  if (day.occupied === true) return true;
  if (day.isOccupied === true) return true;

  return (
    status.includes("booked") ||
    status.includes("reserved") ||
    status.includes("reservation") ||
    status.includes("occupied") ||
    status.includes("unavailable") ||
    status.includes("blocked")
  );
}

function normalizeBookingsFromCalendar(rawData) {
  const rawDays = getCalendarDays(rawData);

  const days = rawDays
    .map(day => ({
      date: getDayDate(day),
      booked: isBookedDay(day),
      bookingKey: getBookingKey(day)
    }))
    .filter(day => day.date)
    .sort((a, b) => a.date.localeCompare(b.date));

  const bookings = [];
  let currentBooking = null;

  for (const day of days) {
    if (!day.booked) {
      if (currentBooking) {
        bookings.push(currentBooking);
        currentBooking = null;
      }
      continue;
    }

    if (!currentBooking) {
      currentBooking = {
        checkIn: day.date,
        checkOut: addDays(day.date, 1),
        bookingKey: day.bookingKey || null
      };
      continue;
    }

    const sameBooking =
      currentBooking.bookingKey &&
      day.bookingKey &&
      String(currentBooking.bookingKey) === String(day.bookingKey);

    const noBookingKeys =
      !currentBooking.bookingKey &&
      !day.bookingKey;

    if (sameBooking || noBookingKeys) {
      currentBooking.checkOut = addDays(day.date, 1);
      continue;
    }

    bookings.push({
      checkIn: currentBooking.checkIn,
      checkOut: day.date,
      bookingKey: currentBooking.bookingKey || null
    });

    currentBooking = {
      checkIn: day.date,
      checkOut: addDays(day.date, 1),
      bookingKey: day.bookingKey || null
    };
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

    const events = [];

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

    if (!checkout && !checkin && stay) {
      events.push({
        date,
        type: "stay",
        label: "Guest stay"
      });
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
