export const BASE_URL = (__ENV.BASE_URL || 'http://localhost:8000').replace(/\/$/, '');

const tokens = (__ENV.K6_TOKENS || '')
  .split(',')
  .map((token) => token.trim())
  .filter(Boolean);

export function authParams(vuIndex = __VU) {
  if (tokens.length === 0) {
    throw new Error('Set K6_TOKENS to a comma-separated list of test bearer tokens.');
  }

  const token = tokens[(vuIndex - 1) % tokens.length];
  return { headers: { Authorization: `Bearer ${token}` } };
}
