import type { NextFunction, Request, Response } from 'express';
import admin from '../config/firebase.js';
import { logger } from '../utils/logger.js';

export interface AuthenticatedRequest extends Request {
  user: admin.auth.DecodedIdToken;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.header('authorization') || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    logger.warn('auth.missing_token', {
      requestId: req.requestId,
      path: req.path,
    });
    return res.status(401).json({ success: false, error: 'Authentication is required' });
  }

  try {
    (req as AuthenticatedRequest).user = await admin.auth().verifyIdToken(token);
    logger.debug('auth.verified', {
      requestId: req.requestId,
      uid: (req as AuthenticatedRequest).user.uid,
    });
    return next();
  } catch (error) {
    logger.warn('auth.invalid_token', {
      requestId: req.requestId,
      error,
    });
    return res.status(401).json({ success: false, error: 'Invalid or expired authentication token' });
  }
}
