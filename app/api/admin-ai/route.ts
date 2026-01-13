import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import OpenAI from "openai";
import { adminDb } from "@/lib/firebaseAdmin";
import { Timestamp } from "firebase-admin/firestore";

const requestSchema = z.object({
  siteId: z.string(),
  messages: z.array(
    z.object({
      role: z.enum(["user", "assistant", "system"]),
      content: z.string(),
    })
  ),
});

// Worker lookup helpers
async function listWorkers(siteId: string) {
  try {
    // Get workers from workers collection
    const workersSnapshot = await adminDb
      .collection("sites")
      .doc(siteId)
      .collection("workers")
      .get();

    if (!workersSnapshot.empty) {
      return workersSnapshot.docs
        .map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            name: data.name || "",
          };
        })
        .filter((w) => w.name); // Filter out workers without names
    }

    return [];
  } catch (err) {
    console.error("Error listing workers:", err);
    return [];
  }
}

async function findWorkerByName(siteId: string, name: string) {
  const workers = await listWorkers(siteId);
  const lowerName = name.toLowerCase().trim();
  const matches = workers.filter((w) =>
    w.name.toLowerCase().includes(lowerName)
  );
  return matches;
}

/**
 * Convert Date to ISO string (YYYY-MM-DD) using local components (not toISOString)
 */
function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Date parsing helper for Hebrew dates
function parseHebrewDate(input: string): string | null {
  const lower = input.toLowerCase().trim();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Handle "היום" (today)
  if (lower === "היום" || lower.includes("היום")) {
    return toISO(today);
  }

  // Handle "מחר" (tomorrow)
  if (lower === "מחר" || lower.includes("מחר")) {
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return toISO(tomorrow);
  }

  // Try parsing ISO format (YYYY-MM-DD)
  const isoMatch = input.match(/^\d{4}-\d{2}-\d{2}$/);
  if (isoMatch) {
    return isoMatch[0];
  }

  // Try parsing DD/MM/YYYY or DD-MM-YYYY
  const dateMatch = input.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-]?(\d{4})?/);
  if (dateMatch) {
    const day = parseInt(dateMatch[1]);
    const month = parseInt(dateMatch[2]);
    const year = dateMatch[3] ? parseInt(dateMatch[3]) : today.getFullYear();
    if (day > 0 && day <= 31 && month > 0 && month <= 12) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  return null;
}

// Booking retrieval helpers
type BookingDTO = {
  id: string;
  date: string;
  time: string;
  workerId: string | null;
  workerName: string | null;
  serviceName: string;
  customerName: string;
  customerPhone: string;
  price: number;
  note: string;
  startAt: Date | null;
};

function dayRangeTimestamps(dateISO: string): { start: Timestamp; end: Timestamp } {
  const startDate = new Date(dateISO + "T00:00:00");
  const endDate = new Date(dateISO + "T23:59:59.999");
  return {
    start: Timestamp.fromDate(startDate),
    end: Timestamp.fromDate(endDate),
  };
}

function normalizeBooking(docId: string, data: any): BookingDTO {
  const startAt = data.startAt
    ? data.startAt.toDate
      ? data.startAt.toDate()
      : null
    : null;

  return {
    id: docId,
    date: data.date || data.dateISO || "",
    time: data.time || data.timeHHmm || "",
    workerId: data.workerId || null,
    workerName: data.workerName || "",
    serviceName: data.serviceName || "",
    customerName: data.customerName || "",
    customerPhone: data.customerPhone || "",
    price: Number(data.price || 0),
    note: data.note || "",
    startAt,
  };
}

