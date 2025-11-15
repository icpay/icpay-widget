import type { AdapterInterface, GetActorOptions, WalletSelectConfig, WalletAccount } from '../index.js';

declare global {
	interface Window {
		ethereum?: any;
	}
}

function getRainbowProvider(): any | null {
	try {
		const anyWin: any = (typeof window !== 'undefined' ? window : {}) as any;
		let eth = anyWin.ethereum;
		if (eth && Array.isArray(eth.providers)) {
			const rainbow = eth.providers.find((p: any) => p && p.isRainbow);
			if (rainbow) return rainbow;
		}
		if (eth && eth.isRainbow) return eth;
		return null;
	} catch {
		return null;
	}
}

export class RainbowAdapter implements AdapterInterface {
	readonly id = 'rainbow';
	readonly label = 'Rainbow';
	readonly icon?: string | null;
	private readonly config: WalletSelectConfig;
	getEvmProvider(): any { return getRainbowProvider(); }

	constructor(args: { config: WalletSelectConfig }) {
		this.config = args.config || {};
	}

	async isInstalled(): Promise<boolean> {
		try {
			return !!getRainbowProvider();
		} catch {
			return false;
		}
	}

	async isConnected(): Promise<boolean> {
		try {
			const provider = getRainbowProvider();
			if (!provider) return false;
			const accounts = await provider.request({ method: 'eth_accounts' });
			return Array.isArray(accounts) && accounts.length > 0;
		} catch {
			return false;
		}
	}

	async connect(): Promise<WalletAccount> {
		const provider = getRainbowProvider();
		if (!provider) throw new Error('Rainbow not available');
		const accounts = await provider.request({ method: 'eth_requestAccounts' });
		const addr = Array.isArray(accounts) ? (accounts[0] || '') : '';
		if (!addr) throw new Error('No account returned by Rainbow');
		return { owner: addr, principal: addr, connected: true };
	}

	async disconnect(): Promise<void> {
		try {
			const provider = getRainbowProvider();
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
			const provider = getRainbowProvider();
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



