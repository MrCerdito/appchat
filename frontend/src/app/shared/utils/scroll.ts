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
