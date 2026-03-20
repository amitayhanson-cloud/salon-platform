"use client";

import { createContext, useContext, useState, useEffect, useMemo, useCallback, ReactNode } from "react";
import { auth, isFirebaseConfigValid, getFirebaseError, getFirebaseConfigStatus } from "@/lib/firebaseClient";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signInWithPhoneNumber,
  signOut,
  onAuthStateChanged,
  type User as FirebaseUser,
  type RecaptchaVerifier,
  type ConfirmationResult,
} from "firebase/auth";
import { getUserDocument, createUserDocument, updateUserProfile } from "@/lib/firestoreUsers";
import { normalizeFirebaseError, logFirebaseError } from "@/lib/firebaseErrors";
import { getActiveListenerCount } from "@/lib/firestoreListeners";
import type { User } from "@/types/user";

function isFirestorePermissionError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  const code = (err as { code?: string })?.code;
  return code === "permission-denied" || /missing or insufficient permissions/i.test(msg);
}

/** Fetch user doc with retry on permission error (auth token can lag after sign-in). */
async function getUserDocumentWithRetry(uid: string, maxRetries = 2): Promise<User | null> {
  const delays = [0, 400, 1000];
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      console.warn("[AuthProvider] Retrying getUserDocument after permission error", {
        attempt,
        uid,
        delayMs: delays[attempt],
      });
      await new Promise((r) => setTimeout(r, delays[attempt]));
    }
    try {
      return await getUserDocument(uid);
    } catch (e) {
      if (!isFirestorePermissionError(e) || attempt === maxRetries) {
        throw e;
      }
    }
  }
  return null;
}

