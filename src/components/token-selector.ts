import { LitElement, html, css } from 'lit';
import { applyThemeVars } from '../styles';
import { customElement, property } from 'lit/decorators.js';
import type { CryptoOption } from '../types';

@customElement('icpay-token-selector')
export class ICPayTokenSelector extends LitElement {
  static styles = css`
    :host { display: block; }
    .crypto-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin: 12px 0 16px; }
    .crypto-option { background: var(--icpay-surface-alt); border: 2px solid var(--icpay-border); border-radius: 12px; padding: 12px 8px; text-align: center; cursor: pointer; color: var(--icpay-text); font-weight: 600; font-size: 12px; }
    .crypto-option.selected { background: var(--icpay-primary); color: #111827; border-color: var(--icpay-primary); }
    select { background: var(--icpay-surface-alt); border: 1px solid var(--icpay-border); color: var(--icpay-text); border-radius: 8px; padding: 10px; font-weight: 600; }
  `;

  @property({ type: Array }) options: CryptoOption[] = [];
  @property({ type: String }) value: string | null = null;
  @property({ type: String }) defaultSymbol: string = 'ICP';
  @property({ type: String }) mode: 'buttons' | 'dropdown' | 'none' = 'buttons';
  @property({ type: Object }) theme?: { primaryColor?: string; secondaryColor?: string };

  connectedCallback(): void {
    super.connectedCallback();
    try { applyThemeVars(this, this.theme as any); } catch {}
  }

  updated(changed: Map<string, unknown>): void {
    if (changed.has('theme')) {
      try { applyThemeVars(this, this.theme as any); } catch {}
    }
  }

  private get effectiveSymbol(): string {
    if (this.value) return this.value;
    const single = this.options?.[0]?.symbol;
    return this.defaultSymbol || single || 'ICP';
  }

  private onSelect(symbol: string) {
    this.value = symbol;
    this.dispatchEvent(new CustomEvent('icpay-token-change', { detail: { symbol }, bubbles: true, composed: true }));
  }

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
      return html`
        <select @change=${(e: any) => this.onSelect(e.target.value)}>
          ${opts.map(o => html`<option value="${o.symbol}" ?selected=${current===o.symbol}>${o.label}<span class="icpay-token-selector-symbol"> (${o.symbol})</span></option>`)}
        </select>
      `;
    }

    // buttons mode
    const current = this.effectiveSymbol;
    return html`
    <div class="icpay-token-selector">
      <label class="label">Select Payment Method</label>
      <div class="crypto-grid">
        ${opts.map(o => html`
          <div class="crypto-option ${current===o.symbol?'selected':''}" @click=${() => this.onSelect(o.symbol)}>${o.label}<span class="icpay-token-selector-symbol"> (${o.symbol})</span></div>
        `)}
      </div>
    </div>
    `;
  }
}

declare global { interface HTMLElementTagNameMap { 'icpay-token-selector': ICPayTokenSelector } }


