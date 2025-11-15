import { html, TemplateResult } from 'lit';
import type { WalletBalanceEntry } from '../../utils/balances';
import { isEvmWalletId } from '../../utils/balances';
import { formatTokenAmountThirdwebStyle } from '../../utils/format';
import { renderPayWithStyles, renderPayWithContent } from './shared/pay-with';

// Embedded icon for NFID provider (data URL)

function sanitizeDataUrl(url: string): string {
  if (!url) return url;
  if (!url.startsWith('data:')) return url;
  // Remove any whitespace that might have slipped in (spaces, newlines, tabs)
  return url.replace(/\s+/g, '');
}

function getWalletFriendlyName(id: string, fallback?: string): string {
  const lower = (id || '').toLowerCase();
  if (lower === 'ii') return 'Internet Identity';
  if (lower === 'nfid') return 'NFID';
  if (lower === 'plug') return 'Plug';
  if (lower === 'oisy') return 'Oisy';
  if (fallback && fallback.trim()) return fallback;
  return id ? id.charAt(0).toUpperCase() + id.slice(1) : 'Wallet';
}

export type WalletEntry = { id: string; label: string; icon?: string | null };

type Options = {
  visible: boolean;
  wallets: WalletEntry[];
  isConnecting?: boolean;
  onSelect: (walletId: string) => void;
  onClose: () => void;
  onSwitchAccount?: () => void;
  // Optional onramp (credit card) entry at the end
  onCreditCard?: () => void;
  creditCardLabel?: string;
  showCreditCard?: boolean;
  creditCardTooltip?: string | null;
  // Two-step support: balances step after connect
  step?: 'connect' | 'balances';
  balances?: WalletBalanceEntry[];
  balancesLoading?: boolean;
  balancesError?: string | null;
  onSelectBalance?: (symbol: string) => void;
  onBack?: () => void;
};

