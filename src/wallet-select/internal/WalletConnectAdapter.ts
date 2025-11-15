import type { AdapterInterface, GetActorOptions, WalletSelectConfig, WalletAccount } from '../index.js';
import { Actor, HttpAgent } from '@dfinity/agent';

let wcProviderScriptLoaded = false;
let qrLibScriptLoaded = false;

async function loadScriptOnce(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      const d: any = (typeof document !== 'undefined' ? document : null);
      if (!d) return resolve();
      const existing = Array.from(d.getElementsByTagName('script')).find((s: any) => s && s.src === src);
      if (existing) return resolve();
      const el = d.createElement('script');
      el.src = src;
      el.async = true;
      el.onload = () => resolve();
      el.onerror = () => reject(new Error('Failed to load script: ' + src));
      d.head.appendChild(el);
    } catch {
      resolve();
    }
  });
}

async function loadAnyScript(urls: string[]): Promise<boolean> {
  for (const url of urls) {
    try {
      await loadScriptOnce(url);
      return true;
    } catch {}
  }
  return false;
}

function getWcV2Ctor(g: any): any | null {
  const cands = [
    g?.EthereumProvider?.default,
    g?.EthereumProvider,
    g?.WalletConnectEthereumProvider?.default,
    g?.WalletConnectEthereumProvider
  ];
  for (const c of cands) if (typeof c === 'function' || (c && typeof c.init === 'function')) return c;
  return null;
}

async function waitFor(predicate: () => any, timeoutMs = 1500, intervalMs = 50): Promise<any> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      try {
        const val = predicate();
        if (val) return resolve(val);
      } catch {}
      if (Date.now() - start >= timeoutMs) return resolve(null);
      setTimeout(tick, intervalMs);
    };
    tick();
  });
}

function defaultRpcForChain(chainId: number): string | null {
  switch (Number(chainId)) {
    case 8453: return 'https://mainnet.base.org';
    case 84532: return 'https://sepolia.base.org';
    default: return null;
  }
}

async function tryDynamicImportV2(): Promise<void> {
  try {
    const g: any = (typeof window !== 'undefined' ? window : {}) as any;
    if (!g?.EthereumProvider && !g?.WalletConnectEthereumProvider) {
      const mod: any = await import(/* @vite-ignore */ '@walletconnect/ethereum-provider');
      const ctor = mod?.EthereumProvider || mod?.default;
      if (ctor) (g as any).EthereumProvider = ctor;
    }
  } catch {}
}

async function ensureQrLib(): Promise<void> {
  const g: any = (typeof window !== 'undefined' ? window : {}) as any;
  if (g?.QRCode && typeof g.QRCode?.toCanvas === 'function') return;
  if (!qrLibScriptLoaded) {
    const ok = await loadAnyScript([
      'https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js',
      'https://unpkg.com/qrcode@1.5.3/build/qrcode.min.js'
    ]);
    qrLibScriptLoaded = ok;
  }
  await waitFor(() => {
    const w: any = (typeof window !== 'undefined' ? window : {}) as any;
    return w?.QRCode && typeof w.QRCode?.toCanvas === 'function';
  }, 1500, 50);
}

