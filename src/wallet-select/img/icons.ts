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
import okxIcon from './okx.js';
import trustIcon from './trust.js';
import walletconnectIcon from './walletconnect.js'; // Disabled
import braveIcon from './brave.js';
import phantomIcon from './phantom.js';
import solflareIcon from './solflare.js';
import rabbyIcon from './rabby.js';
import backpackIcon from './backpack.js';

const ICONS: Record<string, string> = {
  ii: iiIcon,
  nfid: nfidIcon,
  oisy: oisyIcon,
  plug: plugIcon,
  // EVM / popular wallets
  metamask: metamaskIcon,
  coinbase: coinbaseIcon,
  rainbow: rainbowIcon,
  brave: braveIcon,
  phantom: phantomIcon,
  solflare: solflareIcon,
  backpack: backpackIcon,
  rabby: rabbyIcon,
  ledger: ledgerIcon,
  okx: okxIcon,
  trust: trustIcon,
  walletconnect: walletconnectIcon
};

export function getIcon(id: string, fallback?: string | null): string | null {
  const key = (id || '').toLowerCase();
  return ICONS[key] || fallback || null;
}


