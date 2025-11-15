import type { AdapterInterface, GetActorOptions, WalletSelectConfig, WalletAccount } from '../index.js';

declare global {
	interface Window {
		ethereum?: any;
		brave?: any;
		navigator?: any;
	}
}

function isBraveBrowser(): boolean {
	try {
		const nav: any = (typeof navigator !== 'undefined' ? navigator : (window as any)?.navigator);
		return !!(nav && (nav.brave || String(nav.userAgent || '').toLowerCase().includes('brave')));
	} catch {
		return false;
	}
}

function getBraveProviderInternal(allowFallback: boolean): any | null {
	try {
		const anyWin: any = (typeof window !== 'undefined' ? window : {}) as any;
		// Some builds expose a dedicated handle
		if (anyWin.brave?.ethereum) return anyWin.brave.ethereum;
		const eth = anyWin.ethereum;
		if (!eth) return null;
		// Prefer explicit Brave provider if multiple are present
		if (Array.isArray(eth.providers) && eth.providers.length) {
			const byFlag = eth.providers.find((p: any) => p && (p.isBraveWallet || (p?.walletMeta?.name && String(p.walletMeta.name).toLowerCase().includes('brave'))));
			if (byFlag) return byFlag;
			// If running in Brave and fallback explicitly allowed, allow a cautious fallback to a non-branded provider
			if (allowFallback && isBraveBrowser()) {
				const candidate = eth.providers.find(
					(p: any) => p && typeof p.request === 'function' && !p.isMetaMask && !p.isCoinbaseWallet && !p.isRabby && !p.isOkxWallet && !p.isOKExWallet && !p.isPhantom
				);
				if (candidate) return candidate;
				// As a last resort (explicitly opted-in), return the first provider
				return eth.providers[0] || null;
			}
			return null;
		}
		// Single provider case
		if (eth.isBraveWallet) return eth;
		const name = eth?.walletMeta?.name ? String(eth.walletMeta.name).toLowerCase() : '';
		if (name.includes('brave')) return eth;
		// If in Brave, fallback explicitly allowed, and it isn't obviously another brand, allow fallback
		if (allowFallback && isBraveBrowser() && typeof eth.request === 'function' && !eth.isMetaMask && !eth.isCoinbaseWallet && !eth.isRabby && !eth.isOkxWallet && !eth.isOKExWallet && !eth.isPhantom) {
			return eth;
		}
		return null;
	} catch {
		return null;
	}
}

export class BraveAdapter implements AdapterInterface {
	readonly id = 'brave';
	readonly label = 'Brave Wallet';
	readonly icon?: string | null;
	private readonly config: WalletSelectConfig;

	constructor(args: { config: WalletSelectConfig }) {
		this.config = args.config || {};
	}

	private getProvider(): any | null {
		// Always enable fallback logic when in Brave
		return getBraveProviderInternal(true);
	}

	getEvmProvider(): any { return this.getProvider(); }

	async isInstalled(): Promise<boolean> {
		try {
			return !!this.getProvider();
		} catch {
			return false;
		}
	}

	async isConnected(): Promise<boolean> {
		try {
			const provider = this.getProvider();
			if (!provider) return false;
			const accounts = await provider.request?.({ method: 'eth_accounts' });
			if (Array.isArray(accounts) && accounts.length > 0 && typeof accounts[0] === 'string' && accounts[0]) return true;
			const sel = provider?.selectedAddress || (Array.isArray(provider?.accounts) && provider.accounts[0]);
			return !!sel;
		} catch {
			return false;
		}
	}

	async connect(): Promise<WalletAccount> {
		const provider = this.getProvider();
		if (!provider) throw new Error('Brave Wallet not available');
		const accounts = await provider.request?.({ method: 'eth_requestAccounts' });
		const addr = Array.isArray(accounts) ? (accounts[0] || '') : '';
		if (!addr) throw new Error('No account returned by Brave Wallet');
		return { owner: addr, principal: addr, connected: true };
	}

	async disconnect(): Promise<void> {
		try {
			const provider = this.getProvider();
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
			const provider = this.getProvider();
			if (!provider) return null;
			const accounts = await provider.request?.({ method: 'eth_accounts' });
			if (Array.isArray(accounts) && accounts.length > 0 && typeof accounts[0] === 'string' && accounts[0]) return accounts[0];
			const sel = provider?.selectedAddress || (Array.isArray(provider?.accounts) && provider.accounts[0]);
			return (typeof sel === 'string' && sel) ? sel : null;
		} catch {
			return null;
		}
	}

	getActor<T>(options: GetActorOptions): any {
		throw new Error('EVM wallets cannot provide IC actors. Use IC adapters for IC canister interactions.');
	}
}



