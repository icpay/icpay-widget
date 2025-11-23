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
import { BraveAdapter } from './internal/BraveAdapter.js';
import { RainbowAdapter } from './internal/RainbowAdapter.js';
import { RabbyAdapter } from './internal/RabbyAdapter.js';
import { PhantomAdapter } from './internal/PhantomAdapter.js';
import { OkxAdapter } from './internal/OkxAdapter.js';
import { getIcon } from './img/icons.js';


export class WalletSelect {
  private _config: WalletSelectConfig;
  private _adapters: Record<string, AdapterConfig>;
  private _activeAdapter: AdapterInterface | null = null;
  private _account: WalletAccount | null = null;

  private isMobileBrowser(): boolean {
    try {
      const nav: any = (typeof navigator !== 'undefined' ? navigator : (globalThis as any)?.navigator);
      const ua = String(nav?.userAgent || '').toLowerCase();
      return /iphone|ipad|ipod|android|mobile|windows phone/.test(ua);
    } catch {
      return false;
    }
  }

  constructor(config?: WalletSelectConfig) {
    this._config = config || {};
    const baseAdapters: Record<string, AdapterConfig> = {};
    baseAdapters.metamask = { id: 'metamask', label: 'MetaMask', icon: null, enabled: true, adapter: MetaMaskAdapter };
    baseAdapters.coinbase = { id: 'coinbase', label: 'Coinbase Wallet', icon: null, enabled: true, adapter: CoinbaseAdapter };
    // WalletConnect is disabled by default; enable via config.adapters.walletconnect.enabled = true and provide projectId
    baseAdapters.walletconnect = { id: 'walletconnect', label: 'WalletConnect', icon: null, enabled: false, adapter: WalletConnectAdapter };
    baseAdapters.phantom = { id: 'phantom', label: 'Phantom', icon: null, enabled: true, adapter: PhantomAdapter };
    // Temporarily disable Rainbow due to provider interoperability issues
    baseAdapters.rainbow = { id: 'rainbow', label: 'Rainbow', icon: null, enabled: false, adapter: RainbowAdapter };
    baseAdapters.rabby = { id: 'rabby', label: 'Rabby', icon: null, enabled: true, adapter: RabbyAdapter };
    baseAdapters.brave = { id: 'brave', label: 'Brave Wallet', icon: null, enabled: true, adapter: BraveAdapter };
    baseAdapters.okx = { id: 'okx', label: 'OKX Wallet', icon: null, enabled: true, adapter: OkxAdapter };
    baseAdapters.oisy = { id: 'oisy', label: 'Oisy', icon: null, enabled: true, adapter: OisyAdapter };
    baseAdapters.nfid = { id: 'nfid', label: 'NFID', icon: null, enabled: false, adapter: NfidAdapter };
    baseAdapters.ii = { id: 'ii', label: 'Internet Identity', icon: null, enabled: false, adapter: IIAdapter };
    baseAdapters.plug = { id: 'plug', label: 'Plug', icon: null, enabled: true, adapter: PlugAdapter };
    // Initialize adapters config with sane defaults and allow overrides
    const cfgAdapters = (this._config.adapters = this._config.adapters || {});
    const host = defaultIcHost(this._config.icHost);
    // Ensure icHost is always set (used by Plug/agent); default to icp-api.io
    if (!this._config.icHost) this._config.icHost = host;
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
    // Default WalletConnect container for config (kept disabled unless explicitly enabled)
    cfgAdapters.walletconnect = cfgAdapters.walletconnect || {};
    cfgAdapters.walletconnect.config = {
      ...(cfgAdapters.walletconnect.config || {}),
      projectId: cfgAdapters.walletconnect.config?.projectId || '',
      chains: cfgAdapters.walletconnect.config?.chains || [8453, 84532]
    };
    // If WalletConnect is enabled but no projectId provided, hide it to prevent broken UX
    try {
      const wcEnabled = (cfgAdapters.walletconnect?.enabled !== false);
      const wcProjectId = String(cfgAdapters.walletconnect?.config?.projectId || '').trim();
      if (wcEnabled && !wcProjectId) {
        (baseAdapters as any).walletconnect.enabled = false;
      }
    } catch {}
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
      brave: 'evm', rainbow: 'evm', rabby: 'evm', phantom: 'evm', okx: 'evm',
    };
    return Object.values(this._adapters)
      .filter((a) => {
        if (a.enabled === false) return false;
        // Additional synchronous availability gate for WalletConnect: require projectId
        if (a.id === 'walletconnect') {
          try {
            const wcProjectId = String((this._config as any)?.adapters?.walletconnect?.config?.projectId || '').trim();
            if (!wcProjectId) return false;
          } catch { return false; }
        }
        // Hide Rabby on mobile (not supported)
        if (a.id === 'rabby' && this.isMobileBrowser()) return false;
        return true;
      })
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

  // Expose the active EVM provider (if adapter supports it). Falls back to window.ethereum.
  getEvmProvider(): any {
    try {
      const anyAdapter: any = this._activeAdapter as any;
      if (anyAdapter && typeof anyAdapter.getEvmProvider === 'function') {
        const prov = anyAdapter.getEvmProvider();
        if (prov) return prov;
      }
    } catch {}
    try { return (typeof window !== 'undefined' ? (window as any).ethereum : null) || null; } catch { return null; }
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