type AuthContextType = {
  user: User | null;
  firebaseUser: FirebaseUser | null;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string; redirectPath?: string }>;
  loginWithGoogle: () => Promise<{ success: boolean; error?: string; redirectPath?: string }>;
  signup: (email: string, password: string, name?: string, phone?: string) => Promise<{ success: boolean; error?: string; userId?: string }>;
  signupWithGoogle: () => Promise<{ success: boolean; error?: string; userId?: string; needsProfile?: boolean }>;
  signupWithPhoneNumberSend: (phoneNumber: string, recaptchaVerifier: RecaptchaVerifier) => Promise<{ success: boolean; error?: string; confirmationResult?: ConfirmationResult }>;
  signupWithPhoneNumberConfirm: (confirmationResult: ConfirmationResult, code: string) => Promise<{ success: boolean; error?: string; userId?: string; needsProfile?: boolean }>;
  refreshUser: () => Promise<void>;
  logout: () => Promise<void>;
  loading: boolean;
  authReady: boolean; // True when auth state is fully initialized
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Fallback UI component for when Firebase config is invalid
function FirebaseConfigErrorBanner() {
  const configStatus = getFirebaseConfigStatus();
  const error = getFirebaseError();

  return (
    <div className="bg-yellow-50 border-b-2 border-yellow-400 p-4 text-right">
      <div className="container mx-auto max-w-4xl">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 text-yellow-600 text-xl">⚠️</div>
          <div className="flex-1">
            <h3 className="font-semibold text-yellow-900 mb-2">
              הגדרות Firebase חסרות או לא תקינות
            </h3>
            <p className="text-sm text-yellow-800 mb-2">
              {error || "נדרשות הגדרות Firebase כדי להפעיל את האפליקציה."}
            </p>
            <div className="text-xs text-yellow-700 space-y-1 mt-3">
              <p><strong>פרויקט:</strong> {configStatus.projectId}</p>
              <p><strong>דומיין:</strong> {configStatus.authDomain}</p>
              {configStatus.missingKeys.length > 0 && (
                <p><strong>משתנים חסרים:</strong> {configStatus.missingKeys.join(", ")}</p>
              )}
              {!configStatus.apiKeyValid && (
                <p><strong>מפתח API:</strong> לא תקין (נוכחי: {configStatus.apiKeyPrefix}, צריך להתחיל ב-AIza...)</p>
              )}
            </div>
            <div className="mt-3 p-3 bg-yellow-100 rounded-lg border border-yellow-300">
              <p className="text-sm font-semibold text-yellow-900 mb-2">📋 איך לתקן:</p>
              <ol className="text-xs text-yellow-800 space-y-2 list-decimal list-inside">
                <li>
                  <strong>קבל את מפתח ה-API מ-Firebase:</strong>
                  <br />
                  <span className="text-yellow-700">Firebase Console → Project Settings → General → Your apps (Web) → copy Web API key (starts with AIza...)</span>
                </li>
                <li>
                  <strong>עדכן את הקובץ <code className="bg-yellow-200 px-1 rounded">.env.local</code>:</strong>
                  <br />
                  <span className="text-yellow-700">הוסף/עדכן את <code className="bg-yellow-200 px-1 rounded">NEXT_PUBLIC_FIREBASE_API_KEY</code> עם המפתח הנכון</span>
                </li>
                <li className="font-semibold text-yellow-900">
                  <strong>⚠️ הפעל מחדש את שרת הפיתוח:</strong>
                  <br />
                  <span className="text-yellow-700">עצור את השרת (Ctrl+C) והפעל מחדש: <code className="bg-yellow-200 px-1 rounded">npm run dev</code></span>
                </li>
              </ol>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [authReady, setAuthReady] = useState(false);
  const [configValid, setConfigValid] = useState(true);

  // Check Firebase config validity (only once)
  useEffect(() => {
    if (typeof window !== "undefined") {
      const isValid = isFirebaseConfigValid();
      setConfigValid(isValid);

      if (!isValid) {
        setLoading(false);
        setAuthReady(true);
        return;
      }
    }
  }, []);

  // Expose Firestore listener debug getter on window in development (console: window.__getActiveListenerCount?.())
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") {
      (window as unknown as { __getActiveListenerCount?: () => number }).__getActiveListenerCount =
        () => getActiveListenerCount();
    }
  }, []);

  // Initialize auth listener (only once, when config is valid)
  useEffect(() => {
    // Don't initialize auth if config is invalid
    if (!configValid || !auth) {
      setLoading(false);
      setAuthReady(true);
      return;
    }

    let isMounted = true;
    let unsubscribe: (() => void) | null = null;

    if (process.env.NODE_ENV === "development") {
      console.log("[AuthProvider] Setting up onAuthStateChanged listener");
    }

    // Listen to Firebase auth state changes (subscribe only once)
    unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (process.env.NODE_ENV === "development") {
        const currentPath = typeof window !== "undefined" ? window.location.pathname : "unknown";
        console.log("[AuthProvider] onAuthStateChanged fired", {
          uid: firebaseUser?.uid || "null",
          email: firebaseUser?.email || "null",
          pathname: currentPath,
        });
      }

      // Prevent state updates if component unmounted
      if (!isMounted) {
        if (process.env.NODE_ENV === "development") {
          console.log("[AuthProvider] Component unmounted, skipping state update");
        }
        return;
      }

      if (firebaseUser) {
        setFirebaseUser(firebaseUser);
        // Ensure auth token is ready before Firestore read (avoids "Missing or insufficient permissions" race)
        try {
          await firebaseUser.getIdToken(true);
        } catch (_) {
          // non-blocking
        }
        try {
          let userDoc = await getUserDocumentWithRetry(firebaseUser.uid);

          // If user doc doesn't exist, create it (e.g., for Google users who signed in before we created docs)
          if (!userDoc) {
            if (process.env.NODE_ENV === "development") {
              console.log("[AuthProvider] User doc missing, creating...", {
                uid: firebaseUser.uid,
                email: firebaseUser.email,
                provider: firebaseUser.providerData[0]?.providerId || "unknown",
              });
            }
            try {
              userDoc = await createUserDocument(
                firebaseUser.uid,
                firebaseUser.email || "",
                firebaseUser.displayName || undefined,
                firebaseUser.phoneNumber || null
              );
            } catch (createError) {
              console.error("[AuthProvider] Error creating user document:", createError);
            }
          }

          if (isMounted) {
            setUser(userDoc);
            if (process.env.NODE_ENV === "development" && userDoc) {
              console.log("[AuthProvider] User doc loaded", {
                uid: userDoc.id,
                siteId: userDoc.siteId || "null",
              });
            }
          }
        } catch (error) {
          const isPerm = isFirestorePermissionError(error);
          console.error("[AuthProvider] Error fetching user document:", {
            error,
            message: error instanceof Error ? error.message : String(error),
            code: (error as { code?: string })?.code,
            uid: firebaseUser.uid,
          });
          if (isPerm) {
            console.error(
              "[AuthProvider] Firestore permission denied on users/{uid}. Deploy rules: firebase deploy --only firestore:rules"
            );
          }
          if (isMounted) {
            setUser(null);
          }
        }
      } else {
        setFirebaseUser(null);
        setUser(null);
        try {
          const { clearStaleRedirectStorage } = await import("@/lib/clearStaleRedirectStorage");
          clearStaleRedirectStorage();
        } catch {
          // ignore
        }
      }
      
      if (isMounted) {
        setLoading(false);
        setAuthReady(true);
      }
    });

    // Cleanup function
    return () => {
      isMounted = false;
      if (unsubscribe) {
        if (process.env.NODE_ENV === "development") {
          console.log("[AuthProvider] Unsubscribing from onAuthStateChanged");
        }
        unsubscribe();
      }
    };
  }, [configValid]); // Only re-run if configValid changes

  const login = useCallback(async (
    email: string,
    password: string
  ): Promise<{ success: boolean; error?: string; redirectPath?: string }> => {
    if (!auth) {
      console.error("Firebase Auth not initialized");
      return { success: false, error: "Firebase לא מאותחל. אנא בדוק את הגדרות Firebase שלך." };
    }

    try {
      if (process.env.NODE_ENV === "development") {
        console.log("[AuthProvider.login] Attempting email/password login", { email, provider: "password" });
      }
      
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      
      if (process.env.NODE_ENV === "development") {
        console.log("[AuthProvider.login] Login successful", { uid: userCredential.user.uid, provider: userCredential.user.providerData[0]?.providerId || "password" });
      }
      
      // Ensure Firestore user doc exists
      let userDoc = await getUserDocument(userCredential.user.uid);
      if (!userDoc) {
        // Create user doc if missing (shouldn't happen for email/password, but handle gracefully)
        if (process.env.NODE_ENV === "development") {
          console.log("[AuthProvider.login] User doc missing, creating...", { uid: userCredential.user.uid });
        }
        userDoc = await createUserDocument(
          userCredential.user.uid,
          userCredential.user.email || email,
          userCredential.user.displayName || undefined,
          userCredential.user.phoneNumber || null
        );
      }
      
      setUser(userDoc);

      // Send user to login with returnTo=admin; login page will redirect to tenant admin.
      if (process.env.NODE_ENV === "development") {
        console.log(`[AuthProvider.login] uid=${userCredential.user.uid} -> redirectPath=/login?returnTo=admin`);
      }
      return { success: true, redirectPath: "/login?returnTo=admin" };
    } catch (error: unknown) {
      // Log full error details for debugging
      const errorInfo = logFirebaseError("login", error);
      
      // Normalize error to get user-friendly message
      const normalized = normalizeFirebaseError(error);
      
      if (process.env.NODE_ENV === "development") {
        console.log("[AuthProvider.login] Login failed", { errorCode: normalized.code, errorMessage: normalized.message, provider: "password" });
      }
      
      return { success: false, error: normalized.message };
    }
  }, []);

  const loginWithGoogle = useCallback(async (): Promise<{ success: boolean; error?: string; redirectPath?: string }> => {
    if (!auth) {
      console.error("Firebase Auth not initialized");
      return { success: false, error: "Firebase לא מאותחל. אנא בדוק את הגדרות Firebase שלך." };
    }

    try {
      if (process.env.NODE_ENV === "development") {
        console.log("[AuthProvider.loginWithGoogle] Attempting Google login", { provider: "google" });
      }
      
      const provider = new GoogleAuthProvider();
      const userCredential = await signInWithPopup(auth, provider);
      
      if (process.env.NODE_ENV === "development") {
        console.log("[AuthProvider.loginWithGoogle] Google login successful", { 
          uid: userCredential.user.uid, 
          email: userCredential.user.email,
          provider: userCredential.user.providerData[0]?.providerId || "google.com"
        });
      }
      
      // Ensure Firestore user doc exists (create if missing)
      let userDoc = await getUserDocument(userCredential.user.uid);
      if (!userDoc) {
        if (process.env.NODE_ENV === "development") {
          console.log("[AuthProvider.loginWithGoogle] User doc missing, creating...", { uid: userCredential.user.uid });
        }
        // Create user doc for Google user
        userDoc = await createUserDocument(
          userCredential.user.uid,
          userCredential.user.email || "",
          userCredential.user.displayName || undefined,
          userCredential.user.phoneNumber || null
        );
      }
      
      setUser(userDoc);

      // Send user to login with returnTo=admin; login page will redirect to tenant admin.
      if (process.env.NODE_ENV === "development") {
        console.log(`[AuthProvider.loginWithGoogle] uid=${userCredential.user.uid} -> redirectPath=/login?returnTo=admin`);
      }
      return { success: true, redirectPath: "/login?returnTo=admin" };
    } catch (error: unknown) {
      // Log full error details for debugging
      const errorInfo = logFirebaseError("loginWithGoogle", error);
      
      // Normalize error to get user-friendly message
      const normalized = normalizeFirebaseError(error);
      
      if (process.env.NODE_ENV === "development") {
        console.log("[AuthProvider.loginWithGoogle] Google login failed", { errorCode: normalized.code, errorMessage: normalized.message, provider: "google" });
      }
      
      return { success: false, error: normalized.message };
    }
  }, []);

  const signup = useCallback(async (
    email: string,
    password: string,
    name?: string,
    phone?: string
  ): Promise<{ success: boolean; error?: string; userId?: string }> => {
    if (!auth) {
      console.error("Firebase Auth not initialized");
      return { success: false, error: "Firebase לא מאותחל. אנא בדוק את הגדרות Firebase שלך." };
    }

    // Validate password length before sending to Firebase
    if (password.length < 6) {
      return { success: false, error: "הסיסמה חייבת להכיל לפחות 6 תווים" };
    }

    try {
      // Create Firebase auth user
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      
      // Create Firestore user document with siteId=null (no site yet)
      const userDoc = await createUserDocument(
        userCredential.user.uid,
        email,
        name,
        phone?.trim() || null
      );
      
      setUser(userDoc);
      
      // Return userId - signup page will redirect to wizard
      return { success: true, userId: userCredential.user.uid };
    } catch (error: unknown) {
      // Log full error details for debugging
      logFirebaseError("signup", error);
      
      // Normalize error to get user-friendly message
      const normalized = normalizeFirebaseError(error);
      
      return { success: false, error: normalized.message };
    }
  }, []);

  const signupWithGoogle = useCallback(async (): Promise<{ success: boolean; error?: string; userId?: string; needsProfile?: boolean }> => {
    if (!auth) {
      return { success: false, error: "Firebase לא מאותחל. אנא בדוק את הגדרות Firebase שלך." };
    }
    try {
      const provider = new GoogleAuthProvider();
      const userCredential = await signInWithPopup(auth, provider);
      const fbUser = userCredential.user;
      let userDoc = await getUserDocument(fbUser.uid);
      if (!userDoc) {
        userDoc = await createUserDocument(
          fbUser.uid,
          fbUser.email || "",
          fbUser.displayName || undefined,
          fbUser.phoneNumber || null
        );
      }
      setUser(userDoc);
      setFirebaseUser(fbUser);
      const hasPhone = typeof userDoc.phone === "string" && userDoc.phone.trim().length > 0;
      return { success: true, userId: fbUser.uid, needsProfile: !hasPhone };
    } catch (error: unknown) {
      logFirebaseError("signupWithGoogle", error);
      const normalized = normalizeFirebaseError(error);
      return { success: false, error: normalized.message };
    }
  }, []);

  const signupWithPhoneNumberSend = useCallback(async (
    phoneNumber: string,
    recaptchaVerifier: RecaptchaVerifier
  ): Promise<{ success: boolean; error?: string; confirmationResult?: ConfirmationResult }> => {
    if (!auth) {
      return { success: false, error: "Firebase לא מאותחל. אנא בדוק את הגדרות Firebase שלך." };
    }
    try {
      const confirmationResult = await signInWithPhoneNumber(auth, phoneNumber, recaptchaVerifier);
      return { success: true, confirmationResult };
    } catch (error: unknown) {
      logFirebaseError("signupWithPhoneNumberSend", error);
      const normalized = normalizeFirebaseError(error);
      return { success: false, error: normalized.message };
    }
  }, []);

  const signupWithPhoneNumberConfirm = useCallback(async (
    confirmationResult: ConfirmationResult,
    code: string
  ): Promise<{ success: boolean; error?: string; userId?: string; needsProfile?: boolean }> => {
    if (!auth) {
      return { success: false, error: "Firebase לא מאותחל." };
    }
    try {
      const userCredential = await confirmationResult.confirm(code);
      const fbUser = userCredential.user;
      const phone = fbUser.phoneNumber || "";
      let userDoc = await getUserDocument(fbUser.uid);
      if (!userDoc) {
        userDoc = await createUserDocument(
          fbUser.uid,
          fbUser.email || "",
          fbUser.displayName || undefined,
          phone || null
        );
      } else if (phone && !(typeof userDoc.phone === "string" && userDoc.phone.trim().length > 0)) {
        await updateUserProfile(fbUser.uid, { phone });
        const merged = await getUserDocument(fbUser.uid);
        if (merged) userDoc = merged;
      }
      setUser(userDoc);
      setFirebaseUser(fbUser);
      return { success: true, userId: fbUser.uid, needsProfile: true };
    } catch (error: unknown) {
      logFirebaseError("signupWithPhoneNumberConfirm", error);
      const normalized = normalizeFirebaseError(error);
      return { success: false, error: normalized.message };
    }
  }, []);

  const refreshUser = useCallback(async () => {
    if (!firebaseUser) return;
    try {
      const userDoc = await getUserDocumentWithRetry(firebaseUser.uid);
      if (userDoc) setUser(userDoc);
    } catch (e) {
      console.error("[AuthProvider] refreshUser failed:", e);
    }
  }, [firebaseUser]);

  const logout = useCallback(async () => {
    if (!auth) return;
    try {
      const { clearStaleRedirectStorage } = await import("@/lib/clearStaleRedirectStorage");
      clearStaleRedirectStorage();
      await signOut(auth);
      setUser(null);
      setFirebaseUser(null);
    } catch (error) {
      console.error("Error signing out:", error);
    }
  }, []);

  const contextValue = useMemo(
    () => ({
      user,
      firebaseUser,
      login,
      loginWithGoogle,
      signup,
      signupWithGoogle,
      signupWithPhoneNumberSend,
      signupWithPhoneNumberConfirm,
      refreshUser,
      logout,
      loading,
      authReady,
    }),
    [
      user,
      firebaseUser,
      login,
      loginWithGoogle,
      signup,
      signupWithGoogle,
      signupWithPhoneNumberSend,
      signupWithPhoneNumberConfirm,
      refreshUser,
      logout,
      loading,
      authReady,
    ]
  );

  // Show fallback UI if Firebase config is invalid
  if (!configValid) {
    return (
      <AuthContext.Provider value={{ user: null, firebaseUser: null, login, loginWithGoogle, signup, signupWithGoogle: async () => ({ success: false, error: "Firebase לא מוגדר" }), signupWithPhoneNumberSend: async () => ({ success: false, error: "Firebase לא מוגדר" }), signupWithPhoneNumberConfirm: async () => ({ success: false, error: "Firebase לא מוגדר" }), refreshUser: async () => {}, logout, loading: false, authReady: true }}>
        <FirebaseConfigErrorBanner />
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-lg p-6 max-w-md text-right">
            <h2 className="text-xl font-bold text-slate-900 mb-4">
              האפליקציה לא מוכנה לשימוש
            </h2>
            <p className="text-slate-600 mb-4">
              נדרשות הגדרות Firebase תקינות כדי להפעיל את האפליקציה. אנא עיין בהודעת השגיאה למעלה.
            </p>
            <p className="text-sm text-slate-500">
              לאחר עדכון הקובץ <code className="bg-slate-100 px-1 rounded">.env.local</code>, הפעל מחדש את שרת הפיתוח.
            </p>
          </div>
        </div>
      </AuthContext.Provider>
    );
  }

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

