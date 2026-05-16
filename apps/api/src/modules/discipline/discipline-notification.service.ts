import { Injectable } from '@nestjs/common';

import { DisciplineRepository } from './repositories/discipline.repository';

@Injectable()
export class DisciplineNotificationService {
  constructor(private readonly disciplineRepository: DisciplineRepository) {}

  async queue(input: {
    tenant_id: string;
    school_id: string;
    incident_id?: string | null;
    student_id?: string | null;
    recipient_user_id?: string | null;
    notification_type: string;
    channel: 'in_app' | 'email' | 'sms';
    title: string;
    body: string;
    metadata?: Record<string, unknown>;
  }) {
    return this.disciplineRepository.createNotification(input);
  }
}
