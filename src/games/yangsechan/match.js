export function normalizeForMatch(text) {
  return text.replace(/\s/g, '').toLowerCase();
}

export function stripPunct(text) {
  return text.replace(/[^\p{L}\p{N}]/gu, '');
}

export function isAnswerCorrect(guess, target) {
  const g = stripPunct(normalizeForMatch(guess));
  const w = stripPunct(normalizeForMatch(target));
  if (!w || !g) return false;
  return g.includes(w) || w.includes(g);
}
