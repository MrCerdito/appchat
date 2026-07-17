export function scrollToBottom(element: HTMLElement): void {
  if (element) {
    requestAnimationFrame(() => {
      element.scrollTop = element.scrollHeight;
    });
  }
}
