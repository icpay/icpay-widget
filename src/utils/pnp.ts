export function hidePnPDefaultModal(): void {
  try {
    if (typeof document === 'undefined') return;
    // New markup seen in current builds (scoped to widget root)
    const overlays = Array.from(document.querySelectorAll('.icpay-widget-base .modal-overlay')) as HTMLElement[];
    overlays.forEach((overlay) => {
      try {
        const hasWalletSelector = !!overlay.querySelector('.wallet-selector-container');
        if (hasWalletSelector) {
          overlay.style.display = 'none';
          const closeBtn = overlay.querySelector('.close-button') as HTMLElement | null;
          try { closeBtn?.click?.(); } catch {}
        }
      } catch {}
    });
  } catch {}
}


