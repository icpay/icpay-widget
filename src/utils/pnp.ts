export function hidePnPDefaultModal(): void {
  try {
    if (typeof document === 'undefined') return;
    const hideNow = () => {
      // Scoped and global overlays
      const selectors = [
        '.icpay-widget-base .modal-overlay',
        '.modal-overlay',
        // legacy roots/selectors
        '.plug-n-play-modal',
        '.pnp-modal',
        '#plug-n-play-root',
        '#pnp-root',
        '[data-pnp-root]',
        '[data-pnp-modal]'
      ];
      document.querySelectorAll(selectors.join(',')).forEach((el) => {
        const overlay = el as HTMLElement;
        try {
          const hasWalletSelector = !!overlay.querySelector?.('.wallet-selector-container');
          if (overlay.classList?.contains('modal-overlay')) {
            if (hasWalletSelector) overlay.style.display = 'none';
          } else {
            overlay.style.display = 'none';
          }
        } catch {}
      });
    };

    hideNow();

    // Briefly observe DOM mutations to hide overlays that appear after async connects
    try {
      const Observer = (window as any).MutationObserver || (window as any).WebKitMutationObserver;
      if (Observer) {
        const observer = new Observer((mutations: any[]) => {
          for (const m of mutations) {
            if (!m.addedNodes) continue;
            for (const node of m.addedNodes) {
              if (!(node instanceof HTMLElement)) continue;
              if (node.matches?.('.modal-overlay') || node.querySelector?.('.wallet-selector-container')) {
                hideNow();
              }
            }
          }
        });
        observer.observe(document.body, { childList: true, subtree: true });
        setTimeout(() => { try { observer.disconnect(); } catch {} }, 3000);
      }
    } catch {}
  } catch {}
}


// Force Oisy to open in a browser tab (not a sized popup) by clearing window features
// This relies on @windoge98/plug-n-play honoring adapter.config.transport.windowOpenerFeatures
// When features string is empty, most browsers open a new tab instead of a popup window
export function applyOisyNewTabConfig(cfg: any): any {
  try {
    const next = cfg || {};
    next.adapters = next.adapters || {};
    const oisy = next.adapters.oisy || {};
    const oisyConfig = oisy.config || {};
    const transport = { ...(oisyConfig.transport || {}), windowOpenerFeatures: '' };
    next.adapters.oisy = { ...oisy, config: { ...oisyConfig, transport } };
    return next;
  } catch {
    return cfg;
  }
}

