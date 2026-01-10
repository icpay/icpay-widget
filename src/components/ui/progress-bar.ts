import { LitElement, html, css } from 'lit';
import { applyThemeVars } from '../../styles';
import { customElement, property, state } from 'lit/decorators.js';

// Debug logger utility (mirrors other widgets)
function debugLog(debug: boolean, message: string, data?: any): void {
  if (debug) {
    if (data !== undefined) {
      console.log(message, data);
    } else {
      console.log(message);
    }
  }
}

type StepStatus = 'pending' | 'loading' | 'completed' | 'error';

type Step = {
  key: string;
  label: string;
  tooltip: string;
  status: StepStatus;
  timestamp?: string;
  errorMessage?: string;
};

const DEFAULT_STEPS: Step[] = [
  {
    key: 'wallet',
    label: 'Connect wallet',
    tooltip: 'Awaiting wallet connection',
    status: 'pending'
  },
  {
    key: 'await',
    label: 'Awaiting confirmation',
    tooltip: 'Awaiting wallet signature',
    status: 'pending'
  },
  {
    key: 'transfer',
    label: 'Transferring funds',
    tooltip: 'Awaiting transfer to merchant',
    status: 'pending'
  },
  {
    key: 'verify',
    label: 'Verifying payment',
    tooltip: 'Please wait while we verify',
    status: 'pending'
  }
];


