import { Injectable } from '@nestjs/common';

import type { GenerateDisciplineDocumentDto } from './dto/discipline.dto';
import type { DisciplineIncidentEntity } from './entities/discipline.entity';

@Injectable()
export class DisciplineDocumentService {
  async generate(input: {
    incident: DisciplineIncidentEntity;
    dto: GenerateDisciplineDocumentDto;
    actorUserId: string | null;
  }) {
    const documentNumber = `${input.dto.document_type.toUpperCase().replace(/[^A-Z0-9]+/g, '-')}-${Date.now()}`;

    return {
      status: 'generated',
      document_number: documentNumber,
      document_type: input.dto.document_type,
      incident_id: input.incident.id,
      student_id: input.incident.student_id,
      generated_by_user_id: input.actorUserId,
      generated_at: new Date().toISOString(),
      verification_enabled: true,
      confidential_notes_included: false,
    };
  }
}
