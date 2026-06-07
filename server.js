const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.json({
    ok: true,
    message: "Shared Calendar API is working"
  });
});

app.get("/api/shared-calendar", async (req, res) => {
  const { start, end } = req.query;

  res.json({
    ok: true,
    start: start || null,
    end: end || null,
    properties: [
      {
        name: "Test Property",
        bookings: [
          {
            checkIn: "2026-06-10",
            checkOut: "2026-06-14"
          }
        ]
      }
    ]
  });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Shared Calendar API running on port ${PORT}`);
});
