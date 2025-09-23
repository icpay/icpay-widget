import { createWebComponent } from './createWrapper';
import type {
  PayButtonConfig,
  AmountInputConfig,
  PremiumContentConfig,
  TipJarConfig,
  ArticlePaywallConfig,
  CoffeeShopConfig,
  DonationThermometerConfig,
  ThemeConfig
} from '../types';

// Public success detail types
export type IcpaySuccess = { amount?: number; tx: unknown };
export type IcpayCoffeeSuccess = { item: { name: string; priceUsd: number }; tx: unknown };

// Public React components
export const IcpayPayButton = createWebComponent<HTMLElement, { config?: PayButtonConfig; onSuccess?: (detail: IcpaySuccess) => void; onError?: (detail: any) => void }>('icpay-pay-button', { eventMap: { onSuccess: 'icpay-pay', onError: 'icpay-error' } });
export const IcpayAmountInput = createWebComponent<HTMLElement, { config?: AmountInputConfig; onSuccess?: (detail: IcpaySuccess) => void; onError?: (detail: any) => void }>('icpay-amount-input', { eventMap: { onSuccess: 'icpay-amount-pay', onError: 'icpay-error' } });
export const IcpayPremiumContent = createWebComponent<HTMLElement, { config?: PremiumContentConfig; onSuccess?: (detail: IcpaySuccess) => void; onError?: (detail: any) => void }>('icpay-premium-content', { eventMap: { onSuccess: 'icpay-unlock', onError: 'icpay-error' } });
export const IcpayTipJar = createWebComponent<HTMLElement, { config?: TipJarConfig; onSuccess?: (detail: IcpaySuccess) => void; onError?: (detail: any) => void }>('icpay-tip-jar', { eventMap: { onSuccess: 'icpay-tip', onError: 'icpay-error' } });
export const IcpayArticlePaywall = createWebComponent<HTMLElement, { config?: ArticlePaywallConfig; onSuccess?: (detail: IcpaySuccess) => void; onError?: (detail: any) => void }>('icpay-article-paywall', { eventMap: { onSuccess: 'icpay-unlock', onError: 'icpay-error' } });
export const IcpayCoffeeShop = createWebComponent<HTMLElement, { config?: CoffeeShopConfig; onSuccess?: (detail: IcpayCoffeeSuccess) => void; onError?: (detail: any) => void }>('icpay-coffee-shop', { eventMap: { onSuccess: 'icpay-coffee', onError: 'icpay-error' } });
export const IcpayDonationThermometer = createWebComponent<HTMLElement, { config?: DonationThermometerConfig; onSuccess?: (detail: IcpaySuccess) => void; onError?: (detail: any) => void }>('icpay-donation-thermometer', { eventMap: { onSuccess: 'icpay-donation', onError: 'icpay-error' } });
export const IcpayProgressBar = createWebComponent<HTMLElement, {
  open?: boolean;
  steps?: Array<{ key: string; label: string; tooltip: string; status: string }>;
  amount?: number;
  currency?: string;
  ledgerSymbol?: string;
  debug?: boolean;
  theme?: ThemeConfig;
}>('icpay-progress-bar');

// Internal helpers (not exported): wallet selector is not a standalone element.


