import type { AdapterInterface, GetActorOptions, WalletSelectConfig, WalletAccount } from '../index.js';
import { getIcon } from '../img/icons.js';
import walletconnectIconUrl from '../img/walletconnect.js';

let wcProviderScriptLoaded = false;
let qrLibScriptLoaded = false;

// Default WalletConnect chains authorized during pairing.
// Include Ethereum mainnet for better compatibility with mobile wallets.
const DEFAULT_WC_CHAINS: number[] = [1, 8453, 84532]; // Ethereum, Base, Base Sepolia
// Some wallets (e.g., Coinbase/Phantom) are more permissive when Ethereum mainnet (1) is allowed optionally.
const DEFAULT_WC_OPTIONAL_CHAINS: number[] = [1, 8453, 84532];

async function loadScriptOnce(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      const d: any = (typeof document !== 'undefined' ? document : null);
      if (!d) return resolve();
      const scripts = Array.from(d.getElementsByTagName('script')) as HTMLScriptElement[];
      const existing = scripts.find((s: HTMLScriptElement) => s && s.src === src) as HTMLScriptElement | undefined;
      if (existing) {
        // If existing script is type="module", it won't expose a UMD global; inject a non-module script
        const t = String((existing as HTMLScriptElement).type || '').toLowerCase();
        if (t !== 'module') {
          return resolve();
        }
      }
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

function getWcV2Ctor(g: any, cfg?: any): any | null {
  const custom = (cfg && typeof cfg.globalVar === 'string' && cfg.globalVar.trim()) ? cfg.globalVar.trim() : null;
  const cands = [
    custom ? g?.[custom]?.default : null,
    custom ? g?.[custom] : null,
    g?.['@walletconnect/ethereum-provider']?.default,
    g?.['@walletconnect/ethereum-provider'],
    g?.WalletConnect?.EthereumProvider?.default,
    g?.WalletConnect?.EthereumProvider,
    g?.EthereumProvider?.default,
    g?.EthereumProvider,
    g?.WalletConnectEthereumProvider?.default,
    g?.WalletConnectEthereumProvider,
    g?.WalletConnectProvider?.default, // v1-style global fallback
    g?.WalletConnectProvider,
  ].filter(Boolean);
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

// No-op to avoid bundling heavy WC provider into widget; rely on global UMD via CDN or host-provided script
async function tryDynamicImportV2(): Promise<void> { return; }

function isMobileBrowserGlobal(): boolean {
  try {
    const nav: any = (typeof navigator !== 'undefined' ? navigator : (window as any)?.navigator);
    const ua = String(nav?.userAgent || '').toLowerCase();
    return /iphone|ipad|ipod|android|mobile|windows phone/.test(ua);
  } catch {
    return false;
  }
}

function isAndroid(): boolean {
  try {
    const ua = String((typeof navigator !== 'undefined' ? navigator.userAgent : '') || '').toLowerCase();
    return ua.includes('android');
  } catch { return false; }
}

function isMetaMaskMobileUA(): boolean {
  try {
    const ua = String((typeof navigator !== 'undefined' ? navigator.userAgent : '') || '').toLowerCase();
    return ua.includes('metamask');
  } catch { return false; }
}

function isCoinbaseMobileUA(): boolean {
  try {
    const ua = String((typeof navigator !== 'undefined' ? navigator.userAgent : '') || '').toLowerCase();
    return ua.includes('coinbasewallet') || ua.includes('coinbase');
  } catch { return false; }
}

function isRainbowMobileUA(): boolean {
  try {
    const ua = String((typeof navigator !== 'undefined' ? navigator.userAgent : '') || '').toLowerCase();
    return ua.includes('rainbow');
  } catch { return false; }
}

function isTrustMobileUA(): boolean {
  try {
    const ua = String((typeof navigator !== 'undefined' ? navigator.userAgent : '') || '').toLowerCase();
    return ua.includes('trust') || ua.includes('trustwallet');
  } catch { return false; }
}

function isOkxMobileUA(): boolean {
  try {
    const ua = String((typeof navigator !== 'undefined' ? navigator.userAgent : '') || '').toLowerCase();
    return ua.includes('okx');
  } catch { return false; }
}

function isPhantomMobileUA(): boolean {
  try {
    const ua = String((typeof navigator !== 'undefined' ? navigator.userAgent : '') || '').toLowerCase();
    return ua.includes('phantom');
  } catch { return false; }
}

async function ensureQrLib(): Promise<void> {
  const g: any = (typeof window !== 'undefined' ? window : {}) as any;
  if (g?.QRCode && typeof g.QRCode?.toCanvas === 'function') return;
  // Try dynamic import first (avoids CSP/CDN issues if bundled)
  try {
    const mod: any = await import(/* @vite-ignore */ 'qrcode');
    const QR = (mod && (mod.default || mod)) || null;
    if (QR && typeof QR.toCanvas === 'function') {
      (g as any).QRCode = QR;
      return;
    }
  } catch {}
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
  }, 2000, 50);
}

