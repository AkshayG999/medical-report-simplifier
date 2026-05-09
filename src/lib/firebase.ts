import { initializeApp, getApps } from 'firebase/app';
import {
  createUserWithEmailAndPassword,
  getAuth,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
} from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'MY_FIREBASE_WEB_API_KEY',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'MY_PROJECT.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'MY_PROJECT_ID',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'MY_PROJECT.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || 'MY_SENDER_ID',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || 'MY_FIREBASE_WEB_APP_ID',
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || '',
};

export const firebaseApp = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export function signInWithGoogle() {
  return signInWithPopup(auth, googleProvider);
}

function authEmailFromIdentifier(identifier: string): string {
  const normalized = identifier.trim().toLowerCase();

  if (normalized.includes('@')) {
    return normalized;
  }

  const phoneDigits = normalized.replace(/\D/g, '');
  if (phoneDigits.length < 10) {
    throw new Error('Enter a valid email address or mobile number.');
  }

  return `${phoneDigits}@phone.medinsight.local`;
}

export function signInWithPassword(identifier: string, password: string) {
  return signInWithEmailAndPassword(auth, authEmailFromIdentifier(identifier), password);
}

export async function createPasswordAccount(identifier: string, password: string, displayName?: string) {
  const credential = await createUserWithEmailAndPassword(auth, authEmailFromIdentifier(identifier), password);

  if (displayName?.trim()) {
    await updateProfile(credential.user, { displayName: displayName.trim() });
  }

  return credential;
}

export function signOutUser() {
  return signOut(auth);
}
