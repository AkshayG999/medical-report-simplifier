import type { NextFunction, Request, Response } from 'express';
import admin from './firebase.js';

export interface AuthenticatedRequest extends Request {
  user: admin.auth.DecodedIdToken;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.header('authorization') || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ success: false, error: 'Authentication is required' });
  }

  try {
    (req as AuthenticatedRequest).user = await admin.auth().verifyIdToken(token);
    return next();
  } catch (error) {
    console.error('Firebase auth verification failed:', error);
    return res.status(401).json({ success: false, error: 'Invalid or expired authentication token' });
  }
}