function showQrOverlay(uri: string): void {
  try {
    const d: any = (typeof document !== 'undefined' ? document : null);
    if (!d) return;
    let overlay = d.getElementById('icpay-wc-overlay') as HTMLElement | null;
    if (!overlay) {
      overlay = d.createElement('div');
      overlay.id = 'icpay-wc-overlay';
      overlay.style.position = 'fixed';
      overlay.style.inset = '0';
      overlay.style.background = 'rgba(0,0,0,0.55)';
      overlay.style.display = 'flex';
      overlay.style.alignItems = 'center';
      overlay.style.justifyContent = 'center';
      overlay.style.zIndex = '999999';
      const box = d.createElement('div');
      box.style.background = '#1a1a1a';
      box.style.border = '1px solid #333';
      box.style.borderRadius = '16px';
      box.style.padding = '16px';
      box.style.width = '320px';
      box.style.boxShadow = '0 10px 30px rgba(0,0,0,0.4)';
      box.style.display = 'flex';
      box.style.flexDirection = 'column';
      box.style.alignItems = 'center';
      const title = d.createElement('div');
      title.textContent = 'Scan with your wallet';
      title.style.color = '#fff';
      title.style.fontSize = '16px';
      title.style.marginBottom = '12px';
      const canvas = d.createElement('canvas');
      canvas.id = 'icpay-wc-qr-canvas';
      canvas.style.width = '260px';
      canvas.style.height = '260px';
      canvas.style.background = '#fff';
      canvas.style.borderRadius = '8px';
      const link = d.createElement('a');
      link.href = uri;
      link.textContent = 'Open in wallet';
      link.style.color = '#4da3ff';
      link.style.fontSize = '12px';
      link.style.marginTop = '10px';
      link.target = '_blank';
      const close = d.createElement('button');
      close.textContent = 'Close';
      close.style.marginTop = '12px';
      close.style.background = '#2a2a2a';
      close.style.color = '#fff';
      close.style.border = '1px solid #444';
      close.style.padding = '6px 10px';
      close.style.borderRadius = '8px';
      close.onclick = () => { try { d.body.removeChild(overlay as any); } catch {} };
      box.appendChild(title);
      box.appendChild(canvas);
      box.appendChild(link);
      box.appendChild(close);
      overlay.appendChild(box);
      d.body.appendChild(overlay);
    }
    const canvas = d.getElementById('icpay-wc-qr-canvas') as HTMLCanvasElement | null;
    const w: any = (typeof window !== 'undefined' ? window : {}) as any;
    if (canvas && w?.QRCode?.toCanvas) {
      try { w.QRCode.toCanvas(canvas, uri, { width: 260, margin: 2 }); } catch {}
    }
  } catch {}
}

function hideQrOverlay(): void {
  try {
    const d: any = (typeof document !== 'undefined' ? document : null);
    const overlay = d?.getElementById('icpay-wc-overlay');
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
  } catch {}
}

export class WalletConnectAdapter implements AdapterInterface {
  readonly id = 'walletconnect';
  readonly label = 'WalletConnect';
  readonly icon?: string | null;
  private readonly config: WalletSelectConfig;
  private wcProvider: any | null = null;

  constructor(args: { config: WalletSelectConfig }) {
    this.config = args.config || {};
  }

  private getAdapterConfig(): any {
    try {
      return (this.config as any)?.adapters?.walletconnect?.config || {};
    } catch {
      return {};
    }
  }

  private getInjectedWcProvider(): any | null {
    try {
      const anyWin: any = (typeof window !== 'undefined' ? window : {}) as any;
      const eth = anyWin.ethereum;
      if (Array.isArray(eth?.providers)) {
        const p = eth.providers.find((p: any) => p && (p.isWalletConnect || p?.provider?.isWalletConnect));
        if (p) return p;
      }
      if (eth && (eth.isWalletConnect || eth?.provider?.isWalletConnect)) return eth;
    } catch {}
    return null;
  }

  getEvmProvider(): any {
    if (this.wcProvider) return this.wcProvider;
    return this.getInjectedWcProvider();
  }

  async isInstalled(): Promise<boolean> {
    try {
      if (this.getInjectedWcProvider()) return true;
      const g: any = (typeof window !== 'undefined' ? window : {}) as any;
      const hasV2 = !!getWcV2Ctor(g);
      const cfg = this.getAdapterConfig();
      if (hasV2 && (cfg.projectId || cfg.chains)) return true;
      return false;
    } catch {
      return false;
    }
  }

  async isConnected(): Promise<boolean> {
    try {
      const provider = this.getEvmProvider();
      if (!provider) return false;
      const accounts = await provider.request?.({ method: 'eth_accounts' });
      return Array.isArray(accounts) && accounts.length > 0;
    } catch {
      return false;
    }
  }

  private async ensureV2Globals(cfg: any): Promise<void> {
    const g: any = (typeof window !== 'undefined' ? window : {}) as any;
    await tryDynamicImportV2();
    if (!getWcV2Ctor(g)) {
      if (!wcProviderScriptLoaded) {
        const ok = await loadAnyScript([
          'https://cdn.jsdelivr.net/npm/@walletconnect/ethereum-provider@2/dist/index.umd.js',
          'https://unpkg.com/@walletconnect/ethereum-provider@2/dist/index.umd.js',
          'https://cdn.jsdelivr.net/npm/@walletconnect/ethereum-provider@2/dist/index.umd.min.js',
          'https://unpkg.com/@walletconnect/ethereum-provider@2/dist/index.umd.min.js'
        ]);
        wcProviderScriptLoaded = ok;
      }
      await waitFor(() => getWcV2Ctor((typeof window !== 'undefined' ? window : {}) as any), 2000, 50);
    }
  }

