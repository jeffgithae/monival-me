/**
 * Pure-JS fuzzy matching utilities for beneficiary deduplication.
 *
 * No external dependencies — implements Levenshtein distance directly so we
 * don't need to pull in a package for what is, at field-data scale (names
 * and dates of birth, a handful of words long), a cheap O(n*m) computation.
 */

/**
 * Classic Levenshtein edit distance between two strings (insertions,
 * deletions, substitutions). Case-sensitive — callers should normalise
 * case/whitespace before calling.
 */
export function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  // Single rolling row to keep this O(min(m,n)) in space.
  let prevRow = new Array(n + 1);
  for (let j = 0; j <= n; j++) prevRow[j] = j;

  for (let i = 1; i <= m; i++) {
    const currRow = new Array(n + 1);
    currRow[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      currRow[j] = Math.min(
        prevRow[j] + 1,      // deletion
        currRow[j - 1] + 1,  // insertion
        prevRow[j - 1] + cost, // substitution
      );
    }
    prevRow = currRow;
  }
  return prevRow[n];
}

/**
 * Normalises a name for comparison: lowercase, trim, collapse whitespace,
 * strip punctuation. Keeps the comparison robust to "Jane  O'Brien" vs
 * "jane obrien" style discrepancies common in field-collected data.
 */
export function normalizeName(input?: string | null): string {
  if (!input) return '';
  return input
    .toLowerCase()
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '') // strip accents
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Similarity score in [0, 1] between two strings based on normalised
 * Levenshtein distance (1 - distance / maxLength). Identical strings (after
 * normalisation) score 1.0; completely different strings of equal length
 * score 0.0.
 */
export function stringSimilarity(a?: string | null, b?: string | null): number {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const maxLen = Math.max(na.length, nb.length);
  if (maxLen === 0) return 1;
  const dist = levenshteinDistance(na, nb);
  return Math.max(0, 1 - dist / maxLen);
}

/**
 * Token-set similarity: splits both names into word tokens and scores based
 * on how many tokens have a close fuzzy match in the other set, regardless
 * of order. Handles "John Michael Otieno" vs "Otieno John M." style reorders
 * that plain Levenshtein on the full string would score poorly.
 */
export function nameTokenSimilarity(a?: string | null, b?: string | null): number {
  const ta = normalizeName(a).split(' ').filter(Boolean);
  const tb = normalizeName(b).split(' ').filter(Boolean);
  if (ta.length === 0 || tb.length === 0) return 0;

  let matched = 0;
  const usedB = new Set<number>();
  for (const tokA of ta) {
    let bestIdx = -1;
    let bestScore = 0;
    for (let i = 0; i < tb.length; i++) {
      if (usedB.has(i)) continue;
      const score = stringSimilarity(tokA, tb[i]);
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }
    // A token counts as "matched" if it's a close fuzzy hit (tolerates
    // typos / OCR errors / transliteration spelling differences).
    if (bestIdx >= 0 && bestScore >= 0.75) {
      matched += bestScore;
      usedB.add(bestIdx);
    }
  }
  return matched / Math.max(ta.length, tb.length);
}

/**
 * Date-of-birth proximity score in [0, 1]. Exact match scores 1.0; this
 * tolerates small recording errors (e.g. day/month transposition, or a
 * birth year guessed within a year or two — common for beneficiaries
 * without formal documentation) by decaying smoothly with day difference,
 * while still scoring 0 for dates that are clearly unrelated.
 */
export function dobProximity(a?: Date | string | null, b?: Date | string | null): number {
  if (!a || !b) return 0;
  const da = new Date(a);
  const db = new Date(b);
  if (isNaN(da.getTime()) || isNaN(db.getTime())) return 0;

  const dayDiff = Math.abs(da.getTime() - db.getTime()) / (1000 * 60 * 60 * 24);
  if (dayDiff === 0) return 1;

  // Common field-data error: day/month swapped (e.g. 03/07 vs 07/03).
  const swappedA = new Date(da.getFullYear(), da.getDate() - 1, da.getMonth() + 1);
  if (!isNaN(swappedA.getTime())) {
    const swappedDiff = Math.abs(swappedA.getTime() - db.getTime()) / (1000 * 60 * 60 * 24);
    if (swappedDiff === 0) return 0.9;
  }

  if (dayDiff <= 3) return 0.85;
  if (dayDiff <= 31) return 0.5;
  if (dayDiff <= 366) return 0.2;
  return 0;
}

/**
 * Combined fuzzy match score for a beneficiary pair, blending name token
 * similarity (weighted higher — it's the primary discriminating signal)
 * with DOB proximity. Returns a single confidence score in [0, 1].
 */
export function fuzzyBeneficiaryScore(
  recordA: { name?: string | null; dateOfBirth?: Date | string | null },
  recordB: { name?: string | null; dateOfBirth?: Date | string | null },
): number {
  const nameScore = nameTokenSimilarity(recordA.name, recordB.name);
  const dobScore = dobProximity(recordA.dateOfBirth, recordB.dateOfBirth);

  // If neither record has a DOB, fall back to name similarity alone but
  // discount it slightly since we have one fewer corroborating signal.
  if (!recordA.dateOfBirth || !recordB.dateOfBirth) {
    return nameScore * 0.8;
  }

  return nameScore * 0.7 + dobScore * 0.3;
}
