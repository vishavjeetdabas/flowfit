// Firebase configuration and initialization
// ⚠️ Replace these values with your Firebase project config
// Get them from: Firebase Console → Project Settings → General → Your apps → Web app

import { initializeApp } from "firebase/app";
import {
  getFirestore,
  enableIndexedDbPersistence,
} from "firebase/firestore";
import {
  getAuth,
  GoogleAuthProvider,
} from "firebase/auth";

const firebaseConfig = {
  apiKey: "REPLACE_ME",
  authDomain: "REPLACE_ME.firebaseapp.com",
  projectId: "REPLACE_ME",
  storageBucket: "REPLACE_ME.firebasestorage.app",
  messagingSenderId: "REPLACE_ME",
  appId: "REPLACE_ME",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

// Enable offline persistence so the app works without internet (great for gym)
enableIndexedDbPersistence(db).catch((err) => {
  if (err.code === "failed-precondition") {
    console.warn("Firestore persistence unavailable: multiple tabs open");
  } else if (err.code === "unimplemented") {
    console.warn("Firestore persistence not supported in this browser");
  }
});

export { db, auth, googleProvider };
export const isFirebaseConfigured = () => firebaseConfig.apiKey !== "REPLACE_ME";
