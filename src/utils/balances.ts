export type WalletBalanceEntry = {
  ledgerId: string;
  ledgerName: string;
  ledgerSymbol: string;
  canisterId: string;
  // Whether this ledger supports x402/EIP-3009 flow (if provided by API)
  eip3009Version?: string | null;
  x402Accepts?: boolean;
  balance: string;
  formattedBalance: string;
  decimals: number;
  currentPrice?: number;
  lastPriceUpdate?: Date;
  lastUpdated: Date;
  chainId?: string; // EVM chain id as string (e.g., '1', '137')
  chainName?: string;
  rpcUrlPublic?: string;
  chainUuid?: string; // UUID of chains table row
  requiredAmount?: string;
  requiredAmountFormatted?: string;
  hasSufficientBalance?: boolean;
  logoUrl?: string | null;
};

const EVM_WALLET_IDS = new Set(['metamask', 'coinbase', 'brave', 'rainbow', 'rabby', 'phantom', 'okx']);

export function isEvmWalletId(walletId?: string | null): boolean {
  if (!walletId) return false;
  return EVM_WALLET_IDS.has(String(walletId).toLowerCase());
}

export type WalletRaw = { id?: string; provider?: string; key?: string; label?: string; name?: string; title?: string; icon?: string; logo?: string; image?: string } & Record<string, any>;
export type WalletEntry = { id: string; label: string; icon?: string | null };

export function getWalletId(w: WalletRaw): string {
  return (w && (w.id || w.provider || w.key)) || '';
}

export function getWalletLabel(w: WalletRaw): string {
  return (w && (w.label || w.name || w.title || w.id)) || 'Wallet';
}

export function getWalletIcon(w: WalletRaw): string | null {
  return (w && (w.icon || w.logo || w.image)) || null;
}

export function buildWalletEntries(raw: WalletRaw[]): WalletEntry[] {
  return (raw || []).map((w) => ({ id: getWalletId(w), label: getWalletLabel(w), icon: getWalletIcon(w) }));
}

declare global {
  interface Window { ethereum?: any }
}

export async function ensureEvmChain(targetChainId?: number | string, opts?: { chainName?: string; rpcUrlPublic?: string; nativeSymbol?: string; decimals?: number }): Promise<boolean> {
  try {
    if (!window.ethereum || targetChainId === undefined || targetChainId === null) return true;
    const desiredDec = typeof targetChainId === 'number'
      ? targetChainId
      : (String(targetChainId).startsWith('0x') ? parseInt(String(targetChainId), 16) : parseInt(String(targetChainId), 10));
    if (!Number.isFinite(desiredDec)) return true;
    const currentHex: string = await window.ethereum.request({ method: 'eth_chainId' });
    const current = parseInt(currentHex, 16);
    if (current === desiredDec) return true;
    const hex = '0x' + desiredDec.toString(16);
    await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: hex }] });
    return true;
  } catch (e) {
    // Try addEthereumChain fallback using provided chain metadata
    try {
      if (!window.ethereum || targetChainId === undefined || targetChainId === null) return false;
      const desiredDec = typeof targetChainId === 'number'
        ? targetChainId
        : (String(targetChainId).startsWith('0x') ? parseInt(String(targetChainId), 16) : parseInt(String(targetChainId), 10));
      const hex = '0x' + desiredDec.toString(16);
      const chainName = opts?.chainName || `Network ${desiredDec}`;
      const rpcUrls = (opts?.rpcUrlPublic ? [opts.rpcUrlPublic] : []).filter(Boolean) as string[];
      const nativeCurrency = {
        name: opts?.nativeSymbol || 'ETH',
        symbol: opts?.nativeSymbol || 'ETH',
        decimals: (typeof opts?.decimals === 'number' && isFinite(opts.decimals) ? opts.decimals : 18)
      } as any;
      await window.ethereum.request({ method: 'wallet_addEthereumChain', params: [{ chainId: hex, chainName, rpcUrls, nativeCurrency }] });
      return true;
    } catch {
      return false;
    }
  }
}

export async function getWalletBalanceEntries(params: {
  sdk: any;
  lastWalletId?: string | null;
  connectedWallet?: { owner?: string; principal?: string } | any;
  amountUsd?: number;
  chainShortcodes?: string[];
  ledgerShortcodes?: string[];
}): Promise<{ balances: WalletBalanceEntry[]; totalBalancesUSD?: number; lastUpdated: Date }>
{
  const { sdk, lastWalletId, connectedWallet, amountUsd, chainShortcodes, ledgerShortcodes } = params;
  let response: any;
  const lowerId = (lastWalletId || '').toLowerCase();
  const addrOrPrincipal = (connectedWallet?.owner || connectedWallet?.principal || '').toString();
  try {
    if (lowerId && EVM_WALLET_IDS.has(lowerId)) {
      response = await (sdk?.client as any)?.getExternalWalletBalances?.({ network: 'evm', address: addrOrPrincipal, amountUsd, chainShortcodes, ledgerShortcodes });
    } else {
      // Prefer API for IC balances too for uniform behavior
      response = await (sdk?.client as any)?.getExternalWalletBalances?.({ network: 'ic', principal: addrOrPrincipal, amountUsd, chainShortcodes, ledgerShortcodes });
    }
  } catch {
    // Fallbacks: for IC wallets use client method; for EVM wallets, return empty set
    response = { balances: [], totalBalancesUSD: 0, lastUpdated: new Date() };
  }

  const balances: WalletBalanceEntry[] = (response?.balances || []).map((b: any) => ({
    ledgerId: b.ledgerId,
    ledgerName: b.ledgerName,
    ledgerSymbol: b.ledgerSymbol,
    canisterId: b.canisterId,
    eip3009Version: b?.eip3009Version ?? null,
    x402Accepts: b?.x402Accepts != null ? Boolean(b.x402Accepts) : undefined,
    balance: b.balance,
    formattedBalance: b.formattedBalance,
    decimals: b.decimals,
    currentPrice: b.currentPrice,
    lastPriceUpdate: b.lastPriceUpdate ? new Date(b.lastPriceUpdate) : undefined,
    lastUpdated: b.lastUpdated ? new Date(b.lastUpdated) : new Date(),
    chainId: typeof b.chainId === 'string' ? b.chainId : (typeof b.chainId === 'number' ? String(b.chainId) : undefined),
    // Accept multiple API shapes: chainName, chain.name, networkName, etc.
    chainName: b.chainName || (b.chain && (b.chain.name || b.chain.chainName)) || b.networkName || undefined,
    rpcUrlPublic: b.rpcUrlPublic,
    chainUuid: b.chainUuid,
    requiredAmount: b.requiredAmount,
    requiredAmountFormatted: b.requiredAmountFormatted,
    hasSufficientBalance: b.hasSufficientBalance,
    logoUrl: b.logoUrl ?? null,
  }));

  return {
    balances,
    totalBalancesUSD: response?.totalBalancesUSD,
    lastUpdated: response?.lastUpdated ? new Date(response.lastUpdated) : new Date(),
  };
}


