/**
 * HaveAnApp Pulse: anonymous, cookieless usage events. The snippet in
 * index.html defines `window.pulse`; until it loads, calls are queued.
 * Only short tokens are sent, never anything the player typed.
 */
type Props = Record<string, string | number | boolean>;

declare global {
  interface Window {
    pulse?: (name: string, props?: Props) => void;
  }
}

export function track(name: string, props?: Props): void {
  window.pulse?.(name, props);
}
