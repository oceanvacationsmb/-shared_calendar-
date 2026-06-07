const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json());

const GUESTY_CLIENT_ID = process.env.GUESTY_CLIENT_ID;
const GUESTY_CLIENT_SECRET = process.env.GUESTY_CLIENT_SECRET;

// Add your Guesty listing IDs here
const PROPERTIES = [
  {
    nickname: "827B Murrells Inlet",
    listingId: "68db1a3f34efe70012fd1284"
  }
];

function todayString() {
  return new Date().toISOString().split("T")[0];
}

function addDays(dateString, days) {
  const d = new Date(dateString + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
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

async function getListingCalendar(token, listingId, from, to) {
  const url = `https://booking.guesty.com/api/listings/${listingId}/calendar?from=${from}&to=${to}`;

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
      listingId,
      guestyError: data
    }));
  }

  return data;
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

  if (day.reservationId || day.reservation || day.bookingId || day.booking) {
    return true;
  }

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

  if (currentBooking) {
    bookings.push(currentBooking);
  }

  return bookings;
}

function buildDailyEvents(bookings, from, to) {
  const events = [];
  let date = from;

  while (date < to) {
    const dayEvents = [];

    const checkout = bookings.find(b => b.checkOut === date);
    const checkin = bookings.find(b => b.checkIn === date);
    const stay = bookings.find(b => date > b.checkIn && date < b.checkOut);

    if (checkout && checkin) {
      dayEvents.push({
        date,
        type: "turnover",
        label: "Checkout / Check-in"
      });
    } else {
      if (checkout) {
        dayEvents.push({
          date,
          type: "checkout",
          label: "Checkout"
        });
      }

      if (checkin) {
        dayEvents.push({
          date,
          type: "checkin",
          label: "Check-in"
        });
      }

      if (stay) {
        dayEvents.push({
          date,
          type: "stay",
          label: "Guest stay"
        });
      }
    }

    events.push({
      date,
      events: dayEvents
    });

    date = addDays(date, 1);
  }

  return events;
}

app.get("/", (req, res) => {
  res.json({
    ok: true,
    message: "Shared Calendar API is working"
  });
});

app.get("/api/test-guesty-auth", async (req, res) => {
  try {
    if (!GUESTY_CLIENT_ID || !GUESTY_CLIENT_SECRET) {
      return res.status(500).json({
        ok: false,
        message: "Missing Guesty environment variables"
      });
    }

    const token = await getGuestyToken();

    res.json({
      ok: true,
      message: "Guesty auth connected",
      tokenPreview: token ? token.substring(0, 12) + "..." : null
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      message: err.message || "Guesty auth failed"
    });
  }
});

app.get("/api/test-listing-calendar", async (req, res) => {
  try {
    const token = await getGuestyToken();

    const listingId = req.query.listingId || PROPERTIES[0].listingId;
    const from = req.query.from || todayString();
    const to = req.query.to || addDays(from, 30);

    const data = await getListingCalendar(token, listingId, from, to);

    res.json({
      ok: true,
      listingId,
      from,
      to,
      rawData: data
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      message: err.message || "Calendar test failed"
    });
  }
});

app.get("/api/shared-calendar", async (req, res) => {
  try {
    const token = await getGuestyToken();

    const start = req.query.start || todayString();
    const end = req.query.end || addDays(start, 30);

    const properties = [];

    for (const property of PROPERTIES) {
      const rawCalendar = await getListingCalendar(
        token,
        property.listingId,
        start,
        end
      );

      const bookings = normalizeBookingsFromCalendar(rawCalendar);
      const days = buildDailyEvents(bookings, start, end);

      properties.push({
        nickname: property.nickname,
        name: property.nickname,
        listingId: property.listingId,
        bookings,
        days
      });
    }

    res.json({
      ok: true,
      start,
      end,
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
