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
};

export function getServerGame(id) {
  return SERVER_GAMES[id] ?? null;
}
