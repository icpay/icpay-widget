import type { AdapterInterface, GetActorOptions, WalletSelectConfig, WalletAccount } from '../index.js';

declare global {
	interface Window {
		ethereum?: any;
		phantom?: { ethereum?: any; solana?: any } | undefined;
	}
}

function getPhantomEvmProvider(): any | null {
	try {
		const anyWin: any = (typeof window !== 'undefined' ? window : {}) as any;
		// Prefer the dedicated Phantom EVM provider if present
		if (anyWin.phantom && anyWin.phantom.ethereum) return anyWin.phantom.ethereum;
		// Fallback to injected ethereum with isPhantom flag
		let eth = anyWin.ethereum;
		if (eth && Array.isArray(eth.providers)) {
			const phantom = eth.providers.find((p: any) => p && (p.isPhantom || p.isPhantomEthereum));
			if (phantom) return phantom;
		}
		if (eth && (eth.isPhantom || eth.isPhantomEthereum)) return eth;
		return null;
	} catch {
		return null;
	}
}

export class PhantomAdapter implements AdapterInterface {
	readonly id = 'phantom';
	readonly label = 'Phantom';
	readonly icon?: string | null;
	private readonly config: WalletSelectConfig;

	constructor(args: { config: WalletSelectConfig }) {
		this.config = args.config || {};
	}

	async isInstalled(): Promise<boolean> {
		try {
			return !!getPhantomEvmProvider();
		} catch {
			return false;
		}
	}

	async isConnected(): Promise<boolean> {
		try {
			const provider = getPhantomEvmProvider();
			if (!provider) return false;
			const accounts = await provider.request({ method: 'eth_accounts' });
			return Array.isArray(accounts) && accounts.length > 0;
		} catch {
			return false;
		}
	}

	async connect(): Promise<WalletAccount> {
		const provider = getPhantomEvmProvider();
		if (!provider) throw new Error('Phantom (EVM) not available');
		const accounts = await provider.request({ method: 'eth_requestAccounts' });
		const addr = Array.isArray(accounts) ? (accounts[0] || '') : '';
		if (!addr) throw new Error('No account returned by Phantom');
		return { owner: addr, principal: addr, connected: true };
	}

	async disconnect(): Promise<void> {
		try {
			const provider = getPhantomEvmProvider();
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
			const provider = getPhantomEvmProvider();
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



