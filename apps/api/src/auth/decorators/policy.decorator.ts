import { SetMetadata } from '@nestjs/common';

import { POLICY_KEY } from '../auth.constants';
import { PolicyMetadata } from '../auth.interfaces';

export const Policy = (policy: PolicyMetadata): MethodDecorator & ClassDecorator =>
  SetMetadata(POLICY_KEY, policy);

