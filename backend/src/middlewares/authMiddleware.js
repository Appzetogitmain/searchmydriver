import { Driver } from '../models/driverModels/driver.model.js';
import User from '../models/user.model.js';
import { verifyAccessToken, inferAccountType } from '../utils/jwt.util.js';
import { ACCOUNT_DRIVER, ACCOUNT_USER, USER_ROLES } from '../constants/roles.js';
import { STAFF_ROLES } from '../constants/staffPermissions.js';
import {
  AUDIENCES,
  readAccessToken,
  readCandidateAccessTokens,
} from '../utils/cookie.util.js';

/**
 * Common JWT verification and account fetching logic.
 *
 * `audience` selects which namespaced cookie to read. Each app has its own, so
 * a driver signing in can no longer clobber a signed-in customer's session in
 * the same browser (which used to surface as a spurious
 * "Access denied. Not a user account.").
 */
const authenticate = async (req, res, next, accountType, model, fieldName, audience) => {
  const token = readAccessToken(req, audience);
  if (!token) {
    return res.status(401).json({ status: 401, message: 'Not authorized, no token' });
  }

  try {
    const decoded = verifyAccessToken(token);
    const decodedAccountType = inferAccountType(decoded);

    if (decodedAccountType !== accountType) {
      return res.status(401).json({ status: 401, message: `Access denied. Not a ${accountType} account.` });
    }

    const entity = await model.findById(decoded.id);
    if (!entity || entity.isDeleted) {
      return res.status(401).json({ status: 401, message: 'Account not found or deactivated' });
    }

    req[fieldName] = entity;
    next();
  } catch (error) {
    const status = error.statusCode || 401;
    return res.status(status).json({ status, message: error.message || 'Not authorized' });
  }
};

/**
 * 1. Customer-only routes
 */
export const protectUser = (req, res, next) => {
  return authenticate(req, res, next, ACCOUNT_USER, User, 'user', AUDIENCES.USER);
};

/**
 * Customer profile: own id only, or staff (admin / team_member) for any customer id.
 */
export const protectProfileViewer = async (req, res, next) => {
  const candidateTokens = readCandidateAccessTokens(req);
  if (!candidateTokens.length) {
    return res.status(401).json({ status: 401, message: 'Not authorized, no token' });
  }

  try {
    const targetId = req.params.userId;

    for (const candidate of candidateTokens) {
      try {
        const decoded = verifyAccessToken(candidate.token);
        if (inferAccountType(decoded) !== ACCOUNT_USER) continue;

        const entity = await User.findById(decoded.id);
        if (!entity || entity.isDeleted) continue;

        if (STAFF_ROLES.includes(entity.role)) {
          if (!entity.isActive) {
            return res.status(403).json({ status: 403, message: 'Your account has been deactivated.' });
          }
          req.staff = entity;
          return next();
        }

        if (
          entity.role === USER_ROLES.USER &&
          (String(entity._id) === String(targetId) || entity.userId === targetId)
        ) {
          req.user = entity;
          return next();
        }
      } catch {
        // Continue to next candidate token
      }
    }

    return res.status(403).json({ status: 403, message: 'Access denied' });
  } catch (error) {
    const status = error.statusCode || 401;
    return res.status(status).json({ status, message: error.message || 'Not authorized' });
  }
};

/**
 * 2. Driver-only routes
 */
export const protectDriver = (req, res, next) => {
  return authenticate(req, res, next, ACCOUNT_DRIVER, Driver, 'driver', AUDIENCES.DRIVER);
};

/**
 * 3. Staff routes (Admin + Team Member)
 */
export const protectStaff = async (req, res, next) => {
  const token = readAccessToken(req, AUDIENCES.ADMIN);
  if (!token) {
    return res.status(401).json({ status: 401, message: 'Not authorized, no token' });
  }

  try {
    const decoded = verifyAccessToken(token);
    const decodedAccountType = inferAccountType(decoded);

    if (decodedAccountType !== ACCOUNT_USER) {
      return res.status(401).json({ status: 401, message: 'Not authorized for staff area' });
    }

    const staff = await User.findById(decoded.id);
    if (!staff || staff.isDeleted || !STAFF_ROLES.includes(staff.role)) {
      return res.status(401).json({ status: 401, message: 'Staff account not found or unauthorized' });
    }

    if (!staff.isActive) {
      return res.status(403).json({ status: 403, message: 'Your account has been deactivated. Please contact the administrator.' });
    }

    req.staff = staff;
    next();
  } catch (error) {
    const status = error.statusCode || 401;
    return res.status(status).json({ status, message: error.message || 'Not authorized' });
  }
};

/**
 * 4. Role Restriction Middleware
 * Use this after one of the protect middlewares
 */
export const restrictTo = (...roles) => {
  return (req, res, next) => {
    // Determine which entity is logged in
    const currentUser = req.staff || req.user || req.driver;
    
    if (!currentUser || !roles.includes(currentUser.role)) {
      return res.status(403).json({ 
        status: 403, 
        message: 'You do not have permission to perform this action' 
      });
    }
    next();
  };
};

/**
 * 5. Permission Restriction Middleware (PBAC)
 * Use this after protectStaff
 */
export const requirePermission = (permission) => {
  return (req, res, next) => {
    const staff = req.staff;
    if (!staff) {
      return res.status(403).json({ status: 403, message: 'Not authorized' });
    }

    // Super Admin always has access to everything
    if (staff.role === USER_ROLES.ADMIN) {
      return next();
    }

    // Check if the staff member has the required permission
    if (!staff.permissions || !staff.permissions.includes(permission)) {
      return res.status(403).json({ 
        status: 403, 
        message: `You lack the required permission (${permission}) for this action.` 
      });
    }

    next();
  };
};

/**
 * 6. Generic JWT Verifier for shared routes (like Chat)
 */
export const verifyJWT = async (req, res, next) => {
  // Shared between the customer and driver apps, so there is no single audience
  // to read. The SPA sends `X-Auth-Audience` to make the pick deterministic when
  // a browser holds more than one session; otherwise we try each cookie present
  // and use the first that resolves to a live account.
  const candidates = readCandidateAccessTokens(req);
  if (candidates.length === 0) {
    return res.status(401).json({ status: 401, message: 'Not authorized, no token' });
  }

  for (const { token } of candidates) {
    try {
      const decoded = verifyAccessToken(token);
      const decodedAccountType = inferAccountType(decoded);

      if (decodedAccountType === ACCOUNT_DRIVER) {
        const driver = await Driver.findById(decoded.id);
        if (!driver || driver.isDeleted) continue;
        req.user = driver; // Alias for controller ease
        req.driver = driver;
      } else if (decodedAccountType === ACCOUNT_USER) {
        const user = await User.findById(decoded.id);
        if (!user || user.isDeleted) continue;
        req.user = user;
        if (STAFF_ROLES.includes(user.role)) req.staff = user;
      } else {
        continue;
      }

      return next();
    } catch {
      // Expired or malformed — fall through to the next candidate cookie.
    }
  }

  return res.status(401).json({ status: 401, message: 'Not authorized' });
};
