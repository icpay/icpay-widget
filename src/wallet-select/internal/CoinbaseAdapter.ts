import type { AdapterInterface, GetActorOptions, WalletSelectConfig, WalletAccount } from '../index.js';
import { Actor, HttpAgent } from '@dfinity/agent';

declare global {
  interface Window { coinbaseWalletExtension?: any }
}

export class CoinbaseAdapter implements AdapterInterface {
  readonly id = 'coinbase';
  readonly label = 'Coinbase Wallet';
  readonly icon?: string | null;
  private readonly config: WalletSelectConfig;

  constructor(args: { config: WalletSelectConfig }) {
    this.config = args.config || {};
  }

  async isInstalled(): Promise<boolean> {
    try {
      return !!(typeof window !== 'undefined' && (window as any).coinbaseWalletExtension);
    } catch {
      return false;
    }
  }

  async isConnected(): Promise<boolean> {
    return false;
  }

  async connect(): Promise<WalletAccount> {
    throw new Error('Coinbase Wallet is not enabled');
  }

  async disconnect(): Promise<void> {
    try {
      const anyWin: any = (typeof window !== 'undefined' ? window : {}) as any;
      // Prefer the dedicated Coinbase provider if present
      const provider = anyWin.coinbaseWalletExtension || (anyWin.ethereum && anyWin.ethereum.isCoinbaseWallet ? anyWin.ethereum : null);
      if (provider && typeof provider.request === 'function') {
        try {
          // Trigger account permissions prompt so user can switch/revoke
          await provider.request({ method: 'wallet_requestPermissions', params: [{ eth_accounts: {} }] });
        } catch {}
        try { provider.removeAllListeners?.('accountsChanged'); } catch {}
        try { provider.removeAllListeners?.('chainChanged'); } catch {}
        try { provider.removeAllListeners?.('disconnect'); } catch {}
      }
    } catch {}
  }
  // Attempt to trigger Coinbase extension account change UI if available
  // Coinbase extension doesn't provide a standard disconnect; we simply clear dapp state
  // and rely on a fresh connect to prompt the user.

  async getPrincipal(): Promise<string | null> {
    return null;
  }

  getActor<T>(options: GetActorOptions): any {
    throw new Error('EVM wallets cannot provide IC actors. Use IC adapters for IC canister interactions.');
  }
}


