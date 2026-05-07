import { SetMetadata } from '@nestjs/common';

import { PERMISSIONS_KEY } from '../auth.constants';

export const Permissions = (...permissions: string[]): MethodDecorator & ClassDecorator =>
  SetMetadata(PERMISSIONS_KEY, permissions);

