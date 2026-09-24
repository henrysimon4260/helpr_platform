export type AuthRedirectParams = {
  access_token?: string;
  refresh_token?: string;
  code?: string;
  error?: string;
  error_description?: string;
};

/** Read OAuth tokens or an authorization code from an AuthSession redirect. */
export function parseAuthRedirect(url: string): AuthRedirectParams {
  const params = new URLSearchParams();
  const queryIndex = url.indexOf('?');
  const hashIndex = url.indexOf('#');

  if (queryIndex >= 0) {
    const queryEnd = hashIndex > queryIndex ? hashIndex : undefined;
    const query = url.slice(queryIndex + 1, queryEnd);
    new URLSearchParams(query).forEach((value, key) => params.set(key, value));
  }

  if (hashIndex >= 0) {
    new URLSearchParams(url.slice(hashIndex + 1)).forEach((value, key) => params.set(key, value));
  }

  const read = (key: string) => params.get(key) ?? undefined;

  return {
    access_token: read('access_token'),
    refresh_token: read('refresh_token'),
    code: read('code'),
    error: read('error'),
    error_description: read('error_description'),
  };
}
