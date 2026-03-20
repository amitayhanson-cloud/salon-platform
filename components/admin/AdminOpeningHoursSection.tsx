"use client";

import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  forwardRef,
} from "react";
import type { SalonBookingState } from "@/types/booking";
import { defaultBookingState } from "@/types/booking";
import {
  saveBookingSettings,
  convertSalonBookingStateToBookingSettings,
  subscribeBookingSettings,
} from "@/lib/firestoreBookingSettings";
import { resetWorkersAvailabilityToBusinessHours } from "@/lib/resetWorkersAvailability";
import { AdminBookingTab } from "@/components/admin/AdminBookingTab";
import ConfirmModal from "@/components/ui/ConfirmModal";
import { validateSalonBookingBreaks } from "@/lib/openingHoursValidation";

export type AdminOpeningHoursSectionHandle = {
  /** Save pending hours without confirm modal (e.g. global Enter / שמור). */
  saveIfDirtyWithoutModal: () => Promise<void>;
};

type Props = {
  siteId: string;
  onUnsavedChange?: (unsaved: boolean) => void;
};

export const AdminOpeningHoursSection = forwardRef<AdminOpeningHoursSectionHandle, Props>(
  function AdminOpeningHoursSection({ siteId, onUnsavedChange }, ref) {
    const [bookingState, setBookingState] = useState<SalonBookingState | null>(null);
    const [showHoursConfirmModal, setShowHoursConfirmModal] = useState(false);
    const [hoursSaving, setHoursSaving] = useState(false);
    const [bookingHoursToast, setBookingHoursToast] = useState<string | null>(null);
    const [bookingSaveError, setBookingSaveError] = useState<string | null>(null);
    const lastSavedBookingRef = useRef<string | null>(null);
    const hoursUserHasEditedRef = useRef(false);

    useEffect(() => {
      if (!bookingHoursToast) return;
      const t = setTimeout(() => setBookingHoursToast(null), 5000);
      return () => clearTimeout(t);
    }, [bookingHoursToast]);

    const hasHoursUnsaved = useMemo(
      () =>
        hoursUserHasEditedRef.current &&
        bookingState != null &&
        lastSavedBookingRef.current != null &&
        JSON.stringify(bookingState) !== lastSavedBookingRef.current,
      [bookingState]
    );

    useEffect(() => {
      onUnsavedChange?.(hasHoursUnsaved);
    }, [hasHoursUnsaved, onUnsavedChange]);

    useEffect(() => {
      if (typeof window === "undefined" || !siteId) return;
      const dayLabels = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"] as const;
      const dayKeys = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
      const unsubscribe = subscribeBookingSettings(
        siteId,
        (firestoreSettings) => {
          const openingHours = (["0", "1", "2", "3", "4", "5", "6"] as const).map((key, i) => {
            const d = firestoreSettings.days[key];
            const enabled = d?.enabled ?? false;
            const breaks = (d as { breaks?: { start: string; end: string }[] })?.breaks;
            return {
              day: dayKeys[i]!,
              label: dayLabels[i]!,
              open: enabled ? (d?.start ?? null) : null,
              close: enabled ? (d?.end ?? null) : null,
              breaks: breaks && breaks.length > 0 ? breaks : undefined,
            };
          });
          const closedDates = (
            firestoreSettings as { closedDates?: Array<{ date: string; label?: string }> }
          ).closedDates;
          const convertedState: SalonBookingState = {
            defaultSlotMinutes: firestoreSettings.slotMinutes,
            openingHours,
            workers: [],
            bookings: [],
            closedDates: Array.isArray(closedDates) && closedDates.length > 0 ? closedDates : [],
          };
          setBookingState(convertedState);
          lastSavedBookingRef.current = JSON.stringify(convertedState);
          hoursUserHasEditedRef.current = false;
          if (typeof window !== "undefined") {
            window.localStorage.setItem(`bookingState:${siteId}`, JSON.stringify(convertedState));
          }
        },
        (err) => {
          console.error("[AdminOpeningHoursSection] Failed to load booking settings", err);
          try {
            const bookingRaw = window.localStorage.getItem(`bookingState:${siteId}`);
            if (bookingRaw) {
              const parsed = JSON.parse(bookingRaw) as SalonBookingState;
              setBookingState(parsed);
              lastSavedBookingRef.current = JSON.stringify(parsed);
            } else {
              setBookingState(defaultBookingState);
              lastSavedBookingRef.current = JSON.stringify(defaultBookingState);
            }
            hoursUserHasEditedRef.current = false;
          } catch {
            setBookingState(defaultBookingState);
            lastSavedBookingRef.current = JSON.stringify(defaultBookingState);
            hoursUserHasEditedRef.current = false;
          }
        }
      );
      return () => unsubscribe();
    }, [siteId]);

    const persistHours = useCallback(
      async (state: SalonBookingState) => {
        const bookingSettings = convertSalonBookingStateToBookingSettings(state);
        await saveBookingSettings(siteId, bookingSettings);
        await resetWorkersAvailabilityToBusinessHours(siteId, bookingSettings);
        lastSavedBookingRef.current = JSON.stringify(state);
        hoursUserHasEditedRef.current = false;
      },
      [siteId]
    );

    const saveIfDirtyWithoutModal = useCallback(async () => {
      if (!bookingState) return;
      const dirty =
        hoursUserHasEditedRef.current &&
        lastSavedBookingRef.current != null &&
        JSON.stringify(bookingState) !== lastSavedBookingRef.current;
      if (!dirty) return;
      const err = validateSalonBookingBreaks(bookingState);
      if (err) {
        setBookingSaveError(err);
        return;
      }
      setBookingSaveError(null);
      try {
        await persistHours(bookingState);
      } catch (e) {
        console.error("[AdminOpeningHoursSection] saveIfDirtyWithoutModal failed", e);
      }
    }, [bookingState, persistHours]);

    useImperativeHandle(
      ref,
      () => ({
        saveIfDirtyWithoutModal,
      }),
      [saveIfDirtyWithoutModal]
    );

    const handleBookingStateChange = (next: SalonBookingState) => {
      hoursUserHasEditedRef.current = true;
      setBookingState(next);
      const err = validateSalonBookingBreaks(next);
      setBookingSaveError(err ?? null);
      if (typeof window !== "undefined" && siteId) {
        window.localStorage.setItem(`bookingState:${siteId}`, JSON.stringify(next));
      }
    };

    const handleSaveHoursClick = () => {
      if (!bookingState) return;
      const err = validateSalonBookingBreaks(bookingState);
      if (err) {
        setBookingSaveError(err);
        return;
      }
      setBookingSaveError(null);
      setShowHoursConfirmModal(true);
    };

    const handleConfirmSaveHours = async () => {
      if (!bookingState || !siteId) return;
      setHoursSaving(true);
      try {
        await persistHours(bookingState);
        setBookingHoursToast("שעות הפעילות נשמרו. זמינות העובדים אופסה בהתאם.");
        setShowHoursConfirmModal(false);
      } catch (error) {
        console.error("[AdminOpeningHoursSection] Failed to save booking settings:", error);
      } finally {
        setHoursSaving(false);
      }
    };

    return (
      <>
        <div className="pt-2 sm:pt-4 space-y-4">
          <h2 className="text-base sm:text-lg font-bold text-[#0F172A]">שעות פעילות</h2>
          {bookingHoursToast && (
            <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs sm:text-sm text-emerald-800 text-right">
              {bookingHoursToast}
            </div>
          )}
          {bookingSaveError && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs sm:text-sm text-red-700 text-right">
              {bookingSaveError}
            </div>
          )}
          {bookingState && (
            <AdminBookingTab
              state={bookingState}
              onChange={handleBookingStateChange}
              onSaveRequest={hasHoursUnsaved ? handleSaveHoursClick : undefined}
            />
          )}
        </div>

        <ConfirmModal
          open={showHoursConfirmModal}
          onConfirm={handleConfirmSaveHours}
          onClose={() => setShowHoursConfirmModal(false)}
          message="שמירת שעות הפעילות תאפס את זמינות כל העובדים ותתאים אותה לשעות הפעילות של העסק. האם להמשיך?"
          messageSecondary="Saving business hours will reset all workers' availability to match the business hours. Do you want to continue?"
          confirmLabel="אישור"
          cancelLabel="ביטול"
          submitting={hoursSaving}
        />
      </>
    );
  }
);