async function getBookingsForDayAnyStorage(
  siteId: string,
  dateISO: string
): Promise<BookingDTO[]> {
  console.log("[getBookingsForDayAnyStorage] querying", { siteId, dateISO });

  const allBookings: BookingDTO[] = [];
  const seenIds = new Set<string>();

  // Strategy A: sites/{siteId}/bookings where("date", "==", dateISO)
  try {
    const snapA = await adminDb
      .collection("sites")
      .doc(siteId)
      .collection("bookings")
      .where("date", "==", dateISO)
      .orderBy("time", "asc")
      .get();
    console.log("[getBookingsForDayAnyStorage] Strategy A (sites subcollection by date):", snapA.docs.length);
    snapA.docs.forEach((doc) => {
      if (!seenIds.has(doc.id)) {
        allBookings.push(normalizeBooking(doc.id, doc.data()));
        seenIds.add(doc.id);
      }
    });
  } catch (err: any) {
    console.warn("[getBookingsForDayAnyStorage] Strategy A failed:", err.message);
  }

  // Strategy B: top-level bookings where("siteId","==",siteId).where("date","==",dateISO)
  try {
    const snapB = await adminDb
      .collection("bookings")
      .where("siteId", "==", siteId)
      .where("date", "==", dateISO)
      .orderBy("time", "asc")
      .get();
    console.log("[getBookingsForDayAnyStorage] Strategy B (top-level by date):", snapB.docs.length);
    snapB.docs.forEach((doc) => {
      if (!seenIds.has(doc.id)) {
        allBookings.push(normalizeBooking(doc.id, doc.data()));
        seenIds.add(doc.id);
      }
    });
  } catch (err: any) {
    console.warn("[getBookingsForDayAnyStorage] Strategy B failed:", err.message);
  }

  // If we found bookings by date, return them
  if (allBookings.length > 0) {
    console.log("[getBookingsForDayAnyStorage] Returning", allBookings.length, "bookings from date queries");
    return allBookings;
  }

  // Fallback: Try by startAt range
  const { start, end } = dayRangeTimestamps(dateISO);

  // Strategy C: sites/{siteId}/bookings where("startAt", ">=", start).where("startAt","<=", end)
  try {
    const snapC = await adminDb
      .collection("sites")
      .doc(siteId)
      .collection("bookings")
      .where("startAt", ">=", start)
      .where("startAt", "<=", end)
      .orderBy("startAt", "asc")
      .get();
    console.log("[getBookingsForDayAnyStorage] Strategy C (sites subcollection by startAt):", snapC.docs.length);
    snapC.docs.forEach((doc) => {
      if (!seenIds.has(doc.id)) {
        allBookings.push(normalizeBooking(doc.id, doc.data()));
        seenIds.add(doc.id);
      }
    });
  } catch (err: any) {
    console.warn("[getBookingsForDayAnyStorage] Strategy C failed:", err.message);
  }

  // Strategy D: top-level bookings where("siteId","==",siteId).where("startAt", ">=", start).where("startAt","<=", end)
  try {
    const snapD = await adminDb
      .collection("bookings")
      .where("siteId", "==", siteId)
      .where("startAt", ">=", start)
      .where("startAt", "<=", end)
      .orderBy("startAt", "asc")
      .get();
    console.log("[getBookingsForDayAnyStorage] Strategy D (top-level by startAt):", snapD.docs.length);
    snapD.docs.forEach((doc) => {
      if (!seenIds.has(doc.id)) {
        allBookings.push(normalizeBooking(doc.id, doc.data()));
        seenIds.add(doc.id);
      }
    });
  } catch (err: any) {
    console.warn("[getBookingsForDayAnyStorage] Strategy D failed:", err.message);
  }

  // Sort by time if exists, else by startAt
  allBookings.sort((a, b) => {
    if (a.time && b.time) {
      return a.time.localeCompare(b.time);
    }
    if (a.startAt && b.startAt) {
      return a.startAt.getTime() - b.startAt.getTime();
    }
    return 0;
  });

  console.log("[getBookingsForDayAnyStorage] Final result:", allBookings.length, "bookings");
  return allBookings;
}

