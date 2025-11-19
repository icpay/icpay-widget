import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { baseStyles } from '../styles';
import { handleWidgetError, getErrorMessage, shouldShowErrorToUser, getErrorAction, getErrorSeverity, ErrorSeverity } from '../error-handling';
import type { PayButtonConfig } from '../types';
import { renderTransakOnrampModal, TransakOnrampOptions } from './ui/transak-onramp-modal';
import { createSdk } from '../utils/sdk';
import type { WidgetSdk } from '../utils/sdk';
import './ui/progress-bar';
import { renderWalletSelectorModal } from './ui/wallet-selector-modal';
import { getWalletBalanceEntries, buildWalletEntries, isEvmWalletId, ensureEvmChain } from '../utils/balances';
import type { WalletBalanceEntry } from '../utils/balances';
import { renderWalletBalanceModal } from './ui/wallet-balance-modal';
import { applyOisyNewTabConfig, normalizeConnectedWallet, detectOisySessionViaAdapter } from '../utils/pnp';
import { clientSupportsX402 } from '../utils/x402';

const isBrowser = typeof window !== 'undefined';
let WalletSelect: any = null;

function debugLog(debug: boolean, message: string, data?: any): void {
  if (debug) {
    if (data !== undefined) {
      console.log(`[ICPay Widget] ${message}`, data);
    } else {
      console.log(`[ICPay Widget] ${message}`);
    }
  }
}

@customElement('icpay-pay-button')
export class ICPayPayButton extends LitElement {
  static styles = [baseStyles, css`
    .row { display: grid; grid-template-columns: 1fr auto; gap: 8px; align-items: center; }
    .row.single { grid-template-columns: 1fr; }
    select { background: var(--icpay-surface-alt); border: 1px solid var(--icpay-border); color: var(--icpay-text); border-radius: 8px; padding: 10px; font-weight: 600; }
    .error-message { border: 1px solid; font-weight: 500; }
    .error-message.info { background: rgba(59,130,246,0.1); border-color: rgba(59,130,246,0.3); color: #3b82f6; }
    .error-message.warning { background: rgba(245,158,11,0.1); border-color: rgba(245,158,11,0.3); color: #f59e0b; }
    .error-message.error { background: rgba(239,68,68,0.1); border-color: rgba(239,68,68,0.3); color: #ef4444; }
  `];

  @property({ type: Object }) config!: PayButtonConfig;
  @state() private selectedSymbol: string | null = null;
  @state() private processing = false;
  @state() private succeeded = false;
  @state() private errorMessage: string | null = null;
  @state() private errorSeverity: ErrorSeverity | null = null;
  @state() private errorAction: string | null = null;
  @state() private walletConnected = false;
  @state() private pendingAction: 'pay' | null = null;
  @state() private showWalletModal = false;
  @state() private walletModalStep: 'connect' | 'balances' = 'connect';
  @state() private showOnrampModal = false;
  @state() private onrampSessionId: string | null = null;
  @state() private onrampPaymentIntentId: string | null = null;
  @state() private onrampErrorMessage: string | null = null;
  @state() private oisyReadyToPay: boolean = false;
  @state() private oisySignerPreopened: boolean = false;
  @state() private skipDisconnectOnce: boolean = false;
  @state() private lastWalletId: string | null = null;
  // Post-connect token selection
  @state() private showBalanceModal = false;
  @state() private balancesLoading = false;
  @state() private balancesError: string | null = null;
  @state() private walletBalances: WalletBalanceEntry[] = [];
  private onrampPollTimer: number | null = null;
  private transakMessageHandlerBound: any | null = null;
  private pnp: any | null = null;
  private oisyConnectRetriedNewTab: boolean = false;
  private sdk: WidgetSdk | null = null;
  private onrampPollingActive: boolean = false;
  private onrampNotifyController: { stop: () => void } | null = null;

  private getSdk(): WidgetSdk {
    if (!this.sdk) {
      this.sdk = createSdk(this.config);
    }
    return this.sdk;
  }


