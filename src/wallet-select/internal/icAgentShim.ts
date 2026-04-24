/**
 * Bridges injected / legacy IC agents (e.g. Plug's HttpAgent) with `@icp-sdk/core` Actor, which
 * expects `agent.update()` to resolve to `{ reply: Uint8Array, ... }` (raw candid reply bytes).
 */

function asUint8Array(buf: unknown): Uint8Array | undefined {
  if (buf == null) return undefined;
  if (buf instanceof Uint8Array) return buf;
  if (buf instanceof ArrayBuffer) return new Uint8Array(buf);
  const v = buf as ArrayBufferView;
  if (ArrayBuffer.isView(v) && v.buffer) {
    return new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
  }
  return undefined;
}

/**
 * Normalizes the return value of `agent.update()` so `@icp-sdk/core` Actor can decode the reply.
 */
export function normalizeIcpSdkActorUpdateResult(res: unknown): unknown {
  if (!res || typeof res !== 'object') return res;
  const r = res as Record<string, unknown>;
  const direct = asUint8Array(r.reply);
  if (direct) {
    return r.reply === direct ? res : { ...r, reply: direct };
  }
  const nestedCandidates = [
    (r.reply as any)?.arg,
    (r.reply as any)?.reply,
    r.result,
    (r.response as any)?.reply?.arg,
    (r.response as any)?.body?.reply?.arg,
  ];
  for (const c of nestedCandidates) {
    const u8 = asUint8Array(c);
    if (u8) return { ...r, reply: u8 };
  }
  return res;
}

/**
 * Wraps an agent that already implements `update()` so its result matches what `Actor` expects.
 */
export function wrapAgentUpdateResultForIcpSdkActor(rawAgent: any): any {
  if (!rawAgent || typeof rawAgent.update !== 'function') return rawAgent;
  const inner = rawAgent.update.bind(rawAgent);
  return {
    ...rawAgent,
    update: async (canisterId: unknown, fields: unknown, polling?: unknown) => {
      const out = await inner(canisterId, fields, polling);
      return normalizeIcpSdkActorUpdateResult(out);
    },
  };
}