// Tool implementations
async function getTodaysSchedule(
  siteId: string,
  workerId?: string,
  workerName?: string,
  dateISO?: string
) {
  console.log("[getTodaysSchedule] called", { siteId, workerId, workerName, dateISO });

  // Parse date if provided as Hebrew
  let targetDateISO = dateISO;
  if (targetDateISO) {
    const parsed = parseHebrewDate(targetDateISO);
    if (parsed) {
      targetDateISO = parsed;
    }
  }

  // Default to today if not provided
  if (!targetDateISO) {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, "0");
    const d = String(today.getDate()).padStart(2, "0");
    targetDateISO = `${y}-${m}-${d}`;
  }

  let resolvedWorkerId = workerId;

  if (!resolvedWorkerId && workerName) {
    const matches = await findWorkerByName(siteId, workerName);
    if (matches.length === 0) {
      const allWorkers = await listWorkers(siteId);
      return {
        kind: "need_clarification",
        message: `לא נמצא עובד בשם "${workerName}".`,
        options: allWorkers.slice(0, 5).map((w) => ({
          id: w.id,
          name: w.name,
        })),
      };
    }
    if (matches.length > 1) {
      return {
        kind: "need_clarification",
        message: `נמצאו מספר עובדים:`,
        options: matches.map((w) => ({ id: w.id, name: w.name })),
      };
    }
    resolvedWorkerId = matches[0].id;
  }

  console.log("[AI] schedule request", { siteId, dateISO: targetDateISO, workerId: resolvedWorkerId });

  try {
    // Use multi-strategy approach: try both storage paths
    const allBookings = await getBookingsForDayAnyStorage(siteId, targetDateISO);

    console.log("[AI] getTodaysSchedule - bookings returned", allBookings.length);

    // Filter by worker if specified
    let bookings = allBookings;
    if (resolvedWorkerId) {
      bookings = allBookings.filter((b) => b.workerId === resolvedWorkerId);
      console.log("[AI] filtered by worker", bookings.length);
    }

    const dateLabel = new Date(targetDateISO + "T00:00:00").toLocaleDateString("he-IL");

    const formatted = bookings.map((b) => ({
      id: b.id,
      time: b.time,
      workerName: b.workerName || "",
      serviceName: b.serviceName || "",
      customerName: b.customerName || "",
      phone: b.customerPhone || "",
      price: b.price || 0,
      date: dateLabel,
    }));

    return {
      kind: "schedule",
      data: formatted,
      date: dateLabel,
    };
  } catch (err: any) {
    console.error("[AI bookings] failed", { siteId, dateISO: targetDateISO, err: err?.message || String(err) });
    return {
      kind: "text",
      error: "BOOKINGS_LOAD_FAILED",
      text: `שגיאה בטעינת הלוח זמנים: ${err?.message || String(err)}`,
    };
  }
}

// New tool: list all bookings for a date (no worker filter)
async function listBookings(siteId: string, dateISO?: string) {
  console.log("[listBookings] called", { siteId, dateISO });

  // Parse date if provided as Hebrew
  let targetDateISO = dateISO;
  if (targetDateISO) {
    const parsed = parseHebrewDate(targetDateISO);
    if (parsed) {
      targetDateISO = parsed;
    }
  }

  // Default to today if not provided
  if (!targetDateISO) {
    targetDateISO = toISO(new Date());
  }

  console.log("[AI] schedule request", { siteId, dateISO: targetDateISO });

  try {
    // Use multi-strategy approach: try both storage paths
    const bookings = await getBookingsForDayAnyStorage(siteId, targetDateISO);

    console.log("[AI] listBookings - bookings returned", bookings.length);

    const dateLabel = new Date(targetDateISO + "T00:00:00").toLocaleDateString("he-IL");

    if (bookings.length === 0) {
      return {
        kind: "text",
        text: `אין תורים בתאריך ${dateLabel}.`,
      };
    }

    const formatted = bookings.map((b) => ({
      id: b.id,
      time: b.time,
      workerName: b.workerName || "",
      serviceName: b.serviceName || "",
      customerName: b.customerName || "",
      phone: b.customerPhone || "",
      price: b.price || 0,
      date: dateLabel,
    }));

    return {
      kind: "schedule",
      data: formatted,
      date: dateLabel,
    };
  } catch (err: any) {
    console.error("[AI bookings] failed", { siteId, dateISO: targetDateISO, err: err?.message || String(err) });
    return {
      kind: "text",
      error: "BOOKINGS_LOAD_FAILED",
      text: `שגיאה בטעינת התורים: ${err?.message || String(err)}`,
    };
  }
}

