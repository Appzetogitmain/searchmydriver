import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/apiResponse.js';
import {
  AUDIENCES,
  cookieNamesFor,
  setAuthCookies,
  clearAuthCookies,
} from '../utils/cookie.util.js';
import * as commonService from '../services/common.service.js';
import { releaseFcmToken } from '../utils/fcmToken.util.js';

export const uploadImage = asyncHandler(async (req, res) => {
  const result = await commonService.uploadImageService(req.file, req.body.oldPublicId);
  return res.status(200).json(new ApiResponse(200, result, 'Image uploaded successfully'));
});

export const uploadVideo = asyncHandler(async (req, res) => {
  const result = await commonService.uploadVideoService(req.file, req.body.oldPublicId);
  return res.status(200).json(new ApiResponse(200, result, 'Video uploaded successfully'));
});

/**
 * Auth cookies are namespaced per app, so refresh and logout have to say which
 * session they mean. Each app mounts its own route via these factories —
 * refreshing the driver app must not re-issue (or sign out) a customer session
 * that happens to share the browser.
 * @param {string} audience — one of AUDIENCES
 */
export const makeRefreshAccessToken = (audience) =>
  asyncHandler(async (req, res) => {
    const cookieName = cookieNamesFor(audience).refreshToken;
    const incomingRefreshToken = req.cookies[cookieName] || req.cookies?.refreshToken || req.body.refreshToken;
    const tokens = await commonService.refreshSessionTokens(incomingRefreshToken);
    setAuthCookies(res, tokens, audience);
    return res.status(200).json(new ApiResponse(200, tokens, 'Token refreshed successfully'));
  });

/**
 * @param {string} audience — one of AUDIENCES
 *
 * Accepts an optional `fcmToken` in the body: the device deregistering itself
 * for push. Without this a signed-out device keeps receiving the previous
 * account's ride notifications, because the token stays on that account's
 * record and `emitNotification` happily pushes to it.
 *
 * Intentionally still unauthenticated. Logout must work when the access token
 * has already expired — requiring auth here would strand exactly the sessions
 * most in need of clearing — and possessing a device token only ever lets you
 * unsubscribe that same device.
 */
export const makeLogout = (audience) =>
  asyncHandler(async (req, res) => {
    clearAuthCookies(res, audience);

    // Best-effort: a failure here must never stop the client signing out.
    const { fcmToken } = req.body || {};
    if (fcmToken) {
      try {
        const cleared = await releaseFcmToken(fcmToken);
        if (cleared > 0) {
          console.log(
            `[fcm] logout released token ...${String(fcmToken).slice(-8)} from ${cleared} account(s)`,
          );
        }
      } catch (err) {
        console.warn('[fcm] logout token release failed:', err?.message);
      }
    }

    return res.status(200).json(new ApiResponse(200, {}, 'Logged out successfully'));
  });

export const refreshAccessToken = makeRefreshAccessToken(AUDIENCES.USER);
export const logout = makeLogout(AUDIENCES.USER);
