import { useEffect, useRef, useState } from 'react';

type Turnstile = {
  render: (element: HTMLElement, options: Record<string, unknown>) => string;
  remove: (id: string) => void;
};
declare global { interface Window { turnstile?: Turnstile } }
let loader: Promise<void> | undefined;
function loadTurnstile() {
  if (window.turnstile) return Promise.resolve();
  if (!loader) loader = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => { script.remove(); loader = undefined; reject(new Error('Could not load verification. Check your connection and reopen the assistant.')); };
    document.head.appendChild(script);
  });
  return loader;
}

export function HumanVerification({ siteKey, action, attempt, onToken, theme = 'dark' }: { siteKey: string; action: 'chat' | 'signup'; attempt: number; onToken: (token: string) => void; theme?: 'dark' | 'light' | 'auto' }) {
  const container = useRef<HTMLDivElement>(null);
  const callback = useRef(onToken);
  callback.current = onToken;
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true, widget: string | undefined;
    callback.current(''); setError('');
    loadTurnstile().then(() => {
      if (!alive || !container.current || !window.turnstile) return;
      widget = window.turnstile.render(container.current, {
        sitekey: siteKey, action, theme, size: 'flexible',
        callback: (token: string) => { if (alive) { setError(''); callback.current(token); } },
        'expired-callback': () => callback.current(''),
        'error-callback': () => { callback.current(''); setError('Verification failed. Reopen the assistant to try again.'); },
      });
    }).catch(error => { if (alive) setError((error as Error).message); });
    return () => { alive = false; if (widget) window.turnstile?.remove(widget); callback.current(''); };
  }, [siteKey, action, attempt, theme]);
  return <div className="sc-verification"><div ref={container} />{error && <p role="alert">{error}</p>}</div>;
}

export function ChatVerification(props: { siteKey: string; attempt: number; onToken: (token: string) => void }) {
  return <HumanVerification {...props} action="chat" />;
}