export function renderWalletSelectorModal(opts: Options & { oisyReadyToPay?: boolean; onOisyPay?: () => void }): TemplateResult | null {
  if (!opts.visible) return null as any;
  const { wallets, onSelect, onClose, isConnecting } = opts;
  const formatTokenAmount = (val: string | number): string => formatTokenAmountThirdwebStyle(val);
  const toUsd = (b: WalletBalanceEntry): number => {
    const amt = parseFloat(String(b.formattedBalance || '0'));
    const price = Number((b as any).currentPrice ?? 0);
    const usd = (isFinite(amt) ? amt : 0) * (isFinite(price) ? price : 0);
    return isFinite(usd) ? usd : 0;
  };
  const byUsdDesc = (a: WalletBalanceEntry, b: WalletBalanceEntry) => toUsd(b) - toUsd(a);
  const normalizedWallets = wallets.map(w => {
    const id = (w.id || '').toLowerCase();
    return {
      ...w,
      // Force NFID to use embedded icon; others keep provided icon
      icon: w.icon ?? null,
    };
  });
  return html`
    <div style="position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.5);z-index:10000">
      <style>
        .icpay-w-8 { width: 2rem; }
        .icpay-h-8 { height: 2rem; }
        /* New design styles (scoped) */
        .modal { background-color:#1a1a1a; border-radius:24px; width:100%; max-width:420px; padding:24px; color:#fff; display:flex; flex-direction:column; border:1px solid #333; height:460px; }
        .header { display:flex; align-items:center; margin-bottom:20px; padding-bottom:20px; border-bottom:1px solid #333; flex-shrink:0; }
        .back-button { background:none; border:none; color:#fff; font-size:24px; cursor:pointer; padding:0; margin-right:16px; }
        .title { font-size:20px; font-weight:600; flex:1; text-align:center; margin-right:40px; }
        .wallet-list { display:flex; flex-direction:column; gap:0; overflow-y:auto; flex:1; padding-right:8px; scrollbar-gutter: stable; }
        .wallet-item { display:flex; align-items:center; padding:16px 12px; cursor:pointer; transition:background-color 0.2s; border-radius:12px; }
        .wallet-item:hover { background-color:#2a2a2a; }
        .wallet-icon { width:48px; height:48px; border-radius:12px; margin-right:16px; display:flex; align-items:center; justify-content:center; font-size:24px; overflow:hidden; }
        .oisy-icon { background-color:#0066ff; }
        .plug-icon { background:linear-gradient(135deg,#667eea 0%, #764ba2 100%); }
        .coinbase-icon { background-color:#0052ff; }
        .metamask-icon { background-color:#f6851b; }
        .wallet-info { flex:1; }
        .wallet-name { font-size:16px; font-weight:500; margin-bottom:4px; }
        .wallet-status { font-size:14px; color:#888; }
        .divider { height:0; border-top:1px solid #444; margin:8px 0; border-radius:1px; width:100%; }
        .footer { display:flex; justify-content:space-between; align-items:center; margin-top:16px; padding-top:16px; flex-shrink:0; }
        .need-wallet { font-size:14px; color:#888; }
        .get-started { font-size:14px; color:#0066ff; background:none; border:none; cursor:pointer; font-weight:500; }
        .get-started:hover { text-decoration:underline; }
      </style>
      ${renderPayWithStyles()}
      <div class="modal">
        ${opts.step === 'balances' ? html`
          ${renderPayWithContent({
            isLoading: !!opts.balancesLoading,
            error: opts.balancesError,
            balances: opts.balances,
            onBack: () => opts.onBack && opts.onBack(),
            onSelect: (symbol: string) => opts.onSelectBalance && opts.onSelectBalance(symbol)
          })}
        ` : html`
          <div class="header">
            <button class="back-button" @click=${() => { try { onClose(); } catch {} }}>‹</button>
            <h1 class="title">Connect</h1>
          </div>
          <div class="wallet-list">
            ${(() => {
              const items: TemplateResult[] = [];
              let dividerInserted = false;
              let lastWasEvm: boolean | null = null;
              normalizedWallets.forEach((w) => {
                const id = (w.id || '').toLowerCase();
                const displayName = getWalletFriendlyName(w.id, w.label);
                const iconClass = id === 'oisy' ? 'oisy-icon' : (id === 'plug' ? 'plug-icon' : (id === 'coinbase' ? 'coinbase-icon' : (id === 'metamask' ? 'metamask-icon' : '')));
                const isEvm = isEvmWalletId(id);
                // Insert a divider when transitioning from EVM wallets to non-EVM wallets (once)
                if (lastWasEvm === null) {
                  lastWasEvm = isEvm;
                } else if (!dividerInserted && lastWasEvm === true && isEvm === false) {
                  items.push(html`<div class="divider"></div>`);
                  dividerInserted = true;
                }
                items.push(html`
                  <div class="wallet-item" style="opacity:${isConnecting?0.6:1}" @click=${() => onSelect(w.id)}>
                    <div class="wallet-icon ${iconClass}">
                      ${w.icon
                        ? html`<img src="${sanitizeDataUrl(w.icon)}" alt="${displayName} logo" class="icpay-w-8 icpay-h-8" style="object-fit:contain" />`
                        : html`<span>${displayName.charAt(0)}</span>`}
                    </div>
                    <div class="wallet-info">
                      <div class="wallet-name">${displayName}</div>
                      ${id === 'plug' || id === 'oisy' ? html`<div class="wallet-status">Installed</div>` : null}
                    </div>
                  </div>
                `);
                lastWasEvm = isEvm;
              });
              return items;
            })()}
          </div>
          <div class="footer">
            <span class="need-wallet">Need a wallet?</span>
            <button class="get-started" @click=${() => { try { window.open('https://metamask.io/en-GB/download','_blank','noopener,noreferrer'); } catch {} }}>Get started</button>
          </div>
        `}
      </div>
    </div>
  `;
}



