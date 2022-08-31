var InitModule = function (ctx, logger, nk, initializer) {
    initializer.registerRpc("ChannelMessageSend", serverRpc);
    initializer.registerRpc("turnMessageSend", rtBeturnMessageSend);
    initializer.registerRpc("test", serverRpc);
    logger.debug("RrrRR");
    initializer.registerMatch(moduleName, {
        matchInit: matchInit,
        matchJoinAttempt: matchJoinAttempt,
        matchJoin: matchJoin,
        matchLeave: matchLeave,
        matchLoop: matchLoop,
        matchTerminate: matchTerminate,
        matchSignal: matchSignal,
    });
};
var serverRpc = function (ctx, logger, nk, payload) {
    if (ctx.userId != "") {
        logger.error("rpc was called by a user");
        return null;
    }
    return "<JsonResponse>";
};
var Mark;
(function (Mark) {
    Mark[Mark["X"] = 0] = "X";
    Mark[Mark["O"] = 1] = "O";
    Mark[Mark["UNDEFINED"] = 2] = "UNDEFINED";
})(Mark || (Mark = {}));
var OpCode;
(function (OpCode) {
    OpCode[OpCode["START"] = 1] = "START";
    OpCode[OpCode["UPDATE"] = 2] = "UPDATE";
    OpCode[OpCode["DONE"] = 3] = "DONE";
    OpCode[OpCode["MOVE"] = 4] = "MOVE";
    OpCode[OpCode["REJECTED"] = 5] = "REJECTED";
})(OpCode || (OpCode = {}));
var moduleName = "tic-tac-toe_js";
var tickRate = 5;
var maxEmptySec = 30;
var delaybetweenGamesSec = 5;
var turnTimeFastSec = 10;
var turnTimeNormalSec = 20;
var winningPositions = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],
    [0, 4, 8],
    [2, 4, 6],
];
var matchInit = function (ctx, logger, nk, params) {
    logger.debug('Lobby match created');
    return {
        state: { Debug: true },
        tickRate: 10,
        label: ""
    };
};
var matchJoinAttempt = function (ctx, logger, nk, dispatcher, tick, state, presence, metadata) {
    if (presence.userId in state.presences) {
        if (state.presences[presence.userId] === null) {
            state.joinsInProgress++;
            return {
                state: state,
                accept: false,
            };
        }
        else {
            return {
                state: state,
                accept: false,
                rejectMessage: 'already joined',
            };
        }
    }
    if (connectedPlayers(state) + state.joinsInProgress >= 2) {
        return {
            state: state,
            accept: false,
            rejectMessage: 'match full',
        };
    }
    state.joinsInProgress++;
    return {
        state: state,
        accept: true,
    };
};
var matchJoin = function (ctx, logger, nk, dispatcher, tick, state, presences) {
    presences.forEach(function (presence) {
        state.presences[presence.userId] = presence;
        logger.debug('%q joined Lobby match', presence.userId);
    });
    return {
        state: state
    };
};
var matchLeave = function (ctx, logger, nk, dispatcher, tick, state, presences) {
    for (var _i = 0, presences_1 = presences; _i < presences_1.length; _i++) {
        var presence = presences_1[_i];
        logger.info("Player: %s left match: %s.", presence.userId, ctx.matchId);
        state.presences[presence.userId] = null;
    }
    return { state: state };
};
var matchLoop = function (ctx, logger, nk, dispatcher, tick, state, messages) {
    var _a;
    logger.debug('Running match loop. Tick: %d', tick);
    if (connectedPlayers(state) + state.joinsInProgress === 0) {
        state.emptyTicks++;
        if (state.emptyTicks >= maxEmptySec * tickRate) {
            logger.info('closing idle match');
            return null;
        }
    }
    var t = msecToSec(Date.now());
    if (!state.playing) {
        for (var userID in state.presences) {
            if (state.presences[userID] === null) {
                delete state.presences[userID];
            }
        }
        if (Object.keys(state.presences).length < 2 && state.label.open != 1) {
            state.label.open = 1;
            var labelJSON = JSON.stringify(state.label);
            dispatcher.matchLabelUpdate(labelJSON);
        }
        if (Object.keys(state.presences).length < 2) {
            return { state: state };
        }
        if (state.nextGameRemainingTicks > 0) {
            state.nextGameRemainingTicks--;
            return { state: state };
        }
        state.playing = true;
        state.board = new Array(9);
        state.marks = {};
        var marks_1 = [Mark.X, Mark.O];
        Object.keys(state.presences).forEach(function (userId) {
            var _a;
            state.marks[userId] = (_a = marks_1.shift()) !== null && _a !== void 0 ? _a : null;
        });
        state.mark = Mark.X;
        state.winner = null;
        state.winnerPositions = null;
        state.deadlineRemainingTicks = calculateDeadlineTicks(state.label);
        state.nextGameRemainingTicks = 0;
        var msg = {
            board: state.board,
            marks: state.marks,
            mark: state.mark,
            deadline: t + Math.floor(state.deadlineRemainingTicks / tickRate),
        };
        dispatcher.broadcastMessage(OpCode.START, JSON.stringify(msg));
        return { state: state };
    }
    for (var _i = 0, messages_1 = messages; _i < messages_1.length; _i++) {
        var message = messages_1[_i];
        switch (message.opCode) {
            case OpCode.MOVE:
                logger.debug('Received move message from user: %v', state.marks);
                var mark = (_a = state.marks[message.sender.userId]) !== null && _a !== void 0 ? _a : null;
                if (mark === null || state.mark != mark) {
                    dispatcher.broadcastMessage(OpCode.REJECTED, null, [message.sender]);
                    continue;
                }
                var msg = {};
                try {
                    msg = JSON.parse(nk.binaryToString(message.data));
                }
                catch (error) {
                    dispatcher.broadcastMessage(OpCode.REJECTED, null, [message.sender]);
                    logger.debug('Bad data received: %v', error);
                    continue;
                }
                if (state.board[msg.position]) {
                    dispatcher.broadcastMessage(OpCode.REJECTED, null, [message.sender]);
                    continue;
                }
                state.board[msg.position] = mark;
                state.mark = mark === Mark.O ? Mark.X : Mark.O;
                state.deadlineRemainingTicks = calculateDeadlineTicks(state.label);
                var _b = winCheck(state.board, mark), winner = _b[0], winningPos = _b[1];
                if (winner) {
                    state.winner = mark;
                    state.winnerPositions = winningPos;
                    state.playing = false;
                    state.deadlineRemainingTicks = 0;
                    state.nextGameRemainingTicks = delaybetweenGamesSec * tickRate;
                }
                var tie = state.board.every(function (v) { return v !== null; });
                if (tie) {
                    state.playing = false;
                    state.deadlineRemainingTicks = 0;
                    state.nextGameRemainingTicks = delaybetweenGamesSec * tickRate;
                }
                var opCode = void 0;
                var outgoingMsg = void 0;
                if (state.playing) {
                    opCode = OpCode.UPDATE;
                    var msg_1 = {
                        board: state.board,
                        mark: state.mark,
                        deadline: t + Math.floor(state.deadlineRemainingTicks / tickRate),
                    };
                    outgoingMsg = msg_1;
                }
                else {
                    opCode = OpCode.DONE;
                    var msg_2 = {
                        board: state.board,
                        winner: state.winner,
                        winnerPositions: state.winnerPositions,
                        nextGameStart: t + Math.floor(state.nextGameRemainingTicks / tickRate),
                    };
                    outgoingMsg = msg_2;
                }
                dispatcher.broadcastMessage(opCode, JSON.stringify(outgoingMsg));
                break;
            default:
                dispatcher.broadcastMessage(OpCode.REJECTED, null, [message.sender]);
                logger.error('Unexpected opcode received: %d', message.opCode);
        }
    }
    if (state.playing) {
        state.deadlineRemainingTicks--;
        if (state.deadlineRemainingTicks <= 0) {
            state.playing = false;
            state.winner = state.mark === Mark.O ? Mark.X : Mark.O;
            state.deadlineRemainingTicks = 0;
            state.nextGameRemainingTicks = delaybetweenGamesSec * tickRate;
            var msg = {
                board: state.board,
                winner: state.winner,
                nextGameStart: t + Math.floor(state.nextGameRemainingTicks / tickRate),
                winnerPositions: null,
            };
            dispatcher.broadcastMessage(OpCode.DONE, JSON.stringify(msg));
        }
    }
    return { state: state };
};
var matchTerminate = function (ctx, logger, nk, dispatcher, tick, state, graceSeconds) {
    return { state: state };
};
var matchSignal = function (ctx, logger, nk, dispatcher, tick, state) {
    return { state: state };
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
    for (var _i = 0, winningPositions_1 = winningPositions; _i < winningPositions_1.length; _i++) {
        var wp = winningPositions_1[_i];
        if (board[wp[0]] === mark &&
            board[wp[1]] === mark &&
            board[wp[2]] === mark) {
            return [true, wp];
        }
    }
    return [false, null];
}
function connectedPlayers(s) {
    var count = 0;
    for (var _i = 0, _a = Object.keys(s.presences); _i < _a.length; _i++) {
        var p = _a[_i];
        if (p !== null) {
            count++;
        }
    }
    return count;
}
function rpcReward(context, logger, nk, payload) {
    if (!context.userId) {
        throw Error('No user ID in context');
    }
    if (payload) {
        throw Error('no input allowed');
    }
    var objectId = {
        collection: 'reward',
        key: 'daily',
        userId: context.userId,
    };
    var objects;
    try {
        objects = nk.storageRead([objectId]);
    }
    catch (error) {
        logger.error('storageRead error: %s', error);
        throw error;
    }
    var dailyReward = {
        lastClaimUnix: 0,
    };
    objects.forEach(function (object) {
        if (object.key == 'daily') {
            dailyReward = object.value;
        }
    });
    var resp = {
        coinsReceived: 0,
    };
    var d = new Date();
    d.setHours(0, 0, 0, 0);
    if (dailyReward.lastClaimUnix < msecToSec(d.getTime())) {
        resp.coinsReceived = 500;
        var changeset = {
            coins: resp.coinsReceived,
        };
        try {
            nk.walletUpdate(context.userId, changeset, {}, false);
        }
        catch (error) {
            logger.error('walletUpdate error: %q', error);
            throw error;
        }
        var notification = {
            code: 1001,
            content: changeset,
            persistent: true,
            subject: "You've received your daily reward!",
            userId: context.userId,
        };
        try {
            nk.notificationsSend([notification]);
        }
        catch (error) {
            logger.error('notificationsSend error: %q', error);
            throw error;
        }
        dailyReward.lastClaimUnix = msecToSec(Date.now());
        var write = {
            collection: 'reward',
            key: 'daily',
            permissionRead: 1,
            permissionWrite: 0,
            value: dailyReward,
            userId: context.userId,
        };
        if (objects.length > 0) {
            write.version = objects[0].version;
        }
        try {
            nk.storageWrite([write]);
        }
        catch (error) {
            logger.error('storageWrite error: %q', error);
            throw error;
        }
    }
    var result = JSON.stringify(resp);
    logger.debug('rpcReward resp: %q', result);
    return result;
}
function msecToSec(n) {
    return Math.floor(n / 1000);
}
var rtBeturnMessageSend = function (ctx, logger, nk, payload) {
    logger.info("HI!!!!!");
    return null;
};