  connectedCallback(): void {
    super.connectedCallback();
    if (!isBrowser) return;
    debugLog(this.config?.debug || false, 'Pay button connected', { config: this.config });
    // No ledger preload; balances flow handles token availability
    // selectedSymbol will be set from balance selection flow
    try { window.addEventListener('icpay-switch-account', this.onSwitchAccount as EventListener); } catch {}
    // Observe SDK intent creation event: ensure balance/wallet modals close so progress is visible
    try {
      window.addEventListener('icpay-sdk-transaction-created', ((e: any) => {
        debugLog(this.config?.debug || false, 'SDK transaction created', { detail: e?.detail });
        this.showWalletModal = false;
        this.showBalanceModal = false;
        this.requestUpdate();
      }) as EventListener);
    } catch {}
  }

  protected updated(changed: Map<string, unknown>): void {
    if (changed.has('config') && this.pendingAction && this.config?.actorProvider) {
      const action = this.pendingAction as 'pay';
      // Always emit wallet-connected for progress bar
      try { window.dispatchEvent(new CustomEvent('icpay-sdk-wallet-connected', { detail: { walletType: 'external' } })); } catch {}
      // Do NOT auto-continue to pay if we're in balances step (waiting for user to pick a token)
      // or if Oisy single-CTA mode is active. Defer until user confirms.
      if (this.walletModalStep !== 'balances' && !this.oisyReadyToPay) {
        this.pendingAction = null;
        setTimeout(() => { if (action === 'pay') this.pay(); }, 0);
      }
    }
    // No longer pull sessionId from config; it is obtained from SDK response
    if (changed.has('config')) {
      // Recreate SDK on config changes
      this.sdk = null;
      // selectedSymbol kept until user picks a token
    }
  }

  private onSwitchAccount = async (e: any) => {
    try {
      if (this.pnp) {
        try { await this.pnp.disconnect(); } catch {}
      }
      this.walletConnected = false;
      this.config = { ...this.config, actorProvider: undefined as any, connectedWallet: undefined } as any;
      this.pendingAction = 'pay';
      this.walletModalStep = 'connect';
      this.showWalletModal = true;
      this.oisyReadyToPay = false;
      this.lastWalletId = null;
      this.requestUpdate();
      try {
        const amount = Number(this.config?.amountUsd || 0);
        const curr = this.selectedSymbol || 'ICP';
        window.dispatchEvent(new CustomEvent('icpay-sdk-method-start', { detail: { name: 'pay', type: 'sendUsd', amount, currency: curr } }));
      } catch {}
    } catch {}
  };

  // Removed ledger preload

  private selectSymbol(symbol: string) { this.selectedSymbol = symbol; }

  private async ensureWallet(): Promise<boolean> {
    if (this.config.useOwnWallet) {
      if (!this.config.actorProvider) {
        this.pendingAction = 'pay';
        this.dispatchEvent(new CustomEvent('icpay-connect-wallet', { bubbles: true }));
        return false;
      }
      return true;
    }

    if (this.walletConnected) return true;
    try {
      if (!WalletSelect) {
        const module = await import('../wallet-select');
        WalletSelect = module.WalletSelect;
      }
      // Optional: open Oisy in a new tab if explicitly enabled
      const wantsOisyTab = !!((this.config as any)?.openOisyInNewTab || (this.config as any)?.plugNPlay?.openOisyInNewTab);
      const _rawCfg: any = { ...(this.config?.plugNPlay || {}) };
      // Pass chainTypes to wallet selector to filter wallets
      if ((this.config as any)?.chainTypes) _rawCfg.chainTypes = (this.config as any).chainTypes;
      const _cfg: any = wantsOisyTab ? applyOisyNewTabConfig(_rawCfg) : _rawCfg;
      try {
        if (typeof window !== 'undefined') {
          const { resolveDerivationOrigin } = await import('../utils/origin');
          _cfg.derivationOrigin = this.config?.derivationOrigin || resolveDerivationOrigin();
        }
      } catch {}
      this.pnp = new WalletSelect(_cfg);
      const availableWallets = this.pnp.getEnabledWallets();
      debugLog(this.config?.debug || false, 'Available wallets', availableWallets);
      if (!availableWallets?.length) throw new Error('No wallets available');
      // Show chooser modal and resume later
      this.pendingAction = 'pay';
      this.showWalletModal = true;
      return false;
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : 'Wallet connection failed';
      this.errorSeverity = ErrorSeverity.ERROR;
      return false;
    }
  }

