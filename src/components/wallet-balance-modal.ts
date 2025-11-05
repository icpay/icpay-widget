import { html, TemplateResult } from 'lit';

export type WalletBalanceEntry = {
  ledgerId: string;
  ledgerName: string;
  ledgerSymbol: string;
  canisterId: string;
  balance: string; // raw smallest units
  formattedBalance: string; // human readable
  decimals: number;
  currentPrice?: number;
  lastUpdated: Date;
};

type Options = {
  visible: boolean;
  isLoading: boolean;
  error?: string | null;
  balances: WalletBalanceEntry[];
  onSelect: (symbol: string) => void;
  onClose: () => void;
};

export function renderWalletBalanceModal(opts: Options): TemplateResult | null {
  if (!opts.visible) return null as any;

  const nonZero = (opts.balances || []).filter((b) => {
    const v = Number(b.formattedBalance || '0');
    return isFinite(v) && v > 0;
  });

  const zero = (opts.balances || []).filter((b) => {
    const v = Number(b.formattedBalance || '0');
    return !isFinite(v) || v <= 0;
  });

  return html`
    <div style="position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.5);z-index:10001">
      <style>
        .row { display:flex; align-items:center; justify-content:space-between; gap:12px; width:100%; }
        .sym { font-weight:600; color:#fff; }
        .amt { color:#9ca3af; font-variant-numeric: tabular-nums; }
        .btn { width:100%; padding:12px 16px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); border-radius:8px; color:#fff; text-align:left; cursor:pointer; font-size:14px; display:flex; align-items:center; gap:12px; }
        .btn:disabled { opacity:0.6; cursor:not-allowed; }
        .divider { margin:12px 0; height:1px; background:rgba(255,255,255,0.08); }
        .muted { color:#9ca3af; }
      </style>
      <div style="background:#1f2937;border-radius:12px;padding:24px;max-width:420px;width:90%;border:1px solid rgba(255,255,255,0.1);position:relative">
        <button @click=${opts.onClose} style="position:absolute;top:16px;right:16px;width:32px;height:32px;display:flex;align-items:center;justify-content:center;color:#9ca3af;cursor:pointer;border:none;background:transparent;font-size:20px">✕</button>
        <h3 style="color:#fff;margin:0 48px 16px 0;font-size:18px;font-weight:600">Select a token to pay</h3>

        ${opts.isLoading ? html`
          <div class="muted">Loading your balances…</div>
        ` : (opts.error ? html`
          <div style="color:#fca5a5">${opts.error}</div>
        ` : html`
          ${nonZero.length > 0 ? html`
            <div style="display:flex;flex-direction:column;gap:8px">
              ${nonZero.map((b) => html`
                <button class="btn" @click=${() => opts.onSelect(b.ledgerSymbol)}>
                  <div class="row">
                    <div class="sym">${b.ledgerName} <span class="muted" style="margin-left:6px">${b.ledgerSymbol}</span></div>
                    <div class="amt">${b.formattedBalance}</div>
                  </div>
                </button>
              `)}
            </div>
          ` : html`
            <div class="muted" style="margin-bottom:8px">You have no balances on verified ledgers.</div>
          `}

          ${zero.length > 0 ? html`
            <div class="divider"></div>
            <div class="muted" style="margin-bottom:8px">Other tokens</div>
            <div style="display:flex;flex-direction:column;gap:8px">
              ${zero.map((b) => html`
                <button class="btn" disabled title="No balance" @click=${() => opts.onSelect(b.ledgerSymbol)}>
                  <div class="row">
                    <div class="sym">${b.ledgerName} <span class="muted" style="margin-left:6px">${b.ledgerSymbol}</span></div>
                    <div class="amt">0</div>
                  </div>
                </button>
              `)}
            </div>
          ` : null}
        `)}
      </div>
    </div>
  `;
}


