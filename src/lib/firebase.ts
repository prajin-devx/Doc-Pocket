import { initializeApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  signOut as fbSignOut,
  GoogleAuthProvider,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

export const SCOPES = ['https://www.googleapis.com/auth/drive.file'];

export const googleProvider = new GoogleAuthProvider();
SCOPES.forEach(scope => googleProvider.addScope(scope));
googleProvider.setCustomParameters({ prompt: 'select_account' });

// In-memory access token cache as strictly mandated by Workspace Integration Skill
let cachedAccessToken: string | null = null;
let isSigningIn = false;

// Token change listeners
const tokenListeners = new Set<(token: string | null) => void>();

export function onTokenChange(cb: (token: string | null) => void): () => void {
  tokenListeners.add(cb);
  return () => tokenListeners.delete(cb);
}

function notifyTokenChange(token: string | null) {
  cachedAccessToken = token;
  tokenListeners.forEach(cb => {
    try {
      cb(token);
    } catch (err) {
      console.warn('Error in token listener:', err);
    }
  });
}

/**
 * Initialize auth listener. Clears memory token when user signs out.
 */
export const initAuth = (
  onAuthSuccess?: (user: User, token: string | null) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
    } else {
      notifyTokenChange(null);
      if (onAuthFailure) onAuthFailure();
    }
  });
};

/**
 * Google Sign In with Drive permissions
 */
export async function loginWithGoogle(): Promise<{ user: User; accessToken: string }> {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, googleProvider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    const token =
      credential?.accessToken ||
      (result as any)?._tokenResponse?.oauthAccessToken ||
      (result as any)?._tokenResponse?.oauthIdToken ||
      (result as any)?.credential?.accessToken;

    if (!token) {
      throw new Error('Google authorization succeeded but no access token was returned.');
    }
    notifyTokenChange(token);
    return { user: result.user, accessToken: token };
  } catch (error) {
    console.error('Google Sign-in error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
}

/**
 * Retrieve active access token from memory cache
 */
export async function getAccessToken(): Promise<string | null> {
  return cachedAccessToken;
}

/**
 * Check if active access token is present
 */
export function hasCachedAccessToken(): boolean {
  return !!cachedAccessToken;
}

/**
 * Set active access token in memory cache
 */
export function setCachedAccessToken(token: string | null): void {
  notifyTokenChange(token);
}

/**
 * Sign out user and purge in-memory token
 */
export async function logoutUser(): Promise<void> {
  notifyTokenChange(null);
  await fbSignOut(auth);
}