  private async initGlobalProvider(): Promise<any | null> {
    try {
      const g: any = (typeof window !== 'undefined' ? window : {}) as any;
      const cfg = this.getAdapterConfig();

      const hasProjectId = !!(cfg.projectId || cfg.projectID);
      if (!hasProjectId) return null;

      await this.ensureV2Globals(cfg);
      const EthereumProviderCtor: any = getWcV2Ctor(g);
      if (!EthereumProviderCtor) return null; // v2 only
      const projectId = String(cfg.projectId || cfg.projectID);
      const chains: number[] = Array.isArray(cfg.chains) ? cfg.chains.map((c: any) => Number(c)) : [1];
      const metadata = cfg.metadata || {
        name: (g?.document?.title || 'ICPay Widget'),
        description: 'ICPay WalletConnect',
        url: (g?.location?.origin || 'https://icpay.dev'),
        icons: cfg.icons || [(g?.location?.origin ? g.location.origin + '/favicon.ico' : 'https://walletconnect.com/walletconnect-logo.png')]
      };
      // Force showQrModal false to use our custom overlay
      const provider = typeof EthereumProviderCtor.init === 'function'
        ? await EthereumProviderCtor.init({ projectId, chains, showQrModal: false, metadata, relayUrl: 'wss://relay.walletconnect.com' })
        : new EthereumProviderCtor({ projectId, chains, showQrModal: false, metadata, relayUrl: 'wss://relay.walletconnect.com' });

      // Listen for display_uri to render our QR
      try {
        await ensureQrLib();
        provider.on?.('display_uri', (uri: string) => {
          try { showQrOverlay(uri); } catch {}
        });
        provider.on?.('disconnect', () => { try { hideQrOverlay(); } catch {} });
      } catch {}

      try { await provider.enable?.(); } catch {}
      return provider;
    } catch {
      return null;
    }
  }

  async connect(): Promise<WalletAccount> {
    const injected = this.getInjectedWcProvider();
    if (injected) {
      this.wcProvider = injected;
      const accounts = await injected.request({ method: 'eth_requestAccounts' });
      const addr = Array.isArray(accounts) ? (accounts[0] || '') : '';
      if (!addr) throw new Error('No account returned by WalletConnect');
      return { owner: addr, principal: addr, connected: true };
    }

    const provider = await this.initGlobalProvider();
    if (provider) {
      this.wcProvider = provider;
      const accounts = await provider.request?.({ method: 'eth_requestAccounts' });
      const addr = Array.isArray(accounts) ? (accounts[0] || '') : '';
      try { hideQrOverlay(); } catch {}
      if (!addr) throw new Error('No account returned by WalletConnect');
      return { owner: addr, principal: addr, connected: true };
    }

    throw new Error('WalletConnect requires a projectId and provider setup. Include WalletConnect EthereumProvider (v2) globally (CSP must allow CDN) or add it as a dependency, then try again.');
  }

  async disconnect(): Promise<void> {
    try {
      const provider = this.getEvmProvider();
      try { await provider?.disconnect?.(); } catch {}
      try { await provider?.disconnectSession?.(); } catch {}
      try { hideQrOverlay(); } catch {}
      try {
        const keysToNuke: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i) as string;
          if (!k) continue;
          if (k === 'walletconnect' || k.startsWith('wc@') || k.startsWith('@walletconnect/') || k.includes('WALLETCONNECT')) {
            keysToNuke.push(k);
          }
        }
        keysToNuke.forEach((k) => { try { localStorage.removeItem(k); } catch {} });
      } catch {}
      try { provider?.removeAllListeners?.('accountsChanged'); } catch {}
      try { provider?.removeAllListeners?.('chainChanged'); } catch {}
      try { provider?.removeAllListeners?.('disconnect'); } catch {}
      this.wcProvider = null;
    } catch {}
  }

  async getPrincipal(): Promise<string | null> {
    try {
      const provider = this.getEvmProvider();
      if (!provider) return null;
      const accounts = await provider.request?.({ method: 'eth_accounts' });
      const addr = Array.isArray(accounts) ? (accounts[0] || '') : '';
      return addr || null;
    } catch {
      return null;
    }
  }

  getActor<T>(options: GetActorOptions): any {
    throw new Error('EVM wallets cannot provide IC actors. Use IC adapters for IC canister interactions.');
  }
}


