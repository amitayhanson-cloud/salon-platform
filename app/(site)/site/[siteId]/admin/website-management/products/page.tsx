"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";
import {
  ImagePlus,
  Loader2,
  Plus,
  Search,
  Store,
  Trash2,
  Eye,
  EyeOff,
} from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { AdminPageHero } from "@/components/admin/AdminPageHero";
import { saveSiteConfig, subscribeSiteConfig } from "@/lib/firestoreSiteConfig";
import {
  createSiteProduct,
  deleteSiteProduct,
  subscribeSiteProducts,
  updateSiteProduct,
} from "@/lib/firestoreProducts";
import type { SiteConfig } from "@/types/siteConfig";
import type { Product } from "@/types/product";
import { PRODUCT_CATEGORY_PRESETS } from "@/lib/productCategories";
import { formatIlsPrice } from "@/lib/formatPrice";

async function uploadProductImage(
  siteId: string,
  file: File,
  token: string,
  publicIdSuffix: string
): Promise<string> {
  const signRes = await fetch("/api/cloudinary/sign", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ siteId, kind: "product", publicIdSuffix }),
  });
  const signData = await signRes.json().catch(() => ({}));
  if (!signRes.ok) {
    throw new Error(typeof signData.error === "string" ? signData.error : "sign_failed");
  }
  const { timestamp, signature, apiKey, cloudName, folder, publicId } = signData as {
    timestamp: number;
    signature: string;
    apiKey: string;
    cloudName: string;
    folder: string;
    publicId: string;
  };
  const formData = new FormData();
  formData.append("file", file);
  formData.append("api_key", apiKey);
  formData.append("timestamp", String(timestamp));
  formData.append("signature", signature);
  formData.append("folder", folder);
  formData.append("public_id", publicId);
  const uploadRes = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
    method: "POST",
    body: formData,
  });
  const uploadData = await uploadRes.json().catch(() => ({}));
  if (!uploadRes.ok || uploadData.error) {
    throw new Error(uploadData.error?.message || "upload_failed");
  }
  return String(uploadData.secure_url);
}

