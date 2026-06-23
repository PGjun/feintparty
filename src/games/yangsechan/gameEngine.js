import { TURN_TIME, ANSWER_TIME, QUESTIONS_BEFORE_LENGTH_HINT } from './constants.js';
import { isAnswerCorrect } from './match.js';
import { WORD_TOPICS, getTopicLabel } from './wordPools.js';

function wordCharLength(word) {
  return (word ?? '').replace(/\s/g, '').length;
}

function pickWordsForPlayers(topicId, count) {
  const pool = WORD_TOPICS[topicId]?.words;
  if (!pool || pool.length < count) return null;

  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, count);
}

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
    turnPhase: 'action',
    freeTalkTimeLeft: 0,
    answerPending: false,
    timeLeft: TURN_TIME,
    lastStand: false,
    lastStandPlayerId: null,
    messages: [],
    timer: null,
    assignmentMode: 'manual',
    wordTopic: null,
    questionCounts: {},
    letterCountRevealed: false,
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

  function exportSnapshot() {
    return {
      code: state.code,
      players: state.players.map((p) => ({ ...p })),
      status: state.status,
      submissions: { ...state.submissions },
      assignedWords: { ...state.assignedWords },
      turnPlayerIndex: state.turnPlayerIndex,
      turnNumber: state.turnNumber,
      turnMode: state.turnMode,
      turnPhase: state.turnPhase,
      freeTalkTimeLeft: state.freeTalkTimeLeft,
      answerPending: state.answerPending,
      timeLeft: state.timeLeft,
      lastStand: state.lastStand,
      lastStandPlayerId: state.lastStandPlayerId,
      messages: state.messages.slice(-50),
      assignmentMode: state.assignmentMode,
      wordTopic: state.wordTopic,
      questionCounts: { ...state.questionCounts },
      letterCountRevealed: state.letterCountRevealed,
    };
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
    state.turnPhase = 'action';
    state.freeTalkTimeLeft = 0;
    state.answerPending = false;
    state.timeLeft = TURN_TIME;
    state.lastStand = false;
    state.lastStandPlayerId = null;
    state.questionCounts = {};
    state.letterCountRevealed = false;
    state.players.forEach((p) => {
      p.rank = null;
      p.guessed = false;
    });
  }

  function getLastStandPlayer() {
    if (!state.lastStandPlayerId) return null;
    return state.players.find((p) => p.id === state.lastStandPlayerId) ?? null;
  }

  function recordQuestion(playerId) {
    state.questionCounts[playerId] = (state.questionCounts[playerId] ?? 0) + 1;
    maybeRevealLetterCounts();
  }

  function maybeRevealLetterCounts() {
    if (state.letterCountRevealed || state.status !== 'playing') return;

    const active = getActivePlayers();
    if (active.length === 0) return;

    const allAskedEnough = active.every(
      (p) => (state.questionCounts[p.id] ?? 0) >= QUESTIONS_BEFORE_LENGTH_HINT
    );
    if (!allAskedEnough) return;

    state.letterCountRevealed = true;
    addSystemMessage(
      `💡 힌트! 참가자가 각각 ${QUESTIONS_BEFORE_LENGTH_HINT}번 질문했어요. 아직 맞추지 못한 단어의 글자 수를 공개합니다.`
    );
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
      freeTalk: state.turnPhase === 'freeTalk',
      freeTalkTimeLeft: state.freeTalkTimeLeft,
      lastStand: state.lastStand,
      lastStandPlayerId: state.lastStandPlayerId,
      lastStandPlayerName: lastStandPlayer?.name ?? null,
      isLastStandPlayer,
      canGiveUp: isLastStandPlayer,
      isMyTurn,
      canSelectMode:
        isMyTurn && state.turnPhase === 'action' && state.turnMode === null && !state.lastStand,
      canPassTurn: isMyTurn && state.turnPhase === 'freeTalk' && !state.lastStand,
      allConfirmed:
        state.assignmentMode === 'auto'
          ? !!state.wordTopic
          : state.players.length >= 2 &&
            state.players.every((p) => state.submissions[p.id]?.confirmed),
      assignmentMode: state.assignmentMode,
      wordTopic: state.wordTopic,
      wordTopicLabel: getTopicLabel(state.wordTopic),
      isHostView: playerId === hostId,
      canStartGame:
        playerId === hostId &&
        state.players.length >= 2 &&
        (state.assignmentMode === 'auto'
          ? !!state.wordTopic
          : state.players.every((p) => state.submissions[p.id]?.confirmed)),
      myDraftWord: submission?.confirmed ? '' : (submission?.word ?? ''),
      myConfirmed: !!submission?.confirmed,
      messages: state.messages.slice(-50),
      myId: playerId,
      myWord,
      myWordRevealReason,
      myWordLength:
        state.letterCountRevealed && !me?.guessed && myAssignedWord
          ? wordCharLength(myAssignedWord)
          : null,
      letterCountRevealed: state.letterCountRevealed,
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
    state.turnPhase = 'action';
    state.freeTalkTimeLeft = 0;
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

  function resolveAfterCorrectGuess() {
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
    if (remaining.length <= 1) {
      resolveAfterCorrectGuess();
      return;
    }

    startFreeTalk(resolveAfterCorrectGuess);
  }

  function startLastStand(lastPlayer) {
    clearTimer();
    state.lastStand = true;
    state.lastStandPlayerId = lastPlayer.id;
    state.turnMode = null;
    state.turnPhase = 'action';
    state.freeTalkTimeLeft = 0;
    state.answerPending = false;
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
    state.turnPhase = 'action';
    state.freeTalkTimeLeft = 0;
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

  function startTurnTimer() {
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
  }

  function startTurn() {
    const current = getCurrentTurnPlayer();
    if (!current || current.guessed) {
      finishGame();
      return;
    }

    state.turnMode = null;
    state.turnPhase = 'action';
    state.freeTalkTimeLeft = 0;
    state.answerPending = false;
    state.timeLeft = TURN_TIME;
    addSystemMessage(`${current.name}님의 턴입니다! (${state.turnNumber}번째 턴)`);

    startTurnTimer();
    broadcastState();
  }

  function startFreeTalk(onComplete) {
    clearTimer();
    state.turnPhase = 'freeTalk';
    state.turnMode = null;
    state.answerPending = false;
    state.freeTalkTimeLeft = ANSWER_TIME;
    addSystemMessage(`⏳ ${ANSWER_TIME}초 답변 시간!`);
    resumeFreeTalkTimer(onComplete ?? (() => advanceTurn()));
    broadcastState();
  }

  function resumeFreeTalkTimer(onComplete = () => advanceTurn()) {
    clearTimer();
    state.timer = setInterval(() => {
      state.freeTalkTimeLeft--;
      if (state.freeTalkTimeLeft <= 0) {
        clearTimer();
        state.turnPhase = 'action';
        state.freeTalkTimeLeft = 0;
        onComplete();
        return;
      }
      broadcastState();
    }, 1000);
  }

  function beginPlaying(onGameStarted) {
    if (state.players.length < 2) return;

    if (state.assignmentMode === 'auto') {
      if (!state.wordTopic) return;
      const words = pickWordsForPlayers(state.wordTopic, state.players.length);
      if (!words) {
        addSystemMessage('주제 단어가 부족해요. 다른 주제를 선택해주세요.');
        broadcastState();
        return;
      }
      state.players.forEach((p, i) => {
        state.submissions[p.id] = { word: words[i], confirmed: true };
      });
    } else if (!state.players.every((p) => state.submissions[p.id]?.confirmed)) {
      return;
    }

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
      state.assignmentMode = 'manual';
      state.wordTopic = null;
      state.status = 'assigning';
      addSystemMessage('단어를 정해주세요! 전원 확정 후 게임을 시작할 수 있어요.');
      broadcastState();
    },

    handleAction(playerId, playerName, action, payload = {}) {
      switch (action) {
        case 'submit-word': {
          if (state.status !== 'assigning' || state.assignmentMode === 'auto') return;
          const sub = state.submissions[playerId];
          if (sub?.confirmed) return;
          const word = (payload.word ?? '').trim();
          if (!word) return;
          state.submissions[playerId] = { word, confirmed: false };
          broadcastState();
          break;
        }
        case 'confirm-word': {
          if (state.status !== 'assigning' || state.assignmentMode === 'auto') return;
          const word = (payload.word ?? state.submissions[playerId]?.word ?? '').trim();
          if (!word) return;
          state.submissions[playerId] = { word, confirmed: true };
          addSystemMessage(`${playerName}님이 단어를 확정했어요.`);
          broadcastState();
          break;
        }
        case 'set-assign-settings': {
          if (state.status !== 'assigning' || playerId !== hostId) return;

          const mode = payload.assignmentMode;
          const prevMode = state.assignmentMode;
          const prevTopic = state.wordTopic;

          if (mode === 'manual' || mode === 'auto') {
            state.assignmentMode = mode;
            if (mode === 'auto') {
              state.submissions = {};
            }
          }

          const topic = payload.wordTopic;
          if (topic && WORD_TOPICS[topic]) {
            state.wordTopic = topic;
          } else if (topic === null) {
            state.wordTopic = null;
          }

          if (
            state.assignmentMode === 'auto' &&
            state.wordTopic &&
            (prevMode !== 'auto' || prevTopic !== state.wordTopic)
          ) {
            addSystemMessage(`자동 단어 배분 · 주제: ${getTopicLabel(state.wordTopic)}`);
          } else if (state.assignmentMode === 'manual' && prevMode !== 'manual') {
            addSystemMessage('직접 단어 입력 모드입니다.');
          }

          broadcastState();
          break;
        }
        case 'select-mode': {
          if (state.status !== 'playing' || state.lastStand) return;
          if (state.turnPhase !== 'action') return;
          const current = getCurrentTurnPlayer();
          if (!current || current.id !== playerId || current.guessed) return;
          if (state.turnMode !== null) return;

          const mode = payload.mode;
          if (mode !== 'question' && mode !== 'answer') return;

          state.turnMode = mode;
          if (mode === 'question') {
            addSystemMessage(`${playerName}님이 질문합니다.`);
            recordQuestion(playerId);
          } else {
            addSystemMessage(`${playerName}님이 정답을 말합니다.`);
            state.answerPending = true;
          }
          broadcastState();
          break;
        }
        case 'turn-chat': {
          if (state.status !== 'playing' || state.lastStand) return;
          if (state.turnPhase !== 'action') return;
          const current = getCurrentTurnPlayer();
          if (!current || current.id !== playerId || current.guessed) return;
          if (state.turnMode !== null) return;

          const mode = payload.mode;
          const text = (payload.text ?? '').trim();
          if (!text) return;
          if (mode !== 'question' && mode !== 'answer') return;

          if (mode === 'question') {
            state.turnMode = 'question';
            addSystemMessage(`${playerName}님이 질문합니다.`);
            recordQuestion(playerId);
            state.messages.push({
              type: 'chat',
              name: playerName,
              text,
              time: Date.now(),
            });
            startFreeTalk(() => advanceTurn());
            return;
          }

          addSystemMessage(`${playerName}님이 정답을 말합니다.`);
          const targetWord = state.assignedWords[playerId];
          if (targetWord && isAnswerCorrect(text, targetWord)) {
            markCorrect(playerId, playerName, text);
            return;
          }

          state.messages.push({
            type: 'guess',
            name: playerName,
            text,
            time: Date.now(),
          });
          addSystemMessage(`오답! "${text}"`);
          startFreeTalk(() => advanceTurn());
          break;
        }
        case 'pass-turn': {
          if (state.status !== 'playing' || state.lastStand) return;
          if (state.turnPhase !== 'freeTalk') return;
          const current = getCurrentTurnPlayer();
          if (!current || current.id !== playerId) return;
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

      if (state.status === 'playing' && state.turnPhase === 'freeTalk') {
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
        startFreeTalk(() => advanceTurn());
        return;
      }

      if (
        state.status === 'playing' &&
        state.turnMode === 'question' &&
        getCurrentTurnPlayer()?.id === fromId
      ) {
        state.messages.push({
          type: 'chat',
          name: fromName,
          text: trimmed,
          time: Date.now(),
        });
        recordQuestion(fromId);
        startFreeTalk(() => advanceTurn());
        return;
      }

      if (
        state.status === 'playing' &&
        state.turnPhase === 'action' &&
        getCurrentTurnPlayer()?.id === fromId
      ) {
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

    getPlayerState(playerId) {
      return getStateForPlayer(playerId);
    },

    exportState() {
      return exportSnapshot();
    },

    importState(snapshot) {
      clearTimer();
      state.code = snapshot.code ?? state.code;
      state.players = (snapshot.players ?? []).map((p) => ({ ...p }));
      state.status = snapshot.status ?? 'waiting';
      state.submissions = { ...(snapshot.submissions ?? {}) };
      state.assignedWords = { ...(snapshot.assignedWords ?? {}) };
      state.turnPlayerIndex = snapshot.turnPlayerIndex ?? 0;
      state.turnNumber = snapshot.turnNumber ?? 1;
      state.turnMode = snapshot.turnMode ?? null;
      state.turnPhase = snapshot.turnPhase ?? 'action';
      state.freeTalkTimeLeft = snapshot.freeTalkTimeLeft ?? 0;
      state.answerPending = snapshot.answerPending ?? false;
      state.timeLeft = snapshot.timeLeft ?? TURN_TIME;
      state.lastStand = snapshot.lastStand ?? false;
      state.lastStandPlayerId = snapshot.lastStandPlayerId ?? null;
      state.messages = (snapshot.messages ?? []).slice(-50);
      state.assignmentMode = snapshot.assignmentMode ?? 'manual';
      state.wordTopic = snapshot.wordTopic ?? null;
      state.questionCounts = { ...(snapshot.questionCounts ?? {}) };
      state.letterCountRevealed = snapshot.letterCountRevealed ?? false;
      state.timer = null;

      if (state.status === 'playing' && !state.lastStand) {
        if (state.turnPhase === 'freeTalk' && state.freeTalkTimeLeft > 0) {
          if (getActivePlayers().length <= 1) {
            resolveAfterCorrectGuess();
          } else {
            resumeFreeTalkTimer();
          }
        } else if (state.turnPhase === 'action' && state.timeLeft > 0) {
          startTurnTimer();
        }
      }
      broadcastState();
    },

    replacePlayerId(oldId, newId) {
      state.players = state.players.map((p) =>
        p.id === oldId ? { ...p, id: newId } : p
      );
      if (state.submissions[oldId]) {
        state.submissions[newId] = state.submissions[oldId];
        delete state.submissions[oldId];
      }
      if (state.assignedWords[oldId]) {
        state.assignedWords[newId] = state.assignedWords[oldId];
        delete state.assignedWords[oldId];
      }
      if (state.lastStandPlayerId === oldId) {
        state.lastStandPlayerId = newId;
      }
      if (state.questionCounts[oldId] != null) {
        state.questionCounts[newId] = state.questionCounts[oldId];
        delete state.questionCounts[oldId];
      }
      broadcastState();
    },

    destroy() {
      clearTimer();
    },
  };
}
