import { Body, Controller, Delete, Get, Param, Post, UnauthorizedException, UseGuards } from '@nestjs/common';
import { AuthGuard, CurrentUser, type AuthUser } from './auth.guard';
import { FamiliesService } from './families.service';

@Controller('api/families')
@UseGuards(AuthGuard)
export class FamiliesController {
  constructor(private readonly families: FamiliesService) {}

  @Get()
  async list(@CurrentUser() user: AuthUser | null) {
    requireUser(user);
    return { families: await this.families.list(user.uid) };
  }

  @Post()
  async create(@CurrentUser() user: AuthUser | null, @Body() body: { name?: string }) {
    requireUser(user);
    return this.families.create(user.uid, body.name ?? '');
  }

  @Post(':id/members')
  async addMember(
    @CurrentUser() user: AuthUser | null,
    @Param('id') id: string,
    @Body() body: { email?: string; displayName?: string; password?: string; consents?: boolean },
  ) {
    requireUser(user);
    return this.families.addMember(user.uid, id, body);
  }

  @Delete(':id/members/:userId')
  async removeMember(
    @CurrentUser() user: AuthUser | null,
    @Param('id') id: string,
    @Param('userId') userId: string,
  ) {
    requireUser(user);
    return this.families.removeMember(user.uid, id, userId);
  }

  @Delete(':id/invites/:inviteId')
  async cancelInvite(
    @CurrentUser() user: AuthUser | null,
    @Param('id') id: string,
    @Param('inviteId') inviteId: string,
  ) {
    requireUser(user);
    return this.families.cancelInvite(user.uid, id, inviteId);
  }
}

function requireUser(user: AuthUser | null): asserts user is AuthUser {
  if (!user) throw new UnauthorizedException('Sign in required');
}
