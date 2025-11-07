import type { HttpAgentOptions } from '@dfinity/agent';
import { Actor, HttpAgent } from '@dfinity/agent';
// Avoid importing IDL types to prevent cross-version type conflicts

export type WalletSelectConfig = {
  icHost?: string;
  derivationOrigin?: string;
  adapters?: Partial<Record<string, { adapter?: any; config?: any; enabled?: boolean; label?: string; icon?: string }>>;
  chainTypes?: Array<'ic' | 'evm'>; // optional: restrict which wallets to show
};

export type GetActorOptions = {
  canisterId: string;
  idl: any;
  requiresSigning?: boolean;
  anon?: boolean;
};

export type WalletAccount = {
  owner?: string | null;
  principal?: string | null;
  connected?: boolean;
};

export type AdapterInterface = {
  id: string;
  label: string;
  icon?: string | null;
  isInstalled(): Promise<boolean>;
  isConnected(): Promise<boolean>;
  connect(): Promise<WalletAccount>;
  disconnect(): Promise<void>;
  getPrincipal(): Promise<string | null>;
  getActor<T>(options: GetActorOptions): any;
};

export type AdapterConfig = {
  id: string;
  label: string;
  icon?: string | null;
  enabled?: boolean;
  adapter: new (args: { config: WalletSelectConfig }) => AdapterInterface;
};

function toStringPrincipal(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value;
  try {
    const v: any = value as any;
    if (typeof v.toText === 'function') return v.toText();
    if (typeof v.toString === 'function') return v.toString();
  } catch {}
  return null;
}

function defaultHttpAgentOptions(host?: string): HttpAgentOptions {
  const opts: HttpAgentOptions = {};
  if (host) opts.host = host;
  return opts;
}

function defaultIcHost(userHost?: string): string {
  return userHost && typeof userHost === 'string' && userHost.trim() ? userHost : 'https://icp-api.io';
}

// Adapters (Bundler moduleResolution requires explicit .js extension in TS sources)
import { PlugAdapter } from './internal/PlugAdapter.js';
import { IIAdapter } from './internal/IIAdapter.js';
import { NfidAdapter } from './internal/NfidAdapter.js';
import { OisyAdapter } from './internal/OisyAdapter.js';
import { MetaMaskAdapter } from './internal/MetaMaskAdapter.js';
import { WalletConnectAdapter } from './internal/WalletConnectAdapter.js';
import { CoinbaseAdapter } from './internal/CoinbaseAdapter.js';
import { getIcon } from './img/icons.js';


export class WalletSelect {
  private _config: WalletSelectConfig;
  private _adapters: Record<string, AdapterConfig>;
  private _activeAdapter: AdapterInterface | null = null;
  private _account: WalletAccount | null = null;

