import type { AdapterInterface, GetActorOptions, WalletSelectConfig, WalletAccount } from '../index.js';

declare global {
	interface Window {
		solflare?: any;
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

function u8FromBase64(b64: string): Uint8Array {
	try {
		const Buf = (globalThis as any).Buffer;
		if (Buf) return new Uint8Array(Buf.from(b64, 'base64'));
	} catch {}
	const bin = (globalThis as any)?.atob ? (globalThis as any).atob(b64) : '';
	const arr = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
	return arr;
}

function getSolflareProvider(): any | null {
	try {
		const anyWin: any = (typeof window !== 'undefined' ? window : {}) as any;
		const base = anyWin.solflare;
		if (!base) return null;
		// Solflare (like Backpack) expects signAndSendTransaction(transaction) with a Transaction-like
		// object that has serialize(), not request({ params: { transaction: base64 } }). Wrap the
		// provider so the SDK's request({ method: 'signAndSendTransaction', params: { transaction: base64 } })
		// is converted to signAndSendTransaction(fakeTx) where fakeTx.serialize() returns the bytes.
		const shim: any = {
			isSolflare: true, // SDK uses this to choose signTransaction+relay for SPL tokens (avoids wrong-format signAndSendTransaction popup)
			get publicKey() { return base.publicKey; },
			get isConnected() { return base.isConnected; },
			connect: (...args: any[]) => (base.connect ? base.connect(...args) : Promise.resolve()),
			disconnect: (...args: any[]) => (base.disconnect ? base.disconnect(...args) : Promise.resolve()),
			on: (...args: any[]) => (base.on ? base.on(...args) : undefined),
			off: (...args: any[]) => (base.off ? base.off(...args) : undefined),
			removeAllListeners: (...args: any[]) => (base.removeAllListeners ? base.removeAllListeners(...args) : undefined),
			request: async (args: { method: string; params?: any }) => {
				if (args?.method === 'signAndSendTransaction' && typeof base.signAndSendTransaction === 'function') {
					const p = args.params || {};
					if (p?.transaction != null) {
						const bytes = typeof p.transaction === 'string' ? u8FromBase64(p.transaction) : (p.transaction?.byteLength != null ? p.transaction : new Uint8Array(p.transaction));
						if (bytes.length > 0) {
							const fakeTx: any = { serialize: () => bytes };
							return await base.signAndSendTransaction(fakeTx);
						}
					}
					if (typeof base.request === 'function') return base.request(args);
					throw new Error('Unsupported method');
				}
				const isSignTx = args?.method === 'signTransaction' || args?.method === 'solana:signTransaction';
				if (isSignTx && typeof base.signTransaction === 'function') {
					const p = args.params || {};
					if (p?.transaction != null) {
						const bytes = typeof p.transaction === 'string' ? u8FromBase64(p.transaction) : (p.transaction?.byteLength != null ? p.transaction : new Uint8Array(p.transaction || []));
						if (bytes.length > 0) {
							const fakeTx: any = { serialize: () => bytes };
							return await base.signTransaction(fakeTx);
						}
					}
					// Solflare only accepts transaction (base64/bytes) → Transaction-like; message/base58 causes "Invalid transaction" popup.
					// Return null so SDK tries the next variant (transaction base64) without ever sending this request to the wallet.
					return null as any;
				}
				if (typeof base.request === 'function') return base.request(args);
				throw new Error('Unsupported method');
			}
		};
		return shim;
	} catch {
		return null;
	}
}

export class SolflareAdapter implements AdapterInterface {
	readonly id = 'solflare';
	readonly label = 'Solflare';
	readonly icon?: string | null;
	private readonly config: WalletSelectConfig;

	getEvmProvider(): any { return null; }
	getSolanaProvider(): any { return getSolflareProvider(); }

	constructor(args: { config: WalletSelectConfig }) {
		this.config = args.config || {};
	}

	async isInstalled(): Promise<boolean> {
		try {
			if (isMobileBrowser()) return true;
			return !!getSolflareProvider();
		} catch {
			return false;
		}
	}

	async isConnected(): Promise<boolean> {
		try {
			const provider = getSolflareProvider();
			if (!provider) return false;
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
		const provider = getSolflareProvider();
		if (!provider) {
			if (typeof window !== 'undefined' && isMobileBrowser()) {
				// Solflare mobile deep link to open in Solflare app browser
				const href = String(window.location?.href || '');
				const deepLink = `https://solflare.com/ul/v1/browse/${encodeURIComponent(href)}`;
				try {
					window.dispatchEvent(new CustomEvent('icpay-sdk-wallet-deeplink', { detail: { wallet: 'solflare', url: deepLink } }));
				} catch {}
				try {
					window.location.href = deepLink;
				} catch {
					try { window.open(deepLink, '_self', 'noopener,noreferrer'); } catch {}
				}
				throw new Error('Opening Solflare… If nothing happens, install Solflare and try again.');
			}
			throw new Error('Solflare (Solana) not available');
		}
		try {
			const resp = await provider.connect();
			const pk = String(resp?.publicKey || provider.publicKey || '');
			if (!pk) throw new Error('No account returned by Solflare');
			return { owner: pk, principal: pk, connected: true };
		} catch (err: any) {
			if (err && (err.code === 4001 || err.code === '4001')) throw new Error('Connection request was rejected');
			throw new Error(err?.message || 'Solflare connection failed');
		}
	}

	async disconnect(): Promise<void> {
		try {
			const provider = getSolflareProvider();
			if (!provider) return;
			try { await provider.disconnect?.(); } catch {}
			try { provider.removeAllListeners?.('accountChanged'); } catch {}
			try { provider.removeAllListeners?.('connect'); } catch {}
			try { provider.removeAllListeners?.('disconnect'); } catch {}
		} catch {}
	}

	async getPrincipal(): Promise<string | null> {
		try {
			const provider = getSolflareProvider();
			if (!provider) return null;
			const pk = provider?.publicKey ? String(provider.publicKey) : null;
			return pk;
		} catch {
			return null;
		}
	}

	getActor<T>(_options: GetActorOptions): any {
		throw new Error('Solana wallets cannot provide IC actors. Use IC adapters for IC canister interactions.');
	}
}
