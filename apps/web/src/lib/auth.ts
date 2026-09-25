import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { firebaseConfigured, firestoreRegion, getFirebaseAuth, getFirebaseDb } from './firebase';

export type Consents = {
  terms: boolean;
  privacy: boolean;
  marketing: boolean;
  at: string;
};

export async function getIdToken(): Promise<string | null> {
  if (!firebaseConfigured()) return null;
  const user = getFirebaseAuth().currentUser;
  if (!user) return null;
  return user.getIdToken();
}

export function watchAuth(callback: (user: User | null) => void): () => void {
  if (!firebaseConfigured()) {
    callback(null);
    return () => undefined;
  }
  return onAuthStateChanged(getFirebaseAuth(), callback);
}

export async function signUp(input: {
  email: string;
  password: string;
  displayName: string;
  consents: { terms: boolean; privacy: boolean; marketing: boolean };
}): Promise<User> {
  if (!input.consents.terms || !input.consents.privacy) {
    throw new Error('You must accept the Terms and Privacy Policy.');
  }
  const auth = getFirebaseAuth();
  const credential = await createUserWithEmailAndPassword(auth, input.email.trim(), input.password);
  if (input.displayName.trim()) {
    await updateProfile(credential.user, { displayName: input.displayName.trim() });
  }
  const consents: Consents = {
    terms: true,
    privacy: true,
    marketing: Boolean(input.consents.marketing),
    at: new Date().toISOString(),
  };
  await setDoc(doc(getFirebaseDb(), 'users', credential.user.uid), {
    email: credential.user.email,
    displayName: input.displayName.trim() || null,
    region: firestoreRegion,
    createdAt: serverTimestamp(),
    consents,
  });
  return credential.user;
}

export async function signIn(email: string, password: string): Promise<User> {
  const credential = await signInWithEmailAndPassword(getFirebaseAuth(), email.trim(), password);
  return credential.user;
}

export async function logOut(): Promise<void> {
  await signOut(getFirebaseAuth());
}
