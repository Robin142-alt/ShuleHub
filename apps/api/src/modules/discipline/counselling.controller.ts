import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';

import { Permissions } from '../../auth/decorators/permissions.decorator';
import {
  CreateCounsellingNoteDto,
  CreateCounsellingReferralDto,
  CreateCounsellingSessionDto,
  CreateImprovementPlanDto,
  ListCounsellingQueryDto,
  UpdateCounsellingSessionDto,
} from './dto/counselling.dto';
import { CounsellingService } from './counselling.service';

@Controller('counselling')
export class CounsellingController {
  constructor(private readonly counsellingService: CounsellingService) {}

  @Get('dashboard')
  @Permissions('counselling:read')
  getDashboard() {
    return this.counsellingService.getDashboard();
  }

  @Get('referrals')
  @Permissions('counselling:read')
  listReferrals(@Query() query: ListCounsellingQueryDto) {
    return this.counsellingService.listReferrals(query);
  }

  @Post('referrals')
  @Permissions('discipline:write')
  createReferral(@Body() dto: CreateCounsellingReferralDto) {
    return this.counsellingService.createReferral(dto);
  }

  @Post('referrals/:referralId/accept')
  @Permissions('counselling:manage')
  acceptReferral(
    @Param('referralId', new ParseUUIDPipe()) referralId: string,
    @Body() dto: { response_note?: string },
  ) {
    return this.counsellingService.acceptReferral(referralId, dto.response_note);
  }

  @Post('referrals/:referralId/decline')
  @Permissions('counselling:manage')
  declineReferral(
    @Param('referralId', new ParseUUIDPipe()) referralId: string,
    @Body() dto: { response_note?: string },
  ) {
    return this.counsellingService.declineReferral(referralId, dto.response_note);
  }

  @Get('sessions')
  @Permissions('counselling:read')
  listSessions(@Query() query: ListCounsellingQueryDto) {
    return this.counsellingService.listSessions(query);
  }

  @Post('sessions')
  @Permissions('counselling:write')
  createSession(@Body() dto: CreateCounsellingSessionDto) {
    return this.counsellingService.createSession(dto);
  }

  @Patch('sessions/:sessionId')
  @Permissions('counselling:write')
  updateSession(
    @Param('sessionId', new ParseUUIDPipe()) sessionId: string,
    @Body() dto: UpdateCounsellingSessionDto,
  ) {
    return this.counsellingService.updateSession(sessionId, dto);
  }

  @Get('sessions/:sessionId/notes')
  @Permissions('counselling:read')
  listNotes(@Param('sessionId', new ParseUUIDPipe()) sessionId: string) {
    return this.counsellingService.listNotes(sessionId);
  }

  @Post('sessions/:sessionId/notes')
  @Permissions('counselling:write')
  createNote(
    @Param('sessionId', new ParseUUIDPipe()) sessionId: string,
    @Body() dto: CreateCounsellingNoteDto,
  ) {
    return this.counsellingService.createNote(sessionId, dto);
  }

  @Post('improvement-plans')
  @Permissions('counselling:write')
  createImprovementPlan(@Body() dto: CreateImprovementPlanDto) {
    return this.counsellingService.createImprovementPlan(dto);
  }
}
