import feintpainting from './feintpainting/index.js';
import yangsechan from './yangsechan/index.js';

/** @type {import('../platform/gameTypes.js').GameDefinition[]} */
export const GAMES = [feintpainting, yangsechan];

export function getGame(id) {
  return GAMES.find((g) => g.id === id) ?? null;
}
