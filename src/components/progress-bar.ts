import { LitElement, html, css } from 'lit';
import { applyThemeVars } from '../styles';
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
    label: 'Connect Wallet',
    tooltip: 'Awaiting wallet connection',
    status: 'pending'
  },
  {
    key: 'init',
    label: 'Initialising ICPay',
    tooltip: 'Initializing payment',
    status: 'pending'
  },
  {
    key: 'await',
    label: 'Awaiting payment confirmation',
    tooltip: 'Preparing payment',
    status: 'pending'
  },
  {
    key: 'transfer',
    label: 'Transferring funds',
    tooltip: 'Submitting payment',
    status: 'pending'
  },
  {
    key: 'verify',
    label: 'Verifying payment',
    tooltip: 'Confirming payment',
    status: 'pending'
  },
  {
    key: 'confirm',
    label: 'Payment confirmed',
    tooltip: 'Payment completed',
    status: 'pending'
  }
];


@customElement('icpay-progress-bar')
export class ICPayProgressBar extends LitElement {
  static styles = css`
    :host {
      display: block;
      font-family: var(--icpay-font, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
      color: #ffffff;
    }

    .modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.85);
      backdrop-filter: blur(10px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      opacity: 0;
      visibility: hidden;
      transition: opacity 0.3s ease, visibility 0.3s ease;
    }

    .modal-overlay.active {
      opacity: 1;
      visibility: visible;
    }

    .modal-container {
      background: linear-gradient(180deg, #1a1a1a 0%, #0f0f0f 100%);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 24px;
      padding: 48px;
      max-width: 480px;
      width: 90%;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
      transform: translateY(20px);
      transition: transform 0.3s ease;
    }

    .modal-overlay.active .modal-container {
      transform: translateY(0);
    }

    .close-button {
      position: absolute;
      top: 16px;
      right: 16px;
      background: none;
      border: none;
      color: #666666;
      cursor: pointer;
      padding: 8px;
      border-radius: 6px;
      transition: all 0.2s;
      font-size: 18px;
      line-height: 1;
    }

    .close-button:hover {
      background: #1a1a1a;
      color: #ffffff;
    }

    .progress-header { text-align: center; margin-bottom: 40px; }
    .progress-title {
      font-size: 24px;
      font-weight: 600;
      margin-bottom: 8px;
      background: linear-gradient(135deg, #ffffff 0%, #888888 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }
    .progress-subtitle { color: #666666; font-size: 14px; }
    .progress-steps { margin-bottom: 40px; }
    .step { display: flex; align-items: center; margin-bottom: 24px; opacity: 0.3; transition: opacity 0.3s ease; }
    .step.active { opacity: 1; }
    .step.completed { opacity: 0.7; }
    .step-icon { width: 40px; height: 40px; border-radius: 50%; background: #1a1a1a; border: 2px solid #333333; display: flex; align-items: center; justify-content: center; margin-right: 16px; transition: all 0.3s ease; position: relative; }
    .step.active .step-icon { background: #1a1a1a; border-color: #4a9eff; box-shadow: 0 0 0 4px rgba(74, 158, 255, 0.2); }
    .step.completed .step-icon { background: #0d7c3d; border-color: #0d7c3d; }
    .step-icon svg { width: 20px; height: 20px; stroke: #666666; transition: stroke 0.3s ease; }
    .step.active .step-icon svg { stroke: #4a9eff; }
    .step.completed .step-icon svg { stroke: #ffffff; }
    .step-content { flex: 1; }
    .step-title { font-weight: 500; font-size: 16px; margin-bottom: 4px; color: #999999; transition: color 0.3s ease; }
    .step.active .step-title { color: #ffffff; }
    .step-description { font-size: 14px; color: #666666; }
    .loading-spinner { display: none; width: 20px; height: 20px; border: 2px solid rgba(74, 158, 255, 0.2); border-top-color: #4a9eff; border-radius: 50%; animation: spin 1s linear infinite; position: absolute; }
    .step.active .loading-spinner { display: block; }

    .error-message {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 16px;
      background: #0a0a0a;
      border: 1px solid #dc2626;
      border-radius: 8px;
      margin-top: 8px;
    }

    .error-icon {
      flex-shrink: 0;
      width: 20px;
      height: 20px;
      background: #dc2626;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #ffffff;
      font-size: 12px;
      font-weight: bold;
    }

    .error-content h4 {
      margin: 0 0 4px 0;
      font-size: 14px;
      font-weight: 600;
      color: #ffffff;
    }

    .error-content p {
      margin: 0;
      font-size: 12px;
      color: #f87171;
      line-height: 1.4;
    }

    .success-container { text-align: center; }
    .success-icon { width: 80px; height: 80px; margin: 0 auto 24px; background: linear-gradient(135deg, #0d7c3d 0%, #0fa855 100%); border-radius: 50%; display: flex; align-items: center; justify-content: center; }
    .success-icon svg { width: 40px; height: 40px; stroke: #ffffff; stroke-width: 3; }
    .success-title { font-size: 28px; font-weight: 600; margin-bottom: 12px; background: linear-gradient(135deg, #0fa855 0%, #0d7c3d 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
    .success-message { color: #999999; margin-bottom: 24px; font-size: 16px; }
    .success-actions { display: flex; gap: 12px; justify-content: center; }
    .btn { padding: 12px 24px; border-radius: 12px; font-size: 14px; font-weight: 500; cursor: pointer; transition: all 0.3s ease; text-decoration: none; display: inline-flex; align-items: center; gap: 8px; }
    .btn-primary { background: linear-gradient(135deg, #4a9eff 0%, #3a7edf 100%); color: #ffffff; border: none; }
    .btn-primary:hover { transform: translateY(-2px); box-shadow: 0 8px 20px rgba(74, 158, 255, 0.3); }
    .btn-secondary { background: transparent; color: #999999; border: 1px solid #333333; }
    .btn-secondary:hover { background: rgba(255, 255, 255, 0.05); border-color: #555555; color: #ffffff; }

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

    .spinner {
      width: 16px;
      height: 16px;
      border: 2px solid transparent;
      border-top: 2px solid #ffffff;
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }

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

    // Transaction lifecycle events
    window.addEventListener('icpay-sdk-transaction-created', this.onTransactionCreated as EventListener);
    window.addEventListener('icpay-sdk-transaction-updated', this.onTransactionUpdated as EventListener);
    window.addEventListener('icpay-sdk-transaction-completed', this.onTransactionCompleted as EventListener);
    window.addEventListener('icpay-sdk-transaction-failed', this.onTransactionFailed as EventListener);
    window.addEventListener('icpay-sdk-transaction-mismatched', this.onTransactionMismatched as EventListener);

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

    // Transaction lifecycle events
    window.removeEventListener('icpay-sdk-transaction-created', this.onTransactionCreated as EventListener);
    window.removeEventListener('icpay-sdk-transaction-updated', this.onTransactionUpdated as EventListener);
    window.removeEventListener('icpay-sdk-transaction-completed', this.onTransactionCompleted as EventListener);
    window.removeEventListener('icpay-sdk-transaction-failed', this.onTransactionFailed as EventListener);
    window.removeEventListener('icpay-sdk-transaction-mismatched', this.onTransactionMismatched as EventListener);

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
    if (methodName === 'sendFunds' || methodName === 'sendFundsUsd' ||
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

      // Reset all steps to pending
      this.currentSteps = this.currentSteps.map(step => ({ ...step, status: 'pending' as StepStatus }));

      // Step 0: Wallet connect loading (rename if onramp)
      if (methodType === 'onramp') {
        // Update wallet step copy for onramp flow
        const idx = this.getStepIndexByKey('wallet');
        if (idx >= 0) {
          this.currentSteps[idx] = {
            ...this.currentSteps[idx],
            label: 'Transak Started',
            tooltip: 'Awaiting Transak information',
          } as any;
        }
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
      if (methodName === 'sendFundsToLedger') {
        this.completeByKey('wallet');
        this.completeByKey('init');
        this.completeByKey('await');
        this.setLoadingByKey('transfer');
      } else if (methodName === 'notifyLedgerTransaction') {
        this.completeByKey('wallet');
        this.completeByKey('init');
        this.completeByKey('await');
        this.completeByKey('transfer');
        this.setLoadingByKey('verify');
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
    if (methodName === 'sendFunds' || methodName === 'sendFundsUsd' ||
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
      if (methodName === 'getLedgerBalance') {
        this.completeByKey('wallet');
        this.completeByKey('init');
        this.setLoadingByKey('await');
      } else if (methodName === 'sendFundsToLedger') {
        this.completeByKey('wallet');
        this.completeByKey('init');
        this.completeByKey('await');
        this.completeByKey('transfer');
        this.setLoadingByKey('verify');
      } else if (methodName === 'notifyLedgerTransaction') {
        this.completeByKey('wallet');
        this.completeByKey('init');
        this.completeByKey('await');
        this.completeByKey('transfer');
        this.completeByKey('verify');
        this.setLoadingByKey('confirm');
      }
    }
  };

  private onTransactionCreated = (e: any) => {
    const transactionId = e?.detail?.transactionId || e?.detail?.id;

    debugLog(this.debug, 'ICPay Progress: Transaction created event received:', e.detail);

    // Await -> completed on intent created; start transfer loading
    if (!this.failed && !this.completed) {
      this.completeByKey('wallet');
      this.completeByKey('init');
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

    debugLog(this.debug, 'ICPay Progress: Transaction updated event received:', e.detail);

    // When pending turns to confirmed, we will complete progression in onTransactionCompleted
    if (!this.failed && !this.completed && status === 'pending') {
      // Keep current step loading
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
    this.completeByKey('init');
    this.completeByKey('verify');
    this.completeByKey('confirm');
    this.completed = true;
    this.showSuccess = true;
    this.showConfetti = true;

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

    if (methodName?.startsWith('sendFunds') || methodName === 'sendUsd' ||
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

    // Dispatch SDK error event for external listeners
    this.dispatchEvent(new CustomEvent('icpay-progress-sdk-error', {
      detail: { errorMessage, errorCode, step: this.activeIndex },
      bubbles: true
    }));
  };

  private onWalletConnected = (e: any) => {
    const walletType = e?.detail?.walletType || 'unknown';

    debugLog(this.debug, 'ICPay Progress: Wallet connected event received:', e.detail);

    // Complete wallet step and set init to loading
    this.completeByKey('wallet');
    this.setLoadingByKey('init');

    // Do not auto-progress; wait for subsequent events to advance steps

    // Dispatch wallet connected event for external listeners
    this.dispatchEvent(new CustomEvent('icpay-progress-wallet-connected', {
      detail: { walletType, step: this.activeIndex },
      bubbles: true
    }));
  };

  private onWalletDisconnected = (e: any) => {
    const walletType = e?.detail?.walletType || 'unknown';

    debugLog(this.debug, 'ICPay Progress: Wallet disconnected event received:', e.detail);

    // Dispatch wallet disconnected event for external listeners
    this.dispatchEvent(new CustomEvent('icpay-progress-wallet-disconnected', {
      detail: { walletType, step: this.activeIndex },
      bubbles: true
    }));
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

      debugLog(this.debug, `ICPay Progress: Step ${stepIndex} (${step.label}) status changed from ${oldStatus} to ${status}`);

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

  private progressPercent() {
    if (this.failed) return 0;
    if (this.showSuccess) return 100;
    const completedSteps = this.currentSteps.filter(step => step.status === 'completed').length;
    const pct = (completedSteps / this.currentSteps.length) * 100;
    return Math.max(0, Math.min(100, pct));
  }

  private verticalPercent() {
    if (this.failed) return 0;
    if (this.showSuccess) return 100;
    const completedSteps = this.currentSteps.filter(step => step.status === 'completed').length;
    const pct = (completedSteps / this.currentSteps.length) * 100;
    return Math.max(0, Math.min(100, pct));
  }

  private getStepIcon(step: Step): string | any {
    switch (step.status) {
      case 'loading':
        return html`<div class="spinner"></div>`; // Proper CSS spinner
      case 'completed':
        return '✓'; // Checkmark
      case 'error':
        return '✗'; // X mark
      default:
        return '○'; // Empty circle for pending
    }
  }

  private getStepIndexByKey(key: string): number {
    return this.currentSteps.findIndex(s => s.key === key);
  }

  private setLoadingByKey(key: string) {
    const idx = this.getStepIndexByKey(key);
    if (idx >= 0) {
      this.activeIndex = idx;
      this.updateStepStatus(idx, 'loading');
      if (key === 'confirm') {
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
    const displayCurrency = this.currentLedgerSymbol || this.currentCurrency || this.currency;

    debugLog(this.debug, 'ICPay Progress: Rendering success state with:', {
      displayAmount,
      displayCurrency,
      currentAmount: this.currentAmount,
      amount: this.amount,
      currentCurrency: this.currentCurrency,
      currency: this.currency,
      currentLedgerSymbol: this.currentLedgerSymbol,
      ledgerSymbol: this.ledgerSymbol
    });

    return html`
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
    `;
  }

  private renderErrorState() {
    return html`
      <div class="error-message">
        <div class="error-icon">⚠</div>
        <div class="error-content">
          <h4>Transaction Failed</h4>
          <p>${this.errorMessage}</p>
          <div class="success-actions" style="margin-top:12px;">
            <button class="btn btn-primary" @click=${() => { this.open = false; }}>Close</button>
          </div>
        </div>
      </div>
    `;
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
          <h2 class="progress-title">Processing Payment</h2>
          <p class="progress-subtitle">Please wait while we process your transaction</p>
          ${this.renderConfirmTip()}
        </div>
        <div class="progress-steps">
          ${this.currentSteps.map((step, index) => html`
            <div class="step ${index === this.activeIndex ? 'active' : ''} ${step.status === 'completed' ? 'completed' : ''}">
              <div class="step-icon">
                ${step.status === 'loading' ? html`<div class="loading-spinner"></div>` : ''}
                ${step.status === 'completed' ? html`
                  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ` : html`
                  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                  </svg>
                `}
              </div>
              <div class="step-content">
                <div class="step-title">${step.label}</div>
                <div class="step-description">${step.tooltip}</div>
              </div>
            </div>
          `)}
        </div>
      </div>
    `;
  }

  private renderConfirmTip() {
    try {
      const confirmIdx = this.getStepIndexByKey('confirm');
      if (confirmIdx < 0) return null as any;
      const isConfirmLoading = this.activeIndex === confirmIdx && this.currentSteps[confirmIdx]?.status === 'loading';
      if (!isConfirmLoading) return null as any;
      const started = this.confirmLoadingStartedAt || 0;
      const elapsed = started ? (Date.now() - started) : 0;
      if (elapsed < 30000) return null as any;
      return html`<p class="progress-subtitle" style="margin-top:8px;color:#93c5fd">Verification can take from 30 seconds up to 10 minutes depending on the amount. Please wait…</p>`;
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
    return html`
      ${this.open ? html`
        ${this.renderConfetti()}
        <div class="modal-overlay active">
          <div class="modal-container">
            ${this.isWalletConnectLoading ? html`
              <button class="close-button" @click=${() => this.closeProgress()} aria-label="Close" title="Close">✕</button>
            ` : null}
            ${this.renderProgressContent()}
          </div>
        </div>
      ` : null}
    `;
  }
}

declare global { interface HTMLElementTagNameMap { 'icpay-progress-bar': ICPayProgressBar } }


