import { Request, Response, NextFunction } from 'express';
import { sessionManager } from './sessionManager';
import { hasPermission } from '../auth/rbacService';
import { Permission, Role, UserSession } from '../../types/rbac';

export interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
  username: string;
  role: string;
  outlet_id: string | null;
  outlet_name?: string;
  assignedEntities?: string[];
}

export type UserProvider = () => Array<{
  id: string;
  name: string;
  email: string;
  username: string;
  role: string;
  outlet_id: string | null;
  outlet_name?: string;
  status: string;
}>;

let userProvider: UserProvider | null = null;

export function setUserProvider(provider: UserProvider): void {
  userProvider = provider;
}

/**
 * Extracts session token from headers or cookies.
 */
export function extractTokenFromRequest(req: Request): string | null {
  // 1. Check Authorization Bearer header
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7).trim();
    if (token) return token;
  }

  // 2. Check X-Auth-Token header
  const tokenHeader = req.headers['x-auth-token'];
  if (tokenHeader && typeof tokenHeader === 'string') {
    const token = tokenHeader.trim();
    if (token) return token;
  }

  // 3. Check cookies (if cookie-parser is installed or raw cookie header)
  if (req.cookies && req.cookies.cr_session) {
    return req.cookies.cr_session;
  }

  const cookieHeader = req.headers.cookie;
  if (cookieHeader) {
    const match = cookieHeader.match(/(?:^|;\s*)cr_session=([^;]+)/);
    if (match && match[1]) {
      return decodeURIComponent(match[1]);
    }
  }

  return null;
}

/**
 * Central Express authentication middleware.
 */
export function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const token = extractTokenFromRequest(req);
  if (!token) {
    res.status(401).json({
      error: 'Authentication required. Please provide a valid session token.'
    });
    return;
  }

  const session = sessionManager.getSession(token);
  if (!session) {
    res.status(401).json({
      error: 'Session invalid or expired. Please log in again.'
    });
    return;
  }

  // Touch session for sliding window
  sessionManager.touchSession(token);

  // Look up full user record
  let userRecord: any = null;
  if (userProvider) {
    const users = userProvider();
    userRecord = users.find((u) => u.id === session.userId && u.status === 'active');
  }

  const user: AuthenticatedUser = {
    id: session.userId,
    name: userRecord?.name || session.username,
    email: userRecord?.email || `${session.username}@crmaldives.com`,
    username: session.username,
    role: userRecord?.role || session.role,
    outlet_id: userRecord ? userRecord.outlet_id : session.tenantId,
    outlet_name: userRecord?.outlet_name,
    assignedEntities: [userRecord?.outlet_id || session.tenantId].filter(Boolean)
  };

  (req as any).user = user;
  (req as any).session = session;

  next();
}

/**
 * Middleware to restrict access to specific roles.
 */
export function requireRole(...allowedRoles: (Role | string)[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as any).user as AuthenticatedUser | undefined;
    if (!user) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    const role = user.role;
    // Super admin / ADMIN always has superuser clearance
    if (role === 'super_admin' || role === 'ADMIN' || role === 'CLIENT_ADMIN') {
      return next();
    }

    if (allowedRoles.includes(role)) {
      return next();
    }

    res.status(403).json({
      error: `Forbidden: User role '${role}' lacks required role privileges (${allowedRoles.join(', ')}).`
    });
  };
}

/**
 * Middleware to enforce strict RBAC fine-grained permissions.
 */
export function requirePermission(
  permission: Permission,
  getTargetTenantId?: (req: Request) => string | undefined
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as any).user as AuthenticatedUser | undefined;
    if (!user) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    const targetTenant = getTargetTenantId
      ? getTargetTenantId(req) || user.outlet_id || 'DEFAULT-TENANT'
      : user.outlet_id || 'DEFAULT-TENANT';

    // Map user to UserSession format
    const userSession: UserSession = {
      userId: user.id,
      tenantId: user.outlet_id || 'DEFAULT-TENANT',
      role: user.role as Role,
      assignedEntities: user.role === 'super_admin' ? [targetTenant] : user.assignedEntities || [user.outlet_id || 'DEFAULT-TENANT']
    };

    if (user.role === 'super_admin') {
      return next();
    }

    const authorized = hasPermission(userSession, permission, targetTenant);
    if (!authorized) {
      res.status(403).json({
        error: `Access Denied: User '${user.username}' lacks permission '${permission}' for tenant '${targetTenant}'.`
      });
      return;
    }

    next();
  };
}

/**
 * Middleware enforcing tenant isolation (IDOR protection).
 */
export function requireTenantIsolation(
  getTargetTenantId: (req: Request) => string | undefined
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as any).user as AuthenticatedUser | undefined;
    if (!user) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    if (user.role === 'super_admin' || user.role === 'ADMIN') {
      return next();
    }

    const targetTenant = getTargetTenantId(req);
    if (!targetTenant || targetTenant === 'ALL') {
      return next();
    }

    if (user.outlet_id && user.outlet_id !== targetTenant) {
      res.status(403).json({
        error: `Tenant Isolation Violation: Access denied to resources of tenant '${targetTenant}'.`
      });
      return;
    }

    next();
  };
}
