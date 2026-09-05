import { initializeApp, getApps } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
} from "firebase/auth";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

async function loginWithGoogle() {
  try {
    // Debug output to inspect effective firebaseConfig at runtime
    // eslint-disable-next-line no-console
    console.log('[firebase] firebaseConfig:', firebaseConfig);
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[firebase] loginWithGoogle error:', err);
    throw err;
  }
}

async function logout() {
  return signOut(auth);
}

function getCurrentUser() {
  return new Promise((resolve, reject) => {
    const unsubscribe = onAuthStateChanged(
      auth,
      (user) => {
        unsubscribe();
        resolve(user);
      },
      (error) => {
        unsubscribe();
        reject(error);
      }
    );
  });
}

async function isAdmin() {
  const user = await getCurrentUser();
  if (!user) {
    return false;
  }

  const tokenResult = await user.getIdTokenResult();
  return Boolean(tokenResult.claims?.admin === true);
}

export {
  auth,
  googleProvider,
  firebaseConfig,
  loginWithGoogle,
  logout,
  getCurrentUser,
  isAdmin,
};
