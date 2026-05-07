import { Injectable } from '@nestjs/common';

import { SyncPushOperationInput, SyncPushOperationResult } from '../sync.types';

@Injectable()
export class FinanceSyncConflictResolverService {
  async applyOperation(
    operation: SyncPushOperationInput<'finance'>,
  ): Promise<SyncPushOperationResult<'finance'>> {
    return {
      op_id: operation.op_id,
      entity: operation.entity,
      status: 'rejected',
      client_version: operation.version,
      server_version: null,
      reason: 'Finance is server authoritative and cannot be mutated from offline devices',
      conflict_policy: 'server-authoritative',
      server_state: null,
    };
  }
}
