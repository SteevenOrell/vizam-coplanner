import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { subscribeDataChanges } from '../data/changes';
import { useDatabase } from '../data/DatabaseProvider';
import type { SqlDriver } from '../data/db/driver';
import { getMeta, setMeta, updatePreferences, wipeLocalData } from '../data/repos/core';
import { DEMO_NAMES_EN, DEMO_NAMES_FR, seedDemoData } from '../data/seed/demo';
import { syncOnce } from '../data/sync';
import { todayIso } from '../domain/dates';
import { getSupabase, supabaseConfigured } from '../services/supabase';
import { supabaseRemote } from '../services/supabaseRemote';
import { usePreferences } from './preferences';

/**
 * - new: first run or signed out → onboarding / auth.
 * - demo: local-only synthetic data, nothing leaves the device.
 * - cloud: signed in with Supabase; local SQLite first, synced in the background.
 */
export type SessionMode = 'loading' | 'new' | 'demo' | 'cloud';

export type AuthError = 'invalid' | 'exists' | 'weak' | 'confirm' | 'network' | 'unavailable' | 'unknown';
export type AuthResult = { ok: true } | { ok: false; error: AuthError };

export type SyncStatus = 'idle' | 'syncing' | 'offline' | 'error';

interface SessionValue {
  mode: SessionMode;
  email: string | null;
  cloudAvailable: boolean;
  startDemo: () => Promise<void>;
  resetDemo: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signUp: (email: string, password: string, displayName: string) => Promise<AuthResult>;
  signOut: () => Promise<void>;
  /** Leaves demo mode and goes back to onboarding (demo data is erased). */
  leaveDemo: () => Promise<void>;
  sync: { status: SyncStatus; lastAt: string | null; rejected: number };
  syncNow: () => Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

function devQuery(key: string): string | null {
  if (!__DEV__ || typeof window === 'undefined' || typeof window.location?.search !== 'string') return null;
  return new URLSearchParams(window.location.search).get(key);
}

function mapAuthError(error: { message?: string; status?: number; code?: string } | null): AuthError {
  if (!error) return 'unknown';
  const code = error.code ?? '';
  const msg = (error.message ?? '').toLowerCase();
  if (code === 'invalid_credentials' || msg.includes('invalid login')) return 'invalid';
  if (code === 'user_already_exists' || msg.includes('already registered')) return 'exists';
  if (code === 'weak_password' || msg.includes('password')) return 'weak';
  if (code === 'email_not_confirmed') return 'confirm';
  if (msg.includes('network') || msg.includes('fetch')) return 'network';
  return 'unknown';
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const database = useDatabase();
  const { prefs } = usePreferences();
  const [mode, setMode] = useState<SessionMode>('loading');
  const [email, setEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [sync, setSync] = useState<SessionValue['sync']>({ status: 'idle', lastAt: null, rejected: 0 });
  const syncing = useRef(false);
  const db: SqlDriver | null = database.status === 'ready' ? database.db : null;

  // Restore the mode on start.
  useEffect(() => {
    if (!db) return;
    let cancelled = false;
    (async () => {
      let stored = await getMeta(db, 'mode');
      // Dev web only: `?demo=1` starts (`?demo=reset` re-seeds) demo mode without onboarding (screenshots, QA).
      const demoFlag = devQuery('demo');
      if ((demoFlag === '1' && stored !== 'demo') || demoFlag === 'reset') {
        await wipeLocalData(db);
        const lang = devQuery('lang') === 'fr' ? 'fr' : 'en';
        await seedDemoData(db, devQuery('today') ?? todayIso(), lang === 'fr' ? DEMO_NAMES_FR : DEMO_NAMES_EN);
        if (lang === 'fr') await updatePreferences(db, { locale: 'fr' });
        await setMeta(db, 'mode', 'demo');
        stored = 'demo';
      }
      if (stored === 'demo') {
        if (!cancelled) setMode('demo');
        return;
      }
      const sb = getSupabase();
      if (stored === 'cloud' && sb) {
        const { data } = await sb.auth.getSession();
        const user = data.session?.user;
        if (user && user.id === (await getMeta(db, 'userId'))) {
          if (!cancelled) {
            setUserId(user.id);
            setEmail(user.email ?? null);
            setMode('cloud');
          }
          return;
        }
      }
      if (!cancelled) setMode('new');
    })().catch(() => !cancelled && setMode('new'));
    return () => {
      cancelled = true;
    };
  }, [db]);

  const syncNow = useCallback(async () => {
    const sb = getSupabase();
    if (!db || !sb || !userId || syncing.current) return;
    syncing.current = true;
    setSync((s) => ({ ...s, status: 'syncing' }));
    try {
      await syncOnce(db, supabaseRemote(sb, userId), userId);
      const rejected = Number((await getMeta(db, 'sync:rejected')) ?? 0);
      setSync({ status: 'idle', lastAt: new Date().toISOString(), rejected });
    } catch (e) {
      const msg = e instanceof Error ? e.message.toLowerCase() : '';
      setSync((s) => ({ ...s, status: msg.includes('network') || msg.includes('fetch') ? 'offline' : 'error' }));
    } finally {
      syncing.current = false;
    }
  }, [db, userId]);

  // Cloud mode: sync after local writes (debounced), on foreground and every 5 minutes.
  useEffect(() => {
    if (mode !== 'cloud') return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsub = subscribeDataChanges((source) => {
      if (source !== 'local') return;
      clearTimeout(timer);
      timer = setTimeout(() => void syncNow(), 2000);
    });
    const app = AppState.addEventListener('change', (s) => s === 'active' && void syncNow());
    const interval = setInterval(() => void syncNow(), 5 * 60_000);
    const first = setTimeout(() => void syncNow(), 0);
    return () => {
      clearTimeout(first);
      unsub();
      app.remove();
      clearInterval(interval);
      clearTimeout(timer);
    };
  }, [mode, syncNow]);

  const startDemo = useCallback(async () => {
    if (!db) return;
    await wipeLocalData(db);
    await seedDemoData(db, todayIso(), prefs.locale === 'fr' ? DEMO_NAMES_FR : DEMO_NAMES_EN);
    await setMeta(db, 'mode', 'demo');
    setMode('demo');
  }, [db, prefs.locale]);

  const resetDemo = startDemo;

  const leaveDemo = useCallback(async () => {
    if (!db) return;
    await wipeLocalData(db);
    setMode('new');
  }, [db]);

  const enterCloud = useCallback(
    async (id: string, mail: string | null) => {
      if (!db) return;
      // Another user's (or demo) data never mixes with this account.
      if ((await getMeta(db, 'userId')) !== id || (await getMeta(db, 'mode')) !== 'cloud') {
        await wipeLocalData(db);
      }
      await setMeta(db, 'userId', id);
      await setMeta(db, 'mode', 'cloud');
      setUserId(id);
      setEmail(mail);
      setMode('cloud');
    },
    [db],
  );

  const signIn = useCallback(
    async (mail: string, password: string): Promise<AuthResult> => {
      const sb = getSupabase();
      if (!sb) return { ok: false, error: 'unavailable' };
      try {
        const { data, error } = await sb.auth.signInWithPassword({ email: mail.trim(), password });
        if (error || !data.user) return { ok: false, error: mapAuthError(error) };
        await enterCloud(data.user.id, data.user.email ?? null);
        return { ok: true };
      } catch {
        return { ok: false, error: 'network' };
      }
    },
    [enterCloud],
  );

  const signUp = useCallback(
    async (mail: string, password: string, displayName: string): Promise<AuthResult> => {
      const sb = getSupabase();
      if (!sb) return { ok: false, error: 'unavailable' };
      try {
        const { data, error } = await sb.auth.signUp({
          email: mail.trim(),
          password,
          options: { data: { display_name: displayName.trim().slice(0, 80) } },
        });
        if (error) return { ok: false, error: mapAuthError(error) };
        if (!data.session || !data.user) return { ok: false, error: 'confirm' };
        await enterCloud(data.user.id, data.user.email ?? null);
        return { ok: true };
      } catch {
        return { ok: false, error: 'network' };
      }
    },
    [enterCloud],
  );

  const signOut = useCallback(async () => {
    const sb = getSupabase();
    if (db && mode === 'cloud') {
      // Push what we can first; local data is then removed from this device.
      await syncNow().catch(() => undefined);
      await wipeLocalData(db);
    }
    await sb?.auth.signOut().catch(() => undefined);
    setUserId(null);
    setEmail(null);
    setMode('new');
  }, [db, mode, syncNow]);

  const value = useMemo<SessionValue>(
    () => ({
      mode,
      email,
      cloudAvailable: supabaseConfigured,
      startDemo,
      resetDemo,
      signIn,
      signUp,
      signOut,
      leaveDemo,
      sync,
      syncNow,
    }),
    [mode, email, startDemo, resetDemo, signIn, signUp, signOut, leaveDemo, sync, syncNow],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const v = useContext(SessionContext);
  if (!v) throw new Error('useSession outside SessionProvider');
  return v;
}
