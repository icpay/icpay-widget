export function hidePnPDefaultModal(): void {
  try {
    if (typeof document === 'undefined') return;
    const selectors = [
      '.plug-n-play-modal',
      '.pnp-modal',
      '#plug-n-play-root',
      '#pnp-root',
      '[data-pnp-root]',
      '[data-pnp-modal]'
    ];
    document.querySelectorAll(selectors.join(',')).forEach((el) => {
      try { (el as HTMLElement).style.display = 'none'; } catch {}
    });
  } catch {}
}


