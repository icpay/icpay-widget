# ICPay Widget

Embeddable, framework-agnostic payment widgets for **ICPay** — multi-chain crypto payments on **EVM (e.g. Base)**, **Solana**, and **Internet Computer**. Drop-in Web Components and React wrappers powered by `@ic-pay/icpay-sdk`.

## Installation

Using pnpm:
```bash
pnpm add @ic-pay/icpay-widget @ic-pay/icpay-sdk
```

Using yarn:
```bash
yarn add @ic-pay/icpay-widget @ic-pay/icpay-sdk
```

Using npm:
```bash
npm install @ic-pay/icpay-widget @ic-pay/icpay-sdk
```

## Components

| Component | Description |
|-----------|-------------|
| `icpay-pay-button` | One-click pay with fixed or configurable amount |
| `icpay-amount-input` | Enter custom USD amount, then pay |
| `icpay-tip-jar` | Preset tip amounts (e.g. $1, $5, $10) |
| `icpay-premium-content` | Gated content unlock (paywall) |
| `icpay-article-paywall` | Article paywall with preview and unlock |
| `icpay-coffee-shop` | Simple store with preset items and prices |
| `icpay-donation-thermometer` | Donation progress toward a goal |
| `icpay-progress-bar` | Transaction progress indicator (used internally) |

React bindings for all components: `@ic-pay/icpay-widget/react`.

## Supported chains and wallets

- **EVM** (Base, etc.) — MetaMask, Coinbase Wallet, Brave, Rabby, OKX, WalletConnect (QR + deep links).
- **Solana** — Phantom, Backpack (and compatible `window.solana` providers).
- **Internet Computer** — Plug, Internet Identity (II), Oisy, NFID.

Use **token shortcodes** (e.g. `base_usdc`, `sol_usdc`, `ic_icp`) to choose chain and token. Filter options with `tokenShortcodes`, `chainShortcodes`, or `chainTypes` in config.

## Quick usage

HTML (with a bundler):
```html
<script type="module">
  import '@ic-pay/icpay-widget';
</script>

<icpay-pay-button
  id="pay"
  publishable-key="YOUR_PK"
  token-shortcode="base_usdc"
  amount-usd="5"
></icpay-pay-button>
```

React:
```tsx
import { IcpayPayButton } from '@ic-pay/icpay-widget/react';

export default function Example() {
  return (
    <IcpayPayButton
      config={{
        publishableKey: process.env.NEXT_PUBLIC_ICPAY_PK!,
        tokenShortcode: 'base_usdc',
        amountUsd: 5,
      }}
    />
  );
}
```

## Config highlights

- **publishableKey** (required) — From your ICPay account.
- **tokenShortcode** — Token/chain (e.g. `base_usdc`, `sol_usdc`, `ic_icp`). Omit to let the user pick.
- **tokenShortcodes** / **chainShortcodes** / **chainTypes** — Restrict which tokens or chains are shown.
- **recipientAddresses** — `{ evm?, ic?, sol? }` for relay payments to your addresses per chain.
- **theme** — `'light' | 'dark'` or a `ThemeConfig` object.
- **evmProvider** — Pass `window.ethereum` (or another provider) for EVM flows in the browser.

Full config and options: [docs.icpay.org](https://docs.icpay.org).

## Styling and theming

- Works out of the box. Override with CSS variables on `:root` or the component (e.g. `--icpay-primary`, `--icpay-surface`, `--icpay-text`).
- Optional Tailwind build: `dist/tailwind.css`.

## Documentation

- **Component reference, theming, events, examples:** [https://docs.icpay.org](https://docs.icpay.org)
- **Sandbox (testnets):** [betterstripe.com](https://betterstripe.com) — test with Base Sepolia, Solana Devnet, and other test networks.