function AddProductModal({
  open,
  onClose,
  siteId,
  onCreated,
  getToken,
}: {
  open: boolean;
  onClose: () => void;
  siteId: string;
  onCreated: () => void;
  getToken: () => Promise<string | undefined>;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [category, setCategory] = useState<string>(PRODUCT_CATEGORY_PRESETS[0] ?? "אחר");
  const [categoryCustom, setCategoryCustom] = useState("");
  const [stock, setStock] = useState("0");
  const [images, setImages] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setName("");
    setDescription("");
    setPrice("");
    setCategory(PRODUCT_CATEGORY_PRESETS[0] ?? "אחר");
    setCategoryCustom("");
    setStock("0");
    setImages([]);
    setError(null);
  };

  useEffect(() => {
    if (open) reset();
  }, [open]);

  if (!open) return null;

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const token = await getToken();
      if (!token) throw new Error("יש להתחבר");
      const suffix = `p_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const url = await uploadProductImage(siteId, file, token, suffix);
      setImages((prev) => [...prev, url]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "העלאה נכשלה");
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setError(null);
    const priceNum = parseFloat(price.replace(/,/g, "."));
    if (!name.trim()) {
      setError("נא להזין שם מוצר");
      return;
    }
    if (!Number.isFinite(priceNum) || priceNum < 0) {
      setError("מחיר לא תקין");
      return;
    }
    const cat =
      category === "אחר" && categoryCustom.trim() ? categoryCustom.trim() : category;
    setSaving(true);
    try {
      await createSiteProduct(siteId, {
        salonId: siteId,
        name: name.trim(),
        description: description.trim(),
        price: priceNum,
        images,
        category: cat,
        stock: Math.max(0, parseInt(stock, 10) || 0),
        isVisible: true,
      });
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "שמירה נכשלה");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/45 p-4"
      dir="rtl"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold text-slate-900">הוספת מוצר</h2>
        <form className="mt-4 space-y-4" onSubmit={handleSubmit}>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">שם *</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-right"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">תיאור</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-right"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">מחיר (₪) *</label>
              <input
                type="text"
                inputMode="decimal"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-right"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">מלאי</label>
              <input
                type="number"
                min={0}
                value={stock}
                onChange={(e) => setStock(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-right"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">קטגוריה</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-right"
            >
              {PRODUCT_CATEGORY_PRESETS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            {category === "אחר" ? (
              <input
                placeholder="קטגוריה מותאמת"
                value={categoryCustom}
                onChange={(e) => setCategoryCustom(e.target.value)}
                className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-right"
              />
            ) : null}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">תמונות</label>
            <div className="flex flex-wrap gap-2">
              {images.map((url) => (
                <div key={url} className="relative h-20 w-20 overflow-hidden rounded-lg border border-slate-200">
                  <Image src={url} alt="" fill className="object-cover" sizes="80px" />
                  <button
                    type="button"
                    onClick={() => setImages((prev) => prev.filter((u) => u !== url))}
                    className="absolute left-0 top-0 rounded-br bg-red-600 p-1 text-white"
                    aria-label="הסר"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
              <label className="flex h-20 w-20 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 text-slate-500 hover:bg-slate-100">
                {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
                <input type="file" accept="image/*" className="hidden" onChange={handleUpload} disabled={uploading} />
              </label>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              ביטול
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-caleno-ink px-4 py-2 text-sm font-medium text-white hover:bg-[#1E293B] disabled:opacity-50"
            >
              {saving ? "שומר…" : "שמירה"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function AdminProductsPage() {
  const params = useParams();
  const siteId = params?.siteId as string;
  const { firebaseUser } = useAuth();
  const getToken = useCallback(() => firebaseUser?.getIdToken() ?? Promise.resolve(undefined), [firebaseUser]);

  const [config, setConfig] = useState<SiteConfig | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [modalOpen, setModalOpen] = useState(false);
  const [sectionSaving, setSectionSaving] = useState(false);

  useEffect(() => {
    if (!siteId) return;
    const u1 = subscribeSiteConfig(siteId, setConfig, console.error);
    const u2 = subscribeSiteProducts(siteId, false, setProducts, console.error);
    return () => {
      u1();
      u2();
    };
  }, [siteId]);

  const categories = useMemo(() => {
    const s = new Set<string>();
    products.forEach((p) => {
      if (p.category?.trim()) s.add(p.category.trim());
    });
    return Array.from(s).sort((a, b) => a.localeCompare(b, "he"));
  }, [products]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (categoryFilter && p.category !== categoryFilter) return false;
      if (!q) return true;
      const blob = `${p.name} ${p.description} ${p.category}`.toLowerCase();
      return blob.includes(q);
    });
  }, [products, search, categoryFilter]);

  const toggleGlobalSection = async (next: boolean) => {
    if (!siteId || !config) return;
    setSectionSaving(true);
    try {
      const merged = { ...config, showProductsSection: next };
      await saveSiteConfig(siteId, merged);
    } finally {
      setSectionSaving(false);
    }
  };

  const toggleVisible = async (p: Product) => {
    if (!siteId) return;
    await updateSiteProduct(siteId, p.id, { isVisible: !p.isVisible });
  };

  const removeProduct = async (p: Product) => {
    if (!siteId) return;
    if (!confirm(`למחוק את "${p.name}"?`)) return;
    await deleteSiteProduct(siteId, p.id);
  };

  const showSection = config?.showProductsSection === true;

  return (
    <div className="space-y-8 pb-12" dir="rtl">
      <AdminPageHero
        title="ניהול מוצרים"
        subtitle="הוסיפו מוצרים, שלטו בנראות באתר והפעילו את מדור החנות בדף הבית."
      />

      <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Store className="h-6 w-6 text-caleno-deep" />
          <div>
            <p className="font-semibold text-slate-900">הצגת מדור מוצרים באתר</p>
            <p className="text-sm text-slate-600">כשכבוי, הסקשן בדף הבית והקישור ״חנות״ בכותרת מוסתרים.</p>
          </div>
        </div>
        <label className="inline-flex cursor-pointer items-center gap-2 self-end sm:self-auto">
          <span className="text-sm font-medium text-slate-700">{showSection ? "פעיל" : "כבוי"}</span>
          <input
            type="checkbox"
            className="h-5 w-5 rounded border-slate-300"
            checked={showSection}
            disabled={sectionSaving || !config}
            onChange={(e) => void toggleGlobalSection(e.target.checked)}
          />
        </label>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-md flex-1">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="חיפוש לפי שם, תיאור או קטגוריה…"
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-3 pr-10 text-right text-sm outline-none ring-caleno-deep/20 focus:ring-2"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
          >
            <option value="">כל הקטגוריות</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-caleno-ink px-4 py-2 text-sm font-semibold text-white shadow hover:bg-[#1E293B]"
          >
            <Plus className="h-4 w-4" />
            הוספת מוצר
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[640px] text-right text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">מוצר</th>
              <th className="px-4 py-3 font-medium">קטגוריה</th>
              <th className="px-4 py-3 font-medium">מחיר</th>
              <th className="px-4 py-3 font-medium">מלאי</th>
              <th className="px-4 py-3 font-medium">גלוי באתר</th>
              <th className="px-4 py-3 font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                  {products.length === 0 ? "אין מוצרים — לחצו ״הוספת מוצר״" : "אין תוצאות לסינון"}
                </td>
              </tr>
            ) : (
              filtered.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50/80">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-slate-100">
                        {p.images[0] ? (
                          <Image src={p.images[0]} alt="" fill className="object-cover" sizes="48px" />
                        ) : null}
                      </div>
                      <div>
                        <p className="font-medium text-slate-900">{p.name}</p>
                        <p className="line-clamp-1 text-xs text-slate-500">{p.description}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{p.category || "—"}</td>
                  <td className="px-4 py-3 tabular-nums font-medium">{formatIlsPrice(p.price)}</td>
                  <td className="px-4 py-3">{p.stock}</td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => void toggleVisible(p)}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium hover:bg-slate-50"
                      title={p.isVisible ? "הסתר מהאתר" : "הצג באתר"}
                    >
                      {p.isVisible ? (
                        <>
                          <Eye className="h-3.5 w-3.5" /> גלוי
                        </>
                      ) : (
                        <>
                          <EyeOff className="h-3.5 w-3.5" /> מוסתר
                        </>
                      )}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-left">
                    <button
                      type="button"
                      onClick={() => void removeProduct(p)}
                      className="rounded-lg p-2 text-red-600 hover:bg-red-50"
                      aria-label="מחק"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <AddProductModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        siteId={siteId}
        onCreated={() => {}}
        getToken={getToken}
      />
    </div>
  );
}
