import { LitElement, html, css } from 'lit';
import { applyThemeVars } from '../styles';
import { customElement, property } from 'lit/decorators.js';
import { query } from 'lit/decorators.js';
import type { CryptoOption } from '../types';

@customElement('icpay-token-selector')
export class ICPayTokenSelector extends LitElement {
  static styles = css`
    :host { display: block; width: 100%; box-sizing: border-box; }

    /* Common */
    .label,
    .icpay-dropdown-label { font-size: 14px; font-weight: 600; color: var(--icpay-text, #fff); margin-bottom: 8px; display: block; }

    /* Buttons grid (from crypto-payment-selector) */
    .crypto-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; width: 100%; margin: 12px 0 16px; box-sizing: border-box; }
    .crypto-option { background: var(--icpay-surface-alt, #2a3142); border: 1px solid var(--icpay-border, #3a4154); border-radius: 8px; padding: 8px 4px; cursor: pointer; transition: all 0.15s ease; position: relative; overflow: hidden; display: flex; flex-direction: column; align-items: center; gap: 4px; min-height: 60px; }
    .crypto-option:active { transform: scale(0.95); }
    .crypto-option.selected { background: #f7f7f7; border-color: #ffffff; }
    .crypto-option.selected .crypto-name { color: #1a1f2e; }
    .crypto-option.selected .crypto-symbol { color: #4a5568; }
    .crypto-option.selected::after { content: "✓"; position: absolute; top: 4px; right: 4px; width: 16px; height: 16px; background-color: #22C55E; color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: bold; }

    /* Icon as external SVG image with constraints */
    .crypto-icon { width: 24px; height: 24px; border-radius: 50%; object-fit: contain; background: transparent; flex-shrink: 0; }
    .crypto-name { font-size: 11px; font-weight: 600; color: var(--icpay-text, #ffffff); text-align: center; line-height: 1.1; }
    .crypto-symbol { font-size: 9px; color: var(--icpay-muted-text, #888); text-align: center; line-height: 1; }

    /* Dropdown (from crypto-dropdown-selector) */
    .dropdown-wrapper { position: relative; width: 100%; box-sizing: border-box; }
    .dropdown-trigger { position: relative; width: 100%; box-sizing: border-box; background: var(--icpay-surface, #0a0a0a); border: 1px solid var(--icpay-border, #262626); border-radius: 12px; padding: 10px 40px 10px 16px; cursor: pointer; transition: all 0.2s ease; display: flex; align-items: center; gap: 12px; min-height: 44px; }
    .dropdown-trigger:hover { border-color: #404040; background: #171717; }
    .dropdown-trigger:active { transform: scale(0.99); }
    .dropdown-trigger.open { border-color: #525252; background: #171717; border-bottom-left-radius: 0; border-bottom-right-radius: 0; }
    .selected-option { display: flex; align-items: center; gap: 12px; flex: 1; min-width: 0; }
    .dropdown-selected-icon { width: 32px; height: 32px; border-radius: 50%; object-fit: contain; flex-shrink: 0; }
    .dropdown-crypto-name { font-size: 14px; font-weight: 600; color: var(--icpay-text, #ffffff); line-height: 1.2; }
    .dropdown-crypto-symbol { font-size: 12px; color: var(--icpay-muted-text, #a3a3a3); line-height: 1.2; }
    .dropdown-arrow { width: 20px; height: 20px; color: #a3a3a3; transition: transform 0.2s ease; position: absolute; right: 12px; top: 50%; transform: translateY(-50%); pointer-events: none; }
    .dropdown-trigger.open .dropdown-arrow { transform: translateY(-50%) rotate(180deg); color: #ffffff; }
    /* Render menu as absolute under wrapper to align within widget */
    .dropdown-wrapper { position: relative; }
    .dropdown-menu { position: absolute; left: 0; top: 100%; background: var(--icpay-surface, #0a0a0a); border: 1px solid var(--icpay-border, #262626); border-top: none; border-radius: 0 0 12px 12px; overflow: hidden; opacity: 0; visibility: hidden; transform: translateY(-10px); transition: opacity 0.2s ease, transform 0.2s ease, visibility 0.2s ease; z-index: 1000; box-shadow: 0 8px 24px rgba(0,0,0,0.5); max-height: 280px; overflow-y: auto; width: 100%; box-sizing: border-box; }
    .dropdown-menu.open { opacity: 1; visibility: visible; transform: translateY(0); }
    .dropdown-option { display: flex; align-items: center; gap: 12px; padding: 12px 16px; cursor: pointer; transition: background 0.15s ease; border-bottom: 1px solid #171717; }
    .dropdown-option:last-child { border-bottom: none; }
    .dropdown-option:hover { background: #171717; }
    .dropdown-option:active { background: #262626; }
    .dropdown-option.selected { background: #171717; }
    .dropdown-menu::-webkit-scrollbar { width: 4px; }
    .dropdown-menu::-webkit-scrollbar-track { background: #171717; }
    .dropdown-menu::-webkit-scrollbar-thumb { background: #404040; border-radius: 2px; }
    .dropdown-menu::-webkit-scrollbar-thumb:hover { background: #525252; }
    .dropdown-backdrop { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.2); opacity: 0; visibility: hidden; transition: all 0.2s ease; z-index: 500; }
    .dropdown-backdrop.open { opacity: 1; visibility: visible; }

    /* Small screens */
    @media (max-width: 320px) {
      .crypto-grid { gap: 4px; }
      .crypto-option { padding: 6px 2px; min-height: 54px; }
      .dropdown-trigger { padding: 10px 12px; min-height: 48px; }
      .dropdown-option { padding: 10px 12px; }
      .dropdown-selected-icon { width: 28px; height: 28px; }
    }
  `;