@customElement('icpay-progress-bar')
export class ICPayProgressBar extends LitElement {
  static styles = css`
    :host {
      display: block;
      font-family: var(--icpay-font, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
      color: var(--icpay-text-primary, #ffffff);

      /* Theme variables for better composability */
      --icpay-bg-primary: #1f2937;
      --icpay-bg-secondary: rgba(255, 255, 255, 0.05);
      --icpay-bg-secondary-hover: rgba(255, 255, 255, 0.08);
      --icpay-bg-success: rgba(16, 185, 129, 0.1);
      --icpay-bg-error: rgba(239, 68, 68, 0.1);

      --icpay-text-primary: #ffffff;
      --icpay-text-secondary: #9ca3af;
      --icpay-text-muted: #6b7280;

      --icpay-border-primary: rgba(255, 255, 255, 0.1);
      --icpay-border-secondary: rgba(255, 255, 255, 0.2);
      --icpay-border-success: rgba(16, 185, 129, 0.3);
      --icpay-border-error: rgba(239, 68, 68, 0.3);

      --icpay-accent-primary: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%);
      --icpay-accent-success: linear-gradient(135deg, #10b981 0%, #059669 100%);
      --icpay-accent-error: #ef4444;

      --icpay-shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05);
      --icpay-shadow-md: 0 4px 6px rgba(0, 0, 0, 0.1);
      --icpay-shadow-lg: 0 10px 15px rgba(0, 0, 0, 0.1);
      --icpay-shadow-xl: 0 20px 25px rgba(0, 0, 0, 0.1);

      --icpay-radius-sm: 6px;
      --icpay-radius-md: 8px;
      --icpay-radius-lg: 12px;
      --icpay-radius-xl: 16px;

      --icpay-spacing-xs: 4px;
      --icpay-spacing-sm: 8px;
      --icpay-spacing-md: 12px;
      --icpay-spacing-lg: 16px;
      --icpay-spacing-xl: 24px;
    }

    .modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      backdrop-filter: blur(8px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      opacity: 0;
      visibility: hidden;
      transition: opacity 0.3s ease, visibility 0.3s ease;
    }

    .modal-content {
      transition: opacity 0.4s ease, transform 0.4s ease;
      opacity: 1;
      transform: translateY(0);
      flex: 1;
    }

    .modal-content.transitioning {
      opacity: 0;
      transform: translateY(20px);
    }

    .wallet-selector-container {
      width: 100%;
    }

    .wallet-selector-title {
      color: var(--icpay-text-primary);
      margin: 0 48px var(--icpay-spacing-lg) 0;
      font-size: 18px;
      font-weight: 600;
    }

    .wallet-options {
      display: flex;
      flex-direction: column;
      gap: var(--icpay-spacing-sm);
    }

    .wallet-option {
      width: 100%;
      padding: 12px 16px;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 8px;
      display: flex;
      align-items: center;
      gap: 12px;
      cursor: pointer;
      transition: all 0.3s ease;
      box-sizing: border-box;
    }

    .wallet-option:hover {
      background: rgba(255, 255, 255, 0.08);
      border-color: rgba(255, 255, 255, 0.2);
    }

    .wallet-icon {
      width: 48px;
      height: 48px;
      border-radius: 12px;
      background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .wallet-icon img {
      width: 40px;
      height: 40px;
      object-fit: cover;
      border-radius: 12px;
    }

    .wallet-icon-placeholder {
      color: #ffffff;
      font-size: 12px;
      font-weight: bold;
    }

    .wallet-label {
      font-weight: 500;
      font-size: 14px;
      color: #ffffff;
    }

    .modal-overlay.active {
      opacity: 1;
      visibility: visible;
    }

    .modal-container {
      background: #1a1a1a;
      border: 1px solid #333;
      border-radius: 24px;
      padding: 24px;
      max-width: 420px;
      width: 100%;
      height: 460px;
      box-shadow: var(--icpay-shadow-xl);
      transform: translateY(20px);
      transition: transform 0.3s ease;
      position: relative;
      display: flex;
      flex-direction: column;
    }

    .modal-overlay.active .modal-container {
      transform: translateY(0);
    }

    .close-button {
      position: absolute;
      top: var(--icpay-spacing-lg);
      right: var(--icpay-spacing-lg);
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--icpay-text-secondary);
      cursor: pointer;
      border: none;
      background: transparent;
      font-size: 20px;
      transition: all 0.2s;
      z-index: 10;
    }

    .close-button:hover {
      color: var(--icpay-text-primary);
    }

    .progress-header {
      display:flex;
      align-items:center;
      margin-bottom: 20px;
      padding-bottom: 20px;
      border-bottom: 1px solid #333;
      flex-shrink: 0;
    }
    .progress-title {
      font-size: 20px;
      font-weight: 600;
      margin: 0;
      color: #ffffff;
      flex: 1;
      text-align: center;
      margin-right: 40px;
    }
    .progress-spacer { width:24px; display:inline-block; margin-right:16px; }
    .progress-subtitle { color: var(--icpay-text-secondary); font-size: 14px; }
    .progress-steps {
      margin-bottom: var(--icpay-spacing-xl);
      display: flex;
      flex-direction: column;
      gap: 24px;
      overflow-y: auto;
      flex: 1;
    }
    .step {
      width: 100%;
      padding: 16px;
      background: #252525;
      border: none;
      border-radius: 12px;
      display: flex;
      align-items: flex-start;
      gap: 16px;
      transition: all 0.3s ease;
      cursor: default;
      box-sizing: border-box;
    }
    .step.active {
      background: #2a2a2a;
    }
    .step.completed {
      opacity: 1;
      background: #252525;
    }

    .step.error {
      opacity: 1;
      background: rgba(239, 68, 68, 0.1);
      border-color: rgba(239, 68, 68, 0.3);
    }
    .step-icon {
      width: 40px;
      height: 40px;
      border-radius: 0;
      background: transparent;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.3s ease;
      position: relative;
      flex-shrink: 0;
    }
    .step.active .step-icon { }
    .step.completed .step-icon { }

    .step.error .step-icon { background: transparent; }
    .step-icon svg {
      width: 20px;
      height: 20px;
      stroke: var(--icpay-text-primary);
      transition: stroke 0.3s ease;
    }
    .step-content {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 0;
    }
    .step-title {
      font-weight: 500;
      font-size: 16px;
      color: #ffffff;
      transition: color 0.3s ease;
      margin: 0;
    }
    .step-description {
      font-size: 14px;
      color: #888;
      margin: 0;
    }

    .step-error-message {
      font-size: 11px;
      color: #fca5a5;
      margin-top: 4px;
      padding: 4px 8px;
      background: rgba(239, 68, 68, 0.1);
      border-radius: 4px;
      border-left: 3px solid #ef4444;
    }
    /* Spinner exactly like in design: wrapper + ::before ring */
    .spinner {
      width: 40px;
      height: 40px;
      margin-right: 0;
      position: relative;
      flex-shrink: 0;
    }
    .spinner::before {
      content: '';
      position: absolute;
      width: 100%;
      height: 100%;
      border: 3px solid #333;
      border-top: 3px solid #0066ff;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      box-sizing: border-box;
    }
    /* Completed: replace ring with filled green circle + tick */
    .step.completed .spinner::before { display: none; }
    .step.completed .spinner::after {
      content: '✓';
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background-color: #10b981;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #ffffff;
      font-size: 24px;
      font-weight: bold;
      box-sizing: border-box;
    }

    /* Error icon (pastel red) like success's green circle */
    .error-x {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background-color: #f87171; /* pastel red */
      display: flex;
      align-items: center;
      justify-content: center;
      color: #ffffff;
      font-size: 20px;
      font-weight: bold;
      box-sizing: border-box;
    }

    /* Completed icon to match design proportions */
    .complete-icon {
      width: 40px;
      height: 40px;
      position: relative;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .complete-icon::before {
      content: '';
      position: absolute;
      inset: 0;
      border: 3px solid #333;
      border-radius: 50%;
      background: #252525;
      box-sizing: border-box;
    }
    .complete-icon svg {
      position: relative;
      width: 20px;
      height: 20px;
      stroke: #ffffff;
      display: block;
    }

    .error-container {
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-direction: column;
      text-align: center;
    }

    .error-icon-large {
      width: 64px;
      height: 64px;
      margin: 0 auto var(--icpay-spacing-lg);
      background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
      border-radius: var(--icpay-radius-xl);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .error-icon-large svg {
      width: 32px;
      height: 32px;
      stroke: var(--icpay-text-primary);
      stroke-width: 2;
    }

    .error-title {
      font-size: 20px;
      font-weight: 600;
      margin-bottom: var(--icpay-spacing-sm);
      color: var(--icpay-text-primary);
    }

    .error-message-text {
      color: var(--icpay-text-secondary);
      margin-bottom: var(--icpay-spacing-xl);
      font-size: 14px;
    }

    .error-details {
      background: rgba(239, 68, 68, 0.1);
      border: 1px solid rgba(239, 68, 68, 0.3);
      border-radius: var(--icpay-radius-md);
      padding: var(--icpay-spacing-lg);
      margin-bottom: var(--icpay-spacing-xl);
      text-align: left;
    }

    .error-detail-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: var(--icpay-spacing-sm);
    }

    .error-detail-item:last-child {
      margin-bottom: 0;
    }

    .error-detail-label {
      font-size: 14px;
      color: var(--icpay-text-secondary);
      font-weight: 500;
    }

    .error-detail-value {
      font-size: 14px;
      color: var(--icpay-text-primary);
      font-weight: 600;
    }

    .error-actions {
      display: flex;
      gap: var(--icpay-spacing-sm);
      justify-content: center;
    }

    .insufficient-funds-container {
      width: 100%;
    }

    .payment-summary {
      background: rgba(255, 255, 255, 0.1);
      border-radius: var(--icpay-radius-md);
      padding: var(--icpay-spacing-lg);
      margin-bottom: var(--icpay-spacing-lg);
      text-align: center;
    }

    .payment-amount {
      font-size: 16px;
      font-weight: 600;
      color: var(--icpay-text-primary);
    }

    .error-notification {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid #f59e0b;
      border-radius: var(--icpay-radius-md);
      padding: var(--icpay-spacing-lg);
      margin-bottom: var(--icpay-spacing-xl);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--icpay-spacing-lg);
    }

    .error-content {
      display: flex;
      align-items: center;
      gap: var(--icpay-spacing-md);
      flex: 1;
    }

    .error-icon-small {
      width: 20px;
      height: 20px;
      color: #f59e0b;
      flex-shrink: 0;
    }

    .error-icon-small svg {
      width: 100%;
      height: 100%;
    }

    .error-text {
      font-size: 14px;
      font-weight: 500;
      color: #f59e0b;
    }

    .add-funds-btn {
      background: rgba(255, 255, 255, 0.1);
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: var(--icpay-radius-sm);
      padding: 8px 16px;
      color: var(--icpay-text-primary);
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.3s ease;
      flex-shrink: 0;
    }

    .add-funds-btn:hover {
      background: rgba(255, 255, 255, 0.15);
      border-color: rgba(255, 255, 255, 0.3);
    }

    .error-message {
      display: flex;
      align-items: flex-start;
      gap: var(--icpay-spacing-md);
      padding: var(--icpay-spacing-lg);
      background: var(--icpay-bg-error);
      border: 1px solid var(--icpay-border-error);
      border-radius: var(--icpay-radius-md);
      margin-top: var(--icpay-spacing-sm);
    }

    .error-icon {
      flex-shrink: 0;
      width: 20px;
      height: 20px;
      background: var(--icpay-accent-error);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--icpay-text-primary);
      font-size: 12px;
      font-weight: bold;
    }

    .error-content h4 {
      margin: 0 0 4px 0;
      font-size: 14px;
      font-weight: 600;
      color: var(--icpay-text-primary);
    }

    .error-content p {
      margin: 0;
      font-size: 12px;
      color: #fca5a5;
      line-height: 1.4;
    }

    .success-container { text-align: center; }
    .success-center {
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .success-icon {
      width: 64px;
      height: 64px;
      margin: 0 auto var(--icpay-spacing-lg);
      background: var(--icpay-accent-success);
      border-radius: var(--icpay-radius-xl);
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .success-icon svg {
      width: 32px;
      height: 32px;
      stroke: var(--icpay-text-primary);
      stroke-width: 2;
    }
    .success-title {
      font-size: 20px;
      font-weight: 600;
      margin-bottom: var(--icpay-spacing-sm);
      color: var(--icpay-text-primary);
    }
    .success-message {
      color: var(--icpay-text-secondary);
      margin-bottom: 20px;
      font-size: 14px;
    }
    .success-actions {
      display: flex;
      gap: var(--icpay-spacing-sm);
      justify-content: center;
    }
    .btn {
      padding: 10px 20px;
      border-radius: var(--icpay-radius-md);
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.3s ease;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      gap: var(--icpay-spacing-sm);
    }
    .btn-primary {
      background: var(--icpay-accent-primary);
      color: var(--icpay-text-primary);
      border: none;
    }
    .btn-primary:hover {
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
    }
    .btn-secondary {
      background: transparent;
      color: var(--icpay-text-secondary);
      border: 1px solid var(--icpay-border-primary);
    }
    .btn-secondary:hover {
      background: var(--icpay-bg-secondary);
      border-color: var(--icpay-border-secondary);
      color: var(--icpay-text-primary);
    }

    .confetti {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 1001;
    }

    .confetti-piece {
      position: absolute;
      width: 8px;
      height: 8px;
      background: #0066FF;
      animation: confetti-fall 3s linear forwards;
    }

    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }

    /* legacy spinner removed; unified spinner defined above to match design */

    @keyframes confetti-fall {
      0% {
        transform: translateY(-100vh) rotate(0deg);
        opacity: 1;
      }
      100% {
        transform: translateY(100vh) rotate(720deg);
        opacity: 0;
      }
    }
  `;

