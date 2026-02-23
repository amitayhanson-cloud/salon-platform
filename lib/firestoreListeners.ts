/**
 * Dev-only Firestore listener instrumentation to detect leaks and spikes.
 * In production this is a direct pass-through to onSnapshot.
 * Use in admin UI pages to ensure active listener count returns to ~0 when navigating away.
 */

import { onSnapshot, type Unsubscribe } from "firebase/firestore";
import type { Query, DocumentReference } from "firebase/firestore";

const isDev = typeof process !== "undefined" && process.env.NODE_ENV !== "production";
/** Set to true only when debugging listener leaks; avoids log spam and Fast Refresh churn. */
const DEV_LISTENER_LOGS = false;

let activeListenerCount = 0;

export function getActiveListenerCount(): number {
  return activeListenerCount;
}

function getPathLabel(ref: Query | DocumentReference): string {
  try {
    if ("path" in ref) return (ref as DocumentReference).path;
    if ("_query" in ref) {
      const q = (ref as Query & { _query: { path?: { segments?: string[] } } })._query;
      const path = q?.path?.segments?.join("/");
      return path ?? "query";
    }
    return "query";
  } catch {
    return "unknown";
  }
}

type ErrorCallback = (error: Error) => void;

/** QuerySnapshot-like: has .docs. Use for query listeners. */
export type QuerySnapshotLike = { docs: { id: string; data: () => Record<string, unknown> }[] };

/** DocumentSnapshot-like: has .exists(), .data(). Use for doc listeners. */
export type DocumentSnapshotLike = { exists: () => boolean; data: () => Record<string, unknown> | undefined };

function onSnapshotDebugImpl(
  label: string,
  queryOrRef: Query | DocumentReference,
  onNext: (snapshot: QuerySnapshotLike | DocumentSnapshotLike) => void,
  onError?: ErrorCallback
): Unsubscribe {
  if (!isDev) {
    return onSnapshot(
      queryOrRef as Query,
      onNext as (snapshot: import("firebase/firestore").QuerySnapshot) => void,
      onError
    );
  }

  const path = getPathLabel(queryOrRef);
  activeListenerCount += 1;
  if (DEV_LISTENER_LOGS) console.log(`[Firestore listener +1] ${label} | active=${activeListenerCount} | ${path}`);

  const unsubscribe = onSnapshot(
    queryOrRef as Query,
    (snapshot) => {
      onNext(snapshot as QuerySnapshotLike | DocumentSnapshotLike);
    },
    (err) => {
      if (onError) onError(err);
    }
  );

  return () => {
    activeListenerCount -= 1;
    if (DEV_LISTENER_LOGS) console.log(`[Firestore listener -1] ${label} | active=${activeListenerCount}`);
    unsubscribe();
  };
}

/** Query listener — callback receives snapshot with .docs */
export function onSnapshotDebug(
  label: string,
  queryOrRef: Query,
  onNext: (snapshot: QuerySnapshotLike) => void,
  onError?: ErrorCallback
): Unsubscribe {
  return onSnapshotDebugImpl(
    label,
    queryOrRef,
    onNext as (snapshot: QuerySnapshotLike | DocumentSnapshotLike) => void,
    onError
  );
}
/** Document listener — callback receives snapshot with .exists() and .data() */
export function onSnapshotDebugDoc(
  label: string,
  queryOrRef: DocumentReference,
  onNext: (snapshot: DocumentSnapshotLike) => void,
  onError?: ErrorCallback
): Unsubscribe {
  return onSnapshotDebugImpl(
    label,
    queryOrRef,
    onNext as (snapshot: QuerySnapshotLike | DocumentSnapshotLike) => void,
    onError
  );
}