  constructor(config?: WalletSelectConfig) {
    this._config = config || {};
    const baseAdapters: Record<string, AdapterConfig> = {};
    baseAdapters.oisy = { id: 'oisy', label: 'Oisy', icon: null, enabled: true, adapter: OisyAdapter };
    baseAdapters.nfid = { id: 'nfid', label: 'NFID', icon: null, enabled: true, adapter: NfidAdapter };
    baseAdapters.ii = { id: 'ii', label: 'Internet Identity', icon: null, enabled: true, adapter: IIAdapter };
    baseAdapters.plug = { id: 'plug', label: 'Plug', icon: null, enabled: true, adapter: PlugAdapter };
    baseAdapters.metamask = { id: 'metamask', label: 'MetaMask', icon: null, enabled: true, adapter: MetaMaskAdapter };
    baseAdapters.walletconnect = { id: 'walletconnect', label: 'WalletConnect', icon: null, enabled: true, adapter: WalletConnectAdapter };
    baseAdapters.coinbase = { id: 'coinbase', label: 'Coinbase Wallet', icon: null, enabled: true, adapter: CoinbaseAdapter };
    // Initialize adapters config with sane defaults and allow overrides
    const cfgAdapters = (this._config.adapters = this._config.adapters || {});
    const host = defaultIcHost(this._config.icHost);
    // Default NFID signer config
    cfgAdapters.nfid = cfgAdapters.nfid || {};
    cfgAdapters.nfid.config = {
      signerUrl: cfgAdapters.nfid.config?.signerUrl || 'https://nfid.one/rpc',
      hostUrl: cfgAdapters.nfid.config?.hostUrl || host,
      transport: { ...(cfgAdapters.nfid.config?.transport || {}) }
    };
    // Default Oisy signer config
    cfgAdapters.oisy = cfgAdapters.oisy || {};
    cfgAdapters.oisy.config = {
      signerUrl: cfgAdapters.oisy.config?.signerUrl || 'https://oisy.com/sign',
      hostUrl: cfgAdapters.oisy.config?.hostUrl || host,
      transport: { ...(cfgAdapters.oisy.config?.transport || {}) }
    };
    // Keep Plug/II entries present for symmetry
    cfgAdapters.plug = cfgAdapters.plug || {};
    cfgAdapters.ii = cfgAdapters.ii || {};

    // Apply runtime enable/disable from config (default is enabled)
    Object.keys(baseAdapters).forEach((key) => {
      const cfg = (cfgAdapters as any)[key];
      if (cfg && typeof cfg.enabled === 'boolean') {
        (baseAdapters as any)[key].enabled = !!cfg.enabled;
      }
    });

    this._adapters = baseAdapters;
  }

  get config(): WalletSelectConfig { return this._config; }
  get account(): WalletAccount | null { return this._account; }

  getEnabledWallets(): any[] {
    const allowedTypes = Array.isArray(this._config.chainTypes) ? this._config.chainTypes.map((t) => String(t).toLowerCase()) : null;
    const idToType: Record<string, 'ic' | 'evm'> = {
      oisy: 'ic', nfid: 'ic', ii: 'ic', plug: 'ic',
      metamask: 'evm', walletconnect: 'evm', coinbase: 'evm',
    };
    return Object.values(this._adapters)
      .filter((a) => a.enabled !== false)
      .filter((a) => {
        if (!allowedTypes || allowedTypes.length === 0) return true;
        const t = idToType[a.id];
        return !!t && allowedTypes.includes(t);
      })
      .map((a) => ({
        id: a.id,
        label: a.label,
        icon: this.resolveIcon(a.id, a.icon),
        enabled: a.enabled,
        adapter: a.adapter,
        config: (this._config.adapters && (this._config.adapters as any)[a.id]?.config) || {}
      }));
  }

  private resolveIcon(id: string, fallback: string | null | undefined): string | null {
    return getIcon(id, fallback || null);
  }

  connect(walletId?: string): Promise<WalletAccount> {
    const id = (walletId || '').toLowerCase();
    const cfg = id ? this._adapters[id] : undefined;
    if (!cfg || cfg.enabled === false) throw new Error('No wallets available');
    const adapter = new cfg.adapter({ config: this._config });
    this._activeAdapter = adapter;
    return adapter.connect().then((acc) => {
      const principal = toStringPrincipal(acc?.principal || acc?.owner);
      this._account = { owner: principal, principal, connected: true };
      return this._account;
    });
  }

  async disconnect(): Promise<void> {
    try { await this._activeAdapter?.disconnect(); } catch {}
    this._activeAdapter = null;
    this._account = null;
  }

  getActor<T>(options: GetActorOptions): any {
    if (!this._activeAdapter) {
      const agent = new HttpAgent(defaultHttpAgentOptions(this._config.icHost));
      return Actor.createActor(options.idl, { agent, canisterId: options.canisterId });
    }
    return this._activeAdapter.getActor<T>(options);
  }
}

export const createWalletSelect = (config?: WalletSelectConfig) => new WalletSelect(config);