  private getWalletId(w: any): string { return (w && (w.id || w.provider || w.key)) || ''; }
  private getWalletLabel(w: any): string { return (w && (w.label || w.name || w.title || w.id)) || 'Wallet'; }
  private getWalletIcon(w: any): string | null { return (w && (w.icon || w.logo || w.image)) || null; }

  private connectWithWallet(walletId: string) {
    if (!this.pnp) return;
    try {
      if (!walletId) throw new Error('No wallet ID provided');
      this.lastWalletId = (walletId || '').toLowerCase();
      if (this.lastWalletId === 'oisy') this.oisyConnectRetriedNewTab = false;
      // Minimal: connect immediately within click (no pre-open or detection)
      const promise = this.pnp.connect(walletId);
      promise.then((result: any) => {
        debugLog(this.config?.debug || false, 'Wallet connect result', result);
        const isConnected = !!(result && (result.connected === true || (result as any).principal || (result as any).owner || this.pnp?.account));
        if (!isConnected) throw new Error('Wallet connection was rejected');
        this.walletConnected = true;
        try { window.dispatchEvent(new CustomEvent('icpay-sdk-wallet-connected', { detail: { walletType: walletId } })); } catch {}
        const normalized = normalizeConnectedWallet(this.pnp, result);
        const evmProvider = (this.pnp as any)?.getEvmProvider?.();
        this.config = { ...this.config, connectedWallet: normalized, actorProvider: (canisterId: string, idl: any) => this.pnp!.getActor({ canisterId, idl, requiresSigning: true, anon: false }), ...(evmProvider ? { evmProvider } : {}) } as any;
        this.sdk = null;
        const isOisy = (walletId || '').toLowerCase() === 'oisy';
        if (isOisy) {
          // Stay in modal and show a single CTA to execute the transfer from a user gesture
          this.oisyReadyToPay = true;
          // Prevent auto-pay via updated() resume logic
          this.pendingAction = null;
        } else {
          // Keep wallet modal open; advance to balances step and load balances inside it
          this.walletModalStep = 'balances';
          this.fetchAndShowBalances('pay');
        }
      }).catch((error: any) => {
        debugLog(this.config?.debug || false, 'Wallet connection error', error);
        const isOisy = (walletId || '').toLowerCase() === 'oisy';
        const message = (error && (error.message || String(error))) || '';
        const blocked = isOisy && (!this.oisyConnectRetriedNewTab) && (message.includes('Signer window could not be opened') || message.includes('Communication channel could not be established'));
        if (blocked) {
          // Retry Oisy connect by forcing new-tab transport
          this.oisyConnectRetriedNewTab = true;
          (async () => {
            try {
              if (!WalletSelect) { const module = await import('../wallet-select'); WalletSelect = module.WalletSelect; }
            const raw: any = { ...(this.config?.plugNPlay || {}) };
            if ((this.config as any)?.chainTypes) raw.chainTypes = (this.config as any).chainTypes;
              const cfg: any = applyOisyNewTabConfig(raw);
              try {
                if (typeof window !== 'undefined') {
                  const { resolveDerivationOrigin } = await import('../utils/origin');
                  cfg.derivationOrigin = this.config?.derivationOrigin || resolveDerivationOrigin();
                }
              } catch {}
              this.pnp = new WalletSelect(cfg);
              const retry = this.pnp.connect('oisy');
              retry.then((result: any) => {
                const isConnected = !!(result && (result.connected === true || (result as any).principal || (result as any).owner || this.pnp?.account));
                if (!isConnected) throw new Error('Wallet connection was rejected');
                this.walletConnected = true;
                try { window.dispatchEvent(new CustomEvent('icpay-sdk-wallet-connected', { detail: { walletType: 'oisy' } })); } catch {}
                const normalized = normalizeConnectedWallet(this.pnp, result);
                const evmProvider = (this.pnp as any)?.getEvmProvider?.();
                this.config = { ...this.config, connectedWallet: normalized, actorProvider: (canisterId: string, idl: any) => this.pnp!.getActor({ canisterId, idl, requiresSigning: true, anon: false }), ...(evmProvider ? { evmProvider } : {}) } as any;
                this.sdk = null;
                this.oisyReadyToPay = true;
                this.pendingAction = null;
              }).catch((err2: any) => {
                debugLog(this.config?.debug || false, 'Oisy retry connect (new tab) failed', err2);
                this.errorMessage = err2 instanceof Error ? err2.message : 'Wallet connection failed';
                this.errorSeverity = ErrorSeverity.ERROR;
                this.showWalletModal = false;
                try { window.dispatchEvent(new CustomEvent('icpay-sdk-wallet-error', { detail: { message: this.errorMessage, code: 'WALLET_CONNECT_ERROR' } })); } catch {}
              });
            } catch (initErr) {
              debugLog(this.config?.debug || false, 'Oisy new-tab init failed', initErr);
              this.errorMessage = initErr instanceof Error ? initErr.message : 'Wallet connection failed';
              this.errorSeverity = ErrorSeverity.ERROR;
              this.showWalletModal = false;
              try { window.dispatchEvent(new CustomEvent('icpay-sdk-wallet-error', { detail: { message: this.errorMessage, code: 'WALLET_CONNECT_ERROR' } })); } catch {}
            }
          })();
          return;
        }
        this.errorMessage = error instanceof Error ? error.message : 'Wallet connection failed';
        this.errorSeverity = ErrorSeverity.ERROR;
        this.showWalletModal = false;
        try { window.dispatchEvent(new CustomEvent('icpay-sdk-wallet-error', { detail: { message: this.errorMessage, code: 'WALLET_CONNECT_ERROR' } })); } catch {}
      });
    } catch (error) {
      debugLog(this.config?.debug || false, 'Wallet connection error (sync)', error);
      this.errorMessage = error instanceof Error ? error.message : 'Wallet connection failed';
      this.errorSeverity = ErrorSeverity.ERROR;
      this.showWalletModal = false;
      try { window.dispatchEvent(new CustomEvent('icpay-sdk-wallet-error', { detail: { message: this.errorMessage, code: 'WALLET_CONNECT_ERROR' } })); } catch {}
    }
  }

