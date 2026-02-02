"use client";

import { useEffect, useState } from "react";
import { getDoc, setDoc, serverTimestamp, Timestamp, onSnapshot } from "firebase/firestore";
import { clientDocRef } from "@/lib/firestoreClientRefs";
import { Plus, Pencil, Trash2, X, Check } from "lucide-react";

interface ColorEntry {
  id: string;
  colorNumber: string;
  amount: string;
  notes?: string;
  createdAt: Timestamp | string;
}

interface OxygenEntry {
  id: string;
  percentage: string;
  amount: string;
  notes?: string;
  createdAt: Timestamp | string;
}

interface ChemicalCardData {
  colors: ColorEntry[];
  oxygen: OxygenEntry[];
}

interface ChemicalCardProps {
  siteId: string;
  phone: string; // phone number (document ID)
}

export function ChemicalCard({ siteId, phone }: ChemicalCardProps) {
  console.log("[ChemicalCard] mounted", { siteId, phone });

  const canSave = Boolean(siteId && phone);

  const [chemicalData, setChemicalData] = useState<ChemicalCardData>({
    colors: [],
    oxygen: [],
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [editingColorId, setEditingColorId] = useState<string | null>(null);
  const [editingOxygenId, setEditingOxygenId] = useState<string | null>(null);
  const [showAddColor, setShowAddColor] = useState(false);
  const [showAddOxygen, setShowAddOxygen] = useState(false);

  // Form state for new/edit
  const [colorForm, setColorForm] = useState({
    colorNumber: "",
    amount: "",
    notes: "",
  });
  const [oxygenForm, setOxygenForm] = useState({
    percentage: "",
    amount: "",
    notes: "",
  });

  // Load chemical card data and subscribe to updates
  useEffect(() => {
    if (!siteId || !phone) {
      setLoading(false);
      return;
    }

    const clientRef = clientDocRef(siteId, phone);
    console.log("[ChemicalCard] Setting up subscription", {
      siteId,
      phone,
      path: clientRef.path,
      fullPath: `sites/${siteId}/clients/${phone}`,
    });

    setLoading(true);

    // Subscribe to client document for real-time updates
    const unsubscribe = onSnapshot(
      clientRef,
      (snapshot) => {
        console.log("[ChemicalCard] Subscription update", {
          exists: snapshot.exists(),
          hasChemicalCard: !!snapshot.data()?.chemicalCard,
          chemicalCard: snapshot.data()?.chemicalCard,
        });

        if (snapshot.exists()) {
          const data = snapshot.data();
          const chemicalCard = data.chemicalCard || { colors: [], oxygen: [] };
          
          // Convert Timestamps to objects for state
          setChemicalData({
            colors: (chemicalCard.colors || []).map((c: any) => ({
              ...c,
              createdAt: c.createdAt?.toDate?.()?.toISOString() || c.createdAt || new Date().toISOString(),
            })),
            oxygen: (chemicalCard.oxygen || []).map((o: any) => ({
              ...o,
              createdAt: o.createdAt?.toDate?.()?.toISOString() || o.createdAt || new Date().toISOString(),
            })),
          });
        } else {
          // Client doc doesn't exist yet, initialize with empty data
          console.log("[ChemicalCard] Client doc does not exist in subscription, initializing empty");
          setChemicalData({ colors: [], oxygen: [] });
        }
        setLoading(false);
      },
      (error) => {
        console.error("[ChemicalCard] Subscription error", {
          siteId,
          phone,
          error,
          errorMessage: error.message,
        });
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [siteId, phone]);

  const saveChemicalCard = async (data: ChemicalCardData) => {
    console.log("[ChemicalCard] saveChemicalCard called", { siteId, phone });

    if (!siteId || !phone) {
      console.error("[ChemicalCard] Missing siteId or phone", { siteId, phone });
      setSaveMessage("שגיאה: חסר siteId או מספר טלפון");
      setTimeout(() => setSaveMessage(""), 5000);
      return;
    }

    if (!data || (data.colors?.length === 0 && data.oxygen?.length === 0)) {
      console.warn("[ChemicalCard] Empty chemical card – aborting save", { data });
      // Don't abort - allow saving empty state
    }

    setSaving(true);
    setSaveMessage("");

    try {
      const clientRef = clientDocRef(siteId, phone);
      
      console.log("[ChemicalCard] Writing to", {
        path: clientRef.path,
        fullPath: `sites/${siteId}/clients/${phone}`,
      });
      
      // Convert data to Firestore format (ensure no undefined)
      const firestoreData: any = {
        chemicalCard: {
          colors: (data.colors || []).map((c) => ({
            id: c.id,
            colorNumber: c.colorNumber || "",
            amount: c.amount || "",
            notes: c.notes || null,
            createdAt: c.createdAt instanceof Timestamp 
              ? c.createdAt 
              : Timestamp.fromDate(new Date(c.createdAt || new Date())),
          })),
          oxygen: (data.oxygen || []).map((o) => ({
            id: o.id,
            percentage: o.percentage || "",
            amount: o.amount || "",
            notes: o.notes || null,
            createdAt: o.createdAt instanceof Timestamp 
              ? o.createdAt 
              : Timestamp.fromDate(new Date(o.createdAt || new Date())),
          })),
          updatedAt: serverTimestamp(),
        },
      };

      // Use setDoc with merge to create document if it doesn't exist
      await setDoc(clientRef, firestoreData, { merge: true });
      console.log("[ChemicalCard] Firestore write OK");
      
      // Hard verification: Read-after-write
      const verifySnap = await getDoc(clientRef);
      console.log("[ChemicalCard] POST-SAVE SNAP", {
        exists: verifySnap.exists(),
        chemicalCard: verifySnap.data()?.chemicalCard,
        hasChemicalCard: !!verifySnap.data()?.chemicalCard,
        colorsCount: verifySnap.data()?.chemicalCard?.colors?.length || 0,
        oxygenCount: verifySnap.data()?.chemicalCard?.oxygen?.length || 0,
      });

      if (!verifySnap.exists()) {
        throw new Error(`Save failed: client document does not exist at ${clientRef.path}`);
      }
      
      const verifyData = verifySnap.data();
      if (!verifyData?.chemicalCard) {
        throw new Error("POST-SAVE verification failed: chemicalCard NOT persisted");
      }
      
      console.log("[ChemicalCard] POST-SAVE verification passed", {
        siteId,
        phone,
        path: clientRef.path,
        verified: true,
      });
      
      setSaveMessage("נשמר בהצלחה");
      setTimeout(() => setSaveMessage(""), 2000);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error("[ChemicalCard] Failed to save", {
        siteId,
        phone,
        path: `sites/${siteId}/clients/${phone}`,
        error: err,
        errorMessage,
      });
      setSaveMessage(`שגיאה בשמירה: ${errorMessage}`);
      setTimeout(() => setSaveMessage(""), 5000);
    } finally {
      setSaving(false);
    }
  };

  // Color handlers
  const handleAddColor = () => {
    console.log("[ChemicalCard] handleAddColor called", {
      colorForm,
      siteId,
      phone,
    });

    if (!colorForm.colorNumber.trim() || !colorForm.amount.trim()) {
      alert("יש להזין מספר צבע וכמות");
      return;
    }

    const newColor: ColorEntry = {
      id: Date.now().toString(),
      colorNumber: colorForm.colorNumber.trim(),
      amount: colorForm.amount.trim(),
      notes: colorForm.notes.trim() || undefined,
      createdAt: new Date().toISOString(),
    };

    const updated = {
      ...chemicalData,
      colors: [...chemicalData.colors, newColor],
    };

    setChemicalData(updated);
    saveChemicalCard(updated);
    setColorForm({ colorNumber: "", amount: "", notes: "" });
    setShowAddColor(false);
  };

  const handleEditColor = (color: ColorEntry) => {
    setEditingColorId(color.id);
    setColorForm({
      colorNumber: color.colorNumber,
      amount: color.amount,
      notes: color.notes || "",
    });
  };

  const handleSaveColor = () => {
    console.log("[ChemicalCard] handleSaveColor called", {
      colorForm,
      editingColorId,
      siteId,
      phone,
    });

    if (!colorForm.colorNumber.trim() || !colorForm.amount.trim()) {
      alert("יש להזין מספר צבע וכמות");
      return;
    }

    if (!editingColorId) {
      console.warn("[ChemicalCard] handleSaveColor: no editingColorId");
      return;
    }

    const updated = {
      ...chemicalData,
      colors: chemicalData.colors.map((c) =>
        c.id === editingColorId
          ? {
              ...c,
              colorNumber: colorForm.colorNumber.trim(),
              amount: colorForm.amount.trim(),
              notes: colorForm.notes.trim() || undefined,
            }
          : c
      ),
    };

    setChemicalData(updated);
    saveChemicalCard(updated);
    setEditingColorId(null);
    setColorForm({ colorNumber: "", amount: "", notes: "" });
  };

  const handleDeleteColor = (colorId: string) => {
    if (!confirm("האם אתה בטוח שברצונך למחוק את רשומת הצבע?")) return;

    const updated = {
      ...chemicalData,
      colors: chemicalData.colors.filter((c) => c.id !== colorId),
    };

    setChemicalData(updated);
    saveChemicalCard(updated);
  };

  // Oxygen handlers
  const handleAddOxygen = () => {
    console.log("[ChemicalCard] handleAddOxygen called", {
      oxygenForm,
      siteId,
      phone,
    });

    if (!oxygenForm.percentage.trim() || !oxygenForm.amount.trim()) {
      alert("יש להזין אחוז וכמות");
      return;
    }

    const newOxygen: OxygenEntry = {
      id: Date.now().toString(),
      percentage: oxygenForm.percentage.trim(),
      amount: oxygenForm.amount.trim(),
      notes: oxygenForm.notes.trim() || undefined,
      createdAt: new Date().toISOString(),
    };

    const updated = {
      ...chemicalData,
      oxygen: [...chemicalData.oxygen, newOxygen],
    };

    setChemicalData(updated);
    saveChemicalCard(updated);
    setOxygenForm({ percentage: "", amount: "", notes: "" });
    setShowAddOxygen(false);
  };

  const handleEditOxygen = (oxygen: OxygenEntry) => {
    setEditingOxygenId(oxygen.id);
    setOxygenForm({
      percentage: oxygen.percentage,
      amount: oxygen.amount,
      notes: oxygen.notes || "",
    });
  };

  const handleSaveOxygen = () => {
    console.log("[ChemicalCard] handleSaveOxygen called", {
      oxygenForm,
      editingOxygenId,
      siteId,
      phone,
    });

    if (!oxygenForm.percentage.trim() || !oxygenForm.amount.trim()) {
      alert("יש להזין אחוז וכמות");
      return;
    }

    if (!editingOxygenId) {
      console.warn("[ChemicalCard] handleSaveOxygen: no editingOxygenId");
      return;
    }

    const updated = {
      ...chemicalData,
      oxygen: chemicalData.oxygen.map((o) =>
        o.id === editingOxygenId
          ? {
              ...o,
              percentage: oxygenForm.percentage.trim(),
              amount: oxygenForm.amount.trim(),
              notes: oxygenForm.notes.trim() || undefined,
            }
          : o
      ),
    };

    setChemicalData(updated);
    saveChemicalCard(updated);
    setEditingOxygenId(null);
    setOxygenForm({ percentage: "", amount: "", notes: "" });
  };

  const handleDeleteOxygen = (oxygenId: string) => {
    if (!confirm("האם אתה בטוח שברצונך למחוק את רשומת החמצן?")) return;

    const updated = {
      ...chemicalData,
      oxygen: chemicalData.oxygen.filter((o) => o.id !== oxygenId),
    };

    setChemicalData(updated);
    saveChemicalCard(updated);
  };

  if (loading) {
    return (
      <div className="border-t border-slate-200 pt-6 mt-6">
        <p className="text-sm text-slate-500 text-center py-4">טוען כרטיס כימיה…</p>
      </div>
    );
  }

  if (!canSave) {
    return (
      <div className="border-t border-slate-200 pt-6 mt-6">
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-right">
          <p className="text-sm text-amber-800">חסר מזהה אתר או מספר טלפון – לא ניתן לשמור כרטיס כימיה.</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-slate-900">כרטיס כימיה</h3>
        {saveMessage && (
          <span className="text-xs text-emerald-600 flex items-center gap-1">
            <Check className="w-3 h-3" />
            {saveMessage}
          </span>
        )}
      </div>

      {/* Colors Section */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-base font-medium text-slate-800">צבע</h4>
          {!showAddColor && !editingColorId && (
            <button
              onClick={() => setShowAddColor(true)}
              className="flex items-center gap-1 px-3 py-1.5 bg-sky-500 hover:bg-sky-600 text-white rounded-lg text-sm font-medium transition-colors"
            >
              <Plus className="w-4 h-4" />
              הוסף צבע
            </button>
          )}
        </div>

        {/* Add Color Form */}
        {showAddColor && (
          <div className="mb-4 p-4 bg-slate-50 rounded-lg border border-slate-200">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  מספר צבע *
                </label>
                <input
                  type="text"
                  value={colorForm.colorNumber}
                  onChange={(e) => setColorForm({ ...colorForm, colorNumber: e.target.value })}
                  className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-sky-500"
                  placeholder="למשל: 7, 8.1"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  כמות *
                </label>
                <input
                  type="text"
                  value={colorForm.amount}
                  onChange={(e) => setColorForm({ ...colorForm, amount: e.target.value })}
                  className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-sky-500"
                  placeholder="למשל: 1/2, 30g"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  הערות
                </label>
                <input
                  type="text"
                  value={colorForm.notes}
                  onChange={(e) => setColorForm({ ...colorForm, notes: e.target.value })}
                  className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-sky-500"
                  placeholder="הערות (אופציונלי)"
                />
              </div>
            </div>
            <div className="flex gap-2 justify-start">
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  console.log("[ChemicalCard] SAVE BUTTON CLICKED (Add Color)", {
                    siteId,
                    phone,
                    formState: colorForm,
                  });
                  handleAddColor();
                }}
                disabled={!canSave || saving}
                className="px-3 py-1.5 bg-sky-500 hover:bg-sky-600 disabled:bg-sky-300 text-white rounded text-sm font-medium"
              >
                שמור
              </button>
              <button
                onClick={() => {
                  setShowAddColor(false);
                  setColorForm({ colorNumber: "", amount: "", notes: "" });
                }}
                className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded text-sm font-medium"
              >
                ביטול
              </button>
            </div>
          </div>
        )}

        {/* Colors List */}
        {chemicalData.colors.length === 0 && !showAddColor ? (
          <p className="text-sm text-slate-500 text-center py-4">אין רשומות צבע</p>
        ) : (
          <div className="space-y-2">
            {chemicalData.colors.map((color) => {
              const isEditing = editingColorId === color.id;

              return (
                <div
                  key={color.id}
                  className="p-3 bg-slate-50 rounded-lg border border-slate-200"
                >
                  {isEditing ? (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          מספר צבע *
                        </label>
                        <input
                          type="text"
                          value={colorForm.colorNumber}
                          onChange={(e) => setColorForm({ ...colorForm, colorNumber: e.target.value })}
                          className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-sky-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          כמות *
                        </label>
                        <input
                          type="text"
                          value={colorForm.amount}
                          onChange={(e) => setColorForm({ ...colorForm, amount: e.target.value })}
                          className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-sky-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          הערות
                        </label>
                        <input
                          type="text"
                          value={colorForm.notes}
                          onChange={(e) => setColorForm({ ...colorForm, notes: e.target.value })}
                          className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-sky-500"
                        />
                      </div>
                      <div className="md:col-span-3 flex gap-2 justify-start">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            console.log("[ChemicalCard] SAVE BUTTON CLICKED (Edit Color)", {
                              siteId,
                              phone,
                              editingColorId,
                              formState: colorForm,
                            });
                            handleSaveColor();
                          }}
                          disabled={!canSave || saving}
                          className="px-3 py-1.5 bg-sky-500 hover:bg-sky-600 disabled:bg-sky-300 text-white rounded text-sm font-medium"
                        >
                          שמור
                        </button>
                        <button
                          onClick={() => {
                            setEditingColorId(null);
                            setColorForm({ colorNumber: "", amount: "", notes: "" });
                          }}
                          className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded text-sm font-medium"
                        >
                          ביטול
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex justify-between items-center">
                      <div className="grid grid-cols-3 gap-4 flex-1 text-sm">
                        <div>
                          <span className="text-slate-600">מספר צבע:</span>{" "}
                          <span className="font-medium text-slate-900">{color.colorNumber}</span>
                        </div>
                        <div>
                          <span className="text-slate-600">כמות:</span>{" "}
                          <span className="font-medium text-slate-900">{color.amount}</span>
                        </div>
                        {color.notes && (
                          <div>
                            <span className="text-slate-600">הערות:</span>{" "}
                            <span className="font-medium text-slate-900">{color.notes}</span>
                          </div>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleEditColor(color)}
                          className="p-1.5 text-slate-600 hover:text-sky-600 hover:bg-sky-50 rounded transition-colors"
                          title="ערוך"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteColor(color.id)}
                          className="p-1.5 text-slate-600 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                          title="מחק"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Oxygen Section */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-base font-medium text-slate-800">חמצן</h4>
          {!showAddOxygen && !editingOxygenId && (
            <button
              onClick={() => setShowAddOxygen(true)}
              className="flex items-center gap-1 px-3 py-1.5 bg-sky-500 hover:bg-sky-600 text-white rounded-lg text-sm font-medium transition-colors"
            >
              <Plus className="w-4 h-4" />
              הוסף חמצן
            </button>
          )}
        </div>

        {/* Add Oxygen Form */}
        {showAddOxygen && (
          <div className="mb-4 p-4 bg-slate-50 rounded-lg border border-slate-200">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  אחוז *
                </label>
                <input
                  type="text"
                  value={oxygenForm.percentage}
                  onChange={(e) => setOxygenForm({ ...oxygenForm, percentage: e.target.value })}
                  className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-sky-500"
                  placeholder="למשל: 3%, 6%, 9%"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  כמות *
                </label>
                <input
                  type="text"
                  value={oxygenForm.amount}
                  onChange={(e) => setOxygenForm({ ...oxygenForm, amount: e.target.value })}
                  className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-sky-500"
                  placeholder="כמות"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  הערות
                </label>
                <input
                  type="text"
                  value={oxygenForm.notes}
                  onChange={(e) => setOxygenForm({ ...oxygenForm, notes: e.target.value })}
                  className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-sky-500"
                  placeholder="הערות (אופציונלי)"
                />
              </div>
            </div>
            <div className="flex gap-2 justify-start">
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  console.log("[ChemicalCard] SAVE BUTTON CLICKED (Add Oxygen)", {
                    siteId,
                    phone,
                    formState: oxygenForm,
                  });
                  handleAddOxygen();
                }}
                disabled={!canSave || saving}
                className="px-3 py-1.5 bg-sky-500 hover:bg-sky-600 disabled:bg-sky-300 text-white rounded text-sm font-medium"
              >
                שמור
              </button>
              <button
                onClick={() => {
                  setShowAddOxygen(false);
                  setOxygenForm({ percentage: "", amount: "", notes: "" });
                }}
                className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded text-sm font-medium"
              >
                ביטול
              </button>
            </div>
          </div>
        )}

        {/* Oxygen List */}
        {chemicalData.oxygen.length === 0 && !showAddOxygen ? (
          <p className="text-sm text-slate-500 text-center py-4">אין רשומות חמצן</p>
        ) : (
          <div className="space-y-2">
            {chemicalData.oxygen.map((oxygen) => {
              const isEditing = editingOxygenId === oxygen.id;

              return (
                <div
                  key={oxygen.id}
                  className="p-3 bg-slate-50 rounded-lg border border-slate-200"
                >
                  {isEditing ? (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          אחוז *
                        </label>
                        <input
                          type="text"
                          value={oxygenForm.percentage}
                          onChange={(e) => setOxygenForm({ ...oxygenForm, percentage: e.target.value })}
                          className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-sky-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          כמות *
                        </label>
                        <input
                          type="text"
                          value={oxygenForm.amount}
                          onChange={(e) => setOxygenForm({ ...oxygenForm, amount: e.target.value })}
                          className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-sky-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          הערות
                        </label>
                        <input
                          type="text"
                          value={oxygenForm.notes}
                          onChange={(e) => setOxygenForm({ ...oxygenForm, notes: e.target.value })}
                          className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-sky-500"
                        />
                      </div>
                      <div className="md:col-span-3 flex gap-2 justify-start">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            console.log("[ChemicalCard] SAVE BUTTON CLICKED (Edit Oxygen)", {
                              siteId,
                              phone,
                              editingOxygenId,
                              formState: oxygenForm,
                            });
                            handleSaveOxygen();
                          }}
                          disabled={!canSave || saving}
                          className="px-3 py-1.5 bg-sky-500 hover:bg-sky-600 disabled:bg-sky-300 text-white rounded text-sm font-medium"
                        >
                          שמור
                        </button>
                        <button
                          onClick={() => {
                            setEditingOxygenId(null);
                            setOxygenForm({ percentage: "", amount: "", notes: "" });
                          }}
                          className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded text-sm font-medium"
                        >
                          ביטול
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex justify-between items-center">
                      <div className="grid grid-cols-3 gap-4 flex-1 text-sm">
                        <div>
                          <span className="text-slate-600">אחוז:</span>{" "}
                          <span className="font-medium text-slate-900">{oxygen.percentage}</span>
                        </div>
                        <div>
                          <span className="text-slate-600">כמות:</span>{" "}
                          <span className="font-medium text-slate-900">{oxygen.amount}</span>
                        </div>
                        {oxygen.notes && (
                          <div>
                            <span className="text-slate-600">הערות:</span>{" "}
                            <span className="font-medium text-slate-900">{oxygen.notes}</span>
                          </div>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleEditOxygen(oxygen)}
                          className="p-1.5 text-slate-600 hover:text-sky-600 hover:bg-sky-50 rounded transition-colors"
                          title="ערוך"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteOxygen(oxygen.id)}
                          className="p-1.5 text-slate-600 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                          title="מחק"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
