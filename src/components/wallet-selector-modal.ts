import { html, TemplateResult } from 'lit';

// Embedded icon for NFID provider (data URL)
const NFID_ICON_DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAACXBIWXMAAAsTAAALEwEAmpwYAAAE9GlUWHRYTUw6Y29tLmFkb2JlLnhtcAAAAAAAPD94cGFja2V0IGJlZ2luPSLvu78i iglkPSJXNU0wTXBDZWhpSHpyZVN6TlRjemtjOWQiPz4gPHg6eG1wbWV0YSB4bWxuczp4PSJhZG9iZTpuczptZXRhLyIgeDp4bXB0az0iQWRvYmUgWE1QIENvcmUgOS4xLWMwMDIgNzkuZGJhM2RhM2I1LCAyMDIzLzEyLzE1LTEwOjQyOjM3ICAgICAgICAiPiA8cmRmOlJERiB4bWxuczpypmY9Imh0dHA6Ly93d3cudzMub3JnLzE5OTkvMDIvMjItcmRmLXN5bnRheC1ucyMiPiA8cmRmOkRlc2NyaXB0aW9uIHJkZjphYm91dD0iIiB4bWxuczp4bXA9Imh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC8iIHhtbG5zOmRjPSJodHRwOi8vcHVybC5vcmcvZGMvZWxlbWVudHMvMS4xLyIgeG1sbnM6cGhvdG9zaG9wPSJodHRwOi8vbnMuYWRvYmUuY29tL3Bob3Rvc2hvcC8xLjAvIiB4bWxuczp4bXBNTT0iaHR0cDovL25zLmFkb2JlLmNvbS94YXAvMS4wL21tLyIgeG1sbnM6c3RFdnQ9Imh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC9zVHlwZS9SZXNvdXJjZUV2ZW50IyIgeG1wOkNyZWF0b3JUb29sPSJBZG9iZSBQaG90b3Nob3AgMjUuNyAoTWFjaW50b3NoKSIgeG1wOkNyZWF0ZURhdGU9IjIwMjUtMDktMDRUMTc6MTk6NDErMDI6MDAiIHhtcDpNb2RpZnlEYXRlPSIyMDI1LTA5LTA0VDE3OjIzOjU5KzAyOjAwIiB4bXA6TWV0YWRhdGFEYXRlPSIyMDI1LTA5LTA0VDE3OjIzOjU5KzAyOjAwIiBkYzpmb3JtYXQ9ImltYWdlL3BuZyIgcGhvdG9zaG9wOkNvbG9yTW9kZT0iMyIgeG1wTU06SW5zdGFuY2VJRD0ieG1wLmlpZDo1YTMxZThhMi05MzVkLTRkY2YtOTk0Mi05NjgxZWE5MTQ0MDgiIHhtcE1NOkRvY3VtZW50SUQ9InhtcC5kaWQ6NWEzMWU4YTItOTM1ZC00ZGNmLTk5NDItOTY4MWVhOTE0NDA4IiB4bXBNTTpPcmlnaW5hbERvY3VtZW50SUQ9InhtcC5kaWQ6NWEzMWU4YTItOTM1ZC00ZGNmLTk5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';

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
  // Optional onramp (credit card) entry at the end
  onCreditCard?: () => void;
  creditCardLabel?: string;
  showCreditCard?: boolean;
  creditCardTooltip?: string | null;
};

