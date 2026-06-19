// Cloud sync hook — replaces localStorage with Firestore when signed in
// Falls back to localStorage when not signed in or Firebase isn't configured

import { useState, useEffect, useCallback, useRef } from "react";
import {
  doc,
  setDoc,
  onSnapshot,
  getDoc,
} from "firebase/firestore";
import {
  onAuthStateChanged,
  signInWithRedirect,
  getRedirectResult,
  signOut as fbSignOut,
} from "firebase/auth";
import { db, auth, googleProvider, isFirebaseConfigured } from "./firebase";

/* ─── localStorage helpers (kept as fallback) ─── */
function readLocal(k, def) {
  try {
    const r = localStorage.getItem(k);
    return r ? JSON.parse(r) : def;
  } catch {
    return def;
  }
}
function writeLocal(k, v) {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {}
}

/* ─── Firestore doc paths ─── */
const STORE_KEYS = {
  ff_plan: "plan",
  ff_logs: "logs",
  ff_body: "body",
  ff_notes: "notes",
  ff_meta: "meta",
};

function userDocRef(uid, collection) {
  return doc(db, "users", uid, "data", collection);
}

/* ─── The hook ─── */
export function useFirebaseSync() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState("local"); // "local" | "syncing" | "synced" | "offline"
  const unsubsRef = useRef([]);
  const stateRef = useRef({}); // track latest state to avoid write loops

  // Handle redirect result on page load (iOS Safari uses redirect, not popup)
  useEffect(() => {
    if (!isFirebaseConfigured()) return;
    getRedirectResult(auth).catch((err) => {
      console.error("Redirect sign-in error:", err);
    });
  }, []);

  // Listen to auth state
  useEffect(() => {
    if (!isFirebaseConfigured()) {
      setAuthLoading(false);
      return;
    }
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoading(false);
    });
    return () => unsub();
  }, []);

  // Sign in — uses redirect (works on iOS Safari; popup is blocked)
  const signIn = useCallback(async () => {
    if (!isFirebaseConfigured()) return;
    try {
      await signInWithRedirect(auth, googleProvider);
    } catch (err) {
      console.error("Sign-in error:", err);
    }
  }, []);

  // Sign out
  const signOut = useCallback(async () => {
    if (!isFirebaseConfigured()) return;
    // Clean up listeners
    unsubsRef.current.forEach((u) => u());
    unsubsRef.current = [];
    try {
      await fbSignOut(auth);
    } catch (err) {
      console.error("Sign-out error:", err);
    }
    setSyncStatus("local");
  }, []);

  // Merge local data into Firestore on first sign-in
  const mergeLocalToCloud = useCallback(async (uid) => {
    for (const [localKey, firestoreKey] of Object.entries(STORE_KEYS)) {
      const localData = readLocal(localKey, null);
      if (localData === null) continue;

      const ref = userDocRef(uid, firestoreKey);
      const snap = await getDoc(ref);

      if (!snap.exists()) {
        // Cloud is empty, push local data up
        await setDoc(ref, { value: localData });
      }
      // If cloud already has data, cloud wins (it's the source of truth)
    }
  }, []);

  // Subscribe to a Firestore document and sync changes
  const subscribe = useCallback(
    (localKey, defaultValue, setState) => {
      if (!user) return () => {};

      const firestoreKey = STORE_KEYS[localKey];
      if (!firestoreKey) return () => {};

      const ref = userDocRef(user.uid, firestoreKey);

      const unsub = onSnapshot(
        ref,
        (snap) => {
          if (snap.exists()) {
            const cloudVal = snap.data().value;
            stateRef.current[localKey] = cloudVal;
            setState(cloudVal);
            // Also keep localStorage in sync as backup
            writeLocal(localKey, cloudVal);
            setSyncStatus("synced");
          }
        },
        (err) => {
          console.warn("Firestore listen error:", err);
          setSyncStatus("offline");
        }
      );

      unsubsRef.current.push(unsub);
      return unsub;
    },
    [user]
  );

  // Write to Firestore (debounced in the caller via useEffect)
  const writeToCloud = useCallback(
    async (localKey, value) => {
      if (!user) {
        writeLocal(localKey, value);
        return;
      }

      const firestoreKey = STORE_KEYS[localKey];
      if (!firestoreKey) {
        writeLocal(localKey, value);
        return;
      }

      // Skip if value hasn't changed (avoid write loops from onSnapshot)
      if (JSON.stringify(stateRef.current[localKey]) === JSON.stringify(value)) {
        return;
      }
      stateRef.current[localKey] = value;

      // Always write to localStorage as backup
      writeLocal(localKey, value);

      try {
        setSyncStatus("syncing");
        const ref = userDocRef(user.uid, firestoreKey);
        await setDoc(ref, { value });
        setSyncStatus("synced");
      } catch (err) {
        console.warn("Firestore write error (will retry when online):", err);
        setSyncStatus("offline");
      }
    },
    [user]
  );

  // Read initial data (from cloud if signed in, localStorage otherwise)
  const readStore = useCallback(
    async (localKey, defaultValue) => {
      if (!user) {
        return readLocal(localKey, defaultValue);
      }

      const firestoreKey = STORE_KEYS[localKey];
      if (!firestoreKey) return readLocal(localKey, defaultValue);

      try {
        const ref = userDocRef(user.uid, firestoreKey);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          const val = snap.data().value;
          stateRef.current[localKey] = val;
          writeLocal(localKey, val); // keep localStorage in sync
          return val;
        }
        return readLocal(localKey, defaultValue);
      } catch {
        return readLocal(localKey, defaultValue);
      }
    },
    [user]
  );

  return {
    user,
    authLoading,
    syncStatus,
    firebaseConfigured: isFirebaseConfigured(),
    signIn,
    signOut,
    mergeLocalToCloud,
    subscribe,
    writeToCloud,
    readStore,
    readLocal,
    writeLocal,
  };
}
