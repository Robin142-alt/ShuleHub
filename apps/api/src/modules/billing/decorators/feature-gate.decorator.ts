import { SetMetadata } from '@nestjs/common';

import { FEATURE_GATE_KEY } from '../billing.constants';

export const FeatureGate = (...features: string[]): MethodDecorator & ClassDecorator =>
  SetMetadata(FEATURE_GATE_KEY, features);
