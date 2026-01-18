import { html, TemplateResult } from 'lit';
import type { WalletBalanceEntry } from '../../utils/balances';
import { renderPayWithStyles, renderPayWithContent } from './shared/pay-with';

// Helper to detect current theme mode
function getThemeMode(themeOverride?: 'light' | 'dark'): 'light' | 'dark' {
  // If theme is explicitly provided, use it
  if (themeOverride === 'light' || themeOverride === 'dark') return themeOverride;
  
  if (typeof document === 'undefined') return 'light';
  // Check for ICPay-specific theme attribute first
  const icpayTheme = document.documentElement.getAttribute('data-icpay-theme');
  if (icpayTheme === 'light' || icpayTheme === 'dark') return icpayTheme;
  // Fallback to generic data-theme
  const theme = document.documentElement.getAttribute('data-theme');
  if (theme === 'light' || theme === 'dark') return theme;
  // Default to light
  return 'light';
}

type Options = {
  visible: boolean;
  isLoading: boolean;
  error?: string | null;
  balances: WalletBalanceEntry[];
  onSelect: (symbol: string) => void;
  onClose: () => void;
  theme?: 'light' | 'dark'; // Theme mode from widget config
};

export function renderWalletBalanceModal(opts: Options): TemplateResult | null {
  if (!opts.visible) return null as any;

  const themeMode = getThemeMode(opts.theme);
  return html`
    <div class="icpay-modal-overlay" data-theme="${themeMode}" style="position:fixed !important;inset:0 !important;display:flex;align-items:center;justify-content:center;background:rgba(0, 0, 0, 0.5);z-index:99999 !important;transform:none !important;">
      <style>
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
          --icpay-error-text: #dc2626;
        }
        /* Dark mode */
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
          --icpay-error-text: #f87171;
        }
        .icpay-modal-overlay {
          position: fixed !important;
          inset: 0 !important;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(0, 0, 0, 0.5);
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
      </style>
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