export function renderWalletSelectorModal(opts: Options & { oisyReadyToPay?: boolean; onOisyPay?: () => void }): TemplateResult | null {
  if (!opts.visible) return null as any;
  const { wallets, onSelect, onClose, isConnecting } = opts;
  const normalizedWallets = wallets.map(w => {
    const id = (w.id || '').toLowerCase();
    return {
      ...w,
      // Force NFID to use embedded icon; others keep provided icon
      icon: id === 'nfid' ? NFID_ICON_DATA_URL : (w.icon ?? null),
    };
  });
  // onramp-start: Temporarily disable Credit Card (Transak) option in wallet selector
  const creditCardSection: TemplateResult | null = null;
  /*
  // Original credit card section (re-enable by replacing `${creditCardSection}` with this block):
  <div style="margin:12px 0;height:1px;background:rgba(255,255,255,0.08)"></div>
  <div style="display:flex;flex-direction:column;gap:6px">
    <button
      @click=${() => { if (opts.onCreditCard) opts.onCreditCard(); }}
      style="width:100%;padding:12px 16px;background:linear-gradient(135deg,#3b82f6 0%,#10b981 100%);border:1px solid rgba(255,255,255,0.15);border-radius:8px;color:#fff;text-align:center;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;gap:10px">
      <span>💳</span>
      <span style="font-weight:600">${opts.creditCardLabel || 'Pay with credit card'}</span>
    </button>
    ${opts.creditCardTooltip ? html`<div style="font-size:12px;color:#f5d78a;text-align:center">${opts.creditCardTooltip}</div>` : null}
  </div>
  */
  // onramp-end
  return html`
    <div style="position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.5);z-index:10000">
      <div style="background:#1f2937;border-radius:12px;padding:24px;max-width:400px;width:90%;border:1px solid rgba(255,255,255,0.1);position:relative">
        <button @click=${onClose} style="position:absolute;top:16px;right:16px;width:32px;height:32px;display:flex;align-items:center;justify-content:center;color:#9ca3af;cursor:pointer;border:none;background:transparent;font-size:20px">✕</button>
        ${opts.oisyReadyToPay ? null : html`<h3 style="color:#fff;margin:0 48px 16px 0;font-size:18px;font-weight:600">Choose Wallet</h3>`}
        <div style="display:flex;flex-direction:column;gap:8px">
          ${opts.oisyReadyToPay ? html`
            <button
              @click=${() => { if (opts.onOisyPay) opts.onOisyPay(); }}
              style="width:100%;padding:12px 16px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:8px;color:#fff;text-align:left;cursor:pointer;font-size:14px;display:flex;align-items:center;gap:12px;justify-content:center">
              Pay with OISY
            </button>
          ` : normalizedWallets.map(w => {
            const id = (w.id || '').toLowerCase();
            const displayName = getWalletFriendlyName(w.id, w.label);
            const mainButton = html`
              <button
                @click=${() => onSelect(w.id)}
                style="width:100%;padding:12px 16px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:8px;color:#fff;text-align:left;cursor:pointer;font-size:14px;opacity:${isConnecting?0.5:1};display:flex;align-items:center;gap:12px">
                ${w.icon ? html`
                  <div style="width:48px;height:48px;display:flex;align-items:center;justify-content:center">
                    <img src="${sanitizeDataUrl(w.icon)}" alt="${displayName} logo" style="width:40px;height:40px;object-fit:cover;border-radius:12px" />
                  </div>
                ` : html`
                  <div style="width:48px;height:48px;background:linear-gradient(135deg,#3b82f6 0%,#8b5cf6 100%);border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:bold">
                    ${displayName}
                  </div>
                `}
                <div><div style="font-weight:500">${displayName}</div></div>
              </button>`;
            if (id === 'ii') {
              return html`
                <div style="display:flex;gap:8px;align-items:center;width:100%">
                  ${mainButton}
                  <button
                    @click=${() => { try { window.open('https://identity.ic0.app/','_blank','noopener,noreferrer'); } catch {} }}
                    title="Use a different Internet Identity"
                    aria-label="Use a different Internet Identity"
                    style="width:56px;height:72px;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.15);border-radius:8px;color:#9ca3af;cursor:pointer;">
                    <span style="font-size:20px" aria-hidden="true">🔄</span>
                  </button>
                </div>`;
            }
            return html`<div style="width:100%">${mainButton}</div>`;
          })}
        </div>
        ${creditCardSection}
      </div>
    </div>
  `;
}


