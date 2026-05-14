import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';

import { RequestContextService } from '../../common/request-context/request-context.service';
import type {
  ApproveLeaveRequestDto,
  ApproveStaffContractDto,
  ChangeStaffStatusDto,
} from './dto/hr.dto';
import { HrRepository } from './repositories/hr.repository';

@Injectable()
export class HrService {
  constructor(
    private readonly requestContext: RequestContextService,
    private readonly hrRepository: HrRepository,
  ) {}

  async approveContract(dto: ApproveStaffContractDto) {
    const tenantId = this.requireTenantId();
    const overlap = await this.hrRepository.findOverlappingActiveContract(tenantId, dto);

    if (overlap) {
      throw new BadRequestException('Staff member already has an overlapping active contract');
    }

    const contract = await this.hrRepository.approveContract({
      ...dto,
      tenant_id: tenantId,
      approved_by_user_id: this.getActorUserId(),
    });

    await this.hrRepository.appendAuditLog({
      tenant_id: tenantId,
      staff_profile_id: dto.staff_profile_id,
      actor_user_id: this.getActorUserId(),
      action: 'staff.contract.approved',
      metadata: { role_title: dto.role_title, starts_on: dto.starts_on },
    });

    return contract;
  }

  async approveLeave(dto: ApproveLeaveRequestDto) {
    const tenantId = this.requireTenantId();
    const balance = await this.hrRepository.findLeaveBalance(
      tenantId,
      dto.staff_profile_id,
      dto.leave_type,
    );
    const availableDays = Number(balance.available_days ?? 0);

    if (dto.requested_days > availableDays && !dto.override_reason?.trim()) {
      throw new BadRequestException('Leave approval beyond balance requires an override reason');
    }

    const leave = await this.hrRepository.approveLeaveRequest({
      ...dto,
      tenant_id: tenantId,
      approved_by_user_id: this.getActorUserId(),
    });

    await this.hrRepository.appendAuditLog({
      tenant_id: tenantId,
      staff_profile_id: dto.staff_profile_id,
      actor_user_id: this.getActorUserId(),
      action: 'staff.leave.approved',
      metadata: {
        leave_type: dto.leave_type,
        requested_days: dto.requested_days,
        override_reason: dto.override_reason ?? null,
      },
    });

    return leave;
  }

  async changeStaffStatus(dto: ChangeStaffStatusDto) {
    const tenantId = this.requireTenantId();
    const staff = await this.hrRepository.changeStaffStatus({
      ...dto,
      tenant_id: tenantId,
    });

    await this.hrRepository.appendAuditLog({
      tenant_id: tenantId,
      staff_profile_id: dto.staff_profile_id,
      actor_user_id: this.getActorUserId(),
      action: 'staff.status.changed',
      metadata: {
        status: dto.status,
        reason: dto.reason,
      },
    });

    return staff;
  }

  async listStaffDirectory(query: Record<string, string | undefined> = {}) {
    const rows = await this.hrRepository.listStaffDirectory({
      tenant_id: this.requireTenantId(),
      search: this.optionalText(query.search),
      status: this.optionalText(query.status),
    });

    return rows.map((row: Record<string, unknown>) => {
      const {
        statutory_identifiers: _statutoryIdentifiers,
        emergency_contact: _emergencyContact,
        ...publicRow
      } = row;

      return publicRow;
    });
  }

  private requireTenantId(): string {
    const tenantId = this.requestContext.getStore()?.tenant_id;

    if (!tenantId) {
      throw new UnauthorizedException('Tenant context is required for HR operations');
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
