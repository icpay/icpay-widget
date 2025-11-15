import type { AdapterInterface, GetActorOptions, WalletSelectConfig, WalletAccount } from '../index.js';
import { Actor, HttpAgent } from '@dfinity/agent';

declare global {
	interface Window {
		coinbaseWalletExtension?: any;
		ethereum?: any;
	}
}

function getCoinbaseProvider(): any | null {
	try {
		const anyWin: any = (typeof window !== 'undefined' ? window : {}) as any;
		// Prefer dedicated extension handle if available
		if (anyWin.coinbaseWalletExtension) return anyWin.coinbaseWalletExtension;
		// Fallback to injected ethereum with coinbase flag
		const eth = anyWin.ethereum;
		if (eth && Array.isArray(eth.providers)) {
			const cb = eth.providers.find((p: any) => p && (p.isCoinbaseWallet || p?.provider?.isCoinbaseWallet));
			if (cb) return cb;
		}
		if (eth && (eth.isCoinbaseWallet || eth?.provider?.isCoinbaseWallet)) return eth;
		return null;
	} catch {
		return null;
	}
}

export class CoinbaseAdapter implements AdapterInterface {
  readonly id = 'coinbase';
  readonly label = 'Coinbase Wallet';
  readonly icon?: string | null;
  private readonly config: WalletSelectConfig;
  getEvmProvider(): any { return getCoinbaseProvider(); }

  constructor(args: { config: WalletSelectConfig }) {
    this.config = args.config || {};
  }

  async isInstalled(): Promise<boolean> {
		try {
			return !!getCoinbaseProvider();
		} catch {
			return false;
		}
	}

  async isConnected(): Promise<boolean> {
		try {
			const provider = getCoinbaseProvider();
			if (!provider) return false;
			const accounts = await provider.request({ method: 'eth_accounts' });
			return Array.isArray(accounts) && accounts.length > 0;
		} catch {
			return false;
		}
	}

  async connect(): Promise<WalletAccount> {
		const provider = getCoinbaseProvider();
		if (!provider) throw new Error('Coinbase Wallet not available');
		const accounts = await provider.request({ method: 'eth_requestAccounts' });
		const addr = Array.isArray(accounts) ? (accounts[0] || '') : '';
		if (!addr) throw new Error('No account returned by Coinbase Wallet');
		return { owner: addr, principal: addr, connected: true };
	}

  async disconnect(): Promise<void> {
    try {
      const provider = getCoinbaseProvider();
      if (!provider) return;
      try { await provider.request?.({ method: 'wallet_requestPermissions', params: [{ eth_accounts: {} }] }); } catch {}
      try { provider.removeAllListeners?.('accountsChanged'); } catch {}
      try { provider.removeAllListeners?.('chainChanged'); } catch {}
      try { provider.removeAllListeners?.('disconnect'); } catch {}
    } catch {}
  }
  // Attempt to trigger Coinbase extension account change UI if available
  // Coinbase extension doesn't provide a standard disconnect; we simply clear dapp state
  // and rely on a fresh connect to prompt the user.

  async getPrincipal(): Promise<string | null> {
    try {
      const provider = getCoinbaseProvider();
      if (!provider) return null;
      const accounts = await provider.request({ method: 'eth_accounts' });
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


