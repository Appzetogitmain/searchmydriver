/**
 * Auth cookies are namespaced per *audience* (customer app, driver app, admin
 * panel) rather than shared.
 *
 * They used to share one `accessToken` / `refreshToken` pair scoped to `/`,
 * which meant the three apps overwrote each other in a single browser: signing
 * into the driver app replaced a signed-in customer's cookie, so the customer
 * tab kept rendering (its session lives in localStorage) while every request it
 * made carried a driver principal and came back
 * `401 Access denied. Not a user account.` — and vice versa. That is not just a
 * local-testing artifact: a driver who is also a customer, or a staff member
 * using the customer app, hits it in production.
 *
 * The customer pair deliberately keeps the original names so existing customer
 * sessions survive this change; driver and admin sessions are re-issued under
 * new names and must sign in once more.
 */

export const AUDIENCES = Object.freeze({
  USER: 'user',
  DRIVER: 'driver',
  ADMIN: 'admin',
});

const COOKIE_NAMES_BY_AUDIENCE = Object.freeze({
  [AUDIENCES.USER]: Object.freeze({
    accessToken: 'accessToken',
    refreshToken: 'refreshToken',
  }),
  [AUDIENCES.DRIVER]: Object.freeze({
    accessToken: 'driverAccessToken',
    refreshToken: 'driverRefreshToken',
  }),
  [AUDIENCES.ADMIN]: Object.freeze({
    accessToken: 'adminAccessToken',
    refreshToken: 'adminRefreshToken',
  }),
});

/** Order used when a shared route has to work out who is calling. */
export const AUDIENCE_RESOLUTION_ORDER = Object.freeze([
  AUDIENCES.DRIVER,
  AUDIENCES.ADMIN,
  AUDIENCES.USER,
]);

/**
 * @param {string} audience — one of AUDIENCES
 * @returns {{ accessToken: string; refreshToken: string }}
 */
export function cookieNamesFor(audience) {
  const names = COOKIE_NAMES_BY_AUDIENCE[audience];
  if (!names) throw new Error(`Unknown cookie audience: ${audience}`);
  return names;
}

/**
 * Back-compat alias for the customer pair. Prefer `cookieNamesFor(audience)`.
 */
export const COOKIE_NAMES = COOKIE_NAMES_BY_AUDIENCE[AUDIENCES.USER];

const ACCESS_MAX_MS = 15 * 60 * 1000;
const REFRESH_MAX_MS = 7 * 24 * 60 * 60 * 1000;

const isProduction = () => process.env.NODE_ENV === 'production';

/**
 * Cookie attributes are tuned for the typical Vercel + standalone API
 * deployment, where the SPA (e.g. `https://app.example.com`) and the API
 * (e.g. `https://api.example.com`) live on *different* origins. Browsers will
 * only persist a cross-site cookie when it is both `Secure` and
 * `SameSite=None`, and a credentialed XHR/fetch will only attach it back to
 * the API when the same pair is set. Locally we fall back to `SameSite=Lax`
 * and `Secure=false` so the cookie still sticks on http://localhost.
 *
 * Optional `COOKIE_DOMAIN` env var lets you scope the cookie to a shared
 * parent domain (e.g. `.example.com`) when the API and SPA share one.
 */
export function getBaseCookieOptions() {
  const prod = isProduction();
  return {
    httpOnly: true,
    secure: prod,
    sameSite: prod ? 'none' : 'lax',
    path: '/',
    ...(process.env.COOKIE_DOMAIN ? { domain: process.env.COOKIE_DOMAIN } : {}),
  };
}

/**
 * Sets httpOnly auth cookies for one audience. Tokens are never returned in JSON.
 * @param {import('express').Response} res
 * @param {{ accessToken: string; refreshToken: string }} tokens
 * @param {string} audience — one of AUDIENCES
 */
export function setAuthCookies(res, { accessToken, refreshToken }, audience) {
  const base = getBaseCookieOptions();
  const names = cookieNamesFor(audience);
  res.cookie(names.accessToken, accessToken, { ...base, maxAge: ACCESS_MAX_MS });
  res.cookie(names.refreshToken, refreshToken, { ...base, maxAge: REFRESH_MAX_MS });
}

/**
 * Clears one audience's auth cookies. The browser only honours the clear when
 * the options (secure, sameSite, path, domain) match the original `Set-Cookie`,
 * so we reuse the exact same base options.
 *
 * Signing out of one app deliberately leaves the other two signed in — that is
 * the whole point of namespacing them.
 * @param {import('express').Response} res
 * @param {string} audience — one of AUDIENCES
 */
export function clearAuthCookies(res, audience) {
  const base = getBaseCookieOptions();
  const names = cookieNamesFor(audience);
  res.clearCookie(names.accessToken, base);
  res.clearCookie(names.refreshToken, base);
}

/**
 * Reads the access token for a specific audience. A `Bearer` header still wins
 * when present (native clients, server-to-server) since it is unambiguous.
 * @param {import('express').Request} req
 * @param {string} audience — one of AUDIENCES
 */
export function readAccessToken(req, audience) {
  const header = req.headers?.authorization;
  if (header?.startsWith('Bearer ')) return header.slice('Bearer '.length);
  return req.cookies?.[cookieNamesFor(audience).accessToken] || null;
}

/**
 * For routes shared by several audiences (chat, uploads). The SPA sends
 * `X-Auth-Audience` so the choice is deterministic when a browser holds more
 * than one session; without it we fall back to whichever cookies are present.
 * @param {import('express').Request} req
 * @returns {Array<{ audience: string; token: string }>}
 */
export function readCandidateAccessTokens(req) {
  const header = req.headers?.authorization;
  if (header?.startsWith('Bearer ')) {
    return [{ audience: null, token: header.slice('Bearer '.length) }];
  }

  const declared = req.headers?.['x-auth-audience'];
  const order =
    declared && COOKIE_NAMES_BY_AUDIENCE[declared]
      ? [declared]
      : AUDIENCE_RESOLUTION_ORDER;

  return order
    .map((audience) => ({
      audience,
      token: req.cookies?.[cookieNamesFor(audience).accessToken],
    }))
    .filter((candidate) => Boolean(candidate.token));
}
