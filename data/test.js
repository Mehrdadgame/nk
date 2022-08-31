"use strict";
const serverRpc = function (ctx, logger, nk, payload) {
    if (ctx.userId != "") {
        logger.error("rpc was called by a user");
        return null;
    }
    // Valid server to server RPC call, continue executing the RPC...
    return "<JsonResponse>";
};
