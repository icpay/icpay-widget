import { html, TemplateResult } from 'lit';
import type { WalletBalanceEntry } from '../../utils/balances';
import { renderPayWithStyles, renderPayWithContent } from './shared/pay-with';

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

  return html`
    <div style="position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0, 0, 0, 0.5);z-index:10001">
      ${renderPayWithStyles()}
      <div class="modal">
        ${renderPayWithContent({
          isLoading: opts.isLoading,
          error: opts.error,
          balances: opts.balances,
          onBack: opts.onClose,
          onSelect: opts.onSelect
        })}
      </div>
    </div>
  `;
}



