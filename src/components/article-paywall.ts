import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { baseStyles } from '../styles';
import { handleWidgetError, getErrorMessage, shouldShowErrorToUser, getErrorAction, getErrorSeverity, ErrorSeverity } from '../error-handling';
import type { ArticlePaywallConfig, CryptoOption } from '../types';
import { createSdk } from '../utils/sdk';
import './progress-bar';
import './token-selector';
import { renderWalletSelectorModal } from './wallet-selector-modal';

// Check if we're in a browser environment
const isBrowser = typeof window !== 'undefined';

// Plug N Play will be imported dynamically when needed
let PlugNPlay: any = null;

// Debug logger utility for widget components
function debugLog(debug: boolean, message: string, data?: any): void {
  if (debug) {
    if (data !== undefined) {
      console.log(`[ICPay Widget] ${message}`, data);
    } else {
      console.log(`[ICPay Widget] ${message}`);
    }
  }
}

@customElement('icpay-article-paywall')
export class ICPayArticlePaywall extends LitElement {
  static styles = [baseStyles, css`
    .container { background: var(--icpay-surface-alt); border: 1px solid var(--icpay-border); border-radius: 16px; padding: 16px; margin-bottom: 16px; }
    .title { color: var(--icpay-text); font-weight: 700; margin-bottom: 8px; }
    .preview { color: var(--icpay-muted); margin-bottom: 12px; line-height: 1.6; }
    .locked { filter: blur(3px); color: #6b7280; margin-bottom: 12px; }
    .unlocked { filter: blur(0); color: var(--icpay-text); }
    .crypto-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin: 12px 0 16px; }
    .crypto-option { background: var(--icpay-surface-alt); border: 2px solid var(--icpay-border); border-radius: 12px; padding: 12px 8px; text-align: center; cursor: pointer; color: var(--icpay-text); font-weight: 600; font-size: 12px; }
    .crypto-option.selected { background: var(--icpay-primary); color: #111827; border-color: var(--icpay-primary); }

    .error-message {
      border: 1px solid;
      font-weight: 500;
    }

    .error-message.info {
      background: rgba(59, 130, 246, 0.1);
      border-color: rgba(59, 130, 246, 0.3);
      color: #3b82f6;
    }

    .error-message.warning {
      background: rgba(245, 158, 11, 0.1);
      border-color: rgba(245, 158, 11, 0.3);
      color: #f59e0b;
    }

    .error-message.error {
      background: rgba(239, 68, 68, 0.1);
      border-color: rgba(239, 68, 68, 0.3);
      color: #ef4444;
    }
  `];

  @property({ type: Object }) config!: ArticlePaywallConfig;
  @property({ type: String }) title: string = 'Article Title';
  @property({ type: String }) preview: string = '';
  @property({ type: String }) lockedContent: string = '';
  private get obfuscatedLockedContent(): string {
    try {
      const s = this.lockedContent || '';
      // Replace all non-whitespace characters with 'x' to avoid leaking content
      return s.replace(/[^\s]/g, 'x');
    } catch {
      return 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
    }
  }
  @state() private selectedSymbol = 'ICP';
  @state() private unlocked = false;
  @state() private succeeded = false;
  @state() private processing = false;
  @state() private availableLedgers: CryptoOption[] = [];
  @state() private errorMessage: string | null = null;
  @state() private errorSeverity: ErrorSeverity | null = null;
  @state() private errorAction: string | null = null;
  @state() private walletConnected = false;
  @state() private pendingAction: 'unlock' | null = null;
  @state() private showWalletModal = false;
  private pnp: any | null = null;
  private async tryAutoConnectPNP() {
    try {
      if (!this.config || this.config?.useOwnWallet) return;
      const raw = localStorage.getItem('icpay:pnp');
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (!saved?.provider || !saved?.principal) return;
      if (!PlugNPlay) {
        const module = await import('@windoge98/plug-n-play');
        PlugNPlay = module.PNP;
      }
      const pnp = new PlugNPlay(this.config?.plugNPlay || {});
      // Hydrate saved principal for UI/history; require connect on pay
      this.walletConnected = false;
      this.config = {
        ...this.config,
        connectedWallet: { owner: saved.principal, principal: saved.principal, connected: false } as any
      };
    } catch {}
  }

  private get cryptoOptions(): CryptoOption[] {
    // If config provides cryptoOptions, use those (allows override)
    if (this.config.cryptoOptions) {
      return this.config.cryptoOptions;
    }
    // Otherwise use fetched verified ledgers
    return this.availableLedgers;
  }

  connectedCallback(): void {
    super.connectedCallback();
    if (!isBrowser) return; // Skip in SSR

    debugLog(this.config?.debug || false, 'Article paywall connected', { config: this.config });

    // Apply config-driven content if provided
    if (this.config) {
      if (typeof (this.config as any).title === 'string') this.title = (this.config as any).title;
      if (typeof (this.config as any).preview === 'string') this.preview = (this.config as any).preview;
      if (typeof (this.config as any).lockedContent === 'string') this.lockedContent = (this.config as any).lockedContent;
    }

    this.tryAutoConnectPNP();
    if (!(this.config?.cryptoOptions && this.config.cryptoOptions.length > 0)) {
      this.loadVerifiedLedgers();
    }
  }

