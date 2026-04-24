import { Actor, HttpAgent } from '@icp-sdk/core/agent';
// Avoid importing IDL types to prevent cross-version type conflicts
import type { AdapterInterface, WalletSelectConfig, GetActorOptions, WalletAccount } from '../index';
import { PostMessageTransport } from '@slide-computer/signer-web';
import { Signer } from '@slide-computer/signer';
import { SignerAgent } from '@slide-computer/signer-agent';

export class OisyAdapter implements AdapterInterface {
  readonly id = 'oisy';
  readonly label = 'Oisy';
  readonly icon: string | null = null;
  private _config: WalletSelectConfig;
  private _agent: any | null = null;
  private _principal: string | null = null;

  constructor(args: { config: WalletSelectConfig }) { this._config = args.config || {}; }

  async isInstalled(): Promise<boolean> { return true; }
  async isConnected(): Promise<boolean> { return !!this._agent; }
  async connect(): Promise<WalletAccount> {
    const adapters = (this._config as any)?.adapters || {};
    const oisyCfg = adapters.oisy?.config || {};
    const signerUrl: string | undefined = oisyCfg.signerUrl; // e.g., https://oisy.com/signer
    const hostUrl: string | undefined = oisyCfg.hostUrl || this._config.icHost;
    const transportOverrides = (oisyCfg.transport || {}) as Record<string, any>;
    if (!signerUrl) throw new Error('Oisy signerUrl not configured');
    if (!hostUrl) throw new Error('IC host not configured');

    const windowOpenerFeatures = transportOverrides.windowOpenerFeatures ?? '';

    const baseAgent = new HttpAgent({ host: hostUrl });
    const transport = new PostMessageTransport({
      url: signerUrl,
      windowOpenerFeatures,
      detectNonClickEstablishment: false,
      ...transportOverrides
    });
    const signer = new Signer({ transport });
    // Establish channel immediately within click handler before any further awaits
    await signer.openChannel();
    const accounts = await signer.accounts();
    const account = accounts?.[0]?.owner;
    const signerAgent = await SignerAgent.create({ signer, agent: baseAgent, account });

    let principal: string | null = null;
    try { principal = (await signerAgent.getPrincipal())?.toText?.() || null; } catch {}

    this._agent = signerAgent;
    this._principal = principal;
    return { owner: principal, principal, connected: true };
  }
  async disconnect(): Promise<void> { this._agent = null; this._principal = null; }
  async getPrincipal(): Promise<string | null> { return this._principal; }

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
          arg: resolvedArg,
          args: resolvedArg,
          methodName: resolvedMethodName,
          effectiveCanisterId: resolvedEffectiveCanisterId,
          canisterId,
        };
        try {
          console.debug('[ICPay Widget][OisyAdapter] update() normalized request', {
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
            console.error('[ICPay Widget][OisyAdapter] update() missing candid arg payload', {
              canisterId,
              methodName: normalizedReq.methodName,
              requestKeys: Object.keys(req || {}),
            });
          } catch {}
          throw new Error('Oisy update() missing candid arg payload');
        }
        try {
          const res = await rawAgent.call(canisterId, normalizedReq);
          try {
            console.debug('[ICPay Widget][OisyAdapter] call(canisterId, req) success', {
              methodName: normalizedReq.methodName,
              resultType: res?.constructor?.name || typeof res,
              resultKeys: res && typeof res === 'object' ? Object.keys(res) : undefined,
            });
          } catch {}
          return res;
        } catch (err1) {
          try {
            console.warn('[ICPay Widget][OisyAdapter] call(canisterId, req) failed; trying call(req)', {
              methodName: normalizedReq.methodName,
              error: (err1 as any)?.message || String(err1),
            });
          } catch {}
          try {
            const res = await rawAgent.call(normalizedReq);
            try {
              console.debug('[ICPay Widget][OisyAdapter] call(req) success', {
                methodName: normalizedReq.methodName,
                resultType: res?.constructor?.name || typeof res,
                resultKeys: res && typeof res === 'object' ? Object.keys(res) : undefined,
              });
            } catch {}
            return res;
          } catch (err2) {
            try {
              console.error('[ICPay Widget][OisyAdapter] call(req) failed', {
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

  getActor(options: GetActorOptions): any {
    if (!this._agent) throw new Error('Oisy agent not initialized');
    // Create actor through the signer agent compatible path
    const rawAgent: any = this._agent;
    const agent: any = this.normalizeAgent(rawAgent);
    if (typeof agent.update !== 'function') {
      throw new Error('Oisy signer agent is missing update() and call() methods');
    }
    return Actor.createActor(options.idl, { agent, canisterId: options.canisterId });
  }
}


