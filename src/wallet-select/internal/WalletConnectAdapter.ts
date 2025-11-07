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
    // WalletConnect does not require installation; but keep disabled by default via index.ts
    return false;
  }

  async isConnected(): Promise<boolean> {
    return false;
  }

  async connect(): Promise<WalletAccount> {
    throw new Error('WalletConnect is not enabled');
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


