import { createGameEngine as createFeintEngine } from '../src/games/feintpainting/gameEngine.js';
import {
  handleHostMessage as feintHostMessage,
} from '../src/games/feintpainting/protocol.js';
import { MAX_PLAYERS as FEINT_MAX, MIN_PLAYERS as FEINT_MIN } from '../src/games/feintpainting/constants.js';

import { createGameEngine as createYangEngine } from '../src/games/yangsechan/gameEngine.js';
import {
  handleHostMessage as yangHostMessage,
  onHostEngineReady as yangEngineReady,
} from '../src/games/yangsechan/protocol.js';
import { MAX_PLAYERS as YANG_MAX, MIN_PLAYERS as YANG_MIN } from '../src/games/yangsechan/constants.js';

import { createGameEngine as createAirhockeyEngine } from '../src/games/airhockey/gameEngine.js';
import {
  handleHostMessage as airhockeyHostMessage,
} from '../src/games/airhockey/protocol.js';
import { MAX_PLAYERS as AIR_MAX, MIN_PLAYERS as AIR_MIN } from '../src/games/airhockey/constants.js';

export const SERVER_GAMES = {
  feintpainting: {
    id: 'feintpainting',
    maxPlayers: FEINT_MAX,
    minPlayers: FEINT_MIN,
    createEngine: createFeintEngine,
    handleHostMessage: feintHostMessage,
    onHostEngineReady: null,
  },
  yangsechan: {
    id: 'yangsechan',
    maxPlayers: YANG_MAX,
    minPlayers: YANG_MIN,
    createEngine: createYangEngine,
    handleHostMessage: yangHostMessage,
    onHostEngineReady: yangEngineReady,
  },
  airhockey: {
    id: 'airhockey',
    maxPlayers: AIR_MAX,
    minPlayers: AIR_MIN,
    createEngine: createAirhockeyEngine,
    handleHostMessage: airhockeyHostMessage,
    onHostEngineReady: null,
  },
};

export function getServerGame(id) {
  return SERVER_GAMES[id] ?? null;
}
