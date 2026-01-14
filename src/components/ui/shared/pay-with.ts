import { html, TemplateResult } from 'lit';
import type { WalletBalanceEntry } from '../../../utils/balances';
import { formatTokenAmountThirdwebStyle } from '../../../utils/format';

export type PayWithOptions = {
  isLoading: boolean;
  error?: string | null;
  balances: WalletBalanceEntry[] | undefined;
  onBack: () => void;
  onSelect: (symbol: string) => void;
};

function toUsd(b: WalletBalanceEntry): number {
  const amt = parseFloat(String(b.formattedBalance || '0'));
  const price = Number((b as any).currentPrice ?? 0);
  const usd = (isFinite(amt) ? amt : 0) * (isFinite(price) ? price : 0);
  return isFinite(usd) ? usd : 0;
}

const byUsdDesc = (a: WalletBalanceEntry, b: WalletBalanceEntry) => toUsd(b) - toUsd(a);

export function renderPayWithStyles(): TemplateResult {
  return html`<style>
    /* Theme-aware color variables - Light mode defaults */
    .modal {
      --icpay-background: #ffffff;
      --icpay-foreground: #171717;
      --icpay-muted-foreground: #6b7280;
      --icpay-primary: #3b82f6;
      --icpay-primary-foreground: #ffffff;
      --icpay-secondary: #f3f4f6;
      --icpay-secondary-foreground: #171717;
      --icpay-accent: #f9fafb;
      --icpay-border: #e5e7eb;
      --icpay-error-text: #dc2626;
    }
    /* Dark mode */
    [data-theme="dark"] .modal,
    [data-icpay-theme="dark"] .modal,
    :root[data-theme="dark"] .modal,
    :root[data-icpay-theme="dark"] .modal,
    html[data-theme="dark"] .modal,
    html[data-icpay-theme="dark"] .modal,
    .modal[data-theme="dark"] {
      --icpay-background: hsl(222.2 84% 4.9%);
      --icpay-foreground: hsl(210 40% 98%);
      --icpay-muted-foreground: hsl(215 20.2% 65.1%);
      --icpay-primary: hsl(210 40% 98%);
      --icpay-primary-foreground: hsl(222.2 47.4% 11.2%);
      --icpay-secondary: hsl(217.2 32.6% 17.5%);
      --icpay-secondary-foreground: hsl(210 40% 98%);
      --icpay-accent: hsl(217.2 32.6% 17.5%);
      --icpay-border: hsl(217.2 32.6% 30%);
      --icpay-error-text: #f87171;
    }
    .modal { background-color:var(--icpay-background); border-radius:24px; width:100%; max-width:420px; padding:24px; color:var(--icpay-foreground); display:flex; flex-direction:column; border:1px solid var(--icpay-border); height:460px; margin:auto; transition:transform 0.3s ease; position:relative; z-index:1; }
    @media (max-width: 768px) {
      .modal { max-width:100%; width:100%; height:70vh; max-height:70vh; border-radius:24px 24px 0 0; margin:0; transform:translateY(100%); overflow:hidden; display:flex; flex-direction:column; }
      .currency-list { overflow-y:auto; flex:1; min-height:0; }
      .wallet-list { overflow-y:auto; flex:1; min-height:0; }
    }
    .header { display:flex; align-items:center; margin-bottom:20px; padding-bottom:20px; border-bottom:1px solid var(--icpay-border); flex-shrink:0; }
    .back-button { background:none; border:none; color:var(--icpay-foreground); font-size:24px; cursor:pointer; padding:0; margin-right:16px; }
    .title { font-size:20px; font-weight:600; flex:1; text-align:center; margin-right:40px; }
    .currency-list { display:flex; flex-direction:column; gap:0; overflow-y:auto; flex:1; margin-bottom:0; }
    .currency-item { display:flex; align-items:center; padding:16px 12px; cursor:pointer; transition:background-color 0.2s; border-radius:12px; }
    .currency-item:hover { background-color:var(--icpay-accent); }
    .currency-item[disabled] { opacity:0.6; cursor:not-allowed; }
    .currency-icon { width:48px; height:48px; border-radius:50%; margin-right:16px; display:flex; align-items:center; justify-content:center; font-size:28px; flex-shrink:0; overflow:hidden; }
    .eth-icon { background:linear-gradient(135deg,#627eea 0%, #8a9bff 100%); }
    .usdc-icon { background:linear-gradient(135deg,#2775ca 0%, #4da4ff 100%); }
    .usdt-icon { background:linear-gradient(135deg,#26a17b 0%, #50af95 100%); }
    .currency-info { flex:1; }
    .currency-name { font-size:16px; font-weight:500; margin-bottom:4px; }
    .currency-network { font-size:14px; color:var(--icpay-muted-foreground); }
    .currency-balance { text-align:right; }
    .balance-amount { font-size:16px; font-weight:500; margin-bottom:4px; }
    .balance-available { font-size:14px; color:var(--icpay-muted-foreground); }
    .footer { display:flex; justify-content:space-between; align-items:center; margin-top:16px; padding-top:16px; border-top:1px solid var(--icpay-border); flex-shrink:0; }
    .need-wallet { font-size:14px; color:var(--icpay-muted-foreground); }
    .get-started { font-size:14px; color:var(--icpay-primary); background:none; border:none; cursor:pointer; font-weight:500; }
    .get-started:hover { text-decoration:underline; }
    .muted { color:var(--icpay-muted-foreground); }
  </style>`;
}

export function renderPayWithContent(opts: PayWithOptions): TemplateResult {
  const formatTokenAmount = (val: string | number): string => formatTokenAmountThirdwebStyle(val);
  return html`
    <div class="header">
      <button class="back-button" @click=${opts.onBack}>‹</button>
      <h1 class="title">Pay with</h1>
    </div>
    ${opts.isLoading ? html`
      <div class="muted">Loading your balances…</div>
    ` : (opts.error ? html`
      <div style="color:var(--icpay-error-text)">${opts.error}</div>
    ` : html`
      <div class="currency-list">
        ${(() => {
          const sufficient = (opts.balances || [])
            .filter(b => b.hasSufficientBalance === true || b.hasSufficientBalance === undefined)
            .sort(byUsdDesc);
          return sufficient.length > 0 ? html`
            ${sufficient.map((b) => {
              const sym = (b.ledgerSymbol || '').toUpperCase();
              const iconClass = b.logoUrl ? '' : (sym === 'ETH' ? 'eth-icon' : (sym === 'USDC' ? 'usdc-icon' : (sym === 'USDT' ? 'usdt-icon' : '')));
              return html`
                <div class="currency-item" @click=${() => opts.onSelect((b as any).tokenShortcode || b.ledgerSymbol)}>
                  <div class="currency-icon ${iconClass}">
                    ${b.logoUrl
                      ? html`<img src="${b.logoUrl}" alt="${sym} logo" style="width:100%;height:100%;object-fit:fill" />`
                      : html`<span>${sym.slice(0,1)}</span>`}
                  </div>
                  <div class="currency-info">
                    <div class="currency-name">${b.ledgerName}</div>
                    <div class="currency-network">${b.chainName || ''}</div>
                  </div>
                  <div class="currency-balance">
                    <div class="balance-amount">${formatTokenAmount(b.formattedBalance)} ${sym}</div>
                    <div class="balance-available">$${toUsd(b).toFixed(2)}</div>
                  </div>
                </div>
              `;
            })}
          ` : html`<div class="muted" style="margin-bottom:8px">You have no balances on verified tokens.</div>`;
        })()}

        ${(() => {
          const insufficient = (opts.balances || [])
            .filter(b => b.hasSufficientBalance === false)
            .sort(byUsdDesc);
          return insufficient.length > 0 ? html`
            ${insufficient.map((b) => {
              const sym = (b.ledgerSymbol || '').toUpperCase();
              const iconClass = b.logoUrl ? '' : (sym === 'ETH' ? 'eth-icon' : (sym === 'USDC' ? 'usdc-icon' : (sym === 'USDT' ? 'usdt-icon' : '')));
              return html`
                <div class="currency-item" disabled title="Insufficient balance">
                  <div class="currency-icon ${iconClass}">
                    ${b.logoUrl
                      ? html`<img src="${b.logoUrl}" alt="${sym} logo" style="width:100%;height:100%;object-fit:fill" />`
                      : html`<span>${sym.slice(0,1)}</span>`}
                  </div>
                  <div class="currency-info">
                    <div class="currency-name">${b.ledgerName}</div>
                    <div class="currency-network">${b.chainName || ''}</div>
                  </div>
                  <div class="currency-balance">
                    <div class="balance-amount">need ${b.requiredAmountFormatted || '--'}</div>
                    <div class="balance-available">${formatTokenAmount(b.formattedBalance)} ${sym} available</div>
                  </div>
                </div>
              `;
            })}
          ` : null;
        })()}
      </div>
    `)}
    <div class="footer">
      <span class="need-wallet">Need a wallet?</span>
      <button class="get-started" @click=${() => { try { window.open('https://internetcomputer.org/wallets','_blank','noopener,noreferrer'); } catch {} }}>Get started</button>
    </div>
  `;
}


