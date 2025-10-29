import { HttpAgent } from '@dfinity/agent';
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
  getActor(options: GetActorOptions): any {
    if (!this._agent) throw new Error('Oisy agent not initialized');
    // Create actor through the signer agent compatible path
    return (globalThis as any).Actor?.createActor
      ? (globalThis as any).Actor.createActor(options.idl, { agent: this._agent, canisterId: options.canisterId })
      : (options as any);
  }
}


