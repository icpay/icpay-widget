import type { AdapterInterface, GetActorOptions, WalletSelectConfig, WalletAccount } from '../index.js';

declare global {
	interface Window {
		keplr?: any;
		ethereum?: any;
	}
}

function getKeplrEvmProvider(): any | null {
	try {
		const anyWin: any = (typeof window !== 'undefined' ? window : {}) as any;
		// Some Keplr builds expose an ethereum provider with an isKeplr flag
		const eth = anyWin.ethereum;
		if (eth && Array.isArray(eth.providers)) {
			const prov = eth.providers.find((p: any) => p && (p.isKeplr || p?.provider?.isKeplr));
			if (prov) return prov;
		}
		if (eth && (eth.isKeplr || eth?.provider?.isKeplr)) return eth;
		// Future-proof: keplr may expose an explicit EVM provider handle
		if (anyWin.keplr?.ethereum) return anyWin.keplr.ethereum;
		if (typeof anyWin.keplr?.getEthereumProvider === 'function') {
			try { return anyWin.keplr.getEthereumProvider(); } catch {}
		}
		return null;
	} catch {
		return null;
	}
}

export class KeplrAdapter implements AdapterInterface {
	readonly id = 'keplr';
	readonly label = 'Keplr';
	readonly icon?: string | null;
	private readonly config: WalletSelectConfig;

	constructor(args: { config: WalletSelectConfig }) {
		this.config = args.config || {};
	}

	async isInstalled(): Promise<boolean> {
		try {
			return !!getKeplrEvmProvider();
		} catch {
			return false;
		}
	}

	async isConnected(): Promise<boolean> {
		try {
			const provider = getKeplrEvmProvider();
			if (!provider) return false;
			const accounts = await provider.request({ method: 'eth_accounts' });
			return Array.isArray(accounts) && accounts.length > 0;
		} catch {
			return false;
		}
	}

	async connect(): Promise<WalletAccount> {
		const provider = getKeplrEvmProvider();
		if (!provider) throw new Error('Keplr (EVM) not available');
		const accounts = await provider.request({ method: 'eth_requestAccounts' });
		const addr = Array.isArray(accounts) ? (accounts[0] || '') : '';
		if (!addr) throw new Error('No account returned by Keplr');
		return { owner: addr, principal: addr, connected: true };
	}

	async disconnect(): Promise<void> {
		try {
			const provider = getKeplrEvmProvider();
			if (!provider) return;
			try { await provider.request?.({ method: 'wallet_requestPermissions', params: [{ eth_accounts: {} }] }); } catch {}
			try { provider.removeAllListeners?.('accountsChanged'); } catch {}
			try { provider.removeAllListeners?.('chainChanged'); } catch {}
			try { provider.removeAllListeners?.('disconnect'); } catch {}
		} catch {}
	}

	async getPrincipal(): Promise<string | null> {
		try {
			const provider = getKeplrEvmProvider();
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



