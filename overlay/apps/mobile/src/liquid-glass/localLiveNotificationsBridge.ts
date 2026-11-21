import type { EnvironmentId } from "@t3tools/contracts";

export interface LocalLiveAuthState {
  readonly tokenProvider: (() => Promise<string | null>) | null;
  readonly identity: string | null;
}

export interface LocalLiveArmedWork {
  readonly environmentId: EnvironmentId;
  readonly threadTitle: string;
  readonly projectTitle: string;
}

type AuthListener = (state: LocalLiveAuthState) => void;
type ArmedWorkListener = (work: LocalLiveArmedWork) => void;

let currentAuth: LocalLiveAuthState = { tokenProvider: null, identity: null };
const authListeners = new Set<AuthListener>();
const armedWorkListeners = new Set<ArmedWorkListener>();

export function emitLocalLiveAuthChanged(
  tokenProvider: (() => Promise<string | null>) | null,
  identity?: string | null,
): void {
  currentAuth = {
    tokenProvider,
    identity: tokenProvider ? (identity ?? null) : null,
  };
  for (const listener of authListeners) {
    listener(currentAuth);
  }
}

export function getLocalLiveAuthState(): LocalLiveAuthState {
  return currentAuth;
}

export function subscribeLocalLiveAuth(listener: AuthListener): () => void {
  authListeners.add(listener);
  return () => {
    authListeners.delete(listener);
  };
}

export function emitLocalLiveWorkArmed(work: LocalLiveArmedWork): void {
  for (const listener of armedWorkListeners) {
    listener(work);
  }
}

export function subscribeLocalLiveWorkArmed(listener: ArmedWorkListener): () => void {
  armedWorkListeners.add(listener);
  return () => {
    armedWorkListeners.delete(listener);
  };
}