async function showQrOverlay(uri: string): Promise<void> {
  try {
    const d: any = (typeof document !== 'undefined' ? document : null);
    if (!d) return;
    const openUrl = (url: string) => {
      try { window.location.href = url; } catch { try { window.open(url, '_self', 'noopener,noreferrer'); } catch {} }
    };
    // Keep track of any scheduled deep-link attempts and cancel once the user leaves the page
    const scheduled: any[] = [];
    const scheduleIfVisible = (fn: () => void, delayMs: number) => {
      try {
        const id = setTimeout(() => {
          try {
            const doc: any = (typeof document !== 'undefined' ? document : null);
            if (doc && doc.visibilityState === 'hidden') return; // user already switched to wallet
            fn();
          } catch {}
        }, delayMs) as any;
        scheduled.push(id);
      } catch {}
    };
    const clearScheduled = () => {
      try { scheduled.forEach((id) => { try { clearTimeout(id as any); } catch {} }); } catch {}
      scheduled.length = 0;
    };
    const onVisChange = () => {
      try {
        const doc: any = (typeof document !== 'undefined' ? document : null);
        if (doc && doc.visibilityState === 'hidden') {
          clearScheduled();
        }
      } catch {}
    };
    try { document.addEventListener('visibilitychange', onVisChange); } catch {}
    const openCoinbase = (wcUri: string) => {
      // Safer sequence: try universal first; if the page is still visible shortly after, try one native scheme.
      // Avoid Android intents and extra native variants to prevent bad URL pages.
      const single = encodeURIComponent(wcUri);
      // Do NOT append cb_url; Coinbase sometimes treats it as dapp-open instead of WC pairing
      const universal = `https://go.cb-w.com/wc?uri=${single}`;
      const native = `coinbasewallet://wc?uri=${single}`;
      openUrl(universal);
      // If wallet didn't open (page still visible), try native after a short delay
      scheduleIfVisible(() => openUrl(native), 600);
      // Cleanup any pending attempts after a reasonable time window
      scheduleIfVisible(() => { clearScheduled(); try { document.removeEventListener('visibilitychange', onVisChange); } catch {} }, 4000);
    };
    const createBtn = (label: string, iconKey: string | null, onClick: () => void) => {
      const btn = d.createElement('button') as HTMLButtonElement;
      btn.style.display = 'flex';
      btn.style.alignItems = 'center';
      btn.style.gap = '8px';
      btn.style.padding = '8px 12px';
      btn.style.borderRadius = '10px';
      btn.style.border = '1px solid #444';
      btn.style.background = '#2a2a2a';
      btn.style.color = '#fff';
      btn.style.cursor = 'pointer';
      btn.style.width = '100%';
      btn.style.justifyContent = 'center';
      const img = d.createElement('img') as HTMLImageElement;
      const iconUrl = iconKey ? getIcon(iconKey) : null;
      if (iconUrl) {
        img.src = iconUrl;
        img.alt = iconKey || 'wallet';
        img.style.width = '18px';
        img.style.height = '18px';
        img.style.display = 'block';
        btn.appendChild(img);
      }
      const span = d.createElement('span') as HTMLSpanElement;
      span.textContent = label;
      span.style.fontSize = '13px';
      btn.appendChild(span);
      btn.onclick = (e) => { try { e.preventDefault(); } catch {} try { onClick(); } catch {} };
      return btn;
    };
    let overlay = d.getElementById('icpay-wc-overlay') as HTMLElement | null;
    if (!overlay) {
      const ov = d.createElement('div') as HTMLElement;
      ov.id = 'icpay-wc-overlay';
      ov.style.position = 'fixed';
      ov.style.inset = '0';
      ov.style.background = 'rgba(0,0,0,0.55)';
      ov.style.display = 'flex';
      ov.style.alignItems = 'center';
      ov.style.justifyContent = 'center';
      ov.style.zIndex = '999999';
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
      title.textContent = 'Connect with your wallet';
      title.style.color = '#fff';
      title.style.fontSize = '16px';
      title.style.marginBottom = '12px';
      const canvas = d.createElement('canvas');
      canvas.id = 'icpay-wc-qr-canvas';
      canvas.style.width = '260px';
      canvas.style.height = '260px';
      canvas.style.background = '#fff';
      canvas.style.borderRadius = '8px';
      const isMobile = isMobileBrowserGlobal();
      if (isMobile) {
        const linksWrap = d.createElement('div');
        linksWrap.style.display = 'flex';
        linksWrap.style.flexDirection = 'column';
        linksWrap.style.alignItems = 'stretch';
        linksWrap.style.gap = '8px';
        linksWrap.style.width = '100%';
        const setWaitingState = () => {
          try {
            title.textContent = 'Waiting for approval in your wallet...';
            linksWrap.style.pointerEvents = 'none';
            linksWrap.style.opacity = '0.7';
          } catch {}
        };
        // Explicit wallet universal links (no raw wc:, no walletconnect.com chooser)
        linksWrap.appendChild(createBtn('MetaMask with WalletConnect', 'metamask', () => {
          setWaitingState();
          openUrl(`https://metamask.app.link/wc?uri=${encodeURIComponent(uri)}`);
        }));
        linksWrap.appendChild(createBtn('Coinbase Wallet with WalletConnect', 'coinbase', () => {
          setWaitingState();
          openUrl(`https://go.cb-w.com/wc?uri=${encodeURIComponent(uri)}`);
        }));
        linksWrap.appendChild(createBtn('Phantom with WalletConnect', 'phantom', () => {
          setWaitingState();
          openUrl(`https://phantom.app/ul/v1/wc?uri=${encodeURIComponent(uri)}`);
        }));
        linksWrap.appendChild(createBtn('OKX Wallet with WalletConnect', 'okx', () => {
          setWaitingState();
          openUrl(`okx://wallet/wc?uri=${encodeURIComponent(uri)}`);
        }));
        // Rabby mobile may not expose a dedicated deep link; use system chooser via wc:
        linksWrap.appendChild(createBtn('Rabby with WalletConnect', 'rabby', () => {
          setWaitingState();
          openUrl(uri);
        }));
        // Generic system chooser for other installed wallets
        linksWrap.appendChild(createBtn('More wallets (system chooser)', 'walletconnect', () => {
          setWaitingState();
          openUrl(uri);
        }));
        box.appendChild(linksWrap);
      }
      const close = d.createElement('button');
      close.textContent = 'Close';
      close.style.marginTop = '12px';
      close.style.background = '#2a2a2a';
      close.style.color = '#fff';
      close.style.border = '1px solid #444';
      close.style.padding = '6px 10px';
      close.style.borderRadius = '8px';
      close.onclick = () => { try { const cur = d.getElementById('icpay-wc-overlay'); if (cur && cur.parentNode) cur.parentNode.removeChild(cur); } catch {} };
      box.appendChild(title);
      if (!isMobile) {
        box.appendChild(canvas);
      }
      box.appendChild(close);
      ov.appendChild(box);
      d.body.appendChild(ov);
      overlay = ov;
    }
    const canvas = d.getElementById('icpay-wc-qr-canvas') as HTMLCanvasElement | null;
    // On desktop we draw QR; on mobile we rely on wallet buttons and skip QR
    const isMobile = isMobileBrowserGlobal();
    if (!isMobile) {
      await ensureQrLib();
      const w: any = (typeof window !== 'undefined' ? window : {}) as any;
      if (canvas && w?.QRCode?.toCanvas) {
        try { w.QRCode.toCanvas(canvas, uri, { width: 260, margin: 2 }); } catch {}
      }
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
  private wcProviderProxy: any | null = null;
  private wcRedirect: { native?: string; universal?: string } | null = null;
  private lastDisplayUri: string | null = null;
  private autoOpenedWcDeepLink = false;
  private autoOpenedPhantom = false;

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
    if (this.wcProviderProxy) return this.wcProviderProxy;
    if (this.wcProvider) return this.wcProvider;
    return this.getInjectedWcProvider();
  }

  async isInstalled(): Promise<boolean> {
    try {
      if (this.getInjectedWcProvider()) return true;
      const g: any = (typeof window !== 'undefined' ? window : {}) as any;
      const hasV2 = !!getWcV2Ctor(g);
      const cfg = this.getAdapterConfig();
      const hasProjectId = !!(cfg.projectId || cfg.projectID);
      // Only consider WC available if a projectId is configured (unless injected WC provider exists)
      if (hasV2 && hasProjectId) return true;
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
    if (!getWcV2Ctor(g, cfg)) {
      // Load self-hosted (or custom) UMD scripts only.
      if (!wcProviderScriptLoaded) {
        const custom = (cfg && (cfg.umdUrls || cfg.umdUrl)) || null;
        // Try self-hosted relative to current script first
        const selfUrls: string[] = [];
        try {
          const d: any = (typeof document !== 'undefined' ? document : null);
          if (d) {
            const scripts = Array.from(d.getElementsByTagName('script')) as HTMLScriptElement[];
            const isRelevant = (u: string) => {
              const v = u.toLowerCase();
              return v.includes('icpay-embed') || v.includes('widget.icpay') || v.includes('icpay-widget');
            };
            scripts.forEach((s: HTMLScriptElement) => {
              try {
                const src = String(s?.src || '');
                if (!src || !isRelevant(src)) return;
                const idx = src.lastIndexOf('/');
                if (idx > 0) {
                  const base = src.slice(0, idx);
                  selfUrls.push(`${base}/wc/index.umd.js`, `${base}/index.umd.js`);
                }
              } catch {}
            });
          }
        } catch {}
        // WordPress plugin well-known locations (same-origin)
        const origin = (typeof window !== 'undefined' && (window as any).location && (window as any).location.origin)
          ? (window as any).location.origin
          : '';
        const wpUrls: string[] = origin
          ? [
              `${origin}/wp-content/plugins/icpay-payments/assets/js/wc/index.umd.js`,
              `${origin}/wp-content/plugins/instant-crypto-payments-for-woocommerce/assets/js/wc/index.umd.js`,
            ]
          : [];
        const urls: string[] = [
          ...(Array.isArray(custom)
            ? custom.filter(Boolean)
            : (typeof custom === 'string' && custom.trim() ? [custom.trim()] : [])),
          ...selfUrls,
          ...wpUrls,
        ];
        const ok = await loadAnyScript(urls);
        wcProviderScriptLoaded = ok;
      }
      await waitFor(() => getWcV2Ctor((typeof window !== 'undefined' ? window : {}) as any, cfg), 2000, 100);
    }
  }

  private isMobileBrowser(): boolean {
    try {
      const nav: any = (typeof navigator !== 'undefined' ? navigator : (window as any)?.navigator);
      const ua = String(nav?.userAgent || '').toLowerCase();
      return /iphone|ipad|ipod|android|mobile|windows phone/.test(ua);
    } catch {
      return false;
    }
  }

  private openWalletAppIfPossible(): void {
    if (!this.isMobileBrowser()) return;
    try {
      const redirect = this.wcRedirect || {};
      const url = redirect.native || redirect.universal || '';
      if (!url) return;
      try { window.location.href = url; } catch { try { window.open(url, '_self', 'noopener,noreferrer'); } catch {} }
    } catch {}
  }

  private wrapProviderForMobileWake(provider: any): any {
    if (!provider || typeof provider.request !== 'function') return provider;
    const shouldWake = (method?: string) => {
      if (!this.isMobileBrowser()) return false;
      if (!method) return false;
      const m = method.toLowerCase();
      // Methods that will require user approval in wallet app
      return (
        m === 'eth_sendtransaction' ||
        m === 'eth_signtransaction' ||
        m === 'eth_sign' ||
        m === 'personal_sign' ||
        m === 'eth_signtypeddata' ||
        m === 'eth_signtypeddata_v3' ||
        m === 'eth_signtypeddata_v4' ||
        m === 'wallet_switchethereumchain' ||
        m === 'wallet_addethereumchain' ||
        m === 'wallet_requestpermissions'
      );
    };
    const self = this;
    const proxy = new Proxy(provider, {
      get(target: any, prop: PropertyKey, receiver: any) {
        if (prop === 'request') {
          return async function (args: any) {
            try {
              const method = (args && (args.method || (typeof args === 'object' && args?.method))) as string | undefined;
              if (shouldWake(method)) {
                // Attempt to foreground the wallet app before sending the request
                self.openWalletAppIfPossible();
                // brief delay to allow OS to start the app switch
                try { await new Promise((r) => setTimeout(r, 50)); } catch {}
              }
            } catch {}
            return target.request.apply(target, arguments as any);
          };
        }
        return Reflect.get(target, prop, receiver);
      }
    });
    return proxy;
  }

  private async initGlobalProvider(): Promise<any | null> {
    try {
      const g: any = (typeof window !== 'undefined' ? window : {}) as any;
      const cfg = this.getAdapterConfig();

      const hasProjectId = !!(cfg.projectId || cfg.projectID);
      if (!hasProjectId) return null;

      await this.ensureV2Globals(cfg);
      let EthereumProviderCtor: any = getWcV2Ctor(g, cfg);
      if (!EthereumProviderCtor) {
        EthereumProviderCtor = await waitFor(() => getWcV2Ctor((typeof window !== 'undefined' ? window : {}) as any, cfg), 4000, 100);
      }
      if (!EthereumProviderCtor) return null; // not available
      try {
        if ((this.config as any)?.debug) {
          console.debug('[ICPay WC] Using ctor', {
            isFn: typeof EthereumProviderCtor === 'function',
            hasInit: !!(EthereumProviderCtor && typeof EthereumProviderCtor.init === 'function'),
            name: (EthereumProviderCtor && (EthereumProviderCtor.name || EthereumProviderCtor.constructor?.name)) || 'unknown'
          });
        }
      } catch {}
      const projectId = String(cfg.projectId || cfg.projectID);
      // Do not allow site config to pick chains; the widget controls networks.
      const chains: number[] = DEFAULT_WC_CHAINS.slice();
      const optionalChains: number[] = DEFAULT_WC_OPTIONAL_CHAINS.slice();
      // Be explicit about methods/events to match wallet expectations (Coinbase, etc.)
      const methods: string[] = [
        'eth_requestAccounts',
        'eth_accounts',
        'eth_chainId',
        'personal_sign',
        'eth_sign',
        'eth_signTypedData',
        'eth_signTypedData_v3',
        'eth_signTypedData_v4',
        'eth_sendTransaction',
        'wallet_switchEthereumChain',
        'wallet_addEthereumChain'
      ];
      const events: string[] = [
        'accountsChanged',
        'chainChanged',
        'connect',
        'disconnect',
        'message'
      ];
      // Build robust dapp metadata; wallets like Coinbase/Phantom require non-empty values and HTTPS icons
      const siteOrigin = (() => {
        try {
          const o = String(g?.location?.origin || '').trim();
          return (o && /^https?:\/\//.test(o)) ? o : 'https://widget.icpay.org';
        } catch { return 'https://widget.icpay.org'; }
      })();
      const metaName = (() => {
        try {
          const n = String((cfg?.metadata?.name || g?.document?.title || 'ICPay Widget')).trim();
          return n || 'ICPay Widget';
        } catch { return 'ICPay Widget'; }
      })();
      const metaDesc = (() => {
        try {
          const d = String((cfg?.metadata?.description || 'ICPay mobile connect')).trim();
          return d || 'ICPay mobile connect';
        } catch { return 'ICPay mobile connect'; }
      })();
      const metaUrl = (() => {
        try {
          const u = String((cfg?.metadata?.url || siteOrigin)).trim();
          return u || siteOrigin;
        } catch { return siteOrigin; }
      })();
      const metaIcons = (() => {
        try {
          const fromCfg = (Array.isArray(cfg?.metadata?.icons) ? cfg?.metadata?.icons : (Array.isArray(cfg?.icons) ? cfg?.icons : null)) || null;
          const candidates = (fromCfg && fromCfg.length > 0)
            ? fromCfg
            : [siteOrigin + '/favicon.ico', siteOrigin + '/apple-touch-icon.png'];
          const httpsOnly = (candidates as any[]).filter((i: any) => typeof i === 'string' && /^https?:\/\//.test(i as string)) as string[];
          return httpsOnly.length > 0 ? httpsOnly : [siteOrigin + '/favicon.ico'];
        } catch {
          return [siteOrigin + '/favicon.ico'];
        }
      })();
      const metadata = { name: metaName, description: metaDesc, url: metaUrl, icons: metaIcons };
      // Force showQrModal false to use our custom overlay
      const provider = typeof EthereumProviderCtor.init === 'function'
        ? await EthereumProviderCtor.init({
            projectId,
            chains,
            optionalChains,
            showQrModal: false,
            metadata,
            relayUrl: 'wss://relay.walletconnect.com',
            methods,
            optionalMethods: methods,
            events,
            optionalEvents: events
          })
        : new EthereumProviderCtor({
            projectId,
            chains,
            optionalChains,
            showQrModal: false,
            metadata,
            relayUrl: 'wss://relay.walletconnect.com',
            methods,
            optionalMethods: methods,
            events,
            optionalEvents: events
          });

      // Listen for display_uri to render our QR (and mobile deep-link choices)
      try {
        await ensureQrLib();
        provider.on?.( 'display_uri', (uri: string) => {
          try { this.lastDisplayUri = uri; } catch {}
          try { showQrOverlay(uri); } catch {}
        } );
        provider.on?.('disconnect', () => { try { hideQrOverlay(); } catch {} });
      } catch {}

      // Do not call enable() here; connect flow is triggered explicitly in connect()
      return provider;
    } catch {
      return null;
    }
  }

  async connect(): Promise<WalletAccount> {
    // Proactively clear stale WalletConnect v1/v2 residues that can block mobile approval screens
    try {
      const keysToNuke: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i) as string;
        if (!k) continue;
        if (
          k === 'walletconnect' ||
          k.startsWith('wc@') ||
          k.startsWith('@walletconnect/') ||
          k.toLowerCase().includes('walletconnect')
        ) {
          keysToNuke.push(k);
        }
      }
      keysToNuke.forEach((k) => { try { localStorage.removeItem(k); } catch {} });
    } catch {}
    const injected = this.getInjectedWcProvider();
    if (injected) {
      this.wcProvider = injected;
      this.wcProviderProxy = this.wrapProviderForMobileWake(this.wcProvider);
      const accounts = await this.wcProviderProxy.request({ method: 'eth_requestAccounts' });
      const addr = Array.isArray(accounts) ? (accounts[0] || '') : '';
      if (!addr) throw new Error('No account returned by WalletConnect');
      return { owner: addr, principal: addr, connected: true };
    }

    const provider = await this.initGlobalProvider();
    if (provider) {
      this.wcProvider = provider;
      try {
        // Capture redirect metadata if available to foreground wallet app on mobile
        const redirect = (provider?.session?.peer?.metadata?.redirect) || (provider?.session?.peer?.metadata?.redirects) || null;
        if (redirect && (redirect.native || redirect.universal)) {
          this.wcRedirect = { native: redirect.native, universal: redirect.universal };
        }
      } catch {}
      // Ensure clean session state before starting a fresh connect
      try { await this.wcProvider.disconnect?.(); } catch {}
      this.wcProviderProxy = this.wrapProviderForMobileWake(this.wcProvider);
      // Explicitly trigger WC connect to emit display_uri and wait for pairing
      try { await this.wcProviderProxy.connect?.({ chains: DEFAULT_WC_CHAINS.slice(), optionalChains: DEFAULT_WC_OPTIONAL_CHAINS.slice() }); } catch {}
      // Proactively request accounts (some wallets, e.g. Coinbase, require this after pairing)
      try { await this.wcProviderProxy.request?.({ method: 'eth_requestAccounts' }); } catch {}
      // Some providers expose enable(); try it as an additional nudge
      try { await this.wcProviderProxy.enable?.(); } catch {}
      // Listen for connect and try fetching accounts when it fires
      try {
        this.wcProviderProxy.on?.('connect', async () => {
          try {
            const a = await this.wcProviderProxy.request?.({ method: 'eth_accounts' });
            if (Array.isArray(a) && a.length > 0) { try { hideQrOverlay(); } catch {} }
          } catch {}
        });
      } catch {}
      // Wait for accounts to be available (poll + event fallback)
      const waitForAccounts = async (timeoutMs = 60000): Promise<string[]> => {
        const start = Date.now();
        return new Promise<string[]>(async (resolve, reject) => {
          let done = false;
          const finish = (accts: string[] | null, err?: any) => {
            if (done) return;
            done = true;
            try { hideQrOverlay(); } catch {}
            if (accts && accts.length > 0) resolve(accts);
            else reject(err || new Error('No account returned by WalletConnect'));
          };
          try {
            const onAccounts = (accts: any) => {
              const a = Array.isArray(accts) ? accts : [];
              if (a.length > 0) finish(a);
            };
            const onVisibility = async () => {
              try {
                const doc: any = (typeof document !== 'undefined' ? document : null);
                if (doc && doc.visibilityState === 'visible') {
                  try { await this.wcProviderProxy.request?.({ method: 'eth_requestAccounts' }); } catch {}
                // As a last resort, try to re-connect the provider to prompt wallet again
                try { await this.wcProviderProxy.connect?.(); } catch {}
                  // If still no accounts and we have a pending WC URI, avoid auto-redirects; user can tap a wallet again
                  try {
                    const aNow = await this.wcProviderProxy.request?.({ method: 'eth_accounts' });
                    const noAcc = !(Array.isArray(aNow) && aNow.length > 0);
                    // no auto navigation here
                  } catch {}
                }
              } catch {}
            };
            this.wcProviderProxy.on?.('accountsChanged', onAccounts);
            try { document.addEventListener('visibilitychange', onVisibility); } catch {}
            // Poll as a fallback in case events don't fire
            while (!done && Date.now() - start < timeoutMs) {
              try {
                const a1 = await this.wcProviderProxy.request?.({ method: 'eth_accounts' });
                if (Array.isArray(a1) && a1.length > 0) {
                  this.wcProviderProxy.removeListener?.('accountsChanged', onAccounts);
                  try { document.removeEventListener('visibilitychange', onVisibility); } catch {}
                  return finish(a1);
                }
              } catch {}
              await new Promise(r => setTimeout(r, 500));
            }
            this.wcProviderProxy.removeListener?.('accountsChanged', onAccounts);
            try { document.removeEventListener('visibilitychange', onVisibility); } catch {}
            finish(null, new Error('Timed out waiting for WalletConnect approval'));
          } catch (e) {
            finish(null, e);
          }
        });
      };
      const accounts = await waitForAccounts();
      const addr = Array.isArray(accounts) ? (accounts[0] || '') : '';
      if (!addr) throw new Error('No account returned by WalletConnect');
      return { owner: addr, principal: addr, connected: true };
    }

    const cfg = this.getAdapterConfig();
    const hasProjectId = !!(cfg?.projectId || cfg?.projectID);
    if (!hasProjectId) {
      throw new Error('WalletConnect projectId is not configured. Set plugNPlay.adapters.walletconnect.config.projectId to enable WalletConnect.');
    }
    throw new Error('WalletConnect provider not available. Ensure the self-hosted EthereumProvider UMD is available (dist/wc/index.umd.js) or provide plugNPlay.adapters.walletconnect.config.umdUrls.');
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


