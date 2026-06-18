import { TURN_TIME } from './constants.js';
import { isAnswerCorrect } from './match.js';

function shuffleDerangement(n) {
  if (n <= 1) return null;
  if (n === 2) return [1, 0];

  for (let attempt = 0; attempt < 50; attempt++) {
    const perm = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [perm[i], perm[j]] = [perm[j], perm[i]];
    }
    if (perm.every((v, i) => v !== i)) return perm;
  }

  return Array.from({ length: n }, (_, i) => (i + 1) % n);
}

export function createGameEngine(hostId, onBroadcast, _onClearCanvas, onGameFinished) {
  const state = {
    code: '',
    players: [],
    status: 'waiting',
    submissions: {},
    assignedWords: {},
    turnPlayerIndex: 0,
    turnNumber: 1,
    turnMode: null,
    answerPending: false,
    timeLeft: TURN_TIME,
    lastStand: false,
    lastStandPlayerId: null,
    messages: [],
    timer: null,
  };


  function getActivePlayers() {
    return state.players.filter((p) => !p.guessed);
  }

  function getCurrentTurnPlayer() {
    return state.players[state.turnPlayerIndex] ?? null;
  }

  function addSystemMessage(text) {
    state.messages.push({ type: 'system', text, time: Date.now() });
  }

  function broadcastState() {
    state.players.forEach((p) => {
      onBroadcast(p.id, { type: 'state', state: getStateForPlayer(p.id) });
    });
  }

  function clearTimer() {
    clearInterval(state.timer);
    state.timer = null;
  }

  function resetAssigningState() {
    state.submissions = {};
    state.assignedWords = {};
    state.turnPlayerIndex = 0;
    state.turnNumber = 1;
    state.turnMode = null;
    state.answerPending = false;
    state.timeLeft = TURN_TIME;
    state.lastStand = false;
    state.lastStandPlayerId = null;
    state.players.forEach((p) => {
      p.rank = null;
      p.guessed = false;
    });
  }

  function getLastStandPlayer() {
    if (!state.lastStandPlayerId) return null;
    return state.players.find((p) => p.id === state.lastStandPlayerId) ?? null;
  }

  function getStateForPlayer(playerId) {
    const me = state.players.find((p) => p.id === playerId);
    const current = getCurrentTurnPlayer();
    const lastStandPlayer = getLastStandPlayer();
    const isLastStandPlayer = state.lastStand && state.lastStandPlayerId === playerId;
    const isMyTurn =
      state.status === 'playing' &&
      !state.lastStand &&
      current?.id === playerId &&
      !me?.guessed;

    const submission = state.submissions[playerId];

    const myAssignedWord = state.assignedWords[playerId] ?? '';
    const playerCount = state.players.length;
    let myWord = null;
    let myWordRevealReason = null;

    if (myAssignedWord && (state.status === 'playing' || state.status === 'finished')) {
      if (state.status === 'finished') {
        myWord = myAssignedWord;
        myWordRevealReason = me?.guessed ? 'correct' : 'last';
      } else if (playerCount >= 3 && me?.guessed) {
        myWord = myAssignedWord;
        myWordRevealReason = 'correct';
      }
    }

    const view = {
      code: state.code,
      players: state.players.map((p) => ({
        id: p.id,
        name: p.name,
        rank: p.rank,
        guessed: p.guessed,
        confirmed: !!state.submissions[p.id]?.confirmed,
      })),
      status: state.status,
      turnNumber: state.turnNumber,
      turnPlayerId: current?.id ?? null,
      turnPlayerName: current?.name ?? null,
      turnMode: state.turnMode,
      timeLeft: state.timeLeft,
      lastStand: state.lastStand,
      lastStandPlayerId: state.lastStandPlayerId,
      lastStandPlayerName: lastStandPlayer?.name ?? null,
      isLastStandPlayer,
      canGiveUp: isLastStandPlayer,
      isMyTurn,
      canSelectMode: isMyTurn && state.turnMode === null && !state.lastStand,
      canPassTurn: isMyTurn && state.turnMode === 'question' && !state.lastStand,
      allConfirmed:
        state.players.length >= 2 &&
        state.players.every((p) => state.submissions[p.id]?.confirmed),
      myDraftWord: submission?.confirmed ? '' : (submission?.word ?? ''),
      myConfirmed: !!submission?.confirmed,
      messages: state.messages.slice(-50),
      myId: playerId,
      myWord,
      myWordRevealReason,
      othersWords: [],
    };

    if (state.status === 'playing' || state.status === 'finished') {
      view.othersWords = state.players
        .filter((p) => p.id !== playerId)
        .map((p) => ({
          id: p.id,
          name: p.name,
          word: state.assignedWords[p.id] ?? '???',
        }));
    }

    return view;
  }

  function finishGame(reason) {
    clearTimer();
    state.status = 'finished';
    state.turnMode = null;
    state.answerPending = false;
    state.lastStand = false;
    state.lastStandPlayerId = null;

    if (reason) addSystemMessage(reason);

    const ranked = state.players
      .filter((p) => p.rank != null && p.guessed)
      .sort((a, b) => a.rank - b.rank);
    if (ranked.length > 0 || state.players.some((p) => p.rank != null && !p.guessed)) {
      const lines = ranked.map((p) => `${p.rank}등: ${p.name}`);
      const last = state.players.find((p) => p.rank != null && !p.guessed);
      if (last) lines.push(`꼴등: ${last.name}`);
      if (lines.length > 0) addSystemMessage(`🏁 ${lines.join(' · ')}`);
    }

    onGameFinished?.();
    broadcastState();
  }

  function markCorrect(playerId, playerName, text) {
    const player = state.players.find((p) => p.id === playerId);
    if (!player || player.guessed) return;

    const rank = state.players.filter((p) => p.guessed).length + 1;
    player.guessed = true;
    player.rank = rank;

    state.messages.push({
      type: 'correct',
      name: playerName,
      text,
      time: Date.now(),
    });
    addSystemMessage(`🎉 ${playerName}님 정답! (${rank}등)`);

    const remaining = getActivePlayers();
    if (remaining.length === 0) {
      finishGame();
      return;
    }
    if (remaining.length === 1) {
      startLastStand(remaining[0]);
      return;
    }

    advanceTurn();
  }

  function startLastStand(lastPlayer) {
    clearTimer();
    state.lastStand = true;
    state.lastStandPlayerId = lastPlayer.id;
    state.turnMode = null;
    state.answerPending = false;
    addSystemMessage(`🎯 ${lastPlayer.name}님의 마지막 기회!`);
    broadcastState();
  }

  function finishLastStandAsGiveUp(playerId, playerName) {
    const last = state.players.find((p) => p.id === playerId);
    if (!last || last.guessed) return;
    last.rank = state.players.filter((p) => p.guessed).length + 1;
    addSystemMessage(`${playerName}님이 포기했습니다.`);
    finishGame();
  }

  function tryLastStandAnswer(fromId, fromName, text) {
    const targetWord = state.assignedWords[state.lastStandPlayerId];
    if (!targetWord || !isAnswerCorrect(text, targetWord)) return false;

    const lastPlayer = getLastStandPlayer();
    if (!lastPlayer) return false;

    if (fromId === lastPlayer.id) {
      markCorrect(fromId, fromName, text);
      return true;
    }

    state.messages.push({
      type: 'chat',
      name: fromName,
      text,
      time: Date.now(),
    });
    lastPlayer.rank = state.players.filter((p) => p.guessed).length + 1;
    addSystemMessage(`${fromName}님이 정답을 말해 게임이 종료됩니다.`);
    finishGame();
    return true;
  }

  function advanceTurn() {
    clearTimer();
    state.turnMode = null;
    state.answerPending = false;

    if (state.players.length === 0) return;

    let idx = state.turnPlayerIndex;
    for (let step = 0; step < state.players.length; step++) {
      idx = (idx + 1) % state.players.length;
      if (!state.players[idx].guessed) {
        state.turnPlayerIndex = idx;
        state.turnNumber++;
        startTurn();
        return;
      }
    }
  }

  function startTurn() {
    const current = getCurrentTurnPlayer();
    if (!current || current.guessed) {
      finishGame();
      return;
    }

    state.turnMode = null;
    state.answerPending = false;
    state.timeLeft = TURN_TIME;
    addSystemMessage(`${current.name}님의 턴입니다! (${state.turnNumber}번째 턴)`);

    clearTimer();
    state.timer = setInterval(() => {
      state.timeLeft--;
      if (state.timeLeft <= 0) {
        addSystemMessage(`⏱ 시간 초과! 턴이 넘어갑니다.`);
        advanceTurn();
        return;
      }
      broadcastState();
    }, 1000);

    broadcastState();
  }

  function beginPlaying(onGameStarted) {
    if (state.players.length < 2) return;
    if (!state.players.every((p) => state.submissions[p.id]?.confirmed)) return;

    const perm = shuffleDerangement(state.players.length);
    if (!perm) return;

    state.players.forEach((p, i) => {
      const fromPlayer = state.players[perm[i]];
      state.assignedWords[p.id] = state.submissions[fromPlayer.id].word.trim();
    });

    state.status = 'playing';
    state.turnNumber = 1;
    state.turnPlayerIndex = state.players.findIndex((p) => !p.guessed);
    addSystemMessage(`게임 시작! (${state.players.length}명)`);
    onGameStarted?.();
    startTurn();
  }

  function handlePlayerLeave() {
    if (state.players.length < 2) {
      finishGame('참가자가 부족해 게임이 종료됩니다.');
      return;
    }

    if (state.status === 'assigning') {
      broadcastState();
      return;
    }

    if (state.status === 'playing' || state.status === 'finished') {
      const remaining = getActivePlayers();
      if (state.lastStand && remaining.length <= 1) {
        finishGame('참가자가 나가 게임이 종료됩니다.');
        return;
      }
      if (remaining.length <= 1 && !state.lastStand) {
        finishGame('참가자가 나가 게임이 종료됩니다.');
        return;
      }

      const current = getCurrentTurnPlayer();
      if (!current || current.guessed) {
        state.turnPlayerIndex = state.players.findIndex((p) => !p.guessed);
        startTurn();
      } else {
        broadcastState();
      }
    }
  }

  return {
    setCode(code) {
      state.code = code;
    },

    setInitialMessages(messages) {
      state.messages = messages.slice(-50);
    },

    setPlayers(players) {
      const prevIds = new Set(state.players.map((p) => p.id));
      const nextIds = new Set(players.map((p) => p.id));
      const removed = [...prevIds].filter((id) => !nextIds.has(id));

      state.players = players.map((p) => {
        const existing = state.players.find((x) => x.id === p.id);
        return {
          id: p.id,
          name: p.name,
          rank: existing?.rank ?? null,
          guessed: existing?.guessed ?? false,
        };
      });

      removed.forEach((id) => {
        delete state.submissions[id];
        delete state.assignedWords[id];
      });

      if (removed.length > 0) handlePlayerLeave();
      else broadcastState();
    },

    startAssigning() {
      clearTimer();
      resetAssigningState();
      state.status = 'assigning';
      addSystemMessage('단어를 정해주세요! 전원 확정 후 게임을 시작할 수 있어요.');
      broadcastState();
    },

    handleAction(playerId, playerName, action, payload = {}) {
      switch (action) {
        case 'submit-word': {
          if (state.status !== 'assigning') return;
          const sub = state.submissions[playerId];
          if (sub?.confirmed) return;
          const word = (payload.word ?? '').trim();
          if (!word) return;
          state.submissions[playerId] = { word, confirmed: false };
          broadcastState();
          break;
        }
        case 'confirm-word': {
          if (state.status !== 'assigning') return;
          const word = (payload.word ?? state.submissions[playerId]?.word ?? '').trim();
          if (!word) return;
          state.submissions[playerId] = { word, confirmed: true };
          addSystemMessage(`${playerName}님이 단어를 확정했어요.`);
          broadcastState();
          break;
        }
        case 'select-mode': {
          if (state.status !== 'playing' || state.lastStand) return;
          const current = getCurrentTurnPlayer();
          if (!current || current.id !== playerId || current.guessed) return;
          if (state.turnMode !== null) return;

          const mode = payload.mode;
          if (mode !== 'question' && mode !== 'answer') return;

          state.turnMode = mode;
          if (mode === 'question') {
            addSystemMessage(`${playerName}님이 질문합니다.`);
          } else {
            addSystemMessage(
              `${playerName}님이 정답을 말합니다. 이후 첫 메시지가 정답으로 처리됩니다.`
            );
            state.answerPending = true;
          }
          broadcastState();
          break;
        }
        case 'pass-turn': {
          if (state.status !== 'playing' || state.lastStand) return;
          const current = getCurrentTurnPlayer();
          if (!current || current.id !== playerId) return;
          if (state.turnMode !== 'question') return;
          addSystemMessage(`${playerName}님이 턴을 넘깁니다.`);
          advanceTurn();
          break;
        }
        case 'give-up': {
          if (!state.lastStand || playerId !== state.lastStandPlayerId) return;
          finishLastStandAsGiveUp(playerId, playerName);
          break;
        }
        case 'begin-playing': {
          beginPlaying(payload.onGameStarted);
          break;
        }
        default:
          break;
      }
    },

    beginPlaying(onGameStarted) {
      beginPlaying(onGameStarted);
    },

    handleChat(fromId, fromName, text) {
      const trimmed = text.trim();
      if (!trimmed) return;

      if (state.status === 'playing' && state.lastStand) {
        if (tryLastStandAnswer(fromId, fromName, trimmed)) return;

        state.messages.push({
          type: 'chat',
          name: fromName,
          text: trimmed,
          time: Date.now(),
        });
        broadcastState();
        return;
      }

      if (
        state.status === 'playing' &&
        state.answerPending &&
        getCurrentTurnPlayer()?.id === fromId
      ) {
        state.answerPending = false;
        const targetWord = state.assignedWords[fromId];
        if (targetWord && isAnswerCorrect(trimmed, targetWord)) {
          markCorrect(fromId, fromName, trimmed);
          return;
        }

        state.messages.push({
          type: 'guess',
          name: fromName,
          text: trimmed,
          time: Date.now(),
        });
        addSystemMessage(`오답! "${trimmed}"`);
        broadcastState();
        advanceTurn();
        return;
      }

      state.messages.push({
        type: 'chat',
        name: fromName,
        text: trimmed,
        time: Date.now(),
      });
      broadcastState();
    },

    getHostState() {
      return getStateForPlayer(hostId);
    },

    destroy() {
      clearTimer();
    },
  };
}
