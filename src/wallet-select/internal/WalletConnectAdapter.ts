import type { AdapterInterface, GetActorOptions, WalletSelectConfig, WalletAccount } from '../index.js';
import { Actor, HttpAgent } from '@dfinity/agent';

export class WalletConnectAdapter implements AdapterInterface {
  readonly id = 'walletconnect';
  readonly label = 'WalletConnect';
  readonly icon?: string | null;
  private readonly config: WalletSelectConfig;

  constructor(args: { config: WalletSelectConfig }) {
    this.config = args.config || {};
  }

  async isInstalled(): Promise<boolean> {
    try {
      const anyWin: any = (typeof window !== 'undefined' ? window : {}) as any;
      const eth = anyWin.ethereum;
      if (!eth) return false;
      if (eth.isWalletConnect || eth?.provider?.isWalletConnect) return true;
      if (Array.isArray(eth.providers)) {
        return !!eth.providers.find((p: any) => p && (p.isWalletConnect || p?.provider?.isWalletConnect));
      }
      return false;
    } catch {
      return false;
    }
  }

  async isConnected(): Promise<boolean> {
    try {
      const anyWin: any = (typeof window !== 'undefined' ? window : {}) as any;
      const eth = anyWin.ethereum;
      const provider = Array.isArray(eth?.providers) ? eth.providers.find((p: any) => p && (p.isWalletConnect || p?.provider?.isWalletConnect)) : (eth && (eth.isWalletConnect || eth?.provider?.isWalletConnect) ? eth : null);
      if (!provider) return false;
      const accounts = await provider.request({ method: 'eth_accounts' });
      return Array.isArray(accounts) && accounts.length > 0;
    } catch {
      return false;
    }
  }

  async connect(): Promise<WalletAccount> {
    const anyWin: any = (typeof window !== 'undefined' ? window : {}) as any;
    const eth = anyWin.ethereum;
    // If an injected WalletConnect provider exists (e.g. WC Desktop), use it
    const provider = Array.isArray(eth?.providers) ? eth.providers.find((p: any) => p && (p.isWalletConnect || p?.provider?.isWalletConnect)) : (eth && (eth.isWalletConnect || eth?.provider?.isWalletConnect) ? eth : null);
    if (provider) {
      const accounts = await provider.request({ method: 'eth_requestAccounts' });
      const addr = Array.isArray(accounts) ? (accounts[0] || '') : '';
      if (!addr) throw new Error('No account returned by WalletConnect');
      return { owner: addr, principal: addr, connected: true };
    }
    // Otherwise, require host app to provide WalletConnect flow externally
    throw new Error('WalletConnect requires a projectId and provider setup. Please integrate a WalletConnect provider in the host app and expose it as the injected EVM provider.');
  }

  async disconnect(): Promise<void> {
    try {
      const anyWin: any = (typeof window !== 'undefined' ? window : {}) as any;
      const eth = anyWin.ethereum;
      // If the injected provider is WalletConnect v2 and exposes disconnect
      if (eth && (eth.isWalletConnect || eth.provider?.isWalletConnect) && typeof eth.disconnect === 'function') {
        try { await eth.disconnect(); } catch {}
      }
      // Clear common WalletConnect cached keys to force a fresh session next time
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
      // Remove listeners just in case
      try { eth?.removeAllListeners?.('accountsChanged'); } catch {}
      try { eth?.removeAllListeners?.('chainChanged'); } catch {}
      try { eth?.removeAllListeners?.('disconnect'); } catch {}
    } catch {}
  }

  async getPrincipal(): Promise<string | null> {
    return null;
  }

  getActor<T>(options: GetActorOptions): any {
    throw new Error('EVM wallets cannot provide IC actors. Use IC adapters for IC canister interactions.');
  }
}


