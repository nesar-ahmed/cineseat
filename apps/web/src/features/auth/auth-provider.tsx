'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { LoginInput, PublicUser, SignupInput } from '@cineseat/shared';
import {
  ApiClientError,
  getMe,
  login as apiLogin,
  logout as apiLogout,
  signup as apiSignup,
} from '../../lib/api';

/**
 * Session state for the whole app (guideline section 11: auth lives in
 * `features/`, the header, login pages and the account panel all read it here).
 *
 * The token is an httpOnly cookie, invisible to page JavaScript, so the only
 * way to learn who is signed in is to ask `GET /auth/me` once on load.
 */

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

type AuthValue = {
  user: PublicUser | null;
  status: AuthStatus;
  /** Signs in; resolves with the profile the API returned. Throws ApiClientError on failure. */
  login: (input: LoginInput) => Promise<PublicUser>;
  /** Creates an account and signs straight into it (the API sets the cookie on signup). */
  signup: (input: SignupInput) => Promise<PublicUser>;
  signOut: () => Promise<void>;
  /** Applies a fresh PublicUser after PATCH /users/me or an avatar upload. */
  setUser: (user: PublicUser) => void;
};

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<PublicUser | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');

  useEffect(() => {
    let active = true;
    getMe()
      .then(({ user: profile }) => {
        if (!active) return;
        setUserState(profile);
        setStatus('authenticated');
      })
      .catch(() => {
        // 401 is the normal "no session" answer; a dead API is treated the
        // same way so the app never spins on "loading" forever.
        if (!active) return;
        setUserState(null);
        setStatus('unauthenticated');
      });
    return () => {
      active = false;
    };
  }, []);

  const login = useCallback(async (input: LoginInput) => {
    const { user: signedIn } = await apiLogin(input);
    setUserState(signedIn);
    setStatus('authenticated');
    return signedIn;
  }, []);

  const signup = useCallback(async (input: SignupInput) => {
    const { user: created } = await apiSignup(input);
    setUserState(created);
    setStatus('authenticated');
    return created;
  }, []);

  const signOut = useCallback(async () => {
    try {
      await apiLogout();
    } catch (error) {
      // Even if the call fails, drop local state — the worst case is a cookie
      // that expires on its own.
      if (!(error instanceof ApiClientError)) throw error;
    } finally {
      setUserState(null);
      setStatus('unauthenticated');
    }
  }, []);

  const value = useMemo<AuthValue>(
    () => ({ user, status, login, signup, signOut, setUser: setUserState }),
    [user, status, login, signup, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}
