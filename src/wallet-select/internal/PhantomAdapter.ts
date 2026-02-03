import type { AdapterInterface, GetActorOptions, WalletSelectConfig, WalletAccount } from '../index.js';
import { WalletConnectAdapter } from './WalletConnectAdapter.js';

declare global {
	interface Window {
		ethereum?: any;
		phantom?: { ethereum?: any; solana?: any } | undefined;
		solana?: any;
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

function getPhantomSolanaProvider(): any | null {
	try {
		const anyWin: any = (typeof window !== 'undefined' ? window : {}) as any;
		// Prefer the dedicated Phantom Solana provider if present
		if (anyWin.phantom && anyWin.phantom.solana) return anyWin.phantom.solana;
		// Fallback to window.solana
		if (anyWin.solana) return anyWin.solana;
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
	// Keep for compatibility; return null since we will use SOL provider
	getEvmProvider(): any { return null; }
	getSolanaProvider(): any { return getPhantomSolanaProvider(); }

	constructor(args: { config: WalletSelectConfig }) {
		this.config = args.config || {};
	}

	async isInstalled(): Promise<boolean> {
		try {
			// On mobile, provider is only injected inside Phantom's in-app browser.
			// We can't detect the app, so treat as "available" and deep link on connect.
			if (isMobileBrowser()) return true;
			return !!getPhantomSolanaProvider();
		} catch {
			return false;
		}
	}

	async isConnected(): Promise<boolean> {
		try {
			const provider = getPhantomSolanaProvider();
			if (!provider) return false;
			// Phantom SOL exposes isConnected and publicKey
			if (provider.isConnected && provider.publicKey) return true;
			try {
				await provider.connect();
				return !!provider.publicKey;
			} catch {
				return false;
			}
		} catch {
			return false;
		}
	}

	async connect(): Promise<WalletAccount> {
		let provider = getPhantomSolanaProvider();
		if (!provider) {
			// On mobile, the Solana provider is only injected when the dapp runs inside Phantom's in-app browser.
			// Redirect to Phantom's "browse" deep link so the user opens this page inside Phantom.
			if (typeof window !== 'undefined' && isMobileBrowser()) {
				const href = String(window.location?.href || '');
				const ref = String(window.location?.origin || href.replace(/\/[^/]*$/, '') || '');
				const deepLink = `https://phantom.app/ul/browse/${encodeURIComponent(href)}?ref=${encodeURIComponent(ref)}`;
				try {
					window.dispatchEvent(new CustomEvent('icpay-sdk-wallet-deeplink', { detail: { wallet: 'phantom', url: deepLink } }));
				} catch {}
				try {
					window.location.href = deepLink;
				} catch {
					try { window.open(deepLink, '_self', 'noopener,noreferrer'); } catch {}
				}
				throw new Error('Opening Phantom… If nothing happens, install Phantom and try again.');
			}
			throw new Error('Phantom (Solana) not available');
		}
		try {
			const resp = await provider.connect();
			// publicKey may be in provider.publicKey; resp may also include it
			const pk = String(resp?.publicKey || provider.publicKey || '');
			if (!pk) throw new Error('No account returned by Phantom');
			return { owner: pk, principal: pk, connected: true };
		} catch (err: any) {
			if (err && (err.code === 4001 || err.code === '4001')) throw new Error('Connection request was rejected');
			throw new Error(err?.message || 'Phantom connection failed');
		}
	}

	async disconnect(): Promise<void> {
		try {
			const provider = getPhantomSolanaProvider();
			if (!provider) return;
			try { await provider.disconnect?.(); } catch {}
			try { provider.removeAllListeners?.('accountChanged'); } catch {}
			try { provider.removeAllListeners?.('connect'); } catch {}
			try { provider.removeAllListeners?.('disconnect'); } catch {}
		} catch {}
	}

	async getPrincipal(): Promise<string | null> {
		try {
			const provider = getPhantomSolanaProvider();
			if (!provider) return null;
			const pk = provider?.publicKey ? String(provider.publicKey) : null;
			return pk;
		} catch {
			return null;
		}
	}

	getActor<T>(options: GetActorOptions): any {
		throw new Error('EVM wallets cannot provide IC actors. Use IC adapters for IC canister interactions.');
	}
}



