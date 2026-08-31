export function scrollToBottom(
  element: HTMLElement,
  options: { smooth?: boolean } = {},
): void {
  if (element) {
    requestAnimationFrame(() => {
      if (options.smooth) {
        element.scrollTo({ top: element.scrollHeight, behavior: 'smooth' });
      } else {
        element.scrollTop = element.scrollHeight;
      }
    });
  }
}

/**
 * Packages that render asynchronously (images, avatars, media) can change the
 * container height AFTER a single scroll assignment, leaving the user stranded
 * mid-list instead of at the last message. This helper keeps the container
 * hidden while it settles: it (re)applies the target scroll position on every
 * descendant image load/error and on content mutations, plus a double-rAF and
 * a short timeout as a fallback, then calls `onReady()` so the caller can
 * reveal the container in one frame already at the right position.
 *
 * @param container  scrollable element
 * @param target     scroll position to (re)apply while settling
 * @param onReady    called once settling is done
 * @param maxWaitMs  hard cap (default 1200ms) so we never stay hidden forever
 * @returns          cleanup function
 */
export function settleScroll(
  container: HTMLElement | undefined,
  target: { mode: 'bottom' } | { mode: 'restore'; top: number },
  onReady: () => void,
  maxWaitMs = 1200,
): () => void {
  if (!container) {
    onReady();
    return () => {};
  }

  let settled = false;
  let imageListeners: Array<{ img: HTMLImageElement; onLoad: () => void; onError: () => void }> = [];
  const mountedImages = new Set<HTMLImageElement>();

  const apply = () => {
    if (target.mode === 'bottom') {
      container.scrollTop = container.scrollHeight;
    } else {
      container.scrollTop = Math.min(target.top, container.scrollHeight);
    }
  };

  const tryFinish = () => {
    if (settled) return;
    const remaining = imageListeners.length;
    if (remaining <= 0) {
      requestAnimationFrame(() => {
        apply();
        requestAnimationFrame(() => {
          if (!settled) {
            settled = true;
            cleanup();
            apply();
            onReady();
          }
        });
      });
    }
  };

  const resolveImage = (img: HTMLImageElement) => {
    const idx = imageListeners.findIndex(e => e.img === img);
    if (idx !== -1) {
      imageListeners.splice(idx, 1);
    }
    apply();
    tryFinish();
  };

  const watchImages = (root: HTMLElement) => {
    const imgs = Array.from(root.querySelectorAll('img')) as HTMLImageElement[];
    imgs.forEach(img => {
      if (mountedImages.has(img)) return;
      mountedImages.add(img);
      if (img.complete) return;
      const onLoad = () => resolveImage(img);
      const onError = () => resolveImage(img);
      imageListeners.push({ img, onLoad, onError });
      img.addEventListener('load', onLoad);
      img.addEventListener('error', onError);
    });
  };

  const finish = () => {
    if (settled) return;
    settled = true;
    cleanup();
    apply();
    onReady();
  };

  const fallback = window.setTimeout(finish, maxWaitMs);

  const cleanup = () => {
    window.clearTimeout(fallback);
    mutation.disconnect();
    imageListeners.forEach(({ img, onLoad, onError }) => {
      img.removeEventListener('load', onLoad);
      img.removeEventListener('error', onError);
    });
    imageListeners = [];
  };

  const mutation = new MutationObserver(() => {
    watchImages(container);
    apply();
    tryFinish();
  });
  mutation.observe(container, { childList: true, subtree: true });

  watchImages(container);
  apply();
  requestAnimationFrame(() => {
    apply();
    tryFinish();
  });

  return cleanup;
}
