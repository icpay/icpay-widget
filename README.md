# ICPay Widget (Web Components)

Embeddable, framework-agnostic payment widgets powered by `@ic-pay/icpay-sdk`.

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

- `icpay-pay-button` — One‑click pay button
- `icpay-amount-input` — Enter custom amount, then pay
- `icpay-premium-content` — Gated content unlock
- `icpay-tip-jar` — Tips/donations
- `icpay-article-paywall` — Article paywall/unlock
- `icpay-coffee-shop` — Simple store with preset items
- `icpay-donation-thermometer` — Donation progress tracker
- `icpay-progress-bar` — Transaction progress indicator

React bindings are available for all components via `@ic-pay/icpay-widget/react`.

## Quick usage

HTML (with a bundler):
```html
<script type="module">
  import '@ic-pay/icpay-widget';
</script>

<icpay-pay-button
  id="pay"
  publishable-key="YOUR_PK"
  token-shortcode="icp"
  amount-usd="5"
></icpay-pay-button>
```

React:
```tsx
import { IcpayPayButton } from '@ic-pay/icpay-widget/react';

export default function Example() {
  return (
    <IcpayPayButton config={{ publishableKey: process.env.NEXT_PUBLIC_ICPAY_PK!, tokenShortcode: 'icp', amountUsd: 5 }} />
  );
}
```

## Styling & theming

- Works out of the box. Customize with CSS variables on `:root` or the element.
- A minimal Tailwind CSS build is available in `dist/tailwind.css` (optional).

## Documentation

Full component reference, theming, events, and examples: https://docs.icpay.org
