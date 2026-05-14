import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';

import { RequestContextService } from '../../common/request-context/request-context.service';
import type { CreateTimetableSlotDto, PublishTimetableVersionDto } from './dto/timetable.dto';
import { TimetableRepository } from './repositories/timetable.repository';

@Injectable()
export class TimetableService {
  constructor(
    private readonly requestContext: RequestContextService,
    private readonly timetableRepository: TimetableRepository,
  ) {}

  async createSlot(dto: CreateTimetableSlotDto) {
    const tenantId = this.requireTenantId();
    const conflicts = await this.timetableRepository.findSlotConflicts(tenantId, dto);

    if (conflicts.length > 0) {
      const conflictTypes = [...new Set(conflicts.map((conflict) => conflict.type))].join(', ');
      throw new BadRequestException(`Timetable ${conflictTypes} conflict detected`);
    }

    const slot = await this.timetableRepository.createSlot({
      ...dto,
      tenant_id: tenantId,
      created_by_user_id: this.getActorUserId(),
    });

    await this.timetableRepository.appendAuditLog({
      tenant_id: tenantId,
      slot_id: slot?.id ?? null,
      actor_user_id: this.getActorUserId(),
      action: 'timetable.slot.created',
      metadata: {
        class_section_id: dto.class_section_id,
        teacher_id: dto.teacher_id,
        room_id: dto.room_id ?? null,
      },
    });

    return slot;
  }

  async publishVersion(dto: PublishTimetableVersionDto) {
    const tenantId = this.requireTenantId();
    const conflicts = await this.timetableRepository.findVersionConflicts(tenantId, dto);

    if (conflicts.length > 0) {
      throw new BadRequestException('Timetable version has unresolved conflicts');
    }

    const version = await this.timetableRepository.publishVersion({
      ...dto,
      tenant_id: tenantId,
      published_by_user_id: this.getActorUserId(),
    });

    await this.timetableRepository.appendAuditLog({
      tenant_id: tenantId,
      version_id: version.id,
      actor_user_id: this.getActorUserId(),
      action: 'timetable.version.published',
      metadata: {
        academic_year: dto.academic_year,
        term_name: dto.term_name,
        immutable: true,
      },
    });

    return version;
  }

  listPublishedSchedules(query: Record<string, string | undefined> = {}) {
    return this.timetableRepository.listPublishedSchedules({
      tenant_id: this.requireTenantId(),
      academic_year: this.optionalText(query.academic_year),
      term_name: this.optionalText(query.term_name),
    });
  }

  private requireTenantId(): string {
    const tenantId = this.requestContext.getStore()?.tenant_id;

    if (!tenantId) {
      throw new UnauthorizedException('Tenant context is required for timetable operations');
    }

    return tenantId;
  }

  private getActorUserId(): string | null {
    const userId = this.requestContext.getStore()?.user_id;
    return userId && userId !== 'anonymous' ? userId : null;
  }

  private optionalText(value: string | undefined): string | undefined {
    const normalized = value?.trim() ?? '';
    return normalized || undefined;
  }
}
