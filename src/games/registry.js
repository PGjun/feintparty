import feintpainting from './feintpainting/index.js';
import yangsechan from './yangsechan/index.js';
import airhockey from './airhockey/index.js';

/** @type {import('../platform/gameTypes.js').GameDefinition[]} */
export const GAMES = [feintpainting, yangsechan, airhockey];

export function getGame(id) {
  return GAMES.find((g) => g.id === id) ?? null;
}