  private async fetchAndShowBalances(action: 'pay') {
    try {
      this.balancesLoading = true;
      this.balancesError = null;
      this.walletModalStep = 'balances';
      this.showBalanceModal = false; // integrated flow uses wallet modal
      const sdk = this.getSdk();
      const { balances } = await getWalletBalanceEntries({
        sdk,
        lastWalletId: this.lastWalletId,
        connectedWallet: (this.config as any)?.connectedWallet,
        amountUsd: Number(this.config?.amountUsd ?? 0),
        chainShortcodes: (this.config as any)?.chainShortcodes,
        tokenShortcodes: (this.config as any)?.tokenShortcodes,
      });
      this.walletBalances = balances as WalletBalanceEntry[];
      this.pendingAction = action;
    } catch (e: any) {
      this.walletBalances = [];
      this.balancesError = (e && (e.message || String(e))) || 'Failed to load balances';
    } finally {
      this.balancesLoading = false;
    }
  }

  private onSelectBalanceSymbol = async (shortcode: string) => {
    // Resolve selection by tokenShortcode; set selectedSymbol from entry for UI
    const sel = (this.walletBalances || []).find(b => (b as any)?.tokenShortcode === shortcode);
    if (sel?.ledgerSymbol) this.selectedSymbol = sel.ledgerSymbol;

    // Close wallet modal before starting progress to reveal progress bar
    this.showBalanceModal = false;
    this.showWalletModal = false;

    // If EVM wallet, ensure correct network first, then emit EVM payment start
    if (isEvmWalletId(this.lastWalletId)) {
      debugLog(this.config?.debug || false, 'EVM selection made', {
        selectedSymbol: this.selectedSymbol,
        selPresent: !!sel,
        selSnapshot: sel ? {
          ledgerId: (sel as any)?.ledgerId,
          ledgerSymbol: (sel as any)?.ledgerSymbol,
          ledgerName: (sel as any)?.ledgerName,
          chainUuid: (sel as any)?.chainUuid,
          chainId: (sel as any)?.chainId,
          chainName: (sel as any)?.chainName,
          x402Accepts: (sel as any)?.x402Accepts,
          requiredAmount: (sel as any)?.requiredAmount,
          hasSufficientBalance: (sel as any)?.hasSufficientBalance,
        } : null,
      });
      const targetChain = sel?.chainId;
      ensureEvmChain(targetChain, { chainName: sel?.chainName, rpcUrlPublic: (sel as any)?.rpcUrlPublic, nativeSymbol: sel?.ledgerSymbol, decimals: sel?.decimals }).then(async () => {
        try {
        const sdk = this.getSdk();
        const amountUsd = Number(this.config?.amountUsd ?? 0);
          const symbolNow = sel?.ledgerSymbol;
          const tryX402 = Boolean(sel && sel.x402Accepts);
          debugLog(this.config?.debug || false, 'EVM post-ensure chain snapshot', {
            targetChain,
            amountUsd,
            symbolNow,
            tryX402,
            x402Accepts: sel?.x402Accepts,
          });
          if (tryX402) {
            try {
              const metadata = {
                ...(this.config as any)?.metadata,
                icpay_network: 'evm',
                icpay_ledger_id: sel?.ledgerId,
                icpay_context: 'pay-button:x402'
              };
              debugLog(this.config?.debug || false, 'Attempting X402 flow (EVM selection)', { amountUsd, tokenShortcode: sel?.tokenShortcode, x402Accepts: sel?.x402Accepts });
              await (sdk.client as any).createPaymentX402Usd({ usdAmount: amountUsd, tokenShortcode: (sel as any)?.tokenShortcode, metadata });
              return;
            } catch (x402Err: any) {
              debugLog(this.config?.debug || false, 'X402 payment failed (EVM selection), falling back', {
                message: x402Err?.message, code: x402Err?.code, data: x402Err?.details || x402Err?.data
              });
            }
          } else {
            debugLog(this.config?.debug || false, 'Skipping X402 path', {
              reason: sel ? (sel.x402Accepts ? 'unknown' : 'x402Accepts false') : 'no selection',
              selPresent: !!sel,
              x402Accepts: sel?.x402Accepts,
            });
          }
          // Normal wallet flow (native or non-x402 token)
          debugLog(this.config?.debug || false, 'Falling back to normal EVM wallet flow', {
            amountUsd,
            tokenShortcode: (sel as any)?.tokenShortcode,
          });
          await (sdk.client as any).createPaymentUsd({
            usdAmount: amountUsd,
            tokenShortcode: (sel as any)?.tokenShortcode,
            metadata: {
              ...(this.config as any)?.metadata,
              icpay_network: 'evm',
              icpay_ledger_id: sel?.ledgerId
            }
          });
        } catch {}
      });
      return;
    }
    const action = this.pendingAction; this.pendingAction = null;
    if (action === 'pay') {
      // IC flow: send using tokenShortcode same as EVM
      try {
        const sel = (this.walletBalances || []).find(b => (b as any)?.tokenShortcode === shortcode);
        const sdk = this.getSdk();
        const amountUsd = Number(this.config?.amountUsd ?? 0);
        debugLog(this.config?.debug || false, 'IC selection made', {
          selectedSymbol: this.selectedSymbol,
          selPresent: !!sel,
          selSnapshot: sel ? {
            ledgerId: (sel as any)?.ledgerId,
            ledgerSymbol: (sel as any)?.ledgerSymbol,
            ledgerName: (sel as any)?.ledgerName,
            requiredAmount: (sel as any)?.requiredAmount,
            hasSufficientBalance: (sel as any)?.hasSufficientBalance,
            tokenShortcode: (sel as any)?.tokenShortcode,
          } : null,
        });
        await (sdk.client as any).createPaymentUsd({
          usdAmount: amountUsd,
          tokenShortcode: (sel as any)?.tokenShortcode,
          metadata: {
            ...(this.config as any)?.metadata,
            icpay_network: 'ic',
            icpay_ledger_id: (sel as any)?.ledgerId
          }
        });
      } catch {}
    }
  };

