import { WORD_ENTRIES } from './words.js';

function stripSpaces(text) {
  return text.replace(/\s/g, '');
}

/** 히라가나·가타카나 입력을 같은 형태로 비교 */
function toHiragana(text) {
  return stripSpaces(text).replace(/[\u30a1-\u30f6]/g, (char) =>
    String.fromCharCode(char.charCodeAt(0) - 0x60)
  );
}

/** @param {import('./words.js').WordEntry | string | null | undefined} entry */
export function normalizeWordEntry(entry) {
  if (!entry) return null;
  if (typeof entry === 'string') {
    return { ko: entry, ja: entry };
  }
  return entry;
}

/** @param {import('./words.js').WordEntry | string | null | undefined} entry */
export function formatWord(entry) {
  const word = normalizeWordEntry(entry);
  if (!word) return '';
  return `${word.ko} / ${word.ja}`;
}

/** @param {import('./words.js').WordEntry | string | null | undefined} entry */
export function getWordLength(entry) {
  const word = normalizeWordEntry(entry);
  if (!word) return 0;
  return Math.max(word.ko.length, word.ja.length);
}

/** @param {string} text @param {import('./words.js').WordEntry | string | null | undefined} entry */
export function isCorrectAnswer(text, entry) {
  const word = normalizeWordEntry(entry);
  if (!word) return false;

  const trimmed = text.trim();
  if (!trimmed) return false;

  const plain = stripSpaces(trimmed);
  const hiragana = toHiragana(trimmed);

  if (plain === stripSpaces(word.ko)) return true;
  if (plain === stripSpaces(word.ja)) return true;

  if (word.jaReadings?.some((reading) => hiragana === toHiragana(reading))) {
    return true;
  }

  return false;
}

export function pickWord() {
  return WORD_ENTRIES[Math.floor(Math.random() * WORD_ENTRIES.length)];
}
