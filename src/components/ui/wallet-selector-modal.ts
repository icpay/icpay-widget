import { html, TemplateResult } from 'lit';
import type { WalletBalanceEntry } from '../../utils/balances';
import { isEvmWalletId } from '../../utils/balances';
import { formatTokenAmountThirdwebStyle } from '../../utils/format';
import { renderPayWithStyles, renderPayWithContent } from './shared/pay-with';

// Helper to detect current theme mode
function getThemeMode(): 'light' | 'dark' {
  if (typeof document === 'undefined') return 'light';
  // Check for ICPay-specific theme attribute first
  const icpayTheme = document.documentElement.getAttribute('data-icpay-theme');
  if (icpayTheme === 'light' || icpayTheme === 'dark') return icpayTheme;
  // Fallback to generic data-theme
  const theme = document.documentElement.getAttribute('data-theme');
  if (theme === 'light' || theme === 'dark') return theme;
  // Default to light mode to match progress bar
  return 'light';
}

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
  onDismiss?: () => void; // Called when clicking outside (doesn't trigger cancellation events)
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
  const themeMode = getThemeMode();
  const handleOverlayClick = (e: MouseEvent) => {
    // Only close if clicking directly on the overlay, not on the modal content
    if (e.target === e.currentTarget) {
      e.preventDefault();
      e.stopPropagation();
      // Always use onDismiss if provided (doesn't trigger cancellation events)
      // This prevents the progress modal from opening when clicking outside
      if (opts.onDismiss) {
        opts.onDismiss();
      } else {
        // Fall back to onClose only if onDismiss is not provided
        opts.onClose();
      }
    }
  };
  return html`
    <div class="icpay-modal-overlay" data-theme="${themeMode}" @click=${handleOverlayClick} style="position:fixed !important;inset:0 !important;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.5);z-index:99999 !important;transform:none !important;">
      <style>
        .icpay-w-8 { width: 2rem; }
        .icpay-h-8 { height: 2rem; }
        /* Theme-aware color variables - Light mode defaults */
        .icpay-modal-overlay {
          --icpay-background: #ffffff;
          --icpay-foreground: #171717;
          --icpay-muted-foreground: #6b7280;
          --icpay-primary: #3b82f6;
          --icpay-primary-foreground: #ffffff;
          --icpay-secondary: #f3f4f6;
          --icpay-secondary-foreground: #171717;
          --icpay-accent: #f9fafb;
          --icpay-border: #e5e7eb;
          --icpay-success-bg: rgba(16, 185, 129, 0.1);
          --icpay-success-text: #059669;
          --icpay-success-border: rgba(16, 185, 129, 0.3);
          --icpay-warning-bg: rgba(245, 158, 11, 0.1);
          --icpay-warning-text: #d97706;
          --icpay-warning-border: rgba(245, 158, 11, 0.3);
          --icpay-error-bg: rgba(239, 68, 68, 0.1);
          --icpay-error-text: #dc2626;
          --icpay-error-border: rgba(239, 68, 68, 0.3);
          --icpay-processing-bg: rgba(59, 130, 246, 0.1);
          --icpay-processing-text: #2563eb;
          --icpay-processing-border: rgba(59, 130, 246, 0.3);
        }
        /* Dark mode - check for data-theme on any ancestor or document */
        [data-theme="dark"] .icpay-modal-overlay,
        [data-icpay-theme="dark"] .icpay-modal-overlay,
        :root[data-theme="dark"] .icpay-modal-overlay,
        :root[data-icpay-theme="dark"] .icpay-modal-overlay,
        html[data-theme="dark"] .icpay-modal-overlay,
        html[data-icpay-theme="dark"] .icpay-modal-overlay,
        .icpay-modal-overlay[data-theme="dark"] {
          --icpay-background: hsl(222.2 84% 4.9%);
          --icpay-foreground: hsl(210 40% 98%);
          --icpay-muted-foreground: hsl(215 20.2% 65.1%);
          --icpay-primary: hsl(210 40% 98%);
          --icpay-primary-foreground: hsl(222.2 47.4% 11.2%);
          --icpay-secondary: hsl(217.2 32.6% 17.5%);
          --icpay-secondary-foreground: hsl(210 40% 98%);
          --icpay-accent: hsl(217.2 32.6% 17.5%);
          --icpay-border: hsl(217.2 32.6% 30%);
          --icpay-success-bg: rgba(16, 185, 129, 0.1);
          --icpay-success-text: #34d399;
          --icpay-success-border: rgba(16, 185, 129, 0.3);
          --icpay-warning-bg: rgba(245, 158, 11, 0.1);
          --icpay-warning-text: #fbbf24;
          --icpay-warning-border: rgba(245, 158, 11, 0.3);
          --icpay-error-bg: rgba(239, 68, 68, 0.1);
          --icpay-error-text: #f87171;
          --icpay-error-border: rgba(239, 68, 68, 0.3);
          --icpay-processing-bg: rgba(59, 130, 246, 0.1);
          --icpay-processing-text: #60a5fa;
          --icpay-processing-border: rgba(59, 130, 246, 0.3);
        }
        /* New design styles (scoped) */
        .icpay-modal-overlay {
          position: fixed !important;
          inset: 0 !important;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(0,0,0,0.5);
          z-index: 99999 !important;
          /* Ensure modal breaks out of any parent constraints */
          transform: none !important;
          will-change: auto;
          isolation: isolate;
        }
        @media (max-width: 768px) {
          .icpay-modal-overlay {
            align-items: flex-end;
            justify-content: stretch;
          }
        }
        .modal { background-color:var(--icpay-background); border-radius:24px; width:100%; max-width:420px; padding:24px; color:var(--icpay-foreground); display:flex; flex-direction:column; border:1px solid var(--icpay-border); height:460px; margin:auto; transition:transform 0.3s ease; }
        @media (max-width: 768px) {
          .modal { max-width:100%; width:100%; height:70vh; max-height:70vh; border-radius:24px 24px 0 0; margin:0; transform:translateY(100%); overflow:hidden; display:flex; flex-direction:column; }
          .icpay-modal-overlay.active .modal,
          .icpay-modal-overlay:not([style*="display: none"]) .modal { transform:translateY(0); }
          .wallet-list { overflow-y:auto; flex:1; min-height:0; }
        }
        .header { display:flex; align-items:center; margin-bottom:20px; padding-bottom:20px; border-bottom:1px solid var(--icpay-border); flex-shrink:0; }
        .back-button { background:none; border:none; color:var(--icpay-foreground); font-size:24px; cursor:pointer; padding:0; margin-right:16px; }
        .title { font-size:20px; font-weight:600; flex:1; text-align:center; margin-right:40px; }
        .wallet-list { display:flex; flex-direction:column; gap:0; overflow-y:auto; flex:1; padding-right:8px; scrollbar-gutter: stable; }
        .wallet-item { display:flex; align-items:center; padding:16px 12px; cursor:pointer; transition:background-color 0.2s; border-radius:12px; }
        .wallet-item:hover { background-color:var(--icpay-accent); }
        .wallet-icon { width:48px; height:48px; border-radius:12px; margin-right:16px; display:flex; align-items:center; justify-content:center; font-size:24px; overflow:hidden; }
        .oisy-icon { background-color:var(--icpay-primary); }
        .plug-icon { background:linear-gradient(135deg,#667eea 0%, #764ba2 100%); }
        .wallet-info { flex:1; }
        .wallet-name { font-size:16px; font-weight:500; margin-bottom:4px; }
        .wallet-status { font-size:14px; color:var(--icpay-muted-foreground); }
        .divider { height:0; border-top:1px solid var(--icpay-border); margin:8px 0; border-radius:1px; width:100%; }
        .footer { display:flex; justify-content:space-between; align-items:center; margin-top:16px; padding-top:16px; flex-shrink:0; }
        .need-wallet { font-size:14px; color:var(--icpay-muted-foreground); }
        .get-started { font-size:14px; color:var(--icpay-primary); background:none; border:none; cursor:pointer; font-weight:500; }
        .get-started:hover { text-decoration:underline; }
      </style>
      ${renderPayWithStyles()}
      <div class="modal" @click=${(e: MouseEvent) => e.stopPropagation()}>
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
            ${opts.showCreditCard && opts.onCreditCard ? html`
              <div class="wallet-item" style="border:1px solid var(--icpay-primary);background:var(--icpay-processing-bg)" @click=${() => opts.onCreditCard && opts.onCreditCard()}>
                <div class="wallet-icon">
                  💳
                </div>
                <div class="wallet-info">
                  <div class="wallet-name">${opts.creditCardLabel || 'Pay with credit card'}</div>
                  ${opts.creditCardTooltip ? html`<div class="wallet-status">${opts.creditCardTooltip}</div>` : null}
                </div>
              </div>
              <div class="divider"></div>
            ` : null}
            ${(() => {
              const items: TemplateResult[] = [];
              let lastGroup: 'sol' | 'evm' | 'ic' | null = null;
              normalizedWallets.forEach((w) => {
                const id = (w.id || '').toLowerCase();
                const displayName = getWalletFriendlyName(w.id, w.label);
                const isEvm = isEvmWalletId(id);
                const type: 'sol' | 'evm' | 'ic' = (id === 'phantom' || id === 'backpack') ? 'sol' : (isEvm ? 'evm' : 'ic');
                // Insert a divider whenever transitioning between wallet groups (sol -> evm -> ic)
                if (lastGroup !== null && type !== lastGroup) {
                  items.push(html`<div class="divider"></div>`);
                }
                const chainLabel =
                  (id === 'oisy' || id === 'plug' || id === 'nfid' || id === 'ii')
                    ? 'Internet Computer'
                    : (id === 'phantom' || id === 'backpack'
                      ? 'Solana'
                      : (isEvm ? 'Ethereum-compatible' : ''));
                items.push(html`
                  <div class="wallet-item" style="opacity:${isConnecting?0.6:1}" @click=${() => onSelect(w.id)}>
                    <div class="wallet-icon">
                      ${w.icon
                        ? html`<img src="${sanitizeDataUrl(w.icon)}" alt="${displayName} logo" class="icpay-w-8 icpay-h-8" style="object-fit:contain" />`
                        : html`<span>${displayName.charAt(0)}</span>`}
                    </div>
                    <div class="wallet-info">
                      <div class="wallet-name">${displayName}</div>
                      ${chainLabel ? html`<div class="wallet-status">${chainLabel}</div>` : null}
                    </div>
                  </div>
                `);
                lastGroup = type;
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



