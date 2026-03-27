import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const name = String(body?.name ?? "").trim();
  const phoneRaw = String(body?.phone ?? "").trim();
  const businessType = String(body?.businessType ?? "").trim();

  const phone = phoneRaw
    .replace(/\s+/g, "")
    .replace(/-/g, "")
    .startsWith("+")
    ? "+" + phoneRaw.replace(/\s+/g, "").replace(/-/g, "").slice(1)
    : phoneRaw.replace(/\s+/g, "").replace(/-/g, "").replace(/\+/g, "");

  if (!name || name.length < 2) {
    return NextResponse.json({ ok: false, error: "שם לא תקין" }, { status: 400 });
  }

  if (!businessType) {
    return NextResponse.json({ ok: false, error: "בחרו סוג עסק" }, { status: 400 });
  }

  // Basic phone validation: must contain at least 9 digits.
  const digits = phone.replace(/\D/g, "");
  if (!digits || digits.length < 9) {
    return NextResponse.json({ ok: false, error: "טלפון לא תקין" }, { status: 400 });
  }

  const db = getAdminDb();
  const docId = `waitlist_${phone}`;

  await db.collection("waitlistLeads").doc(docId).set(
    {
      name: name || null,
      phone: phone || null,
      businessType,
      createdAt: Timestamp.now(),
      source: "landing_waitlist",
      updatedAt: Timestamp.now(),
    },
    { merge: true }
  );

  return NextResponse.json({ ok: true });
}

