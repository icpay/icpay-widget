import type { AdapterInterface, GetActorOptions, WalletSelectConfig, WalletAccount } from '../index.js';
import { Actor, HttpAgent } from '@dfinity/agent';

declare global {
  interface Window {
    ethereum?: any;
  }
}

export class MetaMaskAdapter implements AdapterInterface {
  readonly id = 'metamask';
  readonly label = 'MetaMask';
  readonly icon?: string | null;
  private readonly config: WalletSelectConfig;

  constructor(args: { config: WalletSelectConfig }) {
    this.config = args.config || ({} as any);
  }

  private isMobileBrowser(): boolean {
    try {
      const nav: any = (typeof navigator !== 'undefined' ? navigator : (window as any)?.navigator);
      const ua = String(nav?.userAgent || '').toLowerCase();
      // Broad mobile check; avoids false positives on desktop
      return /iphone|ipad|ipod|android|mobile|windows phone/.test(ua);
    } catch {
      return false;
    }
  }

  private getProvider(): any {
    try {
      const anyWin: any = (typeof window !== 'undefined' ? window : {}) as any;
      const eth = anyWin.ethereum;
      if (eth && Array.isArray(eth.providers)) {
        const mm = eth.providers.find((p: any) => p && p.isMetaMask);
        if (mm) return mm;
      }
      if (eth && eth.isMetaMask) return eth;
    } catch {}
    return null;
  }

  // Exposed for WalletSelect.getEvmProvider()
  getEvmProvider(): any {
    return this.getProvider();
  }

  async isInstalled(): Promise<boolean> {
    try {
      return !!this.getProvider();
    } catch {
      return false;
    }
  }

  async isConnected(): Promise<boolean> {
    try {
      const provider = this.getProvider();
      if (!provider) return false;
      const req = typeof provider.request === 'function' ? provider.request({ method: 'eth_accounts' }) : Promise.resolve([]);
      const accounts = await req;
      return Array.isArray(accounts) && accounts.length > 0;
    } catch {
      return false;
    }
  }

  async connect(): Promise<WalletAccount> {
    const provider = this.getProvider();
    // If provider is missing on mobile browsers, attempt MetaMask deep link into in-app browser
    if (!provider) {
      if (typeof window !== 'undefined' && this.isMobileBrowser()) {
        try {
          const href = String(window.location?.href || '');
          // Use MetaMask universal link to open the dapp URL inside MetaMask's in-app browser
          const sanitized = href.replace(/^https?:\/\//i, '');
          const deepLink = `https://metamask.app.link/dapp/${sanitized}`;
          try {
            // Emit an event so host apps can track the redirect attempt
            try { window.dispatchEvent(new CustomEvent('icpay-sdk-wallet-deeplink', { detail: { wallet: 'metamask', url: deepLink } })); } catch {}
            window.location.href = deepLink;
          } catch {
            // Fallback to window.open if assignment fails
            try { window.open(deepLink, '_self', 'noopener,noreferrer'); } catch {}
          }
        } catch {}
        throw new Error('Opening MetaMask… If nothing happens, install MetaMask and try again.');
      }
      throw new Error('MetaMask not available');
    }
    const accounts = await provider.request?.({ method: 'eth_requestAccounts' });
    const addr = Array.isArray(accounts) ? (accounts[0] || '') : '';
    if (!addr) throw new Error('No account returned by MetaMask');
    return { owner: addr, principal: addr, connected: true };
  }

  async disconnect(): Promise<void> {
    try {
      const provider = this.getProvider() || (typeof window !== 'undefined' ? (window as any).ethereum : null);
      if (!provider) return;
      try {
        await provider.request?.({
          method: 'wallet_requestPermissions',
          params: [{ eth_accounts: {} }]
        });
      } catch {}
      try { provider.removeAllListeners?.('accountsChanged'); } catch {}
      try { provider.removeAllListeners?.('chainChanged'); } catch {}
      try { provider.removeAllListeners?.('disconnect'); } catch {}
    } catch {}
  }

  async getPrincipal(): Promise<string | null> {
    try {
      const provider = this.getProvider() || (typeof window !== 'undefined' ? (window as any).ethereum : null);
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


