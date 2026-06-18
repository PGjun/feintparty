import { WORDS, ROUND_TIME, MIN_ROUNDS, MAX_ROUNDS } from './constants.js';

function pickWord() {
  return WORDS[Math.floor(Math.random() * WORDS.length)];
}

export function createGameEngine(hostId, onBroadcast, onClearCanvas) {
  const state = {
    code: '',
    players: [],
    drawerIndex: 0,
    round: 1,
    maxRounds: 6,
    status: 'waiting',
    currentWord: '',
    timeLeft: ROUND_TIME,
    messages: [],
    timer: null,
  };

  function getStateForPlayer(playerId) {
    const isDrawer = state.players[state.drawerIndex]?.id === playerId;
    const view = {
      code: state.code,
      players: state.players.map((p) => ({ id: p.id, name: p.name, score: p.score })),
      drawerIndex: state.drawerIndex,
      round: state.round,
      maxRounds: state.maxRounds,
      status: state.status,
      timeLeft: state.timeLeft,
      messages: state.messages.slice(-50),
      isDrawer,
      myId: playerId,
      word: null,
      wordLength: 0,
    };

    if (state.status === 'playing') {
      view.wordLength = state.currentWord.length;
      if (isDrawer) view.word = state.currentWord;
    }
    return view;
  }

  function broadcastState() {
    state.players.forEach((p) => {
      onBroadcast(p.id, { type: 'state', state: getStateForPlayer(p.id) });
    });
  }

  function addSystemMessage(text) {
    state.messages.push({ type: 'system', text, time: Date.now() });
  }

  function startRound() {
    if (state.players.length < 2) return;

    state.status = 'playing';
    state.currentWord = pickWord();
    addSystemMessage(
      `라운드 ${state.round}: ${state.players[state.drawerIndex].name}님이 그립니다!`
    );
    state.timeLeft = ROUND_TIME;
    onClearCanvas();

    clearInterval(state.timer);
    state.timer = setInterval(() => {
      state.timeLeft--;
      if (state.timeLeft <= 0) {
        endRound(false);
      } else {
        broadcastState();
      }
    }, 1000);

    broadcastState();
  }

  function endRound(guessed) {
    clearInterval(state.timer);
    state.status = 'round-end';

    if (guessed) {
      addSystemMessage(`정답! "${state.currentWord}"`);
    } else {
      addSystemMessage(`시간 초과! 정답은 "${state.currentWord}"`);
    }
    broadcastState();

    setTimeout(() => {
      state.drawerIndex = (state.drawerIndex + 1) % state.players.length;
      if (state.drawerIndex === 0) state.round++;

      if (state.round > state.maxRounds) {
        state.status = 'finished';
        addSystemMessage('게임 종료! 수고했어요 🎉');
        broadcastState();
        return;
      }
      startRound();
    }, 3000);
  }

  return {
    setCode(code) {
      state.code = code;
    },

    setPlayers(players) {
      state.players = players.map((p) => ({
        id: p.id,
        name: p.name,
        score: state.players.find((x) => x.id === p.id)?.score ?? 0,
      }));
      broadcastState();
    },

    startGame(maxRounds) {
      const rounds = Math.min(MAX_ROUNDS, Math.max(MIN_ROUNDS, parseInt(maxRounds, 10) || 6));
      state.maxRounds = rounds;
      state.round = 1;
      state.drawerIndex = 0;
      state.players.forEach((p) => (p.score = 0));
      addSystemMessage(`게임 시작! (${state.players.length}명, ${state.maxRounds}라운드)`);
      startRound();
    },

    handleDraw(stroke) {
      state.players.forEach((p) => {
        if (p.id !== state.players[state.drawerIndex]?.id) {
          onBroadcast(p.id, { type: 'draw', stroke });
        }
      });
    },

    handleClearCanvas() {
      onClearCanvas();
    },

    handleChat(fromId, fromName, text) {
      const trimmed = text.trim();
      if (!trimmed) return;

      const isDrawer = state.players[state.drawerIndex]?.id === fromId;
      const player = state.players.find((p) => p.id === fromId);
      if (!player) return;

      if (state.status === 'playing' && !isDrawer) {
        const isCorrect =
          trimmed.replace(/\s/g, '') === state.currentWord.replace(/\s/g, '');

        if (isCorrect) {
          player.score += Math.max(10, state.timeLeft);
          state.players[state.drawerIndex].score += 5;
          state.messages.push({
            type: 'correct',
            name: fromName,
            text: trimmed,
            time: Date.now(),
          });
          broadcastState();
          endRound(true);
          return;
        }

        state.messages.push({
          type: 'guess',
          name: fromName,
          text: trimmed,
          time: Date.now(),
        });
      } else {
        state.messages.push({
          type: 'chat',
          name: fromName,
          text: trimmed,
          time: Date.now(),
        });
      }
      broadcastState();
    },

    getHostState() {
      return getStateForPlayer(hostId);
    },

    destroy() {
      clearInterval(state.timer);
    },
  };
}