  private renderWalletModal() {
    if (!this.showWalletModal || !this.pnp) return null as any;
    const walletsRaw = this.pnp.getEnabledWallets() || [];
    const wallets = buildWalletEntries(walletsRaw);
    const onrampEnabled = (this.config?.onramp?.enabled !== false) && (this.config?.onrampDisabled !== true);
    const minOnramp = 5;
    const amountUsd = Number(this.config?.amountUsd ?? 0);
    const showTooltip = onrampEnabled && amountUsd > 0 && amountUsd < minOnramp;
    const diff = Math.max(0, minOnramp - amountUsd);
    const tooltip = showTooltip ? `Note: Minimum card amount is $${minOnramp}. You will pay about $${diff.toFixed(2)} more.` : null;
    return renderWalletSelectorModal({
      visible: this.showWalletModal,
      wallets,
      isConnecting: false,
      onSwitchAccount: () => this.onSwitchAccount(null),
      step: this.walletModalStep,
      balances: this.walletModalStep === 'balances' ? (this.walletBalances || []) : [],
      balancesLoading: this.walletModalStep === 'balances' ? this.balancesLoading : false,
      balancesError: this.walletModalStep === 'balances' ? this.balancesError : null,
      onSelectBalance: (s: string) => this.onSelectBalanceSymbol(s),
      onBack: () => { this.walletModalStep = 'connect'; },
      onSelect: (walletId: string) => {
        // Ensure any signer window/channel establishment happens directly in this click handler
        this.connectWithWallet(walletId);
      },
        onClose: () => { this.showWalletModal = false; this.oisyReadyToPay = false; try { window.dispatchEvent(new CustomEvent('icpay-sdk-wallet-cancelled', { detail: { reason: 'user_cancelled' } })); } catch {} },
      onCreditCard: onrampEnabled ? () => this.startOnramp() : undefined,
      creditCardLabel: this.config?.onramp?.creditCardLabel || 'Pay with credit card',
      showCreditCard: onrampEnabled,
      creditCardTooltip: tooltip,
      oisyReadyToPay: this.oisyReadyToPay,
      onOisyPay: () => {
        this.showWalletModal = false; // Close modal so progress bar can proceed
        this.skipDisconnectOnce = true;
        this.oisyReadyToPay = false;
        this.pay(); // Trigger pay within same user gesture
      }
    });
  }

