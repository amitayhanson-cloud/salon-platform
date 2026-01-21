import { db, auth } from "@/lib/firebaseClient";
import { doc, getDoc, deleteDoc, collection, getDocs, writeBatch } from "firebase/firestore";
import { deleteUser, reauthenticateWithCredential, EmailAuthProvider } from "firebase/auth";
import type { User as FirebaseUser } from "firebase/auth";

/**
 * Delete all subcollections under users/{uid}/site/main
 */
async function deleteSiteMainSubcollections(userId: string): Promise<void> {
  if (!db) throw new Error("Firestore db not initialized");
  
  const siteMainRef = doc(db, "users", userId, "site", "main");
  
  // All known subcollections under users/{uid}/site/main
  const subcollections = [
    "workers",
    "bookings",
    "services", // Legacy services subcollection (if exists)
    "pricingItems",
    "pricingCategories",
    "clients",
  ];
  
  // Delete all subcollections
  for (const subcollectionName of subcollections) {
    try {
      const subcollectionRef = collection(siteMainRef, subcollectionName);
      const snapshot = await getDocs(subcollectionRef);
      
      if (snapshot.empty) {
        if (process.env.NODE_ENV === "development") {
          console.log(`[deleteSiteMainSubcollections] Subcollection ${subcollectionName} is empty`);
        }
        continue;
      }
      
      // Delete all documents in batches (Firestore batch limit is 500)
      const docs = snapshot.docs;
      const batchSize = 500;
      
      for (let i = 0; i < docs.length; i += batchSize) {
        const batch = writeBatch(db);
        const batchDocs = docs.slice(i, i + batchSize);
        
        batchDocs.forEach((docSnap) => {
          batch.delete(docSnap.ref);
        });
        
        await batch.commit();
        console.log(`[deleteSiteMainSubcollections] Deleted batch ${Math.floor(i / batchSize) + 1} from ${subcollectionName}`);
      }
      
      console.log(`[deleteSiteMainSubcollections] Deleted ${docs.length} documents from ${subcollectionName}`);
    } catch (err) {
      // Subcollection might not exist, continue
      if (process.env.NODE_ENV === "development") {
        console.log(`[deleteSiteMainSubcollections] Subcollection ${subcollectionName} not found or error:`, err);
      }
    }
  }
  
  // Handle nested bookingSettings (users/{uid}/site/main/settings/booking)
  try {
    const bookingSettingsRef = doc(db, "users", userId, "site", "main", "settings", "booking");
    const bookingSettingsSnap = await getDoc(bookingSettingsRef);
    
    if (bookingSettingsSnap.exists()) {
      await deleteDoc(bookingSettingsRef);
      console.log(`[deleteSiteMainSubcollections] Deleted bookingSettings document`);
    }
  } catch (err) {
    if (process.env.NODE_ENV === "development") {
      console.log(`[deleteSiteMainSubcollections] bookingSettings not found or error:`, err);
    }
  }
}

/**
 * Delete all Firestore data for a user
 * Deletes: users/{uid}/site/main subcollections, then users/{uid}/site/main, then users/{uid}
 */
export async function deleteUserFirestoreData(userId: string): Promise<void> {
  if (!db) throw new Error("Firestore db not initialized");
  
  console.log(`[deleteUserFirestoreData] Starting deletion for user: ${userId}`);
  
  try {
    // Step 1: Delete all subcollections under users/{uid}/site/main
    await deleteSiteMainSubcollections(userId);
    
    // Step 2: Delete the site/main document
    const siteMainRef = doc(db, "users", userId, "site", "main");
    const siteMainSnap = await getDoc(siteMainRef);
    
    if (siteMainSnap.exists()) {
      await deleteDoc(siteMainRef);
      console.log(`[deleteUserFirestoreData] Deleted site/main document: users/${userId}/site/main`);
    }
    
    // Step 3: Delete the main user document (this will also delete any remaining subcollections)
    const userRef = doc(db, "users", userId);
    const userSnap = await getDoc(userRef);
    
    if (userSnap.exists()) {
      await deleteDoc(userRef);
      console.log(`[deleteUserFirestoreData] Deleted user document: users/${userId}`);
    } else {
      console.log(`[deleteUserFirestoreData] User document does not exist: users/${userId}`);
    }
    
    console.log(`[deleteUserFirestoreData] Successfully deleted all Firestore data for user: ${userId}`);
  } catch (error) {
    console.error(`[deleteUserFirestoreData] Error deleting Firestore data:`, error);
    throw error;
  }
}

/**
 * Delete Firebase Auth user account
 * Requires recent authentication - will throw if user needs to re-authenticate
 */
export async function deleteFirebaseAuthUser(
  firebaseUser: FirebaseUser,
  password?: string
): Promise<void> {
  if (!auth) throw new Error("Firebase Auth not initialized");
  
  try {
    // Try to delete the user directly
    await deleteUser(firebaseUser);
    console.log(`[deleteFirebaseAuthUser] Successfully deleted Auth user: ${firebaseUser.uid}`);
  } catch (error: any) {
    // If error is about requiring recent login, and password is provided, try re-authentication
    if (error.code === "auth/requires-recent-login" && password && firebaseUser.email) {
      console.log(`[deleteFirebaseAuthUser] Re-authentication required, attempting re-auth...`);
      
      try {
        // Re-authenticate the user
        const credential = EmailAuthProvider.credential(firebaseUser.email, password);
        await reauthenticateWithCredential(firebaseUser, credential);
        
        // Retry deletion after re-authentication
        await deleteUser(firebaseUser);
        console.log(`[deleteFirebaseAuthUser] Successfully deleted Auth user after re-auth: ${firebaseUser.uid}`);
      } catch (reauthError: any) {
        console.error(`[deleteFirebaseAuthUser] Re-authentication failed:`, reauthError);
        throw new Error("נדרשת התחברות מחדש כדי למחוק את החשבון. אנא התחבר שוב ונסה שנית.");
      }
    } else {
      // Re-throw other errors
      console.error(`[deleteFirebaseAuthUser] Error deleting Auth user:`, error);
      throw error;
    }
  }
}

/**
 * Delete user account completely (Firestore + Auth)
 * This is a DESTRUCTIVE operation that cannot be undone
 * 
 * @param firebaseUser - The current authenticated Firebase user
 * @param password - Optional password for re-authentication if needed
 */
export async function deleteUserAccount(
  firebaseUser: FirebaseUser,
  password?: string
): Promise<void> {
  const userId = firebaseUser.uid;
  
  console.log(`[deleteUserAccount] Starting account deletion for user: ${userId}`);
  
  try {
    // Step 1: Delete all Firestore data first
    await deleteUserFirestoreData(userId);
    
    // Step 2: Delete Firebase Auth user
    await deleteFirebaseAuthUser(firebaseUser, password);
    
    console.log(`[deleteUserAccount] Successfully deleted account for user: ${userId}`);
  } catch (error) {
    console.error(`[deleteUserAccount] Failed to delete account:`, error);
    throw error;
  }
}
