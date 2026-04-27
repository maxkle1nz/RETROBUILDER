let inMemoryLocalApiToken = '';

function viteLocalApiToken() {
  const meta = import.meta as unknown as { env?: Record<string, string | undefined> };
  return meta.env?.VITE_RETROBUILDER_LOCAL_API_TOKEN || '';
}

export function localApiAuthToken() {
  return (inMemoryLocalApiToken || viteLocalApiToken()).trim();
}

export function setLocalApiAuthToken(token: string) {
  inMemoryLocalApiToken = token.trim();
}

export function clearLocalApiAuthToken() {
  inMemoryLocalApiToken = '';
}

export function localApiAuthHeaders(headers: HeadersInit = {}) {
  const next = new Headers(headers);
  const token = localApiAuthToken();
  if (token) next.set('X-Retrobuilder-Token', token);
  return next;
}
