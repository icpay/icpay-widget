import type { ActorSubclass } from '@icp-sdk/core/agent';
import { Actor } from '@icp-sdk/core/agent';
import type { IDL } from '@icp-sdk/core/candid';
import type { AdapterInterface, WalletSelectConfig, GetActorOptions, WalletAccount, AdapterConfig } from '../index';

declare global {
  interface Window {
    ic?: any;
  }
}

export class PlugAdapter implements AdapterInterface {
  readonly id = 'plug';
  readonly label = 'Plug';
  readonly icon: string | null = null;
  private _config: WalletSelectConfig;
  private _adapterCfg?: AdapterConfig;

  constructor(args: { config?: WalletSelectConfig; adapter?: AdapterConfig }) {
    this._config = args.config || {};
    this._adapterCfg = args.adapter;
  }

  async isInstalled(): Promise<boolean> {
    return !!(typeof window !== 'undefined' && window.ic && window.ic.plug);
  }

  async isConnected(): Promise<boolean> {
    try { return !!(await window.ic?.plug?.isConnected?.()); } catch { return false; }
  }

  async connect(): Promise<WalletAccount> {
    if (!(await this.isInstalled())) throw new Error('Plug is not installed');
    // Ensure connected
    const connected = await this.isConnected();
    if (!connected) {
      await window.ic!.plug!.requestConnect?.({ host: this._config.icHost });
    }
    const principal = await window.ic!.plug!.getPrincipal?.();
    const principalText = typeof principal?.toText === 'function' ? principal.toText() : (principal?.toString?.() || null);
    return { owner: principalText, principal: principalText, connected: true };
  }

  async disconnect(): Promise<void> {
    try { await window.ic?.plug?.disconnect?.(); } catch {}
  }

  async getPrincipal(): Promise<string | null> {
    try {
      const p = await window.ic!.plug!.getPrincipal?.();
      return typeof p?.toText === 'function' ? p.toText() : (p?.toString?.() || null);
    } catch { return null; }
  }

  private normalizeAgent(rawAgent: any): any {
    if (!rawAgent) return rawAgent;
    if (typeof rawAgent.update === 'function') return rawAgent;
    if (typeof rawAgent.call !== 'function') return rawAgent;
    return {
      ...rawAgent,
      update: async (canisterId: string, request: any) => {
        const req = request || {};
        const resolvedArg =
          req.arg ??
          req.args ??
          req?.body?.arg ??
          req?.content?.arg ??
          req?.request?.arg;
        const resolvedMethodName =
          req.methodName ??
          req.method_name ??
          req?.body?.methodName ??
          req?.content?.methodName ??
          req?.request?.methodName;
        const resolvedEffectiveCanisterId =
          req.effectiveCanisterId ??
          req.effective_canister_id ??
          req?.body?.effectiveCanisterId ??
          req?.content?.effectiveCanisterId ??
          req?.request?.effectiveCanisterId;
        const normalizedReq = {
          ...req,
          // Different agent implementations expect either `arg` or `args`.
          arg: resolvedArg,
          args: resolvedArg,
          methodName: resolvedMethodName,
          effectiveCanisterId: resolvedEffectiveCanisterId,
          canisterId,
        };
        try {
          console.debug('[ICPay Widget][PlugAdapter] update() normalized request', {
            canisterId,
            methodName: normalizedReq.methodName,
            effectiveCanisterId: normalizedReq.effectiveCanisterId,
            hasArg: typeof normalizedReq.arg !== 'undefined',
            hasArgs: typeof normalizedReq.args !== 'undefined',
            argType: normalizedReq.arg?.constructor?.name || typeof normalizedReq.arg,
            argByteLength:
              typeof normalizedReq.arg?.byteLength === 'number'
                ? normalizedReq.arg.byteLength
                : (typeof normalizedReq.arg?.length === 'number' ? normalizedReq.arg.length : undefined),
            requestKeys: Object.keys(req || {}),
          });
        } catch {}
        if (typeof normalizedReq.arg === 'undefined') {
          try {
            console.error('[ICPay Widget][PlugAdapter] update() missing candid arg payload', {
              canisterId,
              methodName: normalizedReq.methodName,
              requestKeys: Object.keys(req || {}),
            });
          } catch {}
          throw new Error('Plug update() missing candid arg payload');
        }
        try {
          // Legacy shape used by many injected Plug agents
          const res = await rawAgent.call(canisterId, normalizedReq);
          try {
            console.debug('[ICPay Widget][PlugAdapter] call(canisterId, req) success', {
              methodName: normalizedReq.methodName,
              resultType: res?.constructor?.name || typeof res,
              resultKeys: res && typeof res === 'object' ? Object.keys(res) : undefined,
            });
          } catch {}
          return res;
        } catch (err1) {
          try {
            console.warn('[ICPay Widget][PlugAdapter] call(canisterId, req) failed; trying call(req)', {
              methodName: normalizedReq.methodName,
              error: (err1 as any)?.message || String(err1),
            });
          } catch {}
          // Some agents expect a single object payload instead
          try {
            const res = await rawAgent.call(normalizedReq);
            try {
              console.debug('[ICPay Widget][PlugAdapter] call(req) success', {
                methodName: normalizedReq.methodName,
                resultType: res?.constructor?.name || typeof res,
                resultKeys: res && typeof res === 'object' ? Object.keys(res) : undefined,
              });
            } catch {}
            return res;
          } catch (err2) {
            try {
              console.error('[ICPay Widget][PlugAdapter] call(req) failed', {
                methodName: normalizedReq.methodName,
                error: (err2 as any)?.message || String(err2),
              });
            } catch {}
            throw err2;
          }
        }
      },
    };
  }

  getActor<T>(options: GetActorOptions): ActorSubclass<T> {
    // Use Plug's agent synchronously if available
    const rawAgent = window.ic?.plug?.agent;
    if (!rawAgent) {
      throw new Error('Plug agent not initialized');
    }
    const agent: any = this.normalizeAgent(rawAgent);
    if (typeof agent.update !== 'function') {
      throw new Error('Plug agent is missing update() and call() methods');
    }
    return Actor.createActor<T>(options.idl as IDL.InterfaceFactory, { agent, canisterId: options.canisterId });
  }
}