  @property({ type: Boolean }) open = false;
  @property({ type: Boolean }) suspended = false;
  @property({ type: Array }) steps: Step[] = DEFAULT_STEPS;
  @property({ type: Number }) amount = 0;
  @property({ type: String }) currency = '';
  @property({ type: String }) ledgerSymbol = '';
  @property({ type: Boolean }) debug = false;
  @state() private activeIndex = 0;
  @state() private completed = false;
  @state() private failed = false;
  @state() private errorMessage: string | null = null;
  @state() private showSuccess = false;
  @state() private showConfetti = false;
  @state() private currentSteps: Step[] = [];
  @state() private currentAmount = 0;
  @state() private currentCurrency = '';
  @state() private currentLedgerSymbol = '';
  @state() private confirmLoadingStartedAt: number | null = null;
  private progressionTimer: number | null = null;
  @state() private currentWalletType: string | null = null;
  @state() private showWalletSelector = false;
  @state() private isTransitioning = false;
  @state() private isOnrampFlow = false;

  @property({ type: Object }) theme?: { primaryColor?: string; secondaryColor?: string };

  connectedCallback(): void {
    super.connectedCallback();
    try { applyThemeVars(this, this.theme as any); } catch {}
    this.currentSteps = [...this.steps];

    // Initialize dynamic values from properties
    this.currentAmount = this.amount;
    this.currentCurrency = this.currency;
    this.currentLedgerSymbol = this.ledgerSymbol;

    // Attach global listeners for ICPay SDK events
    this.attachSDKEventListeners();
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.detachSDKEventListeners();
    this.stopAutomaticProgression();
  }

  protected updated(changed: Map<string, unknown>): void {
    if (changed.has('theme')) {
      try { applyThemeVars(this, this.theme as any); } catch {}
    }
  }

  private attachSDKEventListeners() {
    // Core payment flow events
    window.addEventListener('icpay-sdk-method-start', this.onMethodStart as EventListener);
    window.addEventListener('icpay-sdk-method-success', this.onMethodSuccess as EventListener);
    window.addEventListener('icpay-sdk-method-error', this.onMethodError as EventListener);
    window.addEventListener('icpay-sdk-wallet-cancelled', this.onWalletCancelled as EventListener);
    window.addEventListener('icpay-sdk-wallet-error', this.onWalletError as EventListener);

    // Transaction lifecycle events
    window.addEventListener('icpay-sdk-transaction-created', this.onTransactionCreated as EventListener);
    window.addEventListener('icpay-sdk-transaction-updated', this.onTransactionUpdated as EventListener);
    window.addEventListener('icpay-sdk-transaction-completed', this.onTransactionCompleted as EventListener);
    window.addEventListener('icpay-sdk-transaction-failed', this.onTransactionFailed as EventListener);
    window.addEventListener('icpay-sdk-transaction-mismatched', this.onTransactionMismatched as EventListener);
    // Onramp-specific cue when URL opened in new tab
    window.addEventListener('icpay-onramp-opened', this.onOnrampOpened as EventListener);

    // Additional SDK events
    window.addEventListener('icpay-sdk-error', this.onSDKError as EventListener);
    window.addEventListener('icpay-sdk-wallet-connected', this.onWalletConnected as EventListener);
    window.addEventListener('icpay-sdk-wallet-disconnected', this.onWalletDisconnected as EventListener);
    window.addEventListener('icpay-sdk-balance-check', this.onBalanceCheck as EventListener);
    window.addEventListener('icpay-sdk-ledger-verified', this.onLedgerVerified as EventListener);

    // Custom widget events for better integration
    window.addEventListener('icpay-pay', this.onWidgetPayment as EventListener);
    window.addEventListener('icpay-error', this.onWidgetError as EventListener);
    window.addEventListener('icpay-unlock', this.onWidgetUnlock as EventListener);
    window.addEventListener('icpay-tip', this.onWidgetTip as EventListener);
    window.addEventListener('icpay-donation', this.onWidgetDonation as EventListener);
    window.addEventListener('icpay-coffee', this.onWidgetCoffee as EventListener);
  }

  private detachSDKEventListeners() {
    // Core payment flow events
    window.removeEventListener('icpay-sdk-method-start', this.onMethodStart as EventListener);
    window.removeEventListener('icpay-sdk-method-success', this.onMethodSuccess as EventListener);
    window.removeEventListener('icpay-sdk-method-error', this.onMethodError as EventListener);
    window.removeEventListener('icpay-sdk-wallet-cancelled', this.onWalletCancelled as EventListener);
    window.removeEventListener('icpay-sdk-wallet-error', this.onWalletError as EventListener);

    // Transaction lifecycle events
    window.removeEventListener('icpay-sdk-transaction-created', this.onTransactionCreated as EventListener);
    window.removeEventListener('icpay-sdk-transaction-updated', this.onTransactionUpdated as EventListener);
    window.removeEventListener('icpay-sdk-transaction-completed', this.onTransactionCompleted as EventListener);
    window.removeEventListener('icpay-sdk-transaction-failed', this.onTransactionFailed as EventListener);
    window.removeEventListener('icpay-sdk-transaction-mismatched', this.onTransactionMismatched as EventListener);
    window.removeEventListener('icpay-onramp-opened', this.onOnrampOpened as EventListener);

    // Additional SDK events
    window.removeEventListener('icpay-sdk-error', this.onSDKError as EventListener);
    window.removeEventListener('icpay-sdk-wallet-connected', this.onWalletConnected as EventListener);
    window.removeEventListener('icpay-sdk-wallet-disconnected', this.onWalletDisconnected as EventListener);
    window.removeEventListener('icpay-sdk-balance-check', this.onBalanceCheck as EventListener);
    window.removeEventListener('icpay-sdk-ledger-verified', this.onLedgerVerified as EventListener);

    // Custom widget events
    window.removeEventListener('icpay-pay', this.onWidgetPayment as EventListener);
    window.removeEventListener('icpay-error', this.onWidgetError as EventListener);
    window.removeEventListener('icpay-unlock', this.onWidgetUnlock as EventListener);
    window.removeEventListener('icpay-tip', this.onWidgetTip as EventListener);
    window.removeEventListener('icpay-donation', this.onWidgetDonation as EventListener);
    window.removeEventListener('icpay-coffee', this.onWidgetCoffee as EventListener);
  }

