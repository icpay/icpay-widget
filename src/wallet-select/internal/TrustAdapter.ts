import type { AdapterInterface, GetActorOptions, WalletSelectConfig, WalletAccount } from '../index.js';

declare global {
	interface Window {
		ethereum?: any;
		trustwallet?: any;
		trustWallet?: any;
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

function getTrustProvider(): any | null {
	try {
		const anyWin: any = (typeof window !== 'undefined' ? window : {}) as any;
		// Trust Wallet injects at trustwallet or trustWallet (browser extension)
		if (anyWin.trustwallet?.ethereum) return anyWin.trustwallet.ethereum;
		if (anyWin.trustWallet?.ethereum) return anyWin.trustWallet.ethereum;
		if (anyWin.trustwallet && typeof anyWin.trustwallet.request === 'function') return anyWin.trustwallet;
		if (anyWin.trustWallet && typeof anyWin.trustWallet.request === 'function') return anyWin.trustWallet;
		// Check injected ethereum with Trust flag
		const eth = anyWin.ethereum;
		if (eth && Array.isArray(eth.providers)) {
			const tw = eth.providers.find((p: any) => p && (p.isTrust || p?.isTrustWallet));
			if (tw) return tw;
		}
		if (eth && (eth.isTrust || eth?.isTrustWallet)) return eth;
		// Mobile in-app browsers sometimes miss flags; accept generic provider on mobile when UA suggests Trust
		const ua = String((typeof navigator !== 'undefined' ? navigator : (anyWin as any)?.navigator)?.userAgent || '').toLowerCase();
		if (isMobileBrowser() && (ua.includes('trust') || ua.includes('trustwallet')) && eth && typeof eth.request === 'function') return eth;
		return null;
	} catch {
		return null;
	}
}

export class TrustAdapter implements AdapterInterface {
	readonly id = 'trust';
	readonly label = 'Trust Wallet';
	readonly icon?: string | null;
	private readonly config: WalletSelectConfig;

	constructor(args: { config: WalletSelectConfig }) {
		this.config = args.config || {};
	}

	getEvmProvider(): any { return getTrustProvider(); }

	async isInstalled(): Promise<boolean> {
		try {
			return !!getTrustProvider();
		} catch {
			return false;
		}
	}

	async isConnected(): Promise<boolean> {
		try {
			const provider = getTrustProvider();
			if (!provider) return false;
			const accounts = await provider.request({ method: 'eth_accounts' });
			return Array.isArray(accounts) && accounts.length > 0;
		} catch {
			return false;
		}
	}

	async connect(): Promise<WalletAccount> {
		let provider = getTrustProvider();
		if (!provider) {
			if (typeof window !== 'undefined' && isMobileBrowser()) {
				try {
					const href = String(window.location?.href || '');
					// Trust Wallet dapp browser: coin_id=60 for Ethereum/EVM (https://developer.trustwallet.com/developer/develop-for-trust/deeplinking)
					const deepLink = `https://link.trustwallet.com/open_url?coin_id=60&url=${encodeURIComponent(href)}`;
					try { window.dispatchEvent(new CustomEvent('icpay-sdk-wallet-deeplink', { detail: { wallet: 'trust', url: deepLink } })); } catch {}
					try { window.location.href = deepLink; } catch { try { window.open(deepLink, '_self', 'noopener,noreferrer'); } catch {} }
				} catch {}
				throw new Error('Opening Trust Wallet… If nothing happens, install Trust Wallet and try again.');
			}
			throw new Error('Trust Wallet not available');
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
			provider = getTrustProvider() || provider;
			accounts = await getAccountsOnce();
			if (accounts.length === 0) await delay(300);
		}
		const addr = Array.isArray(accounts) ? (accounts[0] || '') : '';
		if (!addr) throw new Error('No account returned by Trust Wallet');
		return { owner: addr, principal: addr, connected: true };
	}

	async disconnect(): Promise<void> {
		try {
			const provider = getTrustProvider();
			if (!provider) return;
			try { provider.removeAllListeners?.('accountsChanged'); } catch {}
			try { provider.removeAllListeners?.('chainChanged'); } catch {}
			try { provider.removeAllListeners?.('disconnect'); } catch {}
		} catch {}
	}

	async getPrincipal(): Promise<string | null> {
		try {
			const provider = getTrustProvider();
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
