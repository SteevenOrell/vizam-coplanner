import type { Category, TxKind } from '../models';
import { normalizeText } from './layout';

export interface CategoryRuleLike {
  pattern: string;
  kind: TxKind;
  categoryId: string;
}

export type SuggestionSource = 'rule' | 'keyword';
export interface Suggestion {
  categoryId: string;
  source: SuggestionSource;
}

interface Entry {
  icon: string;
  kind: TxKind;
  keywords: readonly string[];
}

/**
 * Built-in keywords per category. They are matched to the user's categories by `icon` (names differ by language and
 * the user can rename them; icons do not). Canadian (English and French) and West African merchants and terms.
 * The longest matching keyword wins, so "uber eats" beats "uber".
 */
export const KEYWORDS: readonly Entry[] = [
  {
    icon: 'cart',
    kind: 'expense',
    keywords: [
      'grocery',
      'groceries',
      'supermarket',
      'supermarche',
      'super marche',
      'epicerie',
      'iga',
      'metro',
      'maxi',
      'provigo',
      'loblaws',
      'super c',
      'costco',
      'sobeys',
      'safeway',
      'no frills',
      'freshco',
      'walmart',
      'adonis',
      'carrefour',
      'auchan',
      'marche',
      'sococe',
      'fruits et legumes',
      'boucherie',
      'fruiterie',
    ],
  },
  {
    icon: 'utensils',
    kind: 'expense',
    keywords: [
      'restaurant',
      'resto',
      'cafe',
      'coffee',
      'starbucks',
      'tim hortons',
      'mcdonald',
      'mcdonalds',
      'subway',
      'pizza',
      'burger',
      'uber eats',
      'ubereats',
      'doordash',
      'skip the dishes',
      'skipthedishes',
      'a w',
      'kfc',
      'pub',
      'boulangerie',
      'bakery',
      'patisserie',
      'maquis',
      'snack',
      'bistro',
      'traiteur',
      'dominos',
    ],
  },
  {
    icon: 'bus',
    kind: 'expense',
    keywords: [
      'uber',
      'lyft',
      'taxi',
      'yango',
      'gozem',
      'stm',
      'ttc',
      'opus',
      'presto',
      'essence',
      'gas bar',
      'petro',
      'petro canada',
      'shell',
      'esso',
      'sunoco',
      'ultramar',
      'total energies',
      'totalenergies',
      'carburant',
      'parking',
      'stationnement',
      'via rail',
      'autobus',
      'transit',
      'sotra',
      'train',
    ],
  },
  {
    icon: 'bolt',
    kind: 'expense',
    keywords: [
      'hydro',
      'hydro quebec',
      'hydro one',
      'electricity',
      'electricite',
      'enbridge',
      'gaz',
      'natural gas',
      'internet',
      'videotron',
      'bell',
      'rogers',
      'telus',
      'fido',
      'koodo',
      'virgin plus',
      'freedom mobile',
      'cie',
      'sodeci',
      'senelec',
      'mtn',
      'moov',
      'airtime',
      'recharge',
      'forfait',
      'cellulaire',
      'wifi',
      'utilities',
      'water bill',
      'facture eau',
    ],
  },
  {
    icon: 'home',
    kind: 'expense',
    keywords: [
      'rent',
      'loyer',
      'mortgage',
      'hypotheque',
      'condo',
      'property tax',
      'taxes foncieres',
      'landlord',
      'proprio',
      'syndic',
      'assurance habitation',
      'home insurance',
      'bail',
    ],
  },
  {
    icon: 'heart',
    kind: 'expense',
    keywords: [
      'pharmacie',
      'pharmacy',
      'jean coutu',
      'pharmaprix',
      'shoppers drug',
      'uniprix',
      'familiprix',
      'clinique',
      'clinic',
      'dentist',
      'dentiste',
      'hopital',
      'hospital',
      'medecin',
      'doctor',
      'optique',
      'physio',
      'sante',
      'medical',
      'laboratoire',
    ],
  },
  {
    icon: 'repeat',
    kind: 'expense',
    keywords: [
      'netflix',
      'spotify',
      'disney',
      'apple music',
      'icloud',
      'youtube premium',
      'amazon prime',
      'prime video',
      'crave',
      'canal',
      'showmax',
      'deezer',
      'adobe',
      'subscription',
      'abonnement',
      'membership',
      'gym',
    ],
  },
  {
    icon: 'users',
    kind: 'expense',
    keywords: [
      'orange money',
      'wave',
      'transfert',
      'transfer',
      'western union',
      'moneygram',
      'remittance',
      'famille',
      'family',
      'momo',
      'mobile money',
      'moov money',
      'wari',
      'envoi',
    ],
  },
  {
    icon: 'briefcase',
    kind: 'income',
    keywords: ['payroll', 'paie', 'paye', 'salaire', 'salary', 'wages', 'wage', 'remuneration', 'traitement'],
  },
];

const COMPILED = KEYWORDS.map((e) => ({
  ...e,
  keywords: e.keywords.map((k) => normalizeText(k)),
}));

/** Whole-word match for short words ("iga", "stm"), word-start match otherwise ("pharmacie" in "pharmacies"). */
function matches(haystack: string, keyword: string): boolean {
  const padded = ` ${haystack} `;
  const needle = ` ${keyword}`;
  if (keyword.length <= 4) return padded.includes(`${needle} `);
  return padded.includes(needle);
}

/** First meaningful word of a bank description, used as the keyword for "always use this category". */
export function keywordFor(description: string): string {
  const words = normalizeText(description)
    .split(' ')
    .filter((w) => /[a-z]/.test(w));
  if (words.length === 0) return '';
  const first = words[0]!;
  const second = words[1];
  const word = first.length <= 3 && second ? `${first} ${second}` : first;
  return word.slice(0, 40);
}

/**
 * 1. The user's rules (case-insensitive substring of the description, same kind; the longest pattern wins).
 * 2. Built-in keywords, resolved to the user's category with the matching icon and kind.
 * Returns null when nothing matches or the user has no category for it.
 */
export function suggestCategory(
  draft: { description: string; kind: TxKind },
  rules: readonly CategoryRuleLike[],
  categories: readonly Category[],
): Suggestion | null {
  const lower = draft.description.toLowerCase();
  const norm = normalizeText(draft.description);
  let ruleHit: CategoryRuleLike | null = null;
  for (const r of rules) {
    if (r.kind !== draft.kind) continue;
    const p = r.pattern.trim().toLowerCase();
    if (p === '') continue;
    if ((lower.includes(p) || norm.includes(normalizeText(p))) && (!ruleHit || p.length > ruleHit.pattern.length)) {
      ruleHit = r;
    }
  }
  if (ruleHit) return { categoryId: ruleHit.categoryId, source: 'rule' };

  let best: { icon: string; len: number } | null = null;
  for (const e of COMPILED) {
    if (e.kind !== draft.kind) continue;
    for (const k of e.keywords) {
      if (k !== '' && matches(norm, k) && (!best || k.length > best.len)) best = { icon: e.icon, len: k.length };
    }
  }
  if (!best) return null;
  const category = categories.find((c) => c.kind === draft.kind && c.icon === best!.icon);
  return category ? { categoryId: category.id, source: 'keyword' } : null;
}