  private onMethodStart = (e: any) => {
    const methodName = e?.detail?.name || '';
    const methodType = e?.detail?.type || '';

    debugLog(this.debug, 'ICPay Progress: Method start event received:', e.detail);

    // Handle different payment methods (top-level starts)
    if (methodName === 'createPayment' || methodName === 'createPaymentUsd' ||
        methodName === 'sendUsd' || methodName === 'pay' ||
        methodName === 'unlock' || methodName === 'tip' ||
        methodName === 'donate' || methodName === 'order') {

      this.open = true;
      this.activeIndex = 0;
      this.completed = false;
      this.failed = false;
      this.errorMessage = null;
      this.showSuccess = false;
      this.showConfetti = false;

      // Do not show an internal wallet selector; parent widgets handle wallet modal
      this.showWalletSelector = false;
      this.isTransitioning = false;

      // Reset all steps to pending
      this.currentSteps = this.currentSteps.map(step => ({ ...step, status: 'pending' as StepStatus }));

      // Step 0: Wallet connect loading (rename/setup if onramp)
      if (methodType === 'onramp') {
        this.isOnrampFlow = true;
        // Remap step labels/tooltips for onramp flow
        const map: Record<string, { label: string; tooltip: string }> = {
          wallet: { label: 'Payment initiated', tooltip: 'Please pay in the new tab' },
          await: { label: 'Onramp process started', tooltip: 'Verifying funds with provider' },
          transfer: { label: 'Funds received', tooltip: 'Payment in progress' },
          verify: { label: 'Payment completed', tooltip: 'Finalizing your payment' },
        };
        this.currentSteps = this.currentSteps.map(s => (map[s.key]
          ? { ...s, label: map[s.key].label, tooltip: map[s.key].tooltip }
          : s));
      }
      this.setLoadingByKey('wallet');

      // Update amount and currency if provided in event
      if (e?.detail?.amount !== undefined) {
        this.currentAmount = e.detail.amount;
        this.amount = e.detail.amount;
        debugLog(this.debug, 'ICPay Progress: Amount updated to:', e.detail.amount);
      }
      if (e?.detail?.currency) {
        this.currentCurrency = e.detail.currency;
        this.currency = e.detail.currency;
        debugLog(this.debug, 'ICPay Progress: Currency updated to:', e.detail.currency);
      }
      if (e?.detail?.ledgerSymbol) {
        this.currentLedgerSymbol = e.detail.ledgerSymbol;
        this.ledgerSymbol = e.detail.ledgerSymbol;
        debugLog(this.debug, 'ICPay Progress: Current state after method start:', {
          activeIndex: this.activeIndex,
          currentAmount: this.currentAmount,
          currentCurrency: this.currentCurrency,
          currentLedgerSymbol: this.currentLedgerSymbol
        });
      }

      // Waiting for wallet confirmation event to proceed
      debugLog(this.debug, 'ICPay Progress: Waiting for wallet confirmation before starting progression');

      this.requestUpdate();
    }

    // Mid-flow granular starts for internal SDK steps (independent of top-level starts)
    if (!this.failed && !this.completed) {
      if (methodName === 'createPaymentX402Usd') {
        // X402 signature step: awaiting confirmation
        this.completeByKey('wallet');
        this.setLoadingByKey('await');
      } else if (methodName === 'sendFundsToLedger') {
        // Regular transfer step (IC or EVM tx): move to transfer
        this.completeByKey('wallet');
        this.completeByKey('await');
        this.setLoadingByKey('transfer');
      } else if (methodName === 'notifyLedgerTransaction') {
        // Start of post-send verification. In X402 this is called after signature (settle start).
        // Ensure we've advanced past await, move to transfer while settlement is being kicked off.
        this.completeByKey('wallet');
        this.completeByKey('await');
        this.setLoadingByKey('transfer');
      }
    }
  };

  private startAutomaticProgression() {
    // Clear any existing progression timer
    if (this.progressionTimer) {
      clearInterval(this.progressionTimer);
    }

    // Start from step 1 (second step) since step 0 is already completed
    this.activeIndex = 1;
    this.updateStepStatus(this.activeIndex, 'loading');

    debugLog(this.debug, 'ICPay Progress: Starting automatic progression from step:', this.activeIndex);

    // Progress through steps every 3 seconds
    this.progressionTimer = setInterval(() => {
      if (this.failed || this.completed) {
        this.stopAutomaticProgression();
        return;
      }

      debugLog(this.debug, 'ICPay Progress: Processing step:', this.activeIndex);

      // Complete current step
      this.updateStepStatus(this.activeIndex, 'completed');

      // Move to next step if available
      if (this.activeIndex < this.currentSteps.length - 1) {
        this.activeIndex++;
        this.updateStepStatus(this.activeIndex, 'loading');
        debugLog(this.debug, 'ICPay Progress: Auto-progressed to step:', this.activeIndex);
      } else {
        // All steps completed, stop progression and wait for transaction completion
        this.stopAutomaticProgression();
        debugLog(this.debug, 'ICPay Progress: All steps completed, waiting for transaction completion');
      }

      this.requestUpdate();
    }, 3000);
  }

  private stopAutomaticProgression() {
    if (this.progressionTimer) {
      clearInterval(this.progressionTimer);
      this.progressionTimer = null;
    }
  }

  private onMethodSuccess = (e: any) => {
    const methodName = e?.detail?.name || '';
    if (methodName === 'createPayment' || methodName === 'createPaymentUsd' ||
        methodName === 'sendUsd' || methodName === 'pay' ||
        methodName === 'unlock' || methodName === 'tip' ||
        methodName === 'donate' || methodName === 'order') {

      // Dispatch method success event for external listeners
      this.dispatchEvent(new CustomEvent('icpay-progress-method-success', {
        detail: { methodName, step: this.activeIndex },
        bubbles: true
      }));
    }

    // Map SDK method successes to step completions (mid-flow methods)
    if (!this.failed && !this.completed) {
      // Onramp flow: do not map internal wallet steps (no wallet transfer happens here)
      if (this.isOnrampFlow) {
        return;
      }
      if (methodName === 'getLedgerBalance') {
        this.completeByKey('wallet');
        this.setLoadingByKey('await');
      } else if (methodName === 'sendFundsToLedger') {
        this.completeByKey('wallet');
        this.completeByKey('await');
        this.completeByKey('transfer');
        this.setLoadingByKey('verify');
      } else if (methodName === 'notifyLedgerTransaction') {
        this.completeByKey('wallet');
        this.completeByKey('await');
        this.completeByKey('transfer');
        // Keep verify loading until completion
        this.setLoadingByKey('verify');
      }
    }
  };

