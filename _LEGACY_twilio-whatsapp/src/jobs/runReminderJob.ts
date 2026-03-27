/**
 * CLI entry to run the 24h reminder job. Schedule with cron every minute:
 * * * * * * cd /path/to/twilio-whatsapp && npm run job:reminders
 */

import dotenv from "dotenv";
dotenv.config();

import { runReminderJob } from "./reminderJob";

runReminderJob()
  .then(({ sent, errors }) => {
    console.log(`Reminders sent: ${sent}, errors: ${errors}`);
    process.exit(errors > 0 ? 1 : 0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
