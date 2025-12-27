import type { AdapterInterface, GetActorOptions, WalletSelectConfig, WalletAccount } from '../index.js';

declare global {
	interface Window {
		backpack?: { solana?: any } | undefined;
		xnft?: { solana?: any } | undefined;
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

function getBackpackSolanaProvider(): any | null {
	try {
		const anyWin: any = (typeof window !== 'undefined' ? window : {}) as any;
		const u8FromBase64 = (b64: string): Uint8Array => {
			try {
				const Buf = (globalThis as any).Buffer;
				if (Buf) return new Uint8Array(Buf.from(b64, 'base64'));
			} catch {}
			const bin = (globalThis as any)?.atob ? (globalThis as any).atob(b64) : '';
			const arr = new Uint8Array(bin.length);
			for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
			return arr;
		};
		// Prefer dedicated Backpack provider if present
		if (anyWin.backpack?.solana) {
			const base = anyWin.backpack.solana;
			// Wrap to standardize behavior and hint SDK to use base58 "message" path (same as Phantom branch)
			const shim: any = {
				// Identity flags for compatibility/debug
				isBackpack: true,
				get publicKey() { return base.publicKey; },
				get isConnected() { return base.isConnected; },
				connect: (...args: any[]) => (base.connect ? base.connect(...args) : Promise.resolve()),
				disconnect: (...args: any[]) => (base.disconnect ? base.disconnect(...args) : Promise.resolve()),
				on: (...args: any[]) => (base.on ? base.on(...args) : undefined),
				off: (...args: any[]) => (base.off ? base.off(...args) : undefined),
				removeAllListeners: (...args: any[]) => (base.removeAllListeners ? base.removeAllListeners(...args) : undefined),
				// Normalize request interface expected by SDK
				request: async (args: { method: string; params?: any }) => {
					// Intercept Solana signing to normalize to the working path for Backpack
					if (args && args.method === 'signAndSendTransaction' && typeof base.signAndSendTransaction === 'function') {
						const p = args.params || {};
						if (p && (p.transaction != null)) {
							const bytes = typeof p.transaction === 'string' ? u8FromBase64(p.transaction) : p.transaction;
							// Minimal serialize()-capable object expected by Backpack
							const fakeTx: any = { serialize: () => bytes };
							return await base.signAndSendTransaction(fakeTx);
						}
						// If no transaction provided, fall back to provider behavior
						if (typeof base.request === 'function') return base.request(args);
						throw new Error('Unsupported method');
					}
					// Non-sign methods: forward to native request if available
					if (typeof base.request === 'function') return base.request(args);
					throw new Error('Unsupported method');
				}
			};
			return shim;
		}
		// xNFT context (Backpack in-app)
		if (anyWin.xnft?.solana) return anyWin.xnft.solana;
		// Some environments expose a generic window.solana object with an isBackpack flag
		const sol = anyWin.solana;
		if (sol && (sol.isBackpack === true || sol?.provider?.isBackpack === true)) {
			// Wrap generic window.solana similarly
			const base = sol;
			const shim: any = {
				isBackpack: true,
				get publicKey() { return base.publicKey; },
				get isConnected() { return base.isConnected; },
				connect: (...args: any[]) => (base.connect ? base.connect(...args) : Promise.resolve()),
				disconnect: (...args: any[]) => (base.disconnect ? base.disconnect(...args) : Promise.resolve()),
				on: (...args: any[]) => (base.on ? base.on(...args) : undefined),
				off: (...args: any[]) => (base.off ? base.off(...args) : undefined),
				removeAllListeners: (...args: any[]) => (base.removeAllListeners ? base.removeAllListeners(...args) : undefined),
				request: async (args: { method: string; params?: any }) => {
					if (args && args.method === 'signAndSendTransaction' && typeof base.signAndSendTransaction === 'function') {
						const p = args.params || {};
						if (p && (p.transaction != null)) {
							const bytes = typeof p.transaction === 'string' ? u8FromBase64(p.transaction) : p.transaction;
							const fakeTx: any = { serialize: () => bytes };
							return await base.signAndSendTransaction(fakeTx);
						}
						if (typeof base.request === 'function') return base.request(args);
						throw new Error('Unsupported method');
					}
					if (typeof base.request === 'function') return base.request(args);
					throw new Error('Unsupported method');
				}
			};
			return shim;
		}
		// Fallback: accept window.solana on mobile (flags can be flaky in in-app browsers)
		if (isMobileBrowser() && sol && typeof sol.connect === 'function') return sol;
		return null;
	} catch {
		return null;
	}
}

export class BackpackAdapter implements AdapterInterface {
	readonly id = 'backpack';
	readonly label = 'Backpack';
	readonly icon?: string | null;
	private readonly config: WalletSelectConfig;
	// Backpack is Solana-first; exposing SOL provider only
	getSolanaProvider(): any { return getBackpackSolanaProvider(); }

	constructor(args: { config: WalletSelectConfig }) {
		this.config = args.config || {};
	}

	async isInstalled(): Promise<boolean> {
		try {
			return !!getBackpackSolanaProvider();
		} catch {
			return false;
		}
	}

	async isConnected(): Promise<boolean> {
		try {
			const provider = getBackpackSolanaProvider();
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
		let provider = getBackpackSolanaProvider();
		if (!provider) {
			if (typeof window !== 'undefined' && isMobileBrowser()) {
				try {
					provider = getBackpackSolanaProvider();
					if (!provider) throw new Error('Backpack (Solana) not available');
				} catch {
					throw new Error('Backpack (Solana) not available');
				}
			}
			throw new Error('Backpack (Solana) not available');
		}
		try {
			const resp = await provider.connect();
			const pk = String(resp?.publicKey || provider.publicKey || '');
			if (!pk) throw new Error('No account returned by Backpack');
			return { owner: pk, principal: pk, connected: true };
		} catch (err: any) {
			if (err && (err.code === 4001 || err.code === '4001')) throw new Error('Connection request was rejected');
			throw new Error(err?.message || 'Backpack connection failed');
		}
	}

	async disconnect(): Promise<void> {
		try {
			const provider = getBackpackSolanaProvider();
			if (!provider) return;
			try { await provider.disconnect?.(); } catch {}
			try { provider.removeAllListeners?.('accountChanged'); } catch {}
			try { provider.removeAllListeners?.('connect'); } catch {}
			try { provider.removeAllListeners?.('disconnect'); } catch {}
		} catch {}
	}

	async getPrincipal(): Promise<string | null> {
		try {
			const provider = getBackpackSolanaProvider();
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