  private onTransactionCreated = (e: any) => {
    const transactionId = e?.detail?.transactionId || e?.detail?.id;

    debugLog(this.debug, 'ICPay Progress: Transaction created event received:', e.detail);

    // For onramp, do not auto-advance to transfer on intent creation
    if (!this.failed && !this.completed) {
      if (this.isOnrampFlow) {
        // Keep first step loading until onramp tab is opened, then move to 'await'
        return;
      }
      this.completeByKey('wallet');
      this.completeByKey('await');
      this.setLoadingByKey('transfer');
    }

    // Dispatch transaction created event for external listeners
    this.dispatchEvent(new CustomEvent('icpay-progress-transaction-created', {
      detail: { transactionId, step: this.activeIndex },
      bubbles: true
    }));
  };

  private onTransactionUpdated = (e: any) => {
    const status = e?.detail?.status || 'pending';
    const transactionId = e?.detail?.transactionId || e?.detail?.id;
    const intentMeta = (e?.detail?.metadata || e?.detail?.intent?.metadata || {}) as any;

    debugLog(this.debug, 'ICPay Progress: Transaction updated event received:', e.detail);

    if (!this.failed && !this.completed) {
      if (this.isOnrampFlow) {
        // Map intent statuses to onramp steps
        // requires_payment -> keep 'await' loading
        // pending/processing -> complete 'await', set 'transfer' loading
        // completed handled in onTransactionCompleted
        // Also advance to 'transfer' when backend confirms onramp order completed via metadata
        const onrampCompleteMeta =
          intentMeta?.onramp_order_completed === true ||
          intentMeta?.icpay_onramp?.status === 'completed' ||
          intentMeta?.onrampCompleted === true;
        if (status === 'requires_payment' && !onrampCompleteMeta) {
          this.completeByKey('wallet');
          this.setLoadingByKey('await');
        } else if (status === 'pending' || status === 'processing' || onrampCompleteMeta) {
          this.completeByKey('wallet');
          this.completeByKey('await');
          this.setLoadingByKey('transfer');
        }
      } else {
        // When pending turns to confirmed, keep current step loading
        if (status === 'pending') {
          // no-op for non-onramp standard flow
        }
      }
    }

    // Dispatch transaction updated event for external listeners
    this.dispatchEvent(new CustomEvent('icpay-progress-transaction-updated', {
      detail: { status, transactionId, step: this.activeIndex },
      bubbles: true
    }));
  };

  private onTransactionCompleted = (e: any) => {
    const transactionId = e?.detail?.transactionId || e?.detail?.id;
    const status = e?.detail?.status || 'completed';

    debugLog(this.debug, 'ICPay Progress: Transaction completed event received:', e.detail);
    debugLog(this.debug, 'ICPay Progress: Current state when transaction completed:', {
      activeIndex: this.activeIndex,
      completed: this.completed,
      failed: this.failed,
      showSuccess: this.showSuccess
    });

    // Ensure remaining steps are completed in sequence before final success
    this.completeByKey('transfer');
    this.completeByKey('await');
    this.completeByKey('verify');
    this.completed = true;
    this.showSuccess = true;
    this.showConfetti = true;
    this.isOnrampFlow = false;

    // Dispatch completion event
    this.dispatchEvent(new CustomEvent('icpay-progress-completed', {
      detail: {
        transactionId,
        status,
        amount: this.currentAmount || this.amount,
        currency: this.currentCurrency || this.currency,
        ledgerSymbol: this.currentLedgerSymbol || this.ledgerSymbol
      },
      bubbles: true
    }));

    // Auto-close after 2 seconds if user hasn't closed it manually
    /*setTimeout(() => {
      if (this.open && this.showSuccess && !this.failed) {
        this.open = false;
      }
    }, 2000);*/

    // Only hide confetti after 3 seconds
    setTimeout(() => {
      this.showConfetti = false;
    }, 3000);
  };

  private onTransactionFailed = (e: any) => {
    const errorMessage = e?.detail?.message || e?.detail?.error?.message || 'Transaction failed';
    const errorCode = e?.detail?.error?.code || e?.detail?.code || 'UNKNOWN_ERROR';
    const transactionId = e?.detail?.transactionId || e?.detail?.id;

    debugLog(this.debug, 'ICPay Progress: Transaction failed event received:', e.detail);

    // Mark as failed and keep modal open with error message
    this.failed = true;
    this.errorMessage = this.transformErrorMessage(errorMessage);
    this.showSuccess = false;
    this.updateStepStatus(this.activeIndex, 'error', errorMessage);
    this.stopAutomaticProgression();
    this.open = true;
    this.isOnrampFlow = false;

    // Dispatch transaction failed event for external listeners
    this.dispatchEvent(new CustomEvent('icpay-progress-failed', {
      detail: { errorMessage, errorCode, transactionId, step: this.activeIndex },
      bubbles: true
    }));
  };

  private onTransactionMismatched = (e: any) => {
    const requestedAmount = e?.detail?.requestedAmount;
    const paidAmount = e?.detail?.paidAmount;
    const transactionId = e?.detail?.transactionId || e?.detail?.id;

    //debugLog(this.debug, 'ICPay Progress: Transaction mismatched event received:', e.detail);

    // Treat as failure with specific message
    this.failed = true;
    const requested = requestedAmount != null ? String(requestedAmount) : 'unknown';
    const paid = paidAmount != null ? String(paidAmount) : 'unknown';
    this.errorMessage = `Amount mismatch. Requested ${requested}, paid ${paid}.`;
    this.showSuccess = false;
    this.updateStepStatus(this.activeIndex, 'error', this.errorMessage);
    this.stopAutomaticProgression();
    this.open = true;
    this.isOnrampFlow = false;

    // Dispatch failed event with mismatch context
    this.dispatchEvent(new CustomEvent('icpay-progress-failed', {
      detail: { errorMessage: this.errorMessage, errorCode: 'MISMATCHED_AMOUNT', transactionId, step: this.activeIndex, requestedAmount, paidAmount },
      bubbles: true
    }));
  };

  private onMethodError = (e: any) => {
    const methodName = e?.detail?.name || '';
    const errorMessage = e?.detail?.error?.message || e?.detail?.message || 'An error occurred';
    const errorCode = e?.detail?.error?.code || e?.detail?.code || 'METHOD_ERROR';

    debugLog(this.debug, 'ICPay Progress: Method error event received:', e.detail);

    if (methodName?.startsWith('createPayment') || methodName === 'sendUsd' ||
        methodName === 'pay' || methodName === 'unlock' ||
        methodName === 'tip' || methodName === 'donate' ||
        methodName === 'order') {
      // Mark as failed and keep modal open with error message
      this.failed = true;
      this.errorMessage = this.transformErrorMessage(errorMessage);
      this.showSuccess = false;
      this.updateStepStatus(this.activeIndex, 'error', errorMessage);
      this.stopAutomaticProgression();
      this.open = true;
      this.isOnrampFlow = false;

      // Dispatch method error event for external listeners
      this.dispatchEvent(new CustomEvent('icpay-progress-error', {
        detail: { methodName, errorMessage, errorCode, step: this.activeIndex },
        bubbles: true
      }));
    }
  };