  private startOnramp() {
    // Signal to progress bar that onramp flow is starting
    try { window.dispatchEvent(new CustomEvent('icpay-sdk-method-start', { detail: { name: 'createPaymentUsd', type: 'onramp' } })); } catch {}
    this.showWalletModal = false;
    // Kick off onramp intent creation through SDK and open Transak with returned sessionId
    setTimeout(() => this.createOnrampIntent(), 0);
  }

  private async createOnrampIntent() {
    try {
      const amountUsd = Number(this.config?.amountUsd ?? 0);
      const sdk = this.getSdk();
      if (!this.selectedSymbol) this.selectedSymbol = 'ICP';
      const symbol = this.selectedSymbol || 'ICP';
      const resp = await sdk.startOnrampUsd(amountUsd, symbol, { context: 'pay-button:onramp' });
      const sessionId = resp?.metadata?.icpay_onramp?.sessionId || resp?.metadata?.icpay_onramp?.session_id || resp?.metadata?.onramp?.sessionId || resp?.metadata?.onramp?.session_id || null;
      const errorMessage = resp?.metadata?.icpay_onramp?.errorMessage || resp?.metadata?.onramp?.errorMessage || null;
      this.onrampErrorMessage = errorMessage || null;
      const paymentIntentId = resp?.metadata?.icpay_payment_intent_id || resp?.metadata?.paymentIntentId || resp?.paymentIntentId || null;
      this.onrampPaymentIntentId = paymentIntentId;
      if (sessionId) {
        this.onrampSessionId = sessionId;
        this.showOnrampModal = true;
        this.attachTransakMessageListener();
      } else {
        // Open modal in friendly error state (sessionId missing)
        this.onrampSessionId = null;
        this.showOnrampModal = true;
      }
    } catch (e) {
      // Also show friendly error modal on any error
      this.onrampSessionId = null;
      this.onrampErrorMessage = (e as any)?.message || null;
      this.showOnrampModal = true;
      handleWidgetError(e, {
        onError: (error) => {
          this.dispatchEvent(new CustomEvent('icpay-error', { detail: error, bubbles: true }));
          if (shouldShowErrorToUser(error)) {
            this.errorMessage = getErrorMessage(error);
            this.errorSeverity = getErrorSeverity(error);
            this.errorAction = getErrorAction(error);
          }
        }
      });
    }
  }

  private attachTransakMessageListener() {
    if (this.transakMessageHandlerBound) return;
    this.transakMessageHandlerBound = (event: MessageEvent) => this.onTransakMessage(event);
    try { window.addEventListener('message', this.transakMessageHandlerBound as any); } catch {}
  }

  private detachTransakMessageListener() {
    if (this.transakMessageHandlerBound) {
      try { window.removeEventListener('message', this.transakMessageHandlerBound as any); } catch {}
      this.transakMessageHandlerBound = null;
    }
  }

