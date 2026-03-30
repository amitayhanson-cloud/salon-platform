import {
  addDoc,
  deleteDoc,
  onSnapshot,
  query,
  updateDoc,
  where,
  type DocumentData,
  type UpdateData,
} from "firebase/firestore";
import { db } from "./firebaseClient";
import { productsCollection, productDoc } from "./firestorePaths";
import type { Product } from "@/types/product";
import { sanitizeForFirestore } from "@/lib/sanitizeForFirestore";

function fromDoc(id: string, data: DocumentData): Product {
  return {
    id,
    salonId: typeof data.salonId === "string" ? data.salonId : String(data.salonId ?? ""),
    name: typeof data.name === "string" ? data.name : String(data.name ?? ""),
    description: typeof data.description === "string" ? data.description : String(data.description ?? ""),
    price: typeof data.price === "number" && Number.isFinite(data.price) ? data.price : Number(data.price) || 0,
    images: Array.isArray(data.images)
      ? data.images.filter((x): x is string => typeof x === "string" && x.trim().length > 0)
      : [],
    category: typeof data.category === "string" ? data.category : String(data.category ?? ""),
    stock: typeof data.stock === "number" && Number.isFinite(data.stock) ? Math.max(0, Math.floor(data.stock)) : Math.max(0, Math.floor(Number(data.stock) || 0)),
    isVisible: data.isVisible !== false,
  };
}

function fixSalonId(siteId: string, p: Product): Product {
  return { ...p, salonId: p.salonId || siteId };
}

/**
 * Realtime products. When visibleOnly, only documents with isVisible === true (for public site).
 * Sorted by name (client-side) to avoid composite index.
 */
export function subscribeSiteProducts(
  siteId: string,
  visibleOnly: boolean,
  onData: (products: Product[]) => void,
  onError?: (e: unknown) => void
): () => void {
  if (!db) {
    onError?.(new Error("Firestore db not initialized"));
    return () => {};
  }
  const col = productsCollection(siteId);
  const q = visibleOnly ? query(col, where("isVisible", "==", true)) : query(col);
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => fixSalonId(siteId, fromDoc(d.id, d.data())));
      list.sort((a, b) => (a.name || "").localeCompare(b.name || "", "he"));
      onData(list);
    },
    (err) => {
      console.error("[subscribeSiteProducts]", err);
      onError?.(err);
    }
  );
}

export function subscribeSiteProduct(
  siteId: string,
  productId: string,
  onData: (product: Product | null) => void,
  onError?: (e: unknown) => void
): () => void {
  if (!db) {
    onError?.(new Error("Firestore db not initialized"));
    return () => {};
  }
  return onSnapshot(
    productDoc(siteId, productId),
    (snap) => {
      if (!snap.exists()) {
        onData(null);
        return;
      }
      onData(fixSalonId(siteId, fromDoc(snap.id, snap.data())));
    },
    (err) => {
      console.error("[subscribeSiteProduct]", err);
      onError?.(err);
      onData(null);
    }
  );
}

export async function createSiteProduct(siteId: string, input: Omit<Product, "id">): Promise<string> {
  if (!db) throw new Error("Firestore db not initialized");
  const payload = sanitizeForFirestore({
    salonId: siteId,
    name: input.name.trim(),
    description: input.description.trim(),
    price: input.price,
    images: input.images,
    category: input.category.trim(),
    stock: Math.max(0, Math.floor(input.stock)),
    isVisible: input.isVisible,
  });
  const ref = await addDoc(productsCollection(siteId), payload);
  return ref.id;
}

export async function updateSiteProduct(
  siteId: string,
  productId: string,
  patch: Partial<Omit<Product, "id" | "salonId">>
): Promise<void> {
  if (!db) throw new Error("Firestore db not initialized");
  const next: Record<string, unknown> = { ...patch };
  if (typeof next.name === "string") next.name = next.name.trim();
  if (typeof next.description === "string") next.description = next.description.trim();
  if (typeof next.category === "string") next.category = next.category.trim();
  if (typeof next.stock === "number") next.stock = Math.max(0, Math.floor(next.stock));
  const cleaned = sanitizeForFirestore(next) as UpdateData<DocumentData>;
  await updateDoc(productDoc(siteId, productId), cleaned);
}

export async function deleteSiteProduct(siteId: string, productId: string): Promise<void> {
  if (!db) throw new Error("Firestore db not initialized");
  await deleteDoc(productDoc(siteId, productId));
}
