import { html, TemplateResult } from 'lit';

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
      icon: w.icon ?? null,
    };
  });
  const creditCardSection: TemplateResult | null = (opts.showCreditCard && opts.onCreditCard)
    ? html`
      <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:12px">
        <button
          @click=${() => { if (opts.onCreditCard) opts.onCreditCard(); }}
          style="width:100%;padding:12px 16px;background:linear-gradient(135deg,#3b82f6 0%,#10b981 100%);border:1px solid rgba(255,255,255,0.15);border-radius:8px;color:#fff;text-align:center;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;gap:10px">
          <span>💳</span>
          <span style="font-weight:600">${opts.creditCardLabel || 'Pay with credit card'}</span>
        </button>
        ${opts.creditCardTooltip ? html`<div style="font-size:12px;color:#f5d78a;text-align:center">${opts.creditCardTooltip}</div>` : null}
      </div>
      <div style="margin:12px 0;height:1px;background:rgba(255,255,255,0.08)"></div>
    `
    : null;
  return html`
    <div style="position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.5);z-index:10000">
      <style>
        .icpay-w-8 { width: 2rem; }
        .icpay-h-8 { height: 2rem; }
      </style>
      <div style="background:#1f2937;border-radius:12px;padding:24px;max-width:400px;width:90%;border:1px solid rgba(255,255,255,0.1);position:relative">
        <button @click=${onClose} style="position:absolute;top:16px;right:16px;width:32px;height:32px;display:flex;align-items:center;justify-content:center;color:#9ca3af;cursor:pointer;border:none;background:transparent;font-size:20px">✕</button>
        ${opts.oisyReadyToPay ? null : html`<h3 style="color:#fff;margin:0 48px 16px 0;font-size:18px;font-weight:600">Connect or pay</h3>`}
        ${creditCardSection}
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
                    <img src="${sanitizeDataUrl(w.icon)}" alt="${displayName} logo" class="icpay-w-8 icpay-h-8" style="object-fit:contain" />
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
      </div>
    </div>
  `;
}


