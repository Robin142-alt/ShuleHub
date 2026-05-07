import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';

import { Permissions } from '../../src/auth/decorators/permissions.decorator';
import { Policy } from '../../src/auth/decorators/policy.decorator';
import { Roles } from '../../src/auth/decorators/roles.decorator';

@Controller('security-probe')
export class SecurityProbeController {
  @Get('owner-only')
  @Roles('owner')
  getOwnerOnly(): { ok: true } {
    return { ok: true };
  }

  @Get('users/:ownerUserId')
  @Permissions('users:read')
  @Policy({
    resource: 'users',
    action: 'read',
    contextFactory: (request) => ({
      owner_user_id: Array.isArray(request.params.ownerUserId)
        ? request.params.ownerUserId[0]
        : request.params.ownerUserId,
      require_ownership: true,
    }),
  })
  getOwnedUser(
    @Param('ownerUserId', new ParseUUIDPipe()) ownerUserId: string,
  ): { owner_user_id: string } {
    return { owner_user_id: ownerUserId };
  }
}
