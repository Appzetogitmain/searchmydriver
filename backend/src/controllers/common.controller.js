import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/apiResponse.js';
import {
  AUDIENCES,
  cookieNamesFor,
  setAuthCookies,
  clearAuthCookies,
} from '../utils/cookie.util.js';
import * as commonService from '../services/common.service.js';

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
    const incomingRefreshToken = req.cookies[cookieName] || req.body.refreshToken;
    const tokens = await commonService.refreshSessionTokens(incomingRefreshToken);
    setAuthCookies(res, tokens, audience);
    return res.status(200).json(new ApiResponse(200, tokens, 'Token refreshed successfully'));
  });

/** @param {string} audience — one of AUDIENCES */
export const makeLogout = (audience) =>
  asyncHandler(async (req, res) => {
    clearAuthCookies(res, audience);
    return res.status(200).json(new ApiResponse(200, {}, 'Logged out successfully'));
  });

export const refreshAccessToken = makeRefreshAccessToken(AUDIENCES.USER);
export const logout = makeLogout(AUDIENCES.USER);
