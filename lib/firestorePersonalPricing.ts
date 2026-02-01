import {
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
  onSnapshot,
  type Unsubscribe,
} from "firebase/firestore";
import { clientDocRef } from "./firestoreClientRefs";

export interface PersonalPricing {
  serviceId: string; // For grouping (service category)
  serviceTypeId: string; // The pricing item ID (this is the key)
  price: number;
  updatedAt?: any; // Firestore Timestamp
  updatedBy?: string;
}

/**
 * Personal pricing is stored as a field on the client document:
 * sites/{siteId}/clients/{phone}.personalPricing[serviceTypeId]
 * 
 * Note: clientId = phone number (document ID)
 */

/**
 * Get personal pricing for a specific service type from client doc
 */
export async function getPersonalPricing(
  siteId: string,
  phone: string,
  serviceTypeId: string
): Promise<PersonalPricing | null> {
  try {
    const docRef = clientDocRef(siteId, phone);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      const data = docSnap.data();
      const personalPricing = data.personalPricing || {};
      const price = personalPricing[serviceTypeId];
      
      // personalPricing is a simple map: { [serviceTypeId]: number }
      if (typeof price === 'number') {
        return {
          serviceId: "", // Not stored in simple map format
          serviceTypeId: String(serviceTypeId),
          price: Number(price) || 0,
        } as PersonalPricing;
      }
    }
    return null;
  } catch (error) {
    console.error("[PersonalPricing] Error getting personal pricing", {
      siteId,
      phone,
      serviceTypeId,
      error,
    });
    throw error;
  }
}

/**
 * Get all personal pricing overrides for a client from client doc
 */
export async function getAllPersonalPricing(
  siteId: string,
  phone: string
): Promise<Map<string, PersonalPricing>> {
  try {
    const docRef = clientDocRef(siteId, phone);
    const docSnap = await getDoc(docRef);
    
    const pricingMap = new Map<string, PersonalPricing>();
    
    if (docSnap.exists()) {
      const data = docSnap.data();
      const personalPricing = data.personalPricing || {};
      
      // personalPricing is a simple map: { [serviceTypeId]: number }
      Object.entries(personalPricing).forEach(([serviceTypeId, price]: [string, any]) => {
        if (typeof price === 'number') {
          pricingMap.set(serviceTypeId, {
            serviceId: "", // Not stored in simple map format
            serviceTypeId: String(serviceTypeId),
            price: Number(price) || 0,
          } as PersonalPricing);
        }
      });
    }
    
    return pricingMap;
  } catch (error) {
    console.error("[PersonalPricing] Error getting all personal pricing", {
      siteId,
      phone,
      error,
    });
    throw error;
  }
}

/**
 * Subscribe to client document to get personal pricing updates
 * Returns a map keyed by serviceTypeId
 */
export function subscribePersonalPricing(
  siteId: string,
  phone: string,
  onUpdate: (pricingMap: Map<string, PersonalPricing>) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  try {
    const docRef = clientDocRef(siteId, phone);
    
    if (process.env.NODE_ENV === "development") {
      console.log("[PersonalPricing] Setting up subscription to client doc", {
        siteId,
        phone,
        path: `sites/${siteId}/clients/${phone}`,
      });
    }
    
    return onSnapshot(
      docRef,
      (snapshot) => {
        const pricingMap = new Map<string, PersonalPricing>();
        
        if (snapshot.exists()) {
          const data = snapshot.data();
          const personalPricing = data.personalPricing || {};
          
          console.log("[PersonalPricing] Subscription snapshot", {
            siteId,
            phone,
            path: docRef.path,
            fullPath: `sites/${siteId}/clients/${phone}`,
            hasPersonalPricing: !!data.personalPricing,
            personalPricing,
          });
          
          // personalPricing is a simple map: { [serviceTypeId]: number }
          Object.entries(personalPricing).forEach(([serviceTypeId, price]: [string, any]) => {
            if (typeof price === 'number') {
              pricingMap.set(serviceTypeId, {
                serviceId: "", // Not stored in simple map format
                serviceTypeId: String(serviceTypeId),
                price: Number(price) || 0,
              } as PersonalPricing);
            }
          });
        } else {
          console.log("[PersonalPricing] Client doc does not exist in subscription", {
            siteId,
            phone,
            path: docRef.path,
          });
        }
        
        if (process.env.NODE_ENV === "development") {
          console.log("[PersonalPricing] Subscription update", {
            siteId,
            phone,
            overrideCount: pricingMap.size,
            serviceTypeIds: Array.from(pricingMap.keys()),
          });
        }
        
        onUpdate(pricingMap);
      },
      (error) => {
        console.error("[PersonalPricing] Error subscribing to personal pricing", {
          siteId,
          phone,
          error,
        });
        if (onError) {
          onError(error);
        }
      }
    );
  } catch (error) {
    console.error("[PersonalPricing] Error setting up subscription", {
      siteId,
      phone,
      error,
    });
    if (onError) {
      onError(error as Error);
    }
    return () => {};
  }
}