  private onSDKError = (e: any) => {
    const errorMessage = e?.detail?.message || 'SDK error occurred';
    const errorCode = e?.detail?.code || 'SDK_ERROR';

    debugLog(this.debug, 'ICPay Progress: SDK error event received:', e.detail);

    // Mark as failed and keep modal open with error message
    this.failed = true;
    this.errorMessage = this.transformErrorMessage(errorMessage);
    this.showSuccess = false;
    this.updateStepStatus(this.activeIndex, 'error', errorMessage);
    this.stopAutomaticProgression();
    this.open = true;
    this.isOnrampFlow = false;

    // Dispatch SDK error event for external listeners
    this.dispatchEvent(new CustomEvent('icpay-progress-sdk-error', {
      detail: { errorMessage, errorCode, step: this.activeIndex },
      bubbles: true
    }));
  };

  private onWalletConnected = (e: any) => {
    const walletType = e?.detail?.walletType || 'unknown';

    debugLog(this.debug, 'ICPay Progress: Wallet connected event received:', e.detail);

    // Complete wallet step and set awaiting confirmation to loading
    this.completeByKey('wallet');
    this.setLoadingByKey('await');

    // Start transition from wallet selector to progress bar
    this.startTransitionToProgress();

    // Dispatch wallet connected event for external listeners
    this.dispatchEvent(new CustomEvent('icpay-progress-wallet-connected', {
      detail: { walletType, step: this.activeIndex },
      bubbles: true
    }));
    this.currentWalletType = walletType;
  };

  // Onramp-specific: user opened the pay URL in a new tab/window
  private onOnrampOpened = (_e: any) => {
    if (!this.isOnrampFlow || this.failed || this.completed) return;
    // Move from step 1 to step 2
    this.completeByKey('wallet');
    this.setLoadingByKey('await');
  };

  private onWalletDisconnected = (e: any) => {
    const walletType = e?.detail?.walletType || 'unknown';

    debugLog(this.debug, 'ICPay Progress: Wallet disconnected event received:', e.detail);

    // Dispatch wallet disconnected event for external listeners
    this.dispatchEvent(new CustomEvent('icpay-progress-wallet-disconnected', {
      detail: { walletType, step: this.activeIndex },
      bubbles: true
    }));
    this.currentWalletType = null;
  };

  private onBalanceCheck = (e: any) => {
    const hasBalance = e?.detail?.hasBalance || false;
    const balance = e?.detail?.balance || 0;

    debugLog(this.debug, 'ICPay Progress: Balance check event received:', e.detail);

    // Handle insufficient balance error
    if (!hasBalance) {
      this.failed = true;
      this.errorMessage = 'Insufficient balance for transaction';
      this.updateStepStatus(this.activeIndex, 'error', 'Insufficient balance for transaction');
      this.stopAutomaticProgression();
      this.showWalletSelector = false; // Ensure we're in progress view for error

      // Dispatch insufficient balance event
      this.dispatchEvent(new CustomEvent('icpay-progress-insufficient-balance', {
        detail: { balance, required: this.currentAmount || this.amount, step: this.activeIndex },
        bubbles: true
      }));
    }
  };

  private onLedgerVerified = (e: any) => {
    const ledgerId = e?.detail?.ledgerId || e?.detail?.canisterId;
    const symbol = e?.detail?.symbol || 'unknown';

    debugLog(this.debug, 'ICPay Progress: Ledger verified event received:', e.detail);

    // Update ledger symbol if provided
    if (symbol && symbol !== 'unknown') {
      this.currentLedgerSymbol = symbol;
      this.ledgerSymbol = symbol;
    }

    // Dispatch ledger verified event
    this.dispatchEvent(new CustomEvent('icpay-progress-ledger-verified', {
      detail: { ledgerId, symbol, step: this.activeIndex },
      bubbles: true
    }));
  };

  // Widget-specific event handlers for better integration
  private onWidgetPayment = (e: any) => {
    const amount = e?.detail?.amount;
    const currency = e?.detail?.currency;
    const ledgerSymbol = e?.detail?.ledgerSymbol;

    debugLog(this.debug, 'ICPay Progress: Widget payment event received:', e.detail);

    // Update dynamic values if provided
    if (amount !== undefined) {
      this.currentAmount = amount;
      this.amount = amount;
    }
    if (currency) {
      this.currentCurrency = currency;
      this.currency = currency;
    }
    if (ledgerSymbol) {
      this.currentLedgerSymbol = ledgerSymbol;
      this.ledgerSymbol = ledgerSymbol;
    }

    // Advance steps to success state (event-driven, no auto progression)
    if (!this.failed) {
      for (let i = this.activeIndex; i < this.currentSteps.length; i++) {
        this.updateStepStatus(i, 'completed');
      }
      this.activeIndex = this.currentSteps.length - 1;
      this.completed = true;
      this.showSuccess = true;
      this.showConfetti = true;
    }

    // Dispatch widget payment event for external listeners
    this.dispatchEvent(new CustomEvent('icpay-progress-widget-payment', {
      detail: { amount, currency, ledgerSymbol, step: this.activeIndex },
      bubbles: true
    }));
  };

  private onWidgetError = (e: any) => {
    const errorMessage = e?.detail?.message || 'Widget error occurred';
    const errorCode = e?.detail?.code || 'WIDGET_ERROR';

    debugLog(this.debug, 'ICPay Progress: Widget error event received:', e.detail);

    // Mark as failed and keep modal open with error message
    this.failed = true;
    this.errorMessage = this.transformErrorMessage(errorMessage);
    this.showSuccess = false;
    this.updateStepStatus(this.activeIndex, 'error', errorMessage);
    this.stopAutomaticProgression();
    this.open = true;

    // Dispatch widget error event for external listeners
    this.dispatchEvent(new CustomEvent('icpay-progress-widget-error', {
      detail: { errorMessage, errorCode, step: this.activeIndex },
      bubbles: true
    }));
  };

  private onWidgetUnlock = (e: any) => {
    const amount = e?.detail?.amount;
    const currency = e?.detail?.currency;

    debugLog(this.debug, 'ICPay Progress: Widget unlock event received:', e.detail);

    // Complete steps and show success
    if (!this.failed) {
      for (let i = this.activeIndex; i < this.currentSteps.length; i++) {
        this.updateStepStatus(i, 'completed');
      }
      this.activeIndex = this.currentSteps.length - 1;
      this.completed = true;
      this.showSuccess = true;
      this.showConfetti = true;
    }

    // Dispatch widget unlock event for external listeners
    this.dispatchEvent(new CustomEvent('icpay-progress-widget-unlock', {
      detail: { amount, currency, step: this.activeIndex },
      bubbles: true
    }));
  };

