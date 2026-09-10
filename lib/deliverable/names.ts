// Comparing two spellings of the same person's name.
//
// A speaker arrives from a flyer as 「宮尾　佳明」, from a caption as
// 「宮尾佳明」 and from a filename as 「miyao_yoshiaki」. Deciding whether two
// of those are the same person is not a formatting question — it is what
// keeps a re-read of the flyer from throwing away the portrait already placed
// against that speaker, and what keeps a photograph from being attached to
// somebody it does not show.
//
// So the comparison is deliberately narrow: width and case are noise, spacing
// between family and given name is noise, and everything else is signal. Two
// names that merely contain a common substring are NOT the same person.

/** Width, case and the several characters Japanese uses to separate names. */
export const normalizeName = (name: string): string =>
  name
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s　・･,、,.。]/g, "")
    .trim();

/**
 * Whether two spellings name the same person.
 *
 * Containment is allowed in one direction only and only for names long enough
 * to mean something: 「宮尾佳明」 in 「宮尾佳明さん」 is the same person, and a
 * one-character overlap never is. Titles that arrive glued to a name
 * (「宮尾佳明氏」) are the common case this covers.
 */
export function sameName(a: string, b: string): boolean {
  const left = normalizeName(a);
  const right = normalizeName(b);
  if (!left || !right) return false;
  if (left === right) return true;
  const [shorter, longer] = left.length <= right.length ? [left, right] : [right, left];
  return shorter.length >= 3 && longer.startsWith(shorter);
}
