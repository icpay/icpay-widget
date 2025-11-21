import type { AdapterInterface, GetActorOptions, WalletSelectConfig, WalletAccount } from '../index.js';

declare global {
	interface Window {
		ethereum?: any;
		okxwallet?: any;
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
		// Mobile in-app browsers sometimes miss flags; accept generic provider on mobile
		if (isMobileBrowser() && eth && typeof eth.request === 'function') return eth;
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
		let provider = getOkxProvider();
		if (!provider) {
			if (typeof window !== 'undefined' && isMobileBrowser()) {
				try {
					const href = String(window.location?.href || '');
					// Try OKX scheme; some platforms require scheme. Provide a fallback to download page.
					const scheme = `okx://wallet/dapp/url?url=${encodeURIComponent(href)}`;
					try { window.dispatchEvent(new CustomEvent('icpay-sdk-wallet-deeplink', { detail: { wallet: 'okx', url: scheme } })); } catch {}
					try { window.location.href = scheme; } catch { try { window.open(scheme, '_self', 'noopener,noreferrer'); } catch {} }
				} catch {}
				throw new Error('Opening OKX Wallet… If nothing happens, install OKX Wallet and try again.');
			}
			throw new Error('OKX Wallet not available');
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
			provider = getOkxProvider() || provider;
			accounts = await getAccountsOnce();
			if (accounts.length === 0) await delay(300);
		}
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



