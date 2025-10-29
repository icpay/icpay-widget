import { HttpAgent } from '@dfinity/agent';
import { StoicTransport } from '@slide-computer/signer-transport-stoic';
import { Signer } from '@slide-computer/signer';
import { SignerAgent } from '@slide-computer/signer-agent';
import type { AdapterInterface, GlobalPnpConfig, GetActorOptions, WalletAccount } from '../index';

export class StoicAdapter implements AdapterInterface {
  readonly id = 'stoic';
  readonly label = 'Stoic';
  readonly icon: string | null = null;
  private _config: GlobalPnpConfig;
  private _agent: any | null = null;
  private _principal: string | null = null;

  constructor(args: { config: GlobalPnpConfig }) { this._config = args.config || {}; }

  async isInstalled(): Promise<boolean> { return true; }
  async isConnected(): Promise<boolean> { return !!this._agent; }

  async connect(): Promise<WalletAccount> {
    const baseAgent = new HttpAgent({ host: this._config.icHost });
    const transport = await StoicTransport.create({ maxTimeToLive: BigInt(7 * 24 * 60 * 60 * 1_000_000_000) });
    const signer = new Signer({ transport });
    // Establish within click handler
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
    if (!this._agent) throw new Error('Stoic agent not initialized');
    return (globalThis as any).Actor?.createActor
      ? (globalThis as any).Actor.createActor(options.idl, { agent: this._agent, canisterId: options.canisterId })
      : (options as any);
  }
}


