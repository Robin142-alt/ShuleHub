import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';

import { Permissions } from '../../auth/decorators/permissions.decorator';
import {
  AssignTicketDto,
  CreateInternalNoteDto,
  CreateSupportMessageDto,
  CreateSupportTicketDto,
  KnowledgeBaseQueryDto,
  ListSupportTicketsQueryDto,
  MergeTicketsDto,
  UpdateTicketStatusDto,
  UploadTicketAttachmentDto,
} from './dto/support.dto';
import { SupportService } from './support.service';
import type { UploadedSupportFile } from './storage/support-attachment-storage.service';

const { memoryStorage } = require('multer');

@Controller('support')
export class SupportController {
  constructor(private readonly supportService: SupportService) {}

  @Get('categories')
  @Permissions('support:view')
  getCategories() {
    return this.supportService.getCategories();
  }

  @Get('tickets')
  @Permissions('support:view')
  listTickets(@Query() query: ListSupportTicketsQueryDto) {
    return this.supportService.listTickets(query);
  }

  @Post('tickets')
  @Permissions('support:create')
  createTicket(@Body() dto: CreateSupportTicketDto) {
    return this.supportService.createTicket(dto);
  }

  @Get('tickets/:ticketId')
  @Permissions('support:view')
  getTicket(@Param('ticketId', new ParseUUIDPipe()) ticketId: string) {
    return this.supportService.getTicket(ticketId);
  }

  @Post('tickets/:ticketId/messages')
  @Permissions('support:reply')
  replyToTicket(
    @Param('ticketId', new ParseUUIDPipe()) ticketId: string,
    @Body() dto: CreateSupportMessageDto,
  ) {
    return this.supportService.replyToTicket(ticketId, dto);
  }

  @Post('tickets/:ticketId/attachments')
  @Permissions('support:reply')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  uploadAttachment(
    @Param('ticketId', new ParseUUIDPipe()) ticketId: string,
    @Body() dto: UploadTicketAttachmentDto,
    @UploadedFile() file: UploadedSupportFile,
  ) {
    return this.supportService.uploadAttachment(ticketId, dto, file);
  }

  @Post('tickets/:ticketId/internal-notes')
  @Permissions('support:manage')
  addInternalNote(
    @Param('ticketId', new ParseUUIDPipe()) ticketId: string,
    @Body() dto: CreateInternalNoteDto,
  ) {
    return this.supportService.addInternalNote(ticketId, dto);
  }

  @Patch('tickets/:ticketId/status')
  @Permissions('support:manage')
  updateTicketStatus(
    @Param('ticketId', new ParseUUIDPipe()) ticketId: string,
    @Body() dto: UpdateTicketStatusDto,
  ) {
    return this.supportService.updateTicketStatus(ticketId, dto);
  }

  @Patch('tickets/:ticketId/assign')
  @Permissions('support:manage')
  assignTicket(
    @Param('ticketId', new ParseUUIDPipe()) ticketId: string,
    @Body() dto: AssignTicketDto,
  ) {
    return this.supportService.assignTicket(ticketId, dto);
  }

  @Patch('tickets/:ticketId/escalate')
  @Permissions('support:manage')
  escalateTicket(
    @Param('ticketId', new ParseUUIDPipe()) ticketId: string,
    @Body() dto: { reason?: string },
  ) {
    return this.supportService.escalateTicket(ticketId, dto.reason);
  }

  @Patch('tickets/:ticketId/merge')
  @Permissions('support:manage')
  mergeTicket(
    @Param('ticketId', new ParseUUIDPipe()) ticketId: string,
    @Body() dto: MergeTicketsDto,
  ) {
    return this.supportService.mergeTickets(ticketId, dto);
  }

  @Get('knowledge-base')
  @Permissions('support:view')
  listKnowledgeBase(@Query() query: KnowledgeBaseQueryDto) {
    return this.supportService.listKnowledgeBase(query);
  }

  @Get('system-status')
  @Permissions('support:view')
  getSystemStatus() {
    return this.supportService.getSystemStatus();
  }

  @Get('notifications')
  @Permissions('support:view')
  listNotifications() {
    return this.supportService.listNotifications();
  }

  @Get('admin/analytics')
  @Permissions('support:manage')
  getAnalytics() {
    return this.supportService.getAnalytics();
  }
}
