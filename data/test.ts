
   const serverRpc : nkruntime.RpcFunction = function (ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string) : string | void {
    if (ctx.userId != "") {
      logger.error("rpc was called by a user");
      return null;
    }
    
    // Valid server to server RPC call, continue executing the RPC...
    return "<JsonResponse>";
  }
  