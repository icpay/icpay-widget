import type { AdapterInterface, GetActorOptions, WalletSelectConfig, WalletAccount } from '../index.js';
import { WalletConnectAdapter } from './WalletConnectAdapter.js';

declare global {
	interface Window {
		ethereum?: any;
		phantom?: { ethereum?: any; solana?: any } | undefined;
	}
}

function isMobileBrowser(): boolean {
	try {
		const nav: any = (typeof navigator !== 'undefined' ? navigator : (window as any)?.navigator);
		const ua = String(nav?.userAgent || '').toLowerCase();
		return /iphone|ipad|ipod|android|mobile|windows phone/.test(ua);
	} catch {
		return false;
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
		// Mobile in-app browsers sometimes miss flags; accept generic provider on mobile
		if (isMobileBrowser() && eth && typeof eth.request === 'function') return eth;
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
	getEvmProvider(): any { return getPhantomEvmProvider(); }

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
		let provider = getPhantomEvmProvider();
		if (!provider) {
			if (typeof window !== 'undefined' && isMobileBrowser()) {
				// Delegate to WalletConnect on mobile; Phantom does not inject into external browsers
				const wc = new WalletConnectAdapter({ config: this.config });
				return await wc.connect();
			}
			throw new Error('Phantom (EVM) not available');
		}
		const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));
		const getAccountsOnce = async (): Promise<string[]> => {
			try {
				const a1 = await provider.request?.({ method: 'eth_accounts' });
				if (Array.isArray(a1) && a1.length > 0) return a1;
			} catch {}
			try {
				const a2 = await provider.request?.({ method: 'eth_requestAccounts' });
				if (Array.isArray(a2) && a2.length > 0) return a2;
			} catch (err: any) {
				if (err && (err.code === 4001 || err.code === '4001')) throw new Error('Connection request was rejected');
			}
			try {
				await provider.request?.({ method: 'wallet_requestPermissions', params: [{ eth_accounts: {} }] });
				const a3 = await provider.request?.({ method: 'eth_accounts' });
				if (Array.isArray(a3) && a3.length > 0) return a3;
			} catch {}
			return [];
		};
		let accounts: string[] = [];
		for (let i = 0; i < 3 && accounts.length === 0; i++) {
			provider = getPhantomEvmProvider() || provider;
			accounts = await getAccountsOnce();
			if (accounts.length === 0) await delay(300);
		}
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



