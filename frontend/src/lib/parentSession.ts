// Parent-lock unlock token, kept in sessionStorage so it dies with the tab.
// Every access is wrapped: storage can be unavailable (private mode, blocked
// site data), and the app must keep working with the parent area locked.

const KEY = 'storyweaver:parent-token';

export function getParentToken(): string | null {
  try {
    return window.sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setParentToken(token: string): void {
  try {
    window.sessionStorage.setItem(KEY, token);
  } catch {
    // storage unavailable: the parent area simply re-locks on reload
  }
}

export function clearParentToken(): void {
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    // nothing to clear
  }
}