  private onTransakMessage(event: MessageEvent) {
    const data: any = event?.data;
    const eventId: string | undefined = data?.event_id || data?.eventId || data?.id;
    if (!eventId || typeof eventId !== 'string') return;

    // Only react to Transak order success
    if (eventId === 'TRANSAK_ORDER_SUCCESSFUL') {
      // Prevent multiple pollers if provider emits duplicates
      this.detachTransakMessageListener();
      if (this.onrampPollingActive) return;
      const orderId = (data?.data?.id) || (data?.id) || (data?.webhookData?.id) || null;
      // Complete steps up to verify and set confirm to loading by emitting method success events the progress bar understands
      try { window.dispatchEvent(new CustomEvent('icpay-sdk-method-success', { detail: { name: 'getLedgerBalance' } })); } catch {}
      try { window.dispatchEvent(new CustomEvent('icpay-sdk-method-success', { detail: { name: 'sendFundsToLedger' } })); } catch {}
      try { window.dispatchEvent(new CustomEvent('icpay-sdk-method-success', { detail: { name: 'notifyLedgerTransaction' } })); } catch {}

      // Close Transak modal upon success, continue with our own progress
      this.showOnrampModal = false;

      // Start polling our API for intent status
      this.startOnrampPolling(orderId || undefined);
    }
  }

  private startOnrampPolling(orderId?: string) {
    // Clear any previous polling
    if (this.onrampPollTimer) { try { clearInterval(this.onrampPollTimer); } catch {}; this.onrampPollTimer = null; }
    if (this.onrampNotifyController) { try { this.onrampNotifyController.stop(); } catch {}; this.onrampNotifyController = null; }

    const paymentIntentId = this.onrampPaymentIntentId;
    if (!paymentIntentId) return;

    const sdk = this.getSdk();
    const handleComplete = () => {
      this.detachTransakMessageListener();
      if (this.onrampNotifyController) { try { this.onrampNotifyController.stop(); } catch {} }
      this.onrampNotifyController = null;
      this.onrampPollingActive = false;
    };
    // Also listen to completion event to tidy up
    const listener = (e: any) => { handleComplete(); };
    try { window.addEventListener('icpay-sdk-transaction-completed', listener as any, { once: true } as any); } catch {}
    this.onrampPollingActive = true;
    this.onrampNotifyController = sdk.notifyIntentUntilComplete(paymentIntentId, 5000, orderId);
    // Store a no-op timer id placeholder so our cleanup path remains intact
    this.onrampPollTimer = 1 as any;
  }

  private async pay() {
    if (!isBrowser || this.processing) return;

    // Reset error state
    this.errorMessage = null;
    this.errorSeverity = null;
    this.errorAction = null;

    // Emit method start to open progress modal and set first step
    try { window.dispatchEvent(new CustomEvent('icpay-sdk-method-start', { detail: { name: 'pay', type: 'sendUsd', amount: this.config?.amountUsd, currency: this.selectedSymbol || 'ICP' } })); } catch {}

    this.processing = true;
    try {
      // Disconnect current built-in wallet before new payment attempt unless we just connected
      if (!this.skipDisconnectOnce) {
        try {
          if (!this.config.useOwnWallet && this.pnp) {
            await this.pnp.disconnect?.();
            this.walletConnected = false;
            this.config = { ...this.config, actorProvider: undefined as any, connectedWallet: undefined } as any;
          }
        } catch {}
      } else {
        this.skipDisconnectOnce = false;
      }
      const ready = await this.ensureWallet();
      if (!ready) return;

      const sdk = this.getSdk();
      // Debug: snapshot wallet state before resolving canister and sending
      try {
        const cw = (this.config as any)?.connectedWallet;
        const pnpAcct = (this as any)?.pnp?.account;
        debugLog(this.config?.debug || false, 'Wallet state before payment', {
          connectedWallet: cw,
          pnpAccount: pnpAcct,
          principal: (cw?.owner || cw?.principal || pnpAcct?.owner || pnpAcct?.principal || null)
        });
      } catch {}
      // Always proceed to balances selection modal; selection handler will create the payment
      this.walletModalStep = 'balances';
      this.showWalletModal = true;
      await this.fetchAndShowBalances('pay');
      return;
    } catch (e) {
      debugLog(this.config?.debug || false, 'Payment error', {
        message: (e as any)?.message,
        code: (e as any)?.code,
        details: (e as any)?.details,
        stack: (e as any)?.stack
      });
      handleWidgetError(e, {
        onError: (error) => {
          this.dispatchEvent(new CustomEvent('icpay-error', { detail: error, bubbles: true }));
          if (shouldShowErrorToUser(error)) {
            this.errorMessage = getErrorMessage(error);
            this.errorSeverity = getErrorSeverity(error);
            this.errorAction = getErrorAction(error);
          }
        }
      });
      // On failure, disconnect so next attempt triggers wallet selection again
      try {
        if (!this.config.useOwnWallet && this.pnp) {
          await this.pnp.disconnect?.();
          this.walletConnected = false;
          this.config = { ...this.config, actorProvider: undefined as any, connectedWallet: undefined } as any;
        }
      } catch {}
    } finally {
      this.processing = false;
    }
  }

