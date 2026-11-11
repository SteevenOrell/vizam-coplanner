import { addDays } from '../dates';
import type { TxKind } from '../models';
import { normalizeText } from './layout';
import type { ImportDraft } from './types';

export interface ExistingTx {
  kind: TxKind;
  amountMinor: number;
  occurredOn: string;
  description: string;
}

export type DuplicateKind = 'existing' | 'file';

/**
 * Descriptions are similar when they are equal once normalised, one contains the other, they share at least half of
 * their words, or one side has no description at all (nothing to contradict the match).
 */
export function similarDescriptions(a: string, b: string): boolean {
  const x = normalizeText(a);
  const y = normalizeText(b);
  if (x === '' || y === '' || x === y) return true;
  if (Math.min(x.length, y.length) >= 3 && (x.includes(y) || y.includes(x))) return true;
  const tx = new Set(x.split(' ').filter((w) => w.length > 1));
  const ty = new Set(y.split(' ').filter((w) => w.length > 1));
  if (tx.size === 0 || ty.size === 0) return false;
  let shared = 0;
  for (const w of tx) if (ty.has(w)) shared++;
  return shared / Math.min(tx.size, ty.size) >= 0.5;
}

/**
 * Likely duplicates, keyed by draft line.
 * - 'existing': an existing transaction of the same account has the same kind and amount, a date within one day and a
 *   similar description.
 * - 'file': an earlier row of this file has the same date, kind, amount and description (the later one is flagged).
 * Rows with an error are never flagged. `existing` must already be limited to the same account.
 */
export function detectDuplicates(
  drafts: readonly ImportDraft[],
  existing: readonly ExistingTx[],
): Map<number, DuplicateKind> {
  const out = new Map<number, DuplicateKind>();
  const byKey = new Map<string, ExistingTx[]>();
  for (const e of existing) {
    const k = `${e.kind}|${e.amountMinor}`;
    const list = byKey.get(k);
    if (list) list.push(e);
    else byKey.set(k, [e]);
  }
  const seen = new Map<string, string[]>();
  for (const d of drafts) {
    if (d.error || !d.occurredOn) continue;
    const near = new Set([addDays(d.occurredOn, -1), d.occurredOn, addDays(d.occurredOn, 1)]);
    const hit = byKey
      .get(`${d.kind}|${d.amountMinor}`)
      ?.some((e) => near.has(e.occurredOn) && similarDescriptions(d.description, e.description));
    if (hit) {
      out.set(d.line, 'existing');
      continue;
    }
    const key = `${d.occurredOn}|${d.kind}|${d.amountMinor}`;
    const norm = normalizeText(d.description);
    const prior = seen.get(key);
    if (prior?.includes(norm)) out.set(d.line, 'file');
    else if (prior) prior.push(norm);
    else seen.set(key, [norm]);
  }
  return out;
}
