/**
 * Express server: Twilio WhatsApp webhook + optional cron trigger for reminder job.
 * Run: npm run dev or npm start
 */

import express from "express";
import qs from "querystring";
import { validateTwilioWhatsAppSignature } from "./middleware/validateTwilioSignature";
import { handleInboundWhatsApp } from "./webhooks/twilioWhatsapp";
import { validateConfig } from "./config";

validateConfig();

const app = express();

// Health check
app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

// Webhook: capture raw body for signature validation, then parse and validate
app.post(
  "/webhooks/twilio/whatsapp",
  (req, res, next) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => {
      (req as express.Request & { rawBody?: string }).rawBody = data;
      req.body = qs.parse(data);
      next();
    });
  },
  validateTwilioWhatsAppSignature,
  (req, res) => {
    handleInboundWhatsApp(req, res).catch((e) => {
      console.error("[webhook] Error:", e);
      res.status(500).send("Internal error");
    });
  }
);

// JSON/urlencoded for other routes (e.g. cron)
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// Optional: trigger reminder job via HTTP (e.g. from cron-job.org or Vercel cron)
// Secure with a secret: ?secret=YOUR_CRON_SECRET
app.post("/cron/reminders", (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (secret && req.query?.secret !== secret) {
    res.status(403).send("Forbidden");
    return;
  }
  const { runReminderJob } = require("./jobs/reminderJob");
  runReminderJob()
    .then(({ sent, errors }) => res.json({ sent, errors }))
    .catch((e) => {
      console.error(e);
      res.status(500).json({ error: String(e) });
    });
});

const port = process.env.PORT || 3001;
app.listen(port, () => {
  console.log(`Twilio WhatsApp service listening on port ${port}`);
  console.log(`Webhook URL: POST /webhooks/twilio/whatsapp`);
});