  render() {
    if (!this.config) return html`<div class="icpay-card icpay-section">Loading...</div>`;

    const selectedSymbol = this.selectedSymbol || 'ICP';
    const amountPart = typeof this.config?.amountUsd === 'number' ? `${Number(this.config.amountUsd).toFixed(2)}` : '';
    const rawLabel = this.config?.buttonLabel || (typeof this.config?.amountUsd === 'number' ? 'Pay ${amount} with crypto' : 'Pay with {symbol}');
    const label = rawLabel.replace('{amount}', amountPart || '$0.00').replace('{symbol}', selectedSymbol);
    const progressEnabled = this.config?.progressBar?.enabled !== false;
    const showProgressBar = progressEnabled;
    const suspendProgress = this.showWalletModal || this.showBalanceModal;

    return html`
      <div class="icpay-card icpay-section icpay-widget-base">
        ${showProgressBar ? html`
          <icpay-progress-bar
            .debug=${!!this.config?.debug}
            .theme=${this.config?.theme}
            .amount=${Number(this.config?.amountUsd || 0)}
            .ledgerSymbol=${selectedSymbol}
            .suspended=${suspendProgress}
          ></icpay-progress-bar>
        ` : null}

        <div class="row single">
          <button class="pay-button ${this.processing?'processing':''}"
            ?disabled=${this.processing || (this.config?.disablePaymentButton === true) || (this.succeeded && this.config?.disableAfterSuccess === true)}
            @click=${() => this.pay()}>
            ${this.succeeded && this.config?.disableAfterSuccess ? 'Paid' : (this.processing ? 'Processing…' : label)}
          </button>
        </div>

        ${this.errorMessage ? html`
          <div class="error-message ${this.errorSeverity}" style="margin-top: 12px; padding: 8px 12px; border-radius: 6px; font-size: 14px; text-align: center;">
            ${this.errorMessage}
            ${this.errorAction ? html`<button style="margin-left: 8px; padding: 4px 8px; background: transparent; border: 1px solid currentColor; border-radius: 4px; font-size: 12px; cursor: pointer;">${this.errorAction}</button>` : ''}
          </div>
        ` : ''}
        ${this.renderWalletModal()}
        ${renderWalletBalanceModal({
          visible: this.showBalanceModal,
          isLoading: this.balancesLoading,
          error: this.balancesError,
          balances: this.walletBalances,
          onSelect: (s: string) => this.onSelectBalanceSymbol(s),
          onClose: () => { this.showBalanceModal = false; },
        })}
        ${this.showOnrampModal ? renderTransakOnrampModal({
          visible: this.showOnrampModal,
          sessionId: this.onrampSessionId,
          errorMessage: this.onrampErrorMessage,
          apiKey: this.config?.onramp?.apiKey,
          apiUrl: this.config?.apiUrl,
          paymentIntentId: this.onrampPaymentIntentId,
          environment: (this.config?.onramp?.environment || 'STAGING') as any,
          width: this.config?.onramp?.width,
          height: this.config?.onramp?.height,
          onClose: () => { this.showOnrampModal = false; },
          onBack: () => { this.showOnrampModal = false; this.showWalletModal = true; }
        } as TransakOnrampOptions) : null}
      </div>
    `;
  }
}

declare global { interface HTMLElementTagNameMap { 'icpay-pay-button': ICPayPayButton } }