  protected updated(changed: Map<string, unknown>): void {
    if (changed.has('config')) {
      // Re-apply content on config update
      if (this.config) {
        if (typeof (this.config as any).title === 'string') this.title = (this.config as any).title;
        if (typeof (this.config as any).preview === 'string') this.preview = (this.config as any).preview;
        if (typeof (this.config as any).lockedContent === 'string') this.lockedContent = (this.config as any).lockedContent;
      }
    }
    if (changed.has('config') && this.pendingAction && this.config?.actorProvider) {
      const action = this.pendingAction;
      this.pendingAction = null;
      try { window.dispatchEvent(new CustomEvent('icpay-sdk-wallet-connected', { detail: { walletType: 'external' } })); } catch {}
      setTimeout(() => { if (action === 'unlock') this.unlock(); }, 0);
    }
  }

  private async loadVerifiedLedgers() {
    if (!isBrowser || !this.config?.publishableKey) {
      // Skip in SSR or if config not set yet
      return;
    }

    try {
      const sdk = createSdk(this.config);
      const ledgers = await sdk.client.getVerifiedLedgers();
      this.availableLedgers = ledgers.map(ledger => ({
        symbol: ledger.symbol,
        label: ledger.name,
        canisterId: ledger.canisterId
      }));
      if (!this.selectedSymbol) {
        this.selectedSymbol = this.config?.defaultSymbol || (this.availableLedgers[0]?.symbol || 'ICP');
      }
    } catch (error) {
      console.warn('Failed to load verified ledgers:', error);
      // Fallback to basic options if API fails
      this.availableLedgers = [{ symbol: 'ICP', label: 'ICP', canisterId: 'ryjl3-tyaaa-aaaaa-aaaba-cai' }];
      if (!this.selectedSymbol) this.selectedSymbol = 'ICP';
    }
  }

  private selectSymbol(s: string) { this.selectedSymbol = s; }

  private async unlock() {
    if (!isBrowser) return; // Skip in SSR

    if (this.processing || this.unlocked) return;

    debugLog(this.config?.debug || false, 'Article paywall unlock started', {
      priceUsd: this.config.priceUsd,
      selectedSymbol: this.selectedSymbol,
      useOwnWallet: this.config.useOwnWallet
    });

    // Clear previous errors
    this.errorMessage = null;
    this.errorSeverity = null;
    this.errorAction = null;

    try { window.dispatchEvent(new CustomEvent('icpay-sdk-method-start', { detail: { name: 'unlock', type: 'sendUsd', amount: this.config.priceUsd, currency: this.selectedSymbol } })); } catch {}

    this.processing = true;
    try {
      // Check wallet connection status first
      if (this.config.useOwnWallet) {
        if (!this.config.actorProvider) {
          this.pendingAction = 'unlock';
          this.dispatchEvent(new CustomEvent('icpay-connect-wallet', { bubbles: true }));
          return;
        }
      } else {
        // Built-in wallet handling - connect directly with Plug N Play
        if (!this.walletConnected) {
          debugLog(this.config?.debug || false, 'Connecting to wallet via Plug N Play');
          try {
            if (!PlugNPlay) { const module = await import('@windoge98/plug-n-play'); PlugNPlay = module.PNP; }
            this.pnp = new PlugNPlay(this.config?.plugNPlay || {});
            const availableWallets = this.pnp.getEnabledWallets();
            debugLog(this.config?.debug || false, 'Available wallets', availableWallets);
            if (!availableWallets?.length) throw new Error('No wallets available');
            this.pendingAction = 'unlock';
            this.showWalletModal = true;
            return;
          } catch (error) {
            debugLog(this.config?.debug || false, 'Wallet connection error:', error);
            this.errorMessage = error instanceof Error ? error.message : 'Wallet connection failed';
            this.errorSeverity = ErrorSeverity.ERROR;
            return;
          }
        }
      }

      // Wallet is connected, proceed with payment
      debugLog(this.config?.debug || false, 'Creating SDK for payment');
      const sdk = createSdk(this.config);

      const opt = this.cryptoOptions.find(o => o.symbol === this.selectedSymbol)!;
      const canisterId = opt.canisterId || await sdk.client.getLedgerCanisterIdBySymbol(this.selectedSymbol);

      debugLog(this.config?.debug || false, 'Article payment details', {
        priceUsd: this.config.priceUsd,
        selectedSymbol: this.selectedSymbol,
        canisterId
      });

      const resp = await sdk.sendUsd(this.config.priceUsd, canisterId, { context: 'article' });
      debugLog(this.config?.debug || false, 'Article payment completed', { resp });

      this.unlocked = true;
      this.succeeded = true;
      if (this.config.onSuccess) this.config.onSuccess({ id: resp.transactionId, status: resp.status });
      this.dispatchEvent(new CustomEvent('icpay-unlock', { detail: { amount: this.config.priceUsd, tx: resp }, bubbles: true }));
    } catch (e) {
      // Handle errors using the new error handling system
      handleWidgetError(e, {
        onError: (error) => {
          this.dispatchEvent(new CustomEvent('icpay-error', { detail: error, bubbles: true }));

          // Update UI error state if error should be shown to user
          if (shouldShowErrorToUser(error)) {
            this.errorMessage = getErrorMessage(error);
            this.errorSeverity = getErrorSeverity(error);
            this.errorAction = getErrorAction(error);
          }
        }
      });
    } finally {
      this.processing = false;
    }
  }

