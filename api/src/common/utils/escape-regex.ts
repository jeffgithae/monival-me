/**
 * Escapes special regex characters in user-supplied search strings before
 * they're used in a MongoDB `$regex` filter.
 *
 * Without this, a malicious or malformed search string (e.g. containing
 * nested quantifiers like `(a+)+$`) can trigger catastrophic backtracking
 * in MongoDB's regex engine — a Regular Expression Denial of Service
 * (ReDoS) that can hang the query thread.
 *
 * Always wrap free-text search input with this before building a $regex
 * filter: `{ $regex: escapeRegex(query.search), $options: 'i' }`
 */
export function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}