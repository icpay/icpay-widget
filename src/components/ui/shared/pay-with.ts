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
    .modal { background-color:#1a1a1a; border-radius:24px; width:100%; max-width:420px; padding:24px; color:#fff; display:flex; flex-direction:column; border:1px solid #333; height:460px; }
    .header { display:flex; align-items:center; margin-bottom:20px; padding-bottom:20px; border-bottom:1px solid #333; flex-shrink:0; }
    .back-button { background:none; border:none; color:#fff; font-size:24px; cursor:pointer; padding:0; margin-right:16px; }
    .title { font-size:20px; font-weight:600; flex:1; text-align:center; margin-right:40px; }
    .currency-list { display:flex; flex-direction:column; gap:0; overflow-y:auto; flex:1; margin-bottom:0; }
    .currency-item { display:flex; align-items:center; padding:16px 12px; cursor:pointer; transition:background-color 0.2s; border-radius:12px; }
    .currency-item:hover { background-color:#2a2a2a; }
    .currency-item[disabled] { opacity:0.6; cursor:not-allowed; }
    .currency-icon { width:48px; height:48px; border-radius:50%; margin-right:16px; display:flex; align-items:center; justify-content:center; font-size:28px; flex-shrink:0; overflow:hidden; }
    .eth-icon { background:linear-gradient(135deg,#627eea 0%, #8a9bff 100%); }
    .usdc-icon { background:linear-gradient(135deg,#2775ca 0%, #4da4ff 100%); }
    .usdt-icon { background:linear-gradient(135deg,#26a17b 0%, #50af95 100%); }
    .currency-info { flex:1; }
    .currency-name { font-size:16px; font-weight:500; margin-bottom:4px; }
    .currency-network { font-size:14px; color:#888; }
    .currency-balance { text-align:right; }
    .balance-amount { font-size:16px; font-weight:500; margin-bottom:4px; }
    .balance-available { font-size:14px; color:#888; }
    .footer { display:flex; justify-content:space-between; align-items:center; margin-top:16px; padding-top:16px; border-top:1px solid #333; flex-shrink:0; }
    .need-wallet { font-size:14px; color:#888; }
    .get-started { font-size:14px; color:#0066ff; background:none; border:none; cursor:pointer; font-weight:500; }
    .get-started:hover { text-decoration:underline; }
    .muted { color:#9ca3af; }
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
      <div style="color:#fca5a5">${opts.error}</div>
    ` : html`
      <div class="currency-list">
        ${(() => {
          const sufficient = (opts.balances || [])
            .filter(b => b.hasSufficientBalance === true || b.hasSufficientBalance === undefined)
            .sort(byUsdDesc);
          return sufficient.length > 0 ? html`
            ${sufficient.map((b) => {
              const sym = (b.ledgerSymbol || '').toUpperCase();
              const iconClass = sym === 'ETH' ? 'eth-icon' : (sym === 'USDC' ? 'usdc-icon' : (sym === 'USDT' ? 'usdt-icon' : ''));
              return html`
                <div class="currency-item" @click=${() => opts.onSelect(b.ledgerSymbol)}>
                  <div class="currency-icon ${iconClass}">
                    <span>${sym.slice(0,1)}</span>
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
          ` : html`<div class="muted" style="margin-bottom:8px">You have no balances on verified ledgers.</div>`;
        })()}

        ${(() => {
          const insufficient = (opts.balances || [])
            .filter(b => b.hasSufficientBalance === false)
            .sort(byUsdDesc);
          return insufficient.length > 0 ? html`
            ${insufficient.map((b) => {
              const sym = (b.ledgerSymbol || '').toUpperCase();
              const iconClass = sym === 'ETH' ? 'eth-icon' : (sym === 'USDC' ? 'usdc-icon' : (sym === 'USDT' ? 'usdt-icon' : ''));
              return html`
                <div class="currency-item" disabled title="Insufficient balance">
                  <div class="currency-icon ${iconClass}">
                    <span>${sym.slice(0,1)}</span>
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


