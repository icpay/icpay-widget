import type { AdapterInterface, GetActorOptions, WalletSelectConfig, WalletAccount } from '../index.js';

declare global {
	interface Window {
		ethereum?: any;
		okxwallet?: any;
	}
}

function getOkxProvider(): any | null {
	try {
		const anyWin: any = (typeof window !== 'undefined' ? window : {}) as any;
		// Dedicated OKX handle if present
		const okx = anyWin.okxwallet;
		if (okx && (okx.isOkxWallet || okx.ethereum)) return okx.ethereum || okx;
		// Check injected ethereum flags
		const eth = anyWin.ethereum;
		if (eth && Array.isArray(eth.providers)) {
			const p = eth.providers.find((p: any) => p && (p.isOkxWallet || p?.provider?.isOkxWallet));
			if (p) return p;
		}
		if (eth && (eth.isOkxWallet || eth?.provider?.isOkxWallet)) return eth;
		return null;
	} catch {
		return null;
	}
}

export class OkxAdapter implements AdapterInterface {
	readonly id = 'okx';
	readonly label = 'OKX Wallet';
	readonly icon?: string | null;
	private readonly config: WalletSelectConfig;

	constructor(args: { config: WalletSelectConfig }) {
		this.config = args.config || {};
	}

	getEvmProvider(): any { return getOkxProvider(); }

	async isInstalled(): Promise<boolean> {
		try {
			return !!getOkxProvider();
		} catch {
			return false;
		}
	}

	async isConnected(): Promise<boolean> {
		try {
			const provider = getOkxProvider();
			if (!provider) return false;
			const accounts = await provider.request({ method: 'eth_accounts' });
			return Array.isArray(accounts) && accounts.length > 0;
		} catch {
			return false;
		}
	}

	async connect(): Promise<WalletAccount> {
		const provider = getOkxProvider();
		if (!provider) throw new Error('OKX Wallet not available');
		const accounts = await provider.request({ method: 'eth_requestAccounts' });
		const addr = Array.isArray(accounts) ? (accounts[0] || '') : '';
		if (!addr) throw new Error('No account returned by OKX Wallet');
		return { owner: addr, principal: addr, connected: true };
	}

	async disconnect(): Promise<void> {
		try {
			const provider = getOkxProvider();
			if (!provider) return;
			try { await provider.request?.({ method: 'wallet_requestPermissions', params: [{ eth_accounts: {} }] }); } catch {}
			try { provider.removeAllListeners?.('accountsChanged'); } catch {}
			try { provider.removeAllListeners?.('chainChanged'); } catch {}
			try { provider.removeAllListeners?.('disconnect'); } catch {}
		} catch {}
	}

	async getPrincipal(): Promise<string | null> {
		try {
			const provider = getOkxProvider();
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



