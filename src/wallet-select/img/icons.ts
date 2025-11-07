// Centralized wallet icons as data URLs
// Note: keep these lightweight and self-contained to avoid external deps

// Import per-wallet icon modules (default export is a data URL)
import iiIcon from './ii.js';
import nfidIcon from './nfid.js';
import oisyIcon from './oisy.js';
import plugIcon from './plug.js';

import metamaskIcon from './metamask.js';
import coinbaseIcon from './coinbase.js';
import rainbowIcon from './rainbow.js';
import ledgerIcon from './ledger.js';
import okexIcon from './okex.js';
import exodusIcon from './exodus.js';
import walletconnectIcon from './walletconnect.js';

const ICONS: Record<string, string> = {
  ii: iiIcon,
  nfid: nfidIcon,
  oisy: oisyIcon,
  plug: plugIcon,
  // EVM / popular wallets
  metamask: metamaskIcon,
  coinbase: coinbaseIcon,
  rainbow: rainbowIcon,
  ledger: ledgerIcon,
  okex: okexIcon,
  exodus: exodusIcon,
  walletconnect: walletconnectIcon,
};

export function getIcon(id: string, fallback?: string | null): string | null {
  const key = (id || '').toLowerCase();
  return ICONS[key] || fallback || null;
}