  private getWalletId(w: any): string { return (w && (w.id || w.provider || w.key)) || ''; }
  private getWalletLabel(w: any): string { return (w && (w.label || w.name || w.title || w.id)) || 'Wallet'; }
  private getWalletIcon(w: any): string | null { return (w && (w.icon || w.logo || w.image)) || null; }

  private async connectWithWallet(walletId: string) {
    if (!this.pnp) return;
    try {
      if (!walletId) throw new Error('No wallet ID provided');
      const result = await this.pnp.connect(walletId);
      const isConnected = !!(result && (result.connected === true || (result as any).principal || (result as any).owner || this.pnp?.account));
      if (!isConnected) throw new Error('Wallet connection was rejected');
      this.walletConnected = true;
      try { window.dispatchEvent(new CustomEvent('icpay-sdk-wallet-connected', { detail: { walletType: walletId } })); } catch {}
      this.config = { ...this.config, connectedWallet: result, actorProvider: (canisterId: string, idl: any) => this.pnp!.getActor({ canisterId, idl, requiresSigning: true, anon: false }) };
      this.showWalletModal = false;
      const action = this.pendingAction; this.pendingAction = null;
      if (action === 'unlock') setTimeout(() => this.unlock(), 0);
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : 'Wallet connection failed';
      this.errorSeverity = ErrorSeverity.ERROR;
      this.showWalletModal = false;
    }
  }

  render() {
    if (!this.config) {
      return html`<div class="card section">Loading...</div>`;
    }

    return html`
      <div class="card section">
        ${this.config?.progressBar?.enabled !== false ? html`<icpay-progress-bar mode="${this.config?.progressBar?.mode || 'modal'}"></icpay-progress-bar>` : null}
        <div class="container">
          <div class="title">${this.title}</div>
          <div class="preview">${this.preview}</div>
          <div class="${this.unlocked ? 'unlocked' : 'locked'}">${this.unlocked ? this.lockedContent : this.obfuscatedLockedContent}</div>
        </div>
        <div class="pricing" style="text-align:center;">
          <div class="price">$${Number(this.config?.priceUsd ?? 0).toFixed(2)}</div>
          <div class="label">Continue reading</div>
        </div>
        <div>
          <icpay-token-selector
            .options=${this.cryptoOptions}
            .value=${this.selectedSymbol || ''}
            .defaultSymbol=${this.config?.defaultSymbol || 'ICP'}
            mode=${(this.config?.showLedgerDropdown || 'buttons')}
            @icpay-token-change=${(e: any) => this.selectSymbol(e.detail.symbol)}
          ></icpay-token-selector>
        </div>
        <button class="pay-button ${this.processing?'processing':''}" ?disabled=${this.processing||this.unlocked || (this.config?.disablePaymentButton === true) || (this.succeeded && this.config?.disableAfterSuccess === true)} @click=${() => this.unlock()}>
          ${this.unlocked ? 'Unlocked' : (this.processing ? 'Processing…' : (
            (this.config?.buttonLabel || 'Pay ${amount} with {symbol}')
              .replace('{amount}', `${Number(this.config?.priceUsd ?? 0).toFixed(2)}`)
              .replace('{symbol}', this.selectedSymbol)
          ))}
        </button>

        ${this.errorMessage ? html`
          <div class="error-message ${this.errorSeverity}" style="margin-top: 12px; padding: 8px 12px; border-radius: 6px; font-size: 14px; text-align: center;">
            ${this.errorMessage}
            ${this.errorAction ? html`
              <button style="margin-left: 8px; padding: 4px 8px; background: transparent; border: 1px solid currentColor; border-radius: 4px; font-size: 12px; cursor: pointer;">
                ${this.errorAction}
              </button>
            ` : ''}
          </div>
        ` : ''}
        ${(() => {
          const walletsRaw = (this as any).pnp?.getEnabledWallets?.() || [];
          const wallets = walletsRaw.map((w:any)=>({ id: this.getWalletId(w), label: this.getWalletLabel(w), icon: this.getWalletIcon(w) }));
          return renderWalletSelectorModal({
            visible: !!(this.showWalletModal && this.pnp),
            wallets,
            isConnecting: false,
            onSelect: (walletId: string) => this.connectWithWallet(walletId),
            onClose: () => { this.showWalletModal = false; }
          });
        })()}
      </div>
    `;
  }
}

declare global { interface HTMLElementTagNameMap { 'icpay-article-paywall': ICPayArticlePaywall } }


