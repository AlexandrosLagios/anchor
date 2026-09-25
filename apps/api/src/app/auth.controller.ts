import { Body, Controller, Get, Headers, Post, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller('api/auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Get('status')
  status() {
    return {
      ok: true,
      configured: this.auth.configured(),
      provider: 'jwt',
      region: process.env.DATA_REGION?.trim() || 'eu-central-1',
    };
  }

  @Post('signup')
  async signup(
    @Body()
    body: {
      email?: string;
      password?: string;
      displayName?: string;
      consents?: { terms?: boolean; privacy?: boolean; marketing?: boolean };
    },
  ) {
    return this.auth.signUp({
      email: body.email ?? '',
      password: body.password ?? '',
      displayName: body.displayName ?? '',
      consents: {
        terms: Boolean(body.consents?.terms),
        privacy: Boolean(body.consents?.privacy),
        marketing: Boolean(body.consents?.marketing),
      },
    });
  }

  @Post('login')
  async login(@Body() body: { email?: string; password?: string }) {
    return this.auth.signIn(body.email ?? '', body.password ?? '');
  }

  @Get('me')
  async me(@Headers('authorization') authorization?: string) {
    const user = await this.auth.verifyBearer(authorization);
    if (!user) throw new UnauthorizedException('Sign in required');
    return this.auth.me(user);
  }
}
