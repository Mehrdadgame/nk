"use strict";
// Copyright 2020 The Nakama Authors
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
const moduleName = "tic-tac-toe_js";
const tickRate = 5;
const maxEmptySec = 30;
const delaybetweenGamesSec = 5;
const turnTimeFastSec = 10;
const turnTimeNormalSec = 20;
const winningPositions = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],
    [0, 4, 8],
    [2, 4, 6],
];
const matchInit = function (ctx, logger, nk, params) {
    logger.debug('Lobby match created');
    return {
        state: { Debug: true },
        tickRate: 10,
        label: ""
    };
};
let matchJoinAttempt = function (ctx, logger, nk, dispatcher, tick, state, presence, metadata) {
    // Check if it's a user attempting to rejoin after a disconnect.
    if (presence.userId in state.presences) {
        if (state.presences[presence.userId] === null) {
            // User rejoining after a disconnect.
            state.joinsInProgress++;
            return {
                state: state,
                accept: false,
            };
        }
        else {
            // User attempting to join from 2 different devices at the same time.
            return {
                state: state,
                accept: false,
                rejectMessage: 'already joined',
            };
        }
    }
    // Check if match is full.
    if (connectedPlayers(state) + state.joinsInProgress >= 2) {
        return {
            state: state,
            accept: false,
            rejectMessage: 'match full',
        };
    }
    // New player attempting to connect.
    state.joinsInProgress++;
    return {
        state,
        accept: true,
    };
};
const matchJoin = function (ctx, logger, nk, dispatcher, tick, state, presences) {
    presences.forEach(function (presence) {
        state.presences[presence.userId] = presence;
        logger.debug('%q joined Lobby match', presence.userId);
    });
    return {
        state
    };
};
let matchLeave = function (ctx, logger, nk, dispatcher, tick, state, presences) {
    for (let presence of presences) {
        logger.info("Player: %s left match: %s.", presence.userId, ctx.matchId);
        state.presences[presence.userId] = null;
    }
    return { state };
};
let matchLoop = function (ctx, logger, nk, dispatcher, tick, state, messages) {
    var _a;
    logger.debug('Running match loop. Tick: %d', tick);
    if (connectedPlayers(state) + state.joinsInProgress === 0) {
        state.emptyTicks++;
        if (state.emptyTicks >= maxEmptySec * tickRate) {
            // Match has been empty for too long, close it.
            logger.info('closing idle match');
            return null;
        }
    }
    let t = msecToSec(Date.now());
    // If there's no game in progress check if we can (and should) start one!
    if (!state.playing) {
        // Between games any disconnected users are purged, there's no in-progress game for them to return to anyway.
        for (let userID in state.presences) {
            if (state.presences[userID] === null) {
                delete state.presences[userID];
            }
        }
        // Check if we need to update the label so the match now advertises itself as open to join.
        if (Object.keys(state.presences).length < 2 && state.label.open != 1) {
            state.label.open = 1;
            let labelJSON = JSON.stringify(state.label);
            dispatcher.matchLabelUpdate(labelJSON);
        }
        // Check if we have enough players to start a game.
        if (Object.keys(state.presences).length < 2) {
            return { state };
        }
        // Check if enough time has passed since the last game.
        if (state.nextGameRemainingTicks > 0) {
            state.nextGameRemainingTicks--;
            return { state };
        }
        // We can start a game! Set up the game state and assign the marks to each player.
        state.playing = true;
        state.board = new Array(9);
        state.marks = {};
        let marks = [Mark.X, Mark.O];
        Object.keys(state.presences).forEach(userId => {
            var _a;
            state.marks[userId] = (_a = marks.shift()) !== null && _a !== void 0 ? _a : null;
        });
        state.mark = Mark.X;
        state.winner = null;
        state.winnerPositions = null;
        state.deadlineRemainingTicks = calculateDeadlineTicks(state.label);
        state.nextGameRemainingTicks = 0;
        // Notify the players a new game has started.
        let msg = {
            board: state.board,
            marks: state.marks,
            mark: state.mark,
            deadline: t + Math.floor(state.deadlineRemainingTicks / tickRate),
        };
        dispatcher.broadcastMessage(OpCode.START, JSON.stringify(msg));
        return { state };
    }
    // There's a game in progresstate. Check for input, update match state, and send messages to clientstate.
    for (const message of messages) {
        switch (message.opCode) {
            case OpCode.MOVE:
                logger.debug('Received move message from user: %v', state.marks);
                let mark = (_a = state.marks[message.sender.userId]) !== null && _a !== void 0 ? _a : null;
                if (mark === null || state.mark != mark) {
                    // It is not this player's turn.
                    dispatcher.broadcastMessage(OpCode.REJECTED, null, [message.sender]);
                    continue;
                }
                let msg = {};
                try {
                    msg = JSON.parse(nk.binaryToString(message.data));
                }
                catch (error) {
                    // Client sent bad data.
                    dispatcher.broadcastMessage(OpCode.REJECTED, null, [message.sender]);
                    logger.debug('Bad data received: %v', error);
                    continue;
                }
                if (state.board[msg.position]) {
                    // Client sent a position outside the board, or one that has already been played.
                    dispatcher.broadcastMessage(OpCode.REJECTED, null, [message.sender]);
                    continue;
                }
                // Update the game state.
                state.board[msg.position] = mark;
                state.mark = mark === Mark.O ? Mark.X : Mark.O;
                state.deadlineRemainingTicks = calculateDeadlineTicks(state.label);
                // Check if game is over through a winning move.
                const [winner, winningPos] = winCheck(state.board, mark);
                if (winner) {
                    state.winner = mark;
                    state.winnerPositions = winningPos;
                    state.playing = false;
                    state.deadlineRemainingTicks = 0;
                    state.nextGameRemainingTicks = delaybetweenGamesSec * tickRate;
                }
                // Check if game is over because no more moves are possible.
                let tie = state.board.every(v => v !== null);
                if (tie) {
                    // Update state to reflect the tie, and schedule the next game.
                    state.playing = false;
                    state.deadlineRemainingTicks = 0;
                    state.nextGameRemainingTicks = delaybetweenGamesSec * tickRate;
                }
                let opCode;
                let outgoingMsg;
                if (state.playing) {
                    opCode = OpCode.UPDATE;
                    let msg = {
                        board: state.board,
                        mark: state.mark,
                        deadline: t + Math.floor(state.deadlineRemainingTicks / tickRate),
                    };
                    outgoingMsg = msg;
                }
                else {
                    opCode = OpCode.DONE;
                    let msg = {
                        board: state.board,
                        winner: state.winner,
                        winnerPositions: state.winnerPositions,
                        nextGameStart: t + Math.floor(state.nextGameRemainingTicks / tickRate),
                    };
                    outgoingMsg = msg;
                }
                dispatcher.broadcastMessage(opCode, JSON.stringify(outgoingMsg));
                break;
            default:
                // No other opcodes are expected from the client, so automatically treat it as an error.
                dispatcher.broadcastMessage(OpCode.REJECTED, null, [message.sender]);
                logger.error('Unexpected opcode received: %d', message.opCode);
        }
    }
    // Keep track of the time remaining for the player to submit their move. Idle players forfeit.
    if (state.playing) {
        state.deadlineRemainingTicks--;
        if (state.deadlineRemainingTicks <= 0) {
            // The player has run out of time to submit their move.
            state.playing = false;
            state.winner = state.mark === Mark.O ? Mark.X : Mark.O;
            state.deadlineRemainingTicks = 0;
            state.nextGameRemainingTicks = delaybetweenGamesSec * tickRate;
            let msg = {
                board: state.board,
                winner: state.winner,
                nextGameStart: t + Math.floor(state.nextGameRemainingTicks / tickRate),
                winnerPositions: null,
            };
            dispatcher.broadcastMessage(OpCode.DONE, JSON.stringify(msg));
        }
    }
    return { state };
};
let matchTerminate = function (ctx, logger, nk, dispatcher, tick, state, graceSeconds) {
    return { state };
};
let matchSignal = function (ctx, logger, nk, dispatcher, tick, state) {
    return { state };
};
function calculateDeadlineTicks(l) {
    if (l.fast === 1) {
        return turnTimeFastSec * tickRate;
    }
    else {
        return turnTimeNormalSec * tickRate;
    }
}
function winCheck(board, mark) {
    for (let wp of winningPositions) {
        if (board[wp[0]] === mark &&
            board[wp[1]] === mark &&
            board[wp[2]] === mark) {
            return [true, wp];
        }
    }
    return [false, null];
}
function connectedPlayers(s) {
    let count = 0;
    for (const p of Object.keys(s.presences)) {
        if (p !== null) {
            count++;
        }
    }
    return count;
}
