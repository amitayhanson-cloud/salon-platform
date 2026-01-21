import { NextRequest, NextResponse } from "next/server";
import { createWebsiteDocument, updateUserSiteId } from "@/lib/firestoreUsers";
import { doc, setDoc, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebaseClient";
import { defaultSiteConfig } from "@/types/siteConfig";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, salonName } = body;

    if (!userId) {
      return NextResponse.json(
        { success: false, error: "User ID is required" },
        { status: 400 }
      );
    }

    // Generate subdomain from salon name or use a random one
    let subdomain = salonName
      ? salonName
          .toLowerCase()
          .replace(/\s+/g, "-")
          .replace(/[^\w\-]/g, "")
          .substring(0, 20)
      : `salon-${Math.random().toString(36).substring(2, 8)}`;

    // Try to create website with subdomain, if taken, add random suffix
    let website;
    let attempts = 0;
    const maxAttempts = 5;

    while (attempts < maxAttempts) {
      try {
        website = await createWebsiteDocument(userId, subdomain, "luxury");
        break;
      } catch (error: any) {
        if (error.message === "Subdomain already taken" && attempts < maxAttempts - 1) {
          // Add random suffix and try again
          subdomain = `${subdomain}-${Math.random().toString(36).substring(2, 5)}`;
          attempts++;
        } else {
          throw error;
        }
      }
    }

    if (!website) {
      return NextResponse.json(
        { success: false, error: "Failed to create website" },
        { status: 500 }
      );
    }

    // Update user document with site ID
    await updateUserSiteId(userId, website.id);

    // Create initial site config for the website
    if (!db) {
      console.error("❌ Firestore db not initialized in API route");
      console.error("🔍 db type:", typeof db, "value:", db);
      throw new Error("Firestore db not initialized. Check Firebase configuration.");
    }

    const siteConfigRef = doc(db, "sites", website.id);
    const initialConfig = {
      ...defaultSiteConfig,
      salonName: salonName || "הסלון שלי",
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    await setDoc(siteConfigRef, initialConfig);

    return NextResponse.json({
      success: true,
      siteId: website.id,
      subdomain: website.subdomain,
    });
  } catch (error: any) {
    console.error("Error creating website:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
