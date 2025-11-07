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
    this.config = args.config || {};
  }

  async isInstalled(): Promise<boolean> {
    try {
      return !!(typeof window !== 'undefined' && window.ethereum && window.ethereum.isMetaMask);
    } catch {
      return false;
    }
  }

  async isConnected(): Promise<boolean> {
    try {
      if (!window.ethereum) return false;
      const accounts = await window.ethereum.request({ method: 'eth_accounts' });
      return Array.isArray(accounts) && accounts.length > 0;
    } catch {
      return false;
    }
  }

  async connect(): Promise<WalletAccount> {
    if (!window.ethereum) throw new Error('MetaMask not available');
    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
    const addr = Array.isArray(accounts) ? (accounts[0] || '') : '';
    if (!addr) throw new Error('No account returned by MetaMask');
    return { owner: addr, principal: addr, connected: true };
  }

  async disconnect(): Promise<void> {
    try {
      if (!window.ethereum) return;
      // Try to open MetaMask permissions prompt so user can switch/revoke account access
      try {
        await window.ethereum.request?.({
          method: 'wallet_requestPermissions',
          params: [{ eth_accounts: {} }]
        });
      } catch {}
      // Best-effort: remove any cached listeners if present (defensive)
      try { window.ethereum.removeAllListeners?.('accountsChanged'); } catch {}
      try { window.ethereum.removeAllListeners?.('chainChanged'); } catch {}
      try { window.ethereum.removeAllListeners?.('disconnect'); } catch {}
    } catch {}
  }

  async getPrincipal(): Promise<string | null> {
    try {
      if (!window.ethereum) return null;
      const accounts = await window.ethereum.request({ method: 'eth_accounts' });
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


