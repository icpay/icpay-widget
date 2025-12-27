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
		// Prefer dedicated Backpack provider if present
		if (anyWin.backpack?.solana) return anyWin.backpack.solana;
		// xNFT context (Backpack in-app)
		if (anyWin.xnft?.solana) return anyWin.xnft.solana;
		// Some environments expose a generic window.solana object with an isBackpack flag
		const sol = anyWin.solana;
		if (sol && (sol.isBackpack === true || sol?.provider?.isBackpack === true)) return sol;
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