/**
 * Set personal pricing for a service type - writes to client doc
 */
export async function setPersonalPricing(
  siteId: string,
  phone: string,
  serviceId: string,
  serviceTypeId: string,
  price: number,
  updatedBy?: string
): Promise<void> {
  // Validate price
  const priceNum = Number(price);
  if (Number.isNaN(priceNum)) {
    throw new Error("Price must be a valid number");
  }
  if (priceNum < 0) {
    throw new Error("Price must be >= 0");
  }

  try {
    // Write to client doc: sites/{siteId}/clients/{phone}
    const docRef = clientDocRef(siteId, phone);
    
    console.log("Saving client data", {
      siteId,
      phone,
      serviceTypeId,
      price: priceNum,
      path: docRef.path,
      fullPath: `sites/${siteId}/clients/${phone}`,
    });
    
    // Check if document exists
    const existingSnap = await getDoc(docRef);
    
    if (existingSnap.exists()) {
      // Document exists - use updateDoc with dot notation to update only this key
      await updateDoc(docRef, {
        [`personalPricing.${serviceTypeId}`]: priceNum,
        updatedAt: serverTimestamp(),
      });
    } else {
      // Document doesn't exist - use setDoc with merge
      await setDoc(
        docRef,
        {
          personalPricing: {
            [serviceTypeId]: priceNum,
          },
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    }

    // Hard verification: Read-after-write
    const verifySnap = await getDoc(docRef);
    if (!verifySnap.exists()) {
      throw new Error(`Save failed: client document does not exist at sites/${siteId}/clients/${phone}`);
    }

    const verifyData = verifySnap.data();
    console.log("POST-SAVE SNAPSHOT", {
      path: docRef.path,
      exists: verifySnap.exists(),
      data: verifyData,
      hasPersonalPricing: !!verifyData?.personalPricing,
      personalPricing: verifyData?.personalPricing,
      targetKey: serviceTypeId,
      targetValue: verifyData?.personalPricing?.[serviceTypeId],
    });
    
    const savedPrice = verifyData?.personalPricing?.[serviceTypeId];
    
    if (savedPrice === undefined || savedPrice === null) {
      throw new Error(`Save failed: personalPricing.${serviceTypeId} does not exist after write`);
    }

    if (Number(savedPrice) !== priceNum) {
      throw new Error(`Save failed: price mismatch. Expected ${priceNum}, got ${savedPrice}`);
    }

    console.log("[PersonalPricing] Saved override verified", {
      siteId,
      phone,
      serviceTypeId,
      price: priceNum,
      path: docRef.path,
      verified: true,
      savedPrice,
    });
  } catch (error) {
    console.error("[PersonalPricing] Error setting personal pricing", {
      siteId,
      phone,
      serviceTypeId,
      price,
      error,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Remove personal pricing override for a service type (reset to default)
 */
export async function removePersonalPricing(
  siteId: string,
  phone: string,
  serviceTypeId: string
): Promise<void> {
  try {
    const docRef = clientDocRef(siteId, phone);
    
    console.log("Removing client personal pricing", {
      siteId,
      phone,
      serviceTypeId,
      path: docRef.path,
      fullPath: `sites/${siteId}/clients/${phone}`,
    });
    
    // Read existing client doc to preserve other fields
    const existingSnap = await getDoc(docRef);
    if (!existingSnap.exists()) {
      // Document doesn't exist, nothing to remove
      console.log("[PersonalPricing] Client doc does not exist, nothing to remove");
      return;
    }
    
    const existingData = existingSnap.data();
    const existingPricing = (existingData.personalPricing || {}) as Record<string, number>;
    
    // Remove the serviceTypeId from pricing object
    const updatedPricing = { ...existingPricing };
    delete updatedPricing[serviceTypeId];
    
    // Use setDoc with merge to update only personalPricing field
    await setDoc(
      docRef,
      {
        personalPricing: updatedPricing,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
    
    // Hard verification: Verify deletion
    const verifySnap = await getDoc(docRef);
    if (verifySnap.exists()) {
      const verifyData = verifySnap.data();
      console.log("POST-DELETE SNAPSHOT", {
        path: docRef.path,
        exists: verifySnap.exists(),
        data: verifyData,
        hasPersonalPricing: !!verifyData?.personalPricing,
        personalPricing: verifyData?.personalPricing,
        deletedKey: serviceTypeId,
        keyStillExists: verifyData?.personalPricing?.[serviceTypeId] !== undefined,
      });
      
      if (verifyData?.personalPricing?.[serviceTypeId] !== undefined) {
        throw new Error(`Deletion failed: personalPricing.${serviceTypeId} still exists after delete`);
      }
    }
    
    console.log("[PersonalPricing] Removed override verified", {
      siteId,
      phone,
      serviceTypeId,
      path: docRef.path,
    });
  } catch (error) {
    console.error("[PersonalPricing] Error removing personal pricing", {
      siteId,
      phone,
      serviceTypeId,
      error,
    });
    throw error;
  }
}