async function createBooking(
  siteId: string,
  serviceName: string,
  dateISO: string,
  time: string,
  customerName: string,
  workerId?: string,
  workerName?: string,
  customerPhone?: string,
  note?: string,
  price?: number,
  durationMin?: number
) {
  let resolvedWorkerId = workerId;

  if (!resolvedWorkerId && workerName) {
    const matches = await findWorkerByName(siteId, workerName);
    if (matches.length === 0) {
      const allWorkers = await listWorkers(siteId);
      return {
        kind: "need_clarification",
        message: `לא נמצא עובד בשם "${workerName}".`,
        options: allWorkers.slice(0, 5).map((w) => ({ id: w.id, name: w.name })),
      };
    }
    if (matches.length > 1) {
      return {
        kind: "need_clarification",
        message: `נמצאו מספר עובדים:`,
        options: matches.map((w) => ({ id: w.id, name: w.name })),
      };
    }
    resolvedWorkerId = matches[0].id;
  }

  if (!resolvedWorkerId) {
    const allWorkers = await listWorkers(siteId);
    return {
      kind: "need_clarification",
      message: "נא לבחור עובד:",
      options: allWorkers.slice(0, 5).map((w) => ({ id: w.id, name: w.name })),
    };
  }

  try {
    // Parse dateISO (handle Hebrew dates)
    let parsedDateISO = dateISO;
    const parsed = parseHebrewDate(dateISO);
    if (parsed) {
      parsedDateISO = parsed;
    }

    // Parse time
    const [hours, minutes] = time.split(":").map(Number);
    const [year, month, day] = parsedDateISO.split("-").map(Number);
    
    // Create startAt in local timezone
    const startAt = new Date(year, month - 1, day, hours, minutes, 0, 0);
    const duration = durationMin || 60;
    const endAt = new Date(startAt.getTime() + duration * 60 * 1000);

    const bookingData = {
      siteId: siteId, // Include siteId for top-level queries
      workerId: resolvedWorkerId,
      workerName: workerName || "",
      serviceName,
      customerName,
      customerPhone: customerPhone || "",
      note: note || "",
      price: price || 0,
      // Legacy fields (for backward compatibility)
      date: parsedDateISO,
      time: time,
      // New canonical fields (always present)
      dateISO: parsedDateISO,
      timeHHmm: time,
      startAt: Timestamp.fromDate(startAt),
      endAt: Timestamp.fromDate(endAt),
      status: "confirmed",
      durationMin: duration,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    const docRef = await adminDb
      .collection("sites")
      .doc(siteId)
      .collection("bookings")
      .add(bookingData);

    return {
      kind: "booking_created",
      data: {
        id: docRef.id,
        ...bookingData,
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString(),
      },
    };
  } catch (err) {
    console.error("Error creating booking:", err);
    return {
      kind: "text",
      text: "שגיאה ביצירת התור.",
    };
  }
}

async function getRevenueThisMonth(siteId: string, monthISO?: string) {
  const targetDate = monthISO ? new Date(monthISO) : new Date();
  const startOfMonth = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1);
  const endOfMonth = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0, 23, 59, 59, 999);

  try {
    const snapshot = await adminDb
      .collection("sites")
      .doc(siteId)
      .collection("bookings")
      .where("startAt", ">=", Timestamp.fromDate(startOfMonth))
      .where("startAt", "<=", Timestamp.fromDate(endOfMonth))
      .get();

    let totalRevenue = 0;
    let countBookings = 0;

    snapshot.docs.forEach((doc) => {
      const data = doc.data();
      const price = data.price || 0;
      totalRevenue += price;
      countBookings++;
    });

    const monthLabel = targetDate.toLocaleDateString("he-IL", {
      year: "numeric",
      month: "long",
    });

    return {
      kind: "revenue",
      data: {
        totalRevenue,
        countBookings,
        monthLabel,
      },
    };
  } catch (err) {
    console.error("Error fetching revenue:", err);
    return {
      kind: "text",
      text: "שגיאה בטעינת ההכנסות.",
    };
  }
}