  @property({ type: Array }) options: CryptoOption[] = [];
  @property({ type: String }) value: string | null = null;
  @property({ type: String }) defaultSymbol: string = 'ICP';
  @property({ type: String }) mode: 'buttons' | 'dropdown' | 'none' = 'buttons';
  @property({ type: Object }) theme?: { primaryColor?: string; secondaryColor?: string };
  @property({ type: Boolean }) open: boolean = false;
  @property({ type: Boolean }) showLabel: boolean = true;
  @query('.dropdown-trigger') private triggerEl?: HTMLElement;
  @query('.dropdown-wrapper') private wrapperEl?: HTMLElement;
  private menuPos: { left: number; top: number; width: number } = { left: 0, top: 0, width: 0 };

  connectedCallback(): void {
    super.connectedCallback();
    try { applyThemeVars(this, this.theme as any); } catch {}
  }

  updated(changed: Map<string, unknown>): void {
    if (changed.has('theme')) {
      try { applyThemeVars(this, this.theme as any); } catch {}
    }
  }

  firstUpdated(): void {
    const onDocClick = (event: MouseEvent) => {
      if (!this.open) return;
      const path = event.composedPath();
      if (!path.includes(this)) {
        this.closeDropdown();
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && this.open) {
        this.closeDropdown();
      }
    };
    // Store on instance for removal
    (this as any)._onDocClick = onDocClick;
    (this as any)._onKey = onKey;
    window.addEventListener('click', onDocClick);
    window.addEventListener('keydown', onKey);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    const onDocClick = (this as any)._onDocClick as ((e: MouseEvent) => void) | undefined;
    const onKey = (this as any)._onKey as ((e: KeyboardEvent) => void) | undefined;
    if (onDocClick) window.removeEventListener('click', onDocClick);
    if (onKey) window.removeEventListener('keydown', onKey);
    // no-op: no position listeners
  }

  private get effectiveSymbol(): string {
    if (this.value) return this.value;
    const single = this.options?.[0]?.symbol;
    return this.defaultSymbol || single || 'ICP';
  }

  private getOptionBySymbol(symbol: string): CryptoOption | undefined {
    return (this.options || []).find(o => o.symbol === symbol);
  }

