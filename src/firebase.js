import { initializeApp } from "firebase/app";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from "firebase/firestore";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyDFR1nyWhcg4GfyvNtY7SCJW3kSfqiINDo",
  authDomain: "flowfit-8aec1.firebaseapp.com",
  projectId: "flowfit-8aec1",
  storageBucket: "flowfit-8aec1.firebasestorage.app",
  messagingSenderId: "864676093826",
  appId: "1:864676093826:web:5d91492abe9a4de49e799b",
  measurementId: "G-07JV6WNV8B",
};

const app = initializeApp(firebaseConfig);

// Modern offline-first persistence (replaces deprecated enableIndexedDbPersistence)
const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager(),
  }),
});

const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

export { db, auth, googleProvider };
export const isFirebaseConfigured = () => firebaseConfig.apiKey !== "REPLACE_ME";