  private onWidgetTip = (e: any) => {
    const amount = e?.detail?.amount;
    const currency = e?.detail?.currency;

    debugLog(this.debug, 'ICPay Progress: Widget tip event received:', e.detail);

    // Complete steps and show success
    if (!this.failed) {
      for (let i = this.activeIndex; i < this.currentSteps.length; i++) {
        this.updateStepStatus(i, 'completed');
      }
      this.activeIndex = this.currentSteps.length - 1;
      this.completed = true;
      this.showSuccess = true;
      this.showConfetti = true;
    }

    // Dispatch widget tip event for external listeners
    this.dispatchEvent(new CustomEvent('icpay-progress-widget-tip', {
      detail: { amount, currency, step: this.activeIndex },
      bubbles: true
    }));
  };

  private onWidgetDonation = (e: any) => {
    const amount = e?.detail?.amount;
    const currency = e?.detail?.currency;

    debugLog(this.debug, 'ICPay Progress: Widget donation event received:', e.detail);

    // Complete steps and show success
    if (!this.failed) {
      for (let i = this.activeIndex; i < this.currentSteps.length; i++) {
        this.updateStepStatus(i, 'completed');
      }
      this.activeIndex = this.currentSteps.length - 1;
      this.completed = true;
      this.showSuccess = true;
      this.showConfetti = true;
    }

    // Dispatch widget donation event for external listeners
    this.dispatchEvent(new CustomEvent('icpay-progress-widget-donation', {
      detail: { amount, currency, step: this.activeIndex },
      bubbles: true
    }));
  };

  private onWidgetCoffee = (e: any) => {
    const amount = e?.detail?.amount;
    const currency = e?.detail?.currency;

    debugLog(this.debug, 'ICPay Progress: Widget coffee event received:', e.detail);

    // Complete steps and show success
    if (!this.failed) {
      for (let i = this.activeIndex; i < this.currentSteps.length; i++) {
        this.updateStepStatus(i, 'completed');
      }
      this.activeIndex = this.currentSteps.length - 1;
      this.completed = true;
      this.showSuccess = true;
      this.showConfetti = true;
    }

    // Dispatch widget coffee event for external listeners
    this.dispatchEvent(new CustomEvent('icpay-progress-widget-coffee', {
      detail: { amount, currency, step: this.activeIndex },
      bubbles: true
    }));
  };

  private updateStepStatus(stepIndex: number, status: StepStatus, errorMessage?: string | null) {
    if (stepIndex >= 0 && stepIndex < this.currentSteps.length) {
      const step = this.currentSteps[stepIndex];
      const oldStatus = step.status;

      step.status = status;
      if (status === 'completed') {
        step.timestamp = this.getCurrentTime();
      }
      if (status === 'error' && errorMessage) {
        step.errorMessage = this.transformErrorMessage(errorMessage);
      }

      if (oldStatus !== status) {
        debugLog(this.debug, `ICPay Progress: Step ${stepIndex} (${step.label}) status changed from ${oldStatus} to ${status}`);
      }

      this.requestUpdate();
    }
  }

  private getCurrentTime() {
    const now = new Date();
    return now.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }

  private getStepIcon(step: Step): string | any {
    if (step.status === 'error') {
      return html`<div class="error-x">✕</div>`;
    }
    return html`<div class="spinner"></div>`;
  }

  private getStepIndexByKey(key: string): number {
    return this.currentSteps.findIndex(s => s.key === key);
  }

  private setLoadingByKey(key: string) {
    const idx = this.getStepIndexByKey(key);
    if (idx >= 0) {
      this.activeIndex = idx;
      this.updateStepStatus(idx, 'loading');
      // Track start time for long verification tip
      if (key === 'verify') {
        this.confirmLoadingStartedAt = Date.now();
      }
    }
  }

  private completeByKey(key: string) {
    const idx = this.getStepIndexByKey(key);
    if (idx >= 0) {
      this.updateStepStatus(idx, 'completed');
      this.activeIndex = idx;
    }
  }

  // Normalize specific error messages to friendlier text
  private transformErrorMessage(message: string): string {
    const msg = String(message || '').toLowerCase();
    if (msg.includes('user rejected')) return 'User have rejected the transfer';
    if (msg.includes('user cancelled') || msg.includes('user canceled')) return 'User have rejected the transfer';
    if (msg.includes('signature rejected')) return 'User have rejected the transfer';
    return message;
  }