  private getLogoUrl(symbol: string): string {
    const slug = String(symbol || '').toLowerCase();
    // Prefer explicit chain via element attribute or global window config; default to 'ic'
    const chain = (this.getAttribute('chain-name') || (window as any)?.ICPay?.config?.chainName || 'IC').toLowerCase();
    const base = (window as any)?.ICPay?.config?.widgetBaseUrl || 'https://widget.icpay.org';
    return `${base}/img/tokens/${chain}/${slug}.svg`;
  }

  private onSelect(symbol: string) {
    this.value = symbol;
    // Force update to ensure current selection reflects immediately
    this.requestUpdate('value');
    this.open = false;
    this.dispatchEvent(new CustomEvent('icpay-token-change', { detail: { symbol }, bubbles: true, composed: true }));
  }

  private toggleDropdown() {
    this.open = !this.open;
    // No dynamic positioning required with absolute menu; keep listeners off
  }

  private closeDropdown() {
    this.open = false;
    // No-op for absolute menu
  }

  // Removed dynamic fixed positioning logic; absolute under wrapper now

  render() {
    const opts = this.options || [];
    // If none or single option, and mode is not forced to show UI, render nothing
    if (this.mode === 'none' || opts.length <= 1) {
      // Ensure selected value is set for parent to use
      const sym = opts.length === 1 ? opts[0].symbol : this.effectiveSymbol;
      if (this.value !== sym) {
        // Microtask to avoid render loop
        queueMicrotask(() => this.onSelect(sym));
      }
      return html``;
    }

    if (this.mode === 'dropdown') {
      const current = this.effectiveSymbol;
      const currentOpt = this.getOptionBySymbol(current) || { symbol: current, label: current } as CryptoOption;
      return html`
        ${this.showLabel ? html`<label class="icpay-dropdown-label">Payment method</label>` : null}
        <div class="dropdown-wrapper">
          <div class="dropdown-trigger ${this.open ? 'open' : ''}" @click=${() => this.toggleDropdown()}>
            <div class="selected-option">
              <img class="dropdown-selected-icon" src="${this.getLogoUrl(currentOpt.symbol)}" alt="${currentOpt.symbol}" />
              <div class="crypto-info">
                <div class="dropdown-crypto-name">${currentOpt.label}</div>
                <div class="dropdown-crypto-symbol">${currentOpt.symbol}</div>
              </div>
            </div>
            <svg class="dropdown-arrow" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
            </svg>
          </div>

          <div class="dropdown-menu ${this.open ? 'open' : ''}">
            ${opts.map(o => html`
              <div class="dropdown-option ${this.value===o.symbol?'selected': (current===o.symbol?'selected':'')}" @click=${() => this.onSelect(o.symbol)}>
                <img class="dropdown-selected-icon" src="${this.getLogoUrl(o.symbol)}" alt="${o.symbol}" />
                <div class="crypto-info">
                  <div class="dropdown-crypto-name">${o.label}</div>
                  <div class="dropdown-crypto-symbol">${o.symbol}</div>
                </div>
              </div>
            `)}
          </div>
        </div>
        <div class="dropdown-backdrop ${this.open ? 'open' : ''}" @click=${() => this.closeDropdown()}></div>
      `;
    }

    // buttons mode
    const current = this.effectiveSymbol;
    return html`
      <div class="icpay-token-selector" style="width:100%;box-sizing:border-box;">
        ${this.showLabel ? html`<label class="label">Payment method</label>` : null}
        <div class="crypto-grid">
          ${opts.map(o => html`
            <div class="crypto-option ${current===o.symbol?'selected':''}" @click=${() => this.onSelect(o.symbol)}>
              <img class="crypto-icon" src="${this.getLogoUrl(o.symbol)}" alt="${o.symbol}" />
              <div class="crypto-name">${o.label}</div>
              <div class="crypto-symbol">${o.symbol}</div>
            </div>
          `)}
        </div>
      </div>
    `;
  }
}

declare global { interface HTMLElementTagNameMap { 'icpay-token-selector': ICPayTokenSelector } }


