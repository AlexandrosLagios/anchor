import { Controller, Get } from '@nestjs/common';
import { firebaseAdminConfigured } from './firebase-admin';

/**
 * Nest email/password signup/login is retired — primary auth is Firebase client SDK.
 * This endpoint only reports whether Firebase Admin token verification is configured.
 */
@Controller('api/auth')
export class AuthController {
  @Get('status')
  status() {
    return {
      ok: true,
      configured: firebaseAdminConfigured(),
      provider: 'firebase',
      region: process.env.DATA_REGION?.trim() || 'eur3',
    };
  }
}
