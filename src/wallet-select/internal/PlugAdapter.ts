import type { ActorSubclass } from '@dfinity/agent';
import { Actor } from '@dfinity/agent';
import type { IDL } from '@dfinity/candid';
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

  getActor<T>(options: GetActorOptions): ActorSubclass<T> {
    // Use Plug's agent synchronously if available
    const agent = window.ic?.plug?.agent;
    if (!agent) {
      throw new Error('Plug agent not initialized');
    }
    return Actor.createActor<T>(options.idl as IDL.InterfaceFactory, { agent, canisterId: options.canisterId });
  }
}


