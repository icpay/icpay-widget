import type { AdapterInterface, GetActorOptions, WalletSelectConfig, WalletAccount } from '../index.js';

declare global {
	interface Window {
		ethereum?: any;
	}
}

function getRabbyProvider(): any | null {
	try {
		const anyWin: any = (typeof window !== 'undefined' ? window : {}) as any;
		let eth = anyWin.ethereum;
		if (eth && Array.isArray(eth.providers)) {
			const rabby = eth.providers.find((p: any) => p && p.isRabby);
			if (rabby) return rabby;
		}
		if (eth && eth.isRabby) return eth;
		return null;
	} catch {
		return null;
	}
}

export class RabbyAdapter implements AdapterInterface {
	readonly id = 'rabby';
	readonly label = 'Rabby';
	readonly icon?: string | null;
	private readonly config: WalletSelectConfig;
	getEvmProvider(): any { return getRabbyProvider(); }

	constructor(args: { config: WalletSelectConfig }) {
		this.config = args.config || {};
	}

	async isInstalled(): Promise<boolean> {
		try {
			return !!getRabbyProvider();
		} catch {
			return false;
		}
	}

	async isConnected(): Promise<boolean> {
		try {
			const provider = getRabbyProvider();
			if (!provider) return false;
			const accounts = await provider.request({ method: 'eth_accounts' });
			return Array.isArray(accounts) && accounts.length > 0;
		} catch {
			return false;
		}
	}

	async connect(): Promise<WalletAccount> {
		const provider = getRabbyProvider();
		if (!provider) throw new Error('Rabby not available');
		const accounts = await provider.request({ method: 'eth_requestAccounts' });
		const addr = Array.isArray(accounts) ? (accounts[0] || '') : '';
		if (!addr) throw new Error('No account returned by Rabby');
		return { owner: addr, principal: addr, connected: true };
	}

	async disconnect(): Promise<void> {
		try {
			const provider = getRabbyProvider();
			if (!provider) return;
			try {
				await provider.request?.({ method: 'wallet_requestPermissions', params: [{ eth_accounts: {} }] });
			} catch {}
			try { provider.removeAllListeners?.('accountsChanged'); } catch {}
			try { provider.removeAllListeners?.('chainChanged'); } catch {}
			try { provider.removeAllListeners?.('disconnect'); } catch {}
		} catch {}
	}

	async getPrincipal(): Promise<string | null> {
		try {
			const provider = getRabbyProvider();
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



