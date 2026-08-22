/** "Add to home screen" support.
 *
 * Chromium fires `beforeinstallprompt`, which we stash so the app can offer a
 * proper install button. Safari/iOS never fires it, so callers fall back to
 * telling the user to use the browser's share menu.
 */

import { useCallback, useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<(available: boolean) => void>();

function notify(available: boolean): void {
  for (const listener of listeners) listener(available);
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    notify(true);
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    notify(false);
  });
}

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia?.('(display-mode: standalone)').matches) return true;
  // iOS Safari exposes a non-standard flag instead.
  return (window.navigator as unknown as { standalone?: boolean }).standalone === true;
}

export interface InstallState {
  /** A native install prompt is ready to show. */
  available: boolean;
  /** Already running as an installed app. */
  installed: boolean;
  promptInstall: () => Promise<'accepted' | 'dismissed' | 'unavailable'>;
}

export function useInstallPrompt(): InstallState {
  const [available, setAvailable] = useState(deferredPrompt !== null);
  const [installed, setInstalled] = useState(isStandalone());

  useEffect(() => {
    const listener = (value: boolean) => {
      setAvailable(value);
      if (!value) setInstalled(isStandalone());
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    const prompt = deferredPrompt;
    if (!prompt) return 'unavailable' as const;
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice.outcome === 'accepted') {
        deferredPrompt = null;
        notify(false);
        setInstalled(true);
      }
      return choice.outcome;
    } catch {
      return 'unavailable' as const;
    }
  }, []);

  return { available, installed, promptInstall };
}
