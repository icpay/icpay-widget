import type { ActorSubclass } from '@dfinity/agent';
import { Actor, HttpAgent } from '@dfinity/agent';
import { AuthClient } from '@dfinity/auth-client';
import type { AdapterInterface, GlobalPnpConfig, GetActorOptions, WalletAccount } from '../index';

export class IIAdapter implements AdapterInterface {
  readonly id = 'ii';
  readonly label = 'Internet Identity';
  readonly icon: string | null = null;
  private _config: GlobalPnpConfig;
  private _client: AuthClient | null = null;
  private _agent: HttpAgent | null = null;

  constructor(args: { config: GlobalPnpConfig }) {
    this._config = args.config || {};
  }

  private async client(): Promise<AuthClient> {
    if (this._client) return this._client;
    this._client = await AuthClient.create();
    return this._client;
  }

  async isInstalled(): Promise<boolean> { return true; }

  async isConnected(): Promise<boolean> {
    const c = await this.client();
    return await c.isAuthenticated();
  }

  async connect(): Promise<WalletAccount> {
    const c = await this.client();
    const connected = await c.isAuthenticated();
    if (!connected) {
      await c.login({ identityProvider: this._config.derivationOrigin, maxTimeToLive: BigInt(7 * 24 * 60 * 60 * 1_000_000_000) });
    }
    const identity = c.getIdentity();
    this._agent = new HttpAgent({ host: this._config.icHost, identity });
    const principal = identity.getPrincipal().toText();
    return { owner: principal, principal, connected: true };
  }

  async disconnect(): Promise<void> {
    try { await (await this.client()).logout(); } catch {}
    this._agent = null;
  }

  async getPrincipal(): Promise<string | null> {
    try { return (await this.client()).getIdentity().getPrincipal().toText(); } catch { return null; }
  }

  getActor<T>(options: GetActorOptions): ActorSubclass<T> {
    if (!this._agent) throw new Error('II agent not initialized');
    return Actor.createActor<T>(options.idl, { agent: this._agent, canisterId: options.canisterId });
  }
}