async function loadSiteContext(siteId: string) {
  try {
    // Load site config
    const siteDoc = await adminDb.collection("sites").doc(siteId).get();
    const siteData = siteDoc.exists ? siteDoc.data() : null;
    const config = siteData?.config || {};

    // Load workers
    const workers = await listWorkers(siteId);

    // Load today's bookings using the multi-strategy helper
    const todayISO = toISO(new Date());
    const todayBookingsRaw = await getBookingsForDayAnyStorage(siteId, todayISO);
    const todayBookings = todayBookingsRaw.slice(0, 200).map((b) => ({
      id: b.id,
      workerId: b.workerId || "",
      workerName: b.workerName || "",
      serviceName: b.serviceName || "",
      customerName: b.customerName || "",
      customerPhone: b.customerPhone || "",
      time: b.time,
      price: b.price || 0,
      note: b.note || "",
    }));

    // Load service pricing
    const servicePricing = config.servicePricing || {};

    // Load reviews (limited to 50)
    const reviews = Array.isArray(config.reviews) ? config.reviews.slice(0, 50) : [];

    // Load FAQs (limited to 50)
    const faqs = Array.isArray(config.faqs) ? config.faqs.slice(0, 50) : [];

    // Load booking settings (opening hours)
    const bookingSettingsDoc = await adminDb
      .collection("sites")
      .doc(siteId)
      .collection("settings")
      .doc("booking")
      .get();
    
    const bookingSettings = bookingSettingsDoc.exists ? bookingSettingsDoc.data() : null;
    const openingHours = bookingSettings?.openingHours || [];

    return {
      salonName: config.salonName || "הסלון",
      services: config.services || [],
      servicePricing,
      workers: workers,
      city: config.city || "",
      address: config.address || "",
      phoneNumber: config.phoneNumber || "",
      whatsappNumber: config.whatsappNumber || "",
      email: config.contactEmail || "",
      todayBookings,
      reviews,
      faqs,
      openingHours,
      themeColors: config.themeColors || {},
    };
  } catch (err) {
    console.error("Error loading site context:", err);
    return {
      salonName: "הסלון",
      services: [],
      servicePricing: {},
      workers: [],
      city: "",
      address: "",
      phoneNumber: "",
      whatsappNumber: "",
      email: "",
      todayBookings: [],
      reviews: [],
      faqs: [],
      openingHours: [],
      themeColors: {},
    };
  }
}

