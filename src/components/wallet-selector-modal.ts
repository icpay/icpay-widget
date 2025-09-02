import { html, TemplateResult } from 'lit';

export type WalletEntry = { id: string; label: string; icon?: string | null };

type Options = {
  visible: boolean;
  wallets: WalletEntry[];
  isConnecting?: boolean;
  onSelect: (walletId: string) => void;
  onClose: () => void;
};

export function renderWalletSelectorModal(opts: Options): TemplateResult | null {
  if (!opts.visible) return null as any;
  const { wallets, onSelect, onClose, isConnecting } = opts;
  return html`
    <div style="position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.5);z-index:10000">
      <div style="background:#1f2937;border-radius:12px;padding:24px;max-width:400px;width:90%;border:1px solid rgba(255,255,255,0.1);position:relative">
        <button @click=${onClose} style="position:absolute;top:16px;right:16px;width:32px;height:32px;display:flex;align-items:center;justify-content:center;color:#9ca3af;cursor:pointer;border:none;background:transparent;font-size:20px">✕</button>
        <h3 style="color:#fff;margin:0 48px 16px 0;font-size:18px;font-weight:600">Choose Wallet</h3>
        <div style="display:flex;flex-direction:column;gap:8px">
          ${wallets.map(w => html`
            <button
              @click=${() => onSelect(w.id)}
              style="width:100%;padding:12px 16px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:8px;color:#fff;text-align:left;cursor:pointer;font-size:14px;opacity:${isConnecting?0.5:1};display:flex;align-items:center;gap:12px">
              ${w.icon ? html`
                <div style="width:48px;height:48px;display:flex;align-items:center;justify-content:center">
                  <img src="${w.icon}" alt="${w.label} logo" style="width:40px;height:40px;object-fit:cover;border-radius:12px;border:1px solid rgba(156,163,175,0.3)" />
                </div>
              ` : html`
                <div style="width:48px;height:48px;background:linear-gradient(135deg,#3b82f6 0%,#8b5cf6 100%);border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:bold;border:1px solid rgba(156,163,175,0.3)">
                  ${(w.id || '?').charAt(0).toUpperCase()}
                </div>
              `}
              <div><div style="font-weight:500">${w.label}</div></div>
            </button>
          `)}
        </div>
      </div>
    </div>
  `;
}


