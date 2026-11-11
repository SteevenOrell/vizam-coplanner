import type { SupabaseClient } from '@supabase/supabase-js';

import type { Remote, RemoteError, RemoteRow } from '../data/sync';

function fail(error: { message: string; code?: string }): never {
  const e = new Error(error.message) as RemoteError;
  e.code = error.code;
  throw e;
}

/** supabase-js implementation of the sync Remote. Every call runs as the signed-in user, under RLS. */
export function supabaseRemote(sb: SupabaseClient, userId: string): Remote {
  return {
    async upsert(table, rows) {
      const { error } = await sb.from(table).upsert(rows, { onConflict: 'id' });
      if (error) fail(error);
    },
    async pull(table, since, limit) {
      let q = sb.from(table).select('*').order('updated_at', { ascending: true }).limit(limit);
      if (since) q = q.gt('updated_at', since);
      const { data, error } = await q;
      if (error) fail(error);
      return (data ?? []) as RemoteRow[];
    },
    async savePreferences(prefs, displayName) {
      const { error } = await sb.from('user_preferences').upsert(prefs, { onConflict: 'user_id' });
      if (error) fail(error);
      const { error: e2 } = await sb.from('profiles').update({ display_name: displayName }).eq('id', userId);
      if (e2) fail(e2);
    },
    async loadPreferences() {
      const { data: prefs, error } = await sb.from('user_preferences').select('*').eq('user_id', userId).maybeSingle();
      if (error) fail(error);
      const { data: profile, error: e2 } = await sb
        .from('profiles')
        .select('display_name')
        .eq('id', userId)
        .maybeSingle();
      if (e2) fail(e2);
      return {
        prefs: (prefs as RemoteRow | null) ?? null,
        displayName: (profile?.display_name as string | undefined) ?? null,
      };
    },
  };
}