async function validateWorkerBelongsToSite(siteId: string, workerId: string): Promise<boolean> {
  try {
    const workerDoc = await adminDb
      .collection("sites")
      .doc(siteId)
      .collection("workers")
      .doc(workerId)
      .get();
    return workerDoc.exists;
  } catch (err) {
    console.error("Error validating worker:", err);
    return false;
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = requestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request body. Missing siteId or messages." },
        { status: 400 }
      );
    }

    const { siteId, messages } = parsed.data;

    if (!siteId || typeof siteId !== "string" || siteId.trim() === "") {
      return NextResponse.json(
        { error: "Missing siteId" },
        { status: 400 }
      );
    }

    console.log("[AI] received request", { siteId, messageCount: messages.length });

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY not configured" },
        { status: 500 }
      );
    }

    // Load full site context
    const siteContext = await loadSiteContext(siteId);
    
    // Build compact context JSON
    const contextJson = JSON.stringify({
      salon: {
        name: siteContext.salonName,
        city: siteContext.city,
        address: siteContext.address,
        phone: siteContext.phoneNumber,
        whatsapp: siteContext.whatsappNumber,
        email: siteContext.email,
      },
      services: siteContext.services.map((s: string) => ({
        name: s,
        price: siteContext.servicePricing[s] || null,
      })),
      workers: siteContext.workers,
      openingHours: siteContext.openingHours,
      todayBookings: siteContext.todayBookings,
      reviewsCount: siteContext.reviews.length,
      faqsCount: siteContext.faqs.length,
    }, null, 2);

    const openai = new OpenAI({ apiKey });

    const systemPrompt = `אתה עוזר AI חכם לניהול סלון "${siteContext.salonName}" (${siteContext.city}).

אתה כבר מחובר לסלון הזה (siteId: ${siteId}). לעולם אל תשאל את המשתמש על siteId - אתה כבר יודע אותו.

=== SITE_CONTEXT ===
${contextJson}
=== END SITE_CONTEXT ===

תפקידך:
1. **ענה על שאלות כלליות** על הסלון באמצעות SITE_CONTEXT:
   - שעות פתיחה, שירותים ומחירים, עובדים, תורים היום, ביקורות, שאלות נפוצות
   - השתמש במידע מה-CONTEXT כדי לענות ישירות, ללא קריאה לכלים

2. **השתמש בכלים רק כאשר נדרש**:
   - listBookings: כשהמשתמש שואל "תראה לי תורים להיום/מחר" או "מה התורים למחר" - מציג את כל התורים לתאריך
   - get_todays_schedule: כשצריך לוח זמנים מפורט לעובד מסוים/תאריך מסוים
   - create_booking: כשצריך ליצור תור חדש
   - get_revenue_this_month: כשצריך חישוב הכנסות חודשיות

3. **כללי תשובה**:
   - ענה בעברית, בצורה ידידותית ומקצועית
   - אם חסר פרט (כמו שם עובד, תאריך, שעה), שאל שאלה אחת ברורה
   - אם יש מספר אפשרויות (כמו עובדים עם שם דומה), הצג את האפשרויות
   - לעולם אל תסרב לשאלות - השתמש ב-CONTEXT או בכלים כדי לענות

4. **זכור**: אתה יכול לענות על כל שאלה על הסלון, לא רק 3 פעולות מוגבלות.`;

    const tools = [
      {
        type: "function" as const,
        function: {
          name: "get_todays_schedule",
          description: "מציג את לוח הזמנים של עובד מסוים ליום מסוים. אם לא מצוין עובד, מציג את כל העובדים.",
          parameters: {
            type: "object",
            properties: {
              workerId: { type: "string", description: "ID של העובד" },
              workerName: { type: "string", description: "שם העובד" },
              dateISO: { type: "string", description: "תאריך ב-ISO format (YYYY-MM-DD) או 'היום' או 'מחר'" },
            },
            required: [],
          },
        },
      },
      {
        type: "function" as const,
        function: {
          name: "listBookings",
          description: "מציג את כל התורים לתאריך מסוים (ללא סינון לפי עובד). השתמש בזה כשהמשתמש שואל 'תראה לי תורים להיום/מחר' או 'מה התורים למחר'.",
          parameters: {
            type: "object",
            properties: {
              dateISO: { type: "string", description: "תאריך ב-ISO format (YYYY-MM-DD) או 'היום' או 'מחר'" },
            },
            required: [],
          },
        },
      },
      {
        type: "function" as const,
        function: {
          name: "create_booking",
          description: "יוצר תור חדש",
          parameters: {
            type: "object",
            properties: {
              workerId: { type: "string" },
              workerName: { type: "string" },
              serviceName: { type: "string" },
              dateISO: { type: "string", description: "תאריך ב-ISO format (YYYY-MM-DD) או 'היום' או 'מחר'" },
              time: { type: "string", description: "שעה בפורמט HH:MM" },
              customerName: { type: "string" },
              customerPhone: { type: "string" },
              note: { type: "string" },
              price: { type: "number" },
              durationMin: { type: "number" },
            },
            required: ["serviceName", "dateISO", "time", "customerName"],
          },
        },
      },
      {
        type: "function" as const,
        function: {
          name: "get_revenue_this_month",
          description: "מחשב את ההכנסות החודשיות",
          parameters: {
            type: "object",
            properties: {
              monthISO: { type: "string", description: "תאריך חודש ב-ISO format" },
            },
            required: [],
          },
        },
      },
    ];

    const completionMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
      ...messages.map((m) => ({
        role: m.role as "user" | "assistant" | "system",
        content: m.content,
      })),
    ];

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: completionMessages,
      tools,
      tool_choice: "auto",
      temperature: 0.2,
      max_tokens: 600,
      stream: true,
    });

    // Stream the response
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        let fullText = "";
        let toolCalls: any[] = [];
        let toolCallId = "";

        try {
          for await (const chunk of response) {
            const delta = chunk.choices[0]?.delta;
            if (!delta) continue;

            // Handle text content
            if (delta.content) {
              fullText += delta.content;
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ text: delta.content, done: false })}\n\n`)
              );
            }

            // Handle tool calls
            if (delta.tool_calls) {
              for (const toolCall of delta.tool_calls) {
                if (toolCall.index !== undefined) {
                  if (!toolCalls[toolCall.index]) {
                    toolCalls[toolCall.index] = {
                      id: toolCall.id || "",
                      name: "",
                      arguments: "",
                    };
                  }
                  if (toolCall.id) toolCalls[toolCall.index].id = toolCall.id;
                  if (toolCall.function?.name) {
                    toolCalls[toolCall.index].name = toolCall.function.name;
                  }
                  if (toolCall.function?.arguments) {
                    toolCalls[toolCall.index].arguments += toolCall.function.arguments;
                  }
                }
              }
            }
          }

          // If we have tool calls, execute them
          if (toolCalls.length > 0) {
            const toolCall = toolCalls[0];
            const args = JSON.parse(toolCall.arguments || "{}");
            let result: any;

            if (toolCall.name === "get_todays_schedule") {
              result = await getTodaysSchedule(
                siteId,
                args.workerId,
                args.workerName,
                args.dateISO
              );
            } else if (toolCall.name === "listBookings") {
              result = await listBookings(siteId, args.dateISO);
            } else if (toolCall.name === "create_booking") {
              if (args.workerId) {
                const isValidWorker = await validateWorkerBelongsToSite(siteId, args.workerId);
                if (!isValidWorker) {
                  controller.enqueue(
                    encoder.encode(
                      `data: ${JSON.stringify({ text: `שגיאה: העובד עם ID ${args.workerId} לא שייך לסלון הזה.`, done: true })}\n\n`
                    )
                  );
                  controller.close();
                  return;
                }
              }
              result = await createBooking(
                siteId,
                args.serviceName,
                args.dateISO,
                args.time,
                args.customerName,
                args.workerId,
                args.workerName,
                args.customerPhone,
                args.note,
                args.price,
                args.durationMin
              );
            } else if (toolCall.name === "get_revenue_this_month") {
              result = await getRevenueThisMonth(siteId, args.monthISO);
            } else {
              result = { kind: "text", text: "פעולה לא מוכרת." };
            }

            // Get final answer from model with tool result
            const toolResultMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
              ...completionMessages,
              {
                role: "assistant",
                content: null,
                tool_calls: [
                  {
                    id: toolCall.id,
                    type: "function",
                    function: {
                      name: toolCall.name,
                      arguments: toolCall.arguments,
                    },
                  },
                ],
              },
              {
                role: "tool",
                tool_call_id: toolCall.id,
                content: JSON.stringify(result),
              },
            ];

            const finalResponse = await openai.chat.completions.create({
              model: "gpt-4o-mini",
              messages: toolResultMessages,
              temperature: 0.2,
              max_tokens: 400,
              stream: true,
            });

            let finalText = "";
            for await (const chunk of finalResponse) {
              const delta = chunk.choices[0]?.delta;
              if (delta?.content) {
                finalText += delta.content;
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ text: delta.content, done: false })}\n\n`)
                );
              }
            }

            // Check if result is large and needs PDF
            const isLarge =
              (result.kind === "schedule" && Array.isArray(result.data) && result.data.length > 6) ||
              finalText.length > 700;

            const responseData: any = {
              text: "",
              done: true,
              kind: result.kind || "text",
              data: result.data,
            };

            if (isLarge && result.data) {
              responseData.isLarge = true;
              responseData.pdfPayload = {
                title:
                  result.kind === "schedule"
                    ? `לוח זמנים - ${result.date || "היום"}`
                    : result.kind === "revenue"
                    ? `הכנסות - ${result.data.monthLabel}`
                    : "דוח",
                type: result.kind === "schedule" ? "schedule" : result.kind === "revenue" ? "revenue" : "generic",
                data: result.data,
              };
            }

            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(responseData)}\n\n`)
            );
          } else {
            // No tool calls - text was already streamed in the loop above
            // Just mark as done
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ text: "", done: true })}\n\n`)
            );
          }

          controller.close();
        } catch (err: any) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ text: `שגיאה: ${err.message}`, done: true })}\n\n`)
          );
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err: any) {
    console.error("[admin-ai] route error:", err);
    console.error("[admin-ai] error stack:", err?.stack);
    
    // Return JSON error response (not HTML)
    return NextResponse.json(
      {
        error: err?.message || "Server error",
        details: process.env.NODE_ENV === "development" ? String(err) : undefined,
      },
      { status: 500 }
    );
  }
}
