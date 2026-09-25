import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  createParamDecorator,
} from '@nestjs/common';
import type { Request } from 'express';
import { verifyIdToken, type AuthUser } from './firebase-admin';

@Injectable()
export class AuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { user?: AuthUser | null }>();
    const requireAuth = process.env.REQUIRE_AUTH === 'true' || process.env.REQUIRE_AUTH === '1';
    const user = await verifyIdToken(request.headers.authorization);
    request.user = user;

    const isWrite = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method.toUpperCase());
    if (requireAuth && isWrite && !user) {
      throw new UnauthorizedException('Sign in required');
    }
    return true;
  }
}

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthUser | null => {
  const request = ctx.switchToHttp().getRequest<Request & { user?: AuthUser | null }>();
  return request.user ?? null;
});

export type { AuthUser };
