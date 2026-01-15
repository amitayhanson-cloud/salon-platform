"use client";

import { useEffect, useState } from "react";
import { doc, getDoc, setDoc, updateDoc, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebaseClient";
import { clientDoc } from "@/lib/firestorePaths";
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
  clientId: string; // phone number
}

export function ChemicalCard({ siteId, clientId }: ChemicalCardProps) {
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

  // Load chemical card data
  useEffect(() => {
    if (!db || !siteId || !clientId) {
      setLoading(false);
      return;
    }

    const loadChemicalCard = async () => {
      try {
        const clientRef = clientDoc(siteId, clientId);
        const clientSnap = await getDoc(clientRef);

        if (clientSnap.exists()) {
          const data = clientSnap.data();
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
          setChemicalData({ colors: [], oxygen: [] });
        }
      } catch (err) {
        console.error("[ChemicalCard] Failed to load", err);
      } finally {
        setLoading(false);
      }
    };

    loadChemicalCard();
  }, [siteId, clientId]);

  const saveChemicalCard = async (data: ChemicalCardData) => {
    if (!db || !siteId || !clientId) return;

    setSaving(true);
    setSaveMessage("");

    try {
      const clientRef = clientDoc(siteId, clientId);
      
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
        },
      };

      // Use setDoc with merge to create document if it doesn't exist
      await setDoc(clientRef, firestoreData, { merge: true });
      setSaveMessage("נשמר בהצלחה");
      setTimeout(() => setSaveMessage(""), 2000);
    } catch (err) {
      console.error("[ChemicalCard] Failed to save", err);
      setSaveMessage("שגיאה בשמירה");
      setTimeout(() => setSaveMessage(""), 3000);
    } finally {
      setSaving(false);
    }
  };

  // Color handlers
  const handleAddColor = () => {
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
    if (!colorForm.colorNumber.trim() || !colorForm.amount.trim()) {
      alert("יש להזין מספר צבע וכמות");
      return;
    }

    if (!editingColorId) return;

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
    if (!oxygenForm.percentage.trim() || !oxygenForm.amount.trim()) {
      alert("יש להזין אחוז וכמות");
      return;
    }

    if (!editingOxygenId) return;

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
                onClick={handleAddColor}
                disabled={saving}
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
                          onClick={handleSaveColor}
                          disabled={saving}
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
                onClick={handleAddOxygen}
                disabled={saving}
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
                          onClick={handleSaveOxygen}
                          disabled={saving}
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
