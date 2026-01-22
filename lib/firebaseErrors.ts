/**
 * Firebase error normalization and handling
 * Converts Firebase errors into user-friendly messages
 */

export type NormalizedError = {
  code?: string;
  message: string;
};

/**
 * Safely extract error information from any error object
 */
function extractErrorInfo(error: unknown): {
  code?: string;
  message?: string;
  name?: string;
  stack?: string;
  stringified?: string;
} {
  const info: {
    code?: string;
    message?: string;
    name?: string;
    stack?: string;
    stringified?: string;
  } = {};

  if (error && typeof error === "object") {
    const err = error as any;
    
    // Extract common error properties
    if (typeof err.code === "string") info.code = err.code;
    if (typeof err.message === "string") info.message = err.message;
    if (typeof err.name === "string") info.name = err.name;
    if (typeof err.stack === "string") info.stack = err.stack;

    // Try to stringify the error object with all properties
    try {
      info.stringified = JSON.stringify(error, Object.getOwnPropertyNames(error));
    } catch (e) {
      // If JSON.stringify fails, try with a replacer
      try {
        info.stringified = JSON.stringify(error, (key, value) => {
          if (value instanceof Error) {
            return {
              name: value.name,
              message: value.message,
              stack: value.stack,
            };
          }
          return value;
        });
      } catch (e2) {
        info.stringified = String(error);
      }
    }
  }

  return info;
}

/**
 * Normalize Firebase errors into a clean structure
 * Handles FirebaseError, Error, and unknown types
 */
export function normalizeFirebaseError(error: unknown): NormalizedError {
  const info = extractErrorInfo(error);
  const code = info.code;
  const rawMessage = info.message || String(error) || "Unknown error";

  // Map Firebase error codes to Hebrew messages
  const errorMessages: Record<string, string> = {
    "auth/email-already-in-use": "האימייל כבר קיים במערכת. נסה להתחבר או לאפס סיסמה",
    "auth/weak-password": "הסיסמה חלשה מדי. יש להשתמש בסיסמה של לפחות 6 תווים",
    "auth/invalid-email": "כתובת האימייל אינה תקינה",
    "auth/operation-not-allowed": "שיטת ההתחברות לא מופעלת. אנא הפעל Email/Password ב-Firebase Console",
    "auth/invalid-api-key": "מפתח API לא תקין. אנא בדוק את הגדרות Firebase שלך",
    "auth/network-request-failed": "בעיית רשת. בדוק את החיבור לאינטרנט",
    "auth/too-many-requests": "יותר מדי ניסיונות. נסה שוב מאוחר יותר",
    "auth/user-disabled": "החשבון הושבת. אנא פנה לתמיכה",
    "auth/invalid-credential": "אימייל או סיסמה שגויים. אם נרשמת עם Google, השתמש בכפתור 'התחברות עם Google'",
    "auth/wrong-password": "אימייל או סיסמה שגויים",
    "auth/user-not-found": "חשבון לא נמצא. אם נרשמת עם Google, השתמש בכפתור 'התחברות עם Google'. אחרת, הירשם תחילה",
    "auth/invalid-verification-code": "קוד האימות שגוי",
    "auth/invalid-verification-id": "מזהה האימות שגוי",
    "auth/code-expired": "קוד האימות פג תוקף",
    "auth/popup-closed-by-user": "חלון ההתחברות נסגר",
    "auth/popup-blocked": "חלון ההתחברות נחסם. אנא אפשר חלונות קופצים בדפדפן",
    "auth/account-exists-with-different-credential": "חשבון קיים עם שיטת התחברות אחרת. נסה להתחבר עם Google או אימייל/סיסמה",
  };

  // Return normalized error with Hebrew message if available
  if (code && errorMessages[code]) {
    return {
      code,
      message: errorMessages[code],
    };
  }

  // If no code or unknown code, return the raw message
  return {
    code,
    message: rawMessage,
  };
}

/**
 * Log error with full details for debugging
 * Safe to use with any error type
 * Returns error info for further processing
 */
export function logFirebaseError(context: string, error: unknown): { code?: string; message?: string } {
  const info = extractErrorInfo(error);
  
  // Only log in development
  if (process.env.NODE_ENV === "development") {
    console.error(`[${context}] Firebase error (raw):`, error);
    console.error(`[${context}] Firebase error (string):`, String(error));
    
    if (info.code) {
      console.error(`[${context}] Error code:`, info.code);
    }
    if (info.message) {
      console.error(`[${context}] Error message:`, info.message);
    }
    if (info.name) {
      console.error(`[${context}] Error name:`, info.name);
    }
    if (info.stack) {
      console.error(`[${context}] Error stack:`, info.stack);
    }
    if (info.stringified) {
      console.error(`[${context}] Error (stringified):`, info.stringified);
    }
    
    // Also log the normalized error
    const normalized = normalizeFirebaseError(error);
    console.error(`[${context}] Normalized error:`, normalized);
  }
  
  return { code: info.code, message: info.message };
}
