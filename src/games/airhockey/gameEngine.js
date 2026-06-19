import {
  BALL_RADIUS,
  COUNTDOWN_SECONDS,
  DEFAULT_TARGET_SCORE,
  GOAL_CELEBRATION_MS,
  MAX_TARGET_SCORE,
  MIN_TARGET_SCORE,
  TICK_MS,
  getDefaultPaddlePosition,
} from './constants.js';
import {
  BROADCAST_EVERY_STEPS,
  FIXED_DT,
  clampPaddle,
  serveFromCenter,
  spawnBallForPlayer,
  stepPhysicsWorld,
} from './physics.js';

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function createGameEngine(hostId, onBroadcast, _onClearCanvas, onGameFinished) {
  const state = {
    code: '',
    hostId,
    players: [],
    paddles: [
      getDefaultPaddlePosition(0),
      getDefaultPaddlePosition(1),
    ],
    ball: { x: 0.5, y: 0.5, vx: 0, vy: 0 },
    prevPaddles: [
      getDefaultPaddlePosition(0),
      getDefaultPaddlePosition(1),
    ],
    paddleVel: [{ x: 0, y: 0 }, { x: 0, y: 0 }],
    paddleHitCooldown: [0, 0],
    status: 'waiting',
    targetScore: DEFAULT_TARGET_SCORE,
    countdown: 0,
    goalCelebration: null,
    winnerId: null,
    messages: [],
    physicsTimer: null,
    countdownTimer: null,
    celebrationTimer: null,
    physicsStep: 0,
    serverTime: 0,
  };

  function broadcastState() {
    state.serverTime = Date.now();
    state.players.forEach((p) => {
      onBroadcast(p.id, { type: 'state', state: getStateForPlayer(p.id) });
    });
  }

  function addSystemMessage(text) {
    state.messages.push({ type: 'system', text, time: Date.now() });
  }

  function getPlayerIndex(playerId) {
    return state.players.findIndex((p) => p.id === playerId);
  }

  function getStateForPlayer(playerId) {
    const playerIndex = getPlayerIndex(playerId);
    const opponentIndex = playerIndex === 0 ? 1 : 0;
    const me = state.players[playerIndex];
    const opponent = state.players[opponentIndex];

    return {
      code: state.code,
      players: state.players.map((p) => ({
        id: p.id,
        name: p.name,
        score: p.score ?? 0,
        playerIndex: p.playerIndex,
      })),
      myId: playerId,
      myPlayerIndex: playerIndex,
      hostId: state.hostId,
      status: state.status,
      targetScore: state.targetScore,
      countdown: state.countdown,
      paddles: state.paddles.map((p) => ({ x: p.x, y: p.y })),
      ball: {
        x: state.ball.x,
        y: state.ball.y,
        vx: state.ball.vx,
        vy: state.ball.vy,
      },
      goalCelebration: state.goalCelebration,
      winnerId: state.winnerId,
      winnerName: state.winnerId
        ? state.players.find((p) => p.id === state.winnerId)?.name
        : null,
      myScore: me?.score ?? 0,
      opponentScore: opponent?.score ?? 0,
      messages: state.messages.slice(-50),
      serverTime: state.serverTime,
      physicsStep: state.physicsStep,
    };
  }

  function stopTimers() {
    if (state.physicsTimer) {
      clearInterval(state.physicsTimer);
      state.physicsTimer = null;
    }
    if (state.countdownTimer) {
      clearInterval(state.countdownTimer);
      state.countdownTimer = null;
    }
    if (state.celebrationTimer) {
      clearTimeout(state.celebrationTimer);
      state.celebrationTimer = null;
    }
  }

  function resetPositions() {
    state.paddles[0] = getDefaultPaddlePosition(0);
    state.paddles[1] = getDefaultPaddlePosition(1);
    state.prevPaddles[0] = { ...state.paddles[0] };
    state.prevPaddles[1] = { ...state.paddles[1] };
    state.paddleVel = [{ x: 0, y: 0 }, { x: 0, y: 0 }];
    state.paddleHitCooldown = [0, 0];
    state.ball = { x: 0.5, y: 0.5, vx: 0, vy: 0 };
    state.goalCelebration = null;
    state.winnerId = null;
    state.physicsStep = 0;
  }

  function startCountdown() {
    state.status = 'countdown';
    state.countdown = COUNTDOWN_SECONDS;
    broadcastState();

    state.countdownTimer = setInterval(() => {
      state.countdown -= 1;
      if (state.countdown <= 0) {
        clearInterval(state.countdownTimer);
        state.countdownTimer = null;
        beginPlaying();
        return;
      }
      broadcastState();
    }, 1000);
  }

  function beginPlaying() {
    state.status = 'playing';
    const firstServer = Math.random() < 0.5 ? 0 : 1;
    state.ball = serveFromCenter(firstServer);
    startPhysics();
    broadcastState();
  }

  function startPhysics() {
    if (state.physicsTimer) return;
    state.physicsTimer = setInterval(stepPhysics, TICK_MS);
  }

  function stopPhysics() {
    if (state.physicsTimer) {
      clearInterval(state.physicsTimer);
      state.physicsTimer = null;
    }
  }

  function stepPhysics() {
    if (state.status !== 'playing') return;

    const paddleSegments = state.paddles.map((paddle, i) => {
      const prev = state.prevPaddles[i];
      return {
        from: { x: prev.x, y: prev.y },
        to: { x: paddle.x, y: paddle.y },
      };
    });

    for (let i = 0; i < state.paddles.length; i++) {
      const seg = paddleSegments[i];
      state.paddleVel[i] = {
        x: (seg.to.x - seg.from.x) / FIXED_DT,
        y: (seg.to.y - seg.from.y) / FIXED_DT,
      };
      state.prevPaddles[i] = { x: seg.to.x, y: seg.to.y };
    }

    const goal = stepPhysicsWorld(state, FIXED_DT, paddleSegments);
    state.physicsStep += 1;

    if (goal) {
      scoreGoal(goal.goal);
      return;
    }

    if (state.physicsStep % BROADCAST_EVERY_STEPS === 0) {
      broadcastState();
    }
  }

  function scoreGoal(scorerIndex) {
    stopPhysics();
    const scorer = state.players[scorerIndex];
    if (!scorer) return;

    scorer.score = (scorer.score ?? 0) + 1;
    const loserIndex = scorerIndex === 0 ? 1 : 0;

    state.goalCelebration = {
      scorerIndex,
      scorerName: scorer.name,
    };
    state.status = 'goalCelebration';
    addSystemMessage(`🎉 ${scorer.name} 득점!`);
    broadcastState();

    state.celebrationTimer = setTimeout(() => {
      state.celebrationTimer = null;
      state.goalCelebration = null;

      if (scorer.score >= state.targetScore) {
        finishGame(scorer.id);
        return;
      }

      state.status = 'playing';
      state.ball = spawnBallForPlayer(loserIndex);
      state.paddles[loserIndex] = getDefaultPaddlePosition(loserIndex);
      state.prevPaddles[loserIndex] = { ...state.paddles[loserIndex] };
      state.paddleVel[loserIndex] = { x: 0, y: 0 };
      state.paddleHitCooldown = [0, 0];
      startPhysics();
      broadcastState();
    }, GOAL_CELEBRATION_MS);
  }

  function finishGame(winnerId) {
    stopPhysics();
    state.status = 'finished';
    state.winnerId = winnerId;
    const winner = state.players.find((p) => p.id === winnerId);
    addSystemMessage(`🏆 ${winner?.name ?? '플레이어'} 승리!`);
    onGameFinished?.();
    broadcastState();
  }

  return {
    setCode(code) {
      state.code = code;
    },

    setPlayers(players) {
      state.players = players.map((p, i) => {
        const existing = state.players.find((x) => x.id === p.id || x.name === p.name);
        return {
          id: p.id,
          name: p.name,
          score: existing?.score ?? 0,
          playerIndex: i,
        };
      });
      broadcastState();
    },

    setInitialMessages(messages) {
      state.messages = messages.slice(-50);
    },

    startGame(targetScore) {
      stopTimers();
      const score = clamp(
        parseInt(targetScore, 10) || DEFAULT_TARGET_SCORE,
        MIN_TARGET_SCORE,
        MAX_TARGET_SCORE
      );
      state.targetScore = score;
      state.players.forEach((p) => {
        p.score = 0;
      });
      resetPositions();
      addSystemMessage(`게임 시작! 선승 ${score}점`);
      startCountdown();
    },

    returnToGameWaiting() {
      stopTimers();
      state.status = 'waiting';
      state.countdown = 0;
      resetPositions();
      state.players.forEach((p) => {
        p.score = 0;
      });
      broadcastState();
    },

    setPaddlePosition(playerId, x, y) {
      const index = getPlayerIndex(playerId);
      if (index < 0 || state.status !== 'playing') return;
      state.paddles[index] = clampPaddle(index, x, y);
    },

    handleChat(fromId, fromName, text) {
      const trimmed = text.trim();
      if (!trimmed) return;
      state.messages.push({
        type: 'chat',
        name: fromName,
        text: trimmed,
        time: Date.now(),
      });
      broadcastState();
    },

    getHostState() {
      return getStateForPlayer(state.hostId);
    },

    getPlayerState(playerId) {
      return getStateForPlayer(playerId);
    },

    replacePlayerId(oldId, newId) {
      state.players = state.players.map((p) =>
        p.id === oldId ? { ...p, id: newId } : p
      );
      if (state.hostId === oldId) state.hostId = newId;
      if (state.winnerId === oldId) state.winnerId = newId;
      broadcastState();
    },

    destroy() {
      stopTimers();
    },
  };
}
