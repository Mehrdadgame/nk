"use strict";
var Mark;
(function (Mark) {
    Mark[Mark["X"] = 0] = "X";
    Mark[Mark["O"] = 1] = "O";
    Mark[Mark["UNDEFINED"] = 2] = "UNDEFINED";
})(Mark || (Mark = {}));
// The complete set of opcodes used for communication between clients and server.
var OpCode;
(function (OpCode) {
    // New game round starting.
    OpCode[OpCode["START"] = 1] = "START";
    // Update to the state of an ongoing round.
    OpCode[OpCode["UPDATE"] = 2] = "UPDATE";
    // A game round has just completed.
    OpCode[OpCode["DONE"] = 3] = "DONE";
    // A move the player wishes to make and sends to the server.
    OpCode[OpCode["MOVE"] = 4] = "MOVE";
    // Move was rejected.
    OpCode[OpCode["REJECTED"] = 5] = "REJECTED";
})(OpCode || (OpCode = {}));