  private renderConfetti() {
    if (!this.showConfetti) return '';

    const confettiPieces = Array.from({ length: 50 }, (_, i) => i);
    const colors = ['#0066FF', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6'];

    return html`
      <div class="confetti">
        ${confettiPieces.map((piece) => html`
          <div
            class="confetti-piece"
            style="
              left: ${Math.random() * 100}%;
              top: ${Math.random() * 100}%;
              background-color: ${colors[Math.floor(Math.random() * colors.length)]};
              animation-delay: ${Math.random() * 2}s;
              animation-duration: ${2 + Math.random() * 2}s;
            "
          ></div>
        `)}
      </div>
    `;
  }

  private renderSuccessState() {
    const displayAmount = this.currentAmount || this.amount;

    debugLog(this.debug, 'ICPay Progress: Rendering success state with:', {
      displayAmount,
      currentAmount: this.currentAmount,
      amount: this.amount,
      currentCurrency: this.currentCurrency,
      currency: this.currency,
      currentLedgerSymbol: this.currentLedgerSymbol,
      ledgerSymbol: this.ledgerSymbol
    });

    return html`
      <div class="success-center">
        <div class="success-container">
          <div class="success-icon">
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 class="success-title">Payment Complete!</h2>
          <p class="success-message">Your payment of ${displayAmount} USD has been successfully processed.</p>
          <div class="success-actions">
            <button class="btn btn-primary" @click=${() => { this.open = false; }}>Close</button>
          </div>
        </div>
      </div>
    `;
  }

  private renderErrorState() {
    const isInsufficientFunds = this.errorMessage?.includes('Insufficient balance') || false;

    if (isInsufficientFunds) {
      return this.renderInsufficientFundsError();
    }

    return this.renderGenericError();
  }

  private renderInsufficientFundsError() {
    const displayAmount = this.currentAmount || this.amount;

    return html`
      <div class="insufficient-funds-container">
        <div class="payment-summary">
          <div class="payment-amount">Pay $${displayAmount} with crypto</div>
        </div>

        <div class="error-notification">
          <div class="error-content">
            <div class="error-icon-small">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.268 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <div class="error-text">Insufficient balance for this transaction</div>
          </div>
        </div>

        <div class="error-actions">
          <button class="btn btn-secondary" @click=${() => this.requestSwitchAccount()} title="Switch to a different account">
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" style="width: 16px; height: 16px;">
              <path stroke-linecap="round" stroke-linejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
            </svg>
            Switch Account
          </button>
          <button class="btn btn-primary" @click=${() => { this.open = false; }}>
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" style="width: 16px; height: 16px;">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
            Close
          </button>
        </div>
      </div>
    `;
  }

  private renderGenericError() {
    return html`
      <div class="error-container">
        <div class="error-icon-large">
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h2 class="error-title">Transaction Failed</h2>
        <p class="error-message-text">${this.errorMessage}</p>
        <div class="error-actions">
          <button class="btn btn-secondary" @click=${() => this.requestSwitchAccount()} title="Switch to a different account">
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" style="width: 16px; height: 16px;">
              <path stroke-linecap="round" stroke-linejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
            </svg>
            Switch Account
          </button>
          <button class="btn btn-primary" @click=${() => { this.open = false; }}>
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" style="width: 16px; height: 16px;">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
            Close
          </button>
        </div>
      </div>
    `;
  }

  private requestSwitchAccount() {
    try {
      // Close the progress modal so the wallet selector can be used
      this.open = false;
      const walletType = this.currentWalletType || 'unknown';
      window.dispatchEvent(new CustomEvent('icpay-switch-account', { detail: { walletType } } as any));
    } catch {}
  }

  private handleAddFunds() {
    try {
      // Dispatch add funds event for external handling
      window.dispatchEvent(new CustomEvent('icpay-add-funds', {
        detail: {
          amount: this.currentAmount || this.amount,
          currency: this.currentLedgerSymbol || this.currentCurrency || this.currency
        }
      }));

      // Close the modal to allow external handling
      this.open = false;
    } catch (error) {
      console.error('Error handling add funds:', error);
    }
  }

  private startTransitionToProgress() {
    this.isTransitioning = true;
    this.requestUpdate();

    // After transition animation completes, switch to progress view
    setTimeout(() => {
      this.showWalletSelector = false;
      this.isTransitioning = false;
      this.requestUpdate();
    }, 400);
  }

  private renderProgressContent() {
    if (this.showSuccess) {
      return this.renderSuccessState();
    }

    if (this.failed) {
      return this.renderErrorState();
    }

    return html`
      <div class="progress-container">
        <div class="progress-header">
          <span class="progress-spacer"></span>
          <h3 class="progress-title">Processing</h3>
        </div>
        ${this.renderConfirmTip()}
        <div class="progress-steps">
          ${this.currentSteps.map((step, index) => html`
            <div class="step ${index === this.activeIndex ? 'active' : ''} ${step.status === 'completed' ? 'completed' : ''} ${step.status === 'error' ? 'error' : ''}">
              <div class="step-icon">
                ${this.getStepIcon(step)}
              </div>
              <div class="step-content">
                <div class="step-title">${step.label}</div>
                <div class="step-description">${step.tooltip}</div>
                ${step.status === 'error' && step.errorMessage ? html`
                  <div class="step-error-message">${step.errorMessage}</div>
                ` : ''}
              </div>
            </div>
          `)}
        </div>
      </div>
    `;
  }

  private onWalletCancelled = (e: any) => {
    try {
      // Ensure the progress modal is visible if it was initiated
      this.open = true;
      // Mark the wallet step as error with cancelled tooltip
      const idx = this.getStepIndexByKey('wallet');
      if (idx >= 0) {
        this.activeIndex = idx;
        // Update tooltip and status
        this.currentSteps[idx] = {
          ...this.currentSteps[idx],
          tooltip: 'Wallet connection cancelled',
          status: 'error'
        } as Step;
        this.requestUpdate();
      }
    } catch {}
  };

  private onWalletError = (e: any) => {
    try {
      const rawMessage = e?.detail?.message || 'Wallet error';
      const errorMessage = this.transformErrorMessage(rawMessage);
      this.open = true;
      const idx = this.getStepIndexByKey('wallet');
      if (idx >= 0) {
        this.activeIndex = idx;
        // Update step to error with friendly tooltip and message
        this.currentSteps[idx] = {
          ...this.currentSteps[idx],
          tooltip: 'Wallet connection failed',
          status: 'error',
          errorMessage
        } as Step;
        this.requestUpdate();
      }
    } catch {}
  };

  private renderConfirmTip() {
    try {
      const verifyIdx = this.getStepIndexByKey('verify');
      if (verifyIdx < 0) return null as any;
      const isVerifyLoading = this.activeIndex === verifyIdx && this.currentSteps[verifyIdx]?.status === 'loading';
      if (!isVerifyLoading) return null as any;
      const started = this.confirmLoadingStartedAt || 0;
      const elapsed = started ? (Date.now() - started) : 0;
      if (elapsed < 30000) return null as any;
      return html`<p class="progress-subtitle" style="margin-top:8px;color:#60a5fa">Verification can take from 30 seconds up to 10 minutes depending on the amount. Please wait…</p>`;
    } catch {
      return null as any;
    }
  }

  private retryTransaction() {
    // Reset state but preserve dynamic values
    this.activeIndex = 0;
    this.completed = false;
    this.failed = false;
    this.errorMessage = null;
    this.showSuccess = false;
    this.showConfetti = false;

    // Preserve dynamic values from the current transaction
    // Don't reset currentAmount, currentCurrency, currentLedgerSymbol

    // Reset all steps to pending
    this.currentSteps = this.currentSteps.map(step => ({ ...step, status: 'pending' as StepStatus }));

    // Update first step to loading
    this.updateStepStatus(0, 'loading');

    // Start automatic progression again
    this.startAutomaticProgression();

    this.requestUpdate();
  }

  private closeProgress() {
    this.open = false;
    this.showWalletSelector = false;
    this.isTransitioning = false;
  }

  private renderStep(step: Step, index: number) {
    return html`
      <div class="step-item ${step.status}">
        <div class="step-icon">
          ${this.getStepIcon(step)}
        </div>
        <div class="step-content">
          <div class="step-title">
            ${step.status === 'completed' ? 'COMPLETED' : step.label}
          </div>
          ${step.status === 'completed' ? html`
            <div class="step-subtitle">
              ${step.timestamp} - ${step.tooltip}
            </div>
          ` : step.status === 'error' && step.errorMessage ? html`
            <div class="step-error">${step.errorMessage}</div>
          ` : html`
            <div class="step-subtitle">${step.tooltip}</div>
          `}
        </div>
      </div>
    `;
  }

  private get isWalletConnectLoading(): boolean {
    try {
      const idx = this.currentSteps.findIndex(s => (s as any).key === 'wallet');
      if (idx < 0) return false;
      return this.currentSteps[idx].status === 'loading' && !this.failed && !this.showSuccess;
    } catch {
      return false;
    }
  }

  render() {
    if (this.suspended) {
      return null as any;
    }
    return html`
      ${this.open ? html`
        ${this.renderConfetti()}
        <div class="modal-overlay active">
          <div class="modal-container">
            ${!this.showSuccess ? html`<button class="close-button" @click=${() => this.closeProgress()} aria-label="Close" title="Close">✕</button>` : null}
            <div class="modal-content ${this.isTransitioning ? 'transitioning' : ''}">
              ${this.renderProgressContent()}
            </div>
          </div>
        </div>
      ` : null}
    `;
  }
}

declare global { interface HTMLElementTagNameMap { 'icpay-progress-bar': ICPayProgressBar } }



