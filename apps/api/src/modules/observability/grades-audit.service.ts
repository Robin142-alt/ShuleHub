import { Injectable } from '@nestjs/common';

import { AuditLogService } from './audit-log.service';

@Injectable()
export class GradesAuditService {
  constructor(private readonly auditLogService: AuditLogService) {}

  async recordGradeAction(input: {
    action: 'grade.created' | 'grade.updated' | 'grade.published' | 'grade.deleted';
    grade_id: string;
    student_id: string;
    assessment_id?: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.auditLogService.record({
      action: input.action,
      resource_type: 'grade',
      resource_id: input.grade_id,
      metadata: {
        student_id: input.student_id,
        assessment_id: input.assessment_id ?? null,
        ...input.metadata,
      },
    });
  }
}
