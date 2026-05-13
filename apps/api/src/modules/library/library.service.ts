import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';

import { RequestContextService } from '../../common/request-context/request-context.service';
import { DatabaseService } from '../../database/database.service';
import { CreateLibraryBookDto, CreateLibraryCategoryDto, ListLibraryBooksQueryDto, UpdateLibraryBookDto } from './dto/catalog.dto';
import {
  CreateLibraryMemberDto,
  IssueLibraryBookDto,
  ListLibraryQueryDto,
  ReturnLibraryBookDto,
  UpdateLibraryFineDto,
} from './dto/library-workflow.dto';
import {
  LibraryBookRecord,
  LibraryBorrowingRecord,
  LibraryMemberRecord,
  LibraryRepository,
} from './repositories/library.repository';

const DEFAULT_OVERDUE_FINE_PER_DAY = 10;
const DEFAULT_DAMAGED_BOOK_PENALTY = 500;
const DEFAULT_LOST_BOOK_PENALTY = 1200;

@Injectable()
export class LibraryService {
  constructor(
    private readonly requestContext: RequestContextService,
    private readonly databaseService: DatabaseService,
    private readonly libraryRepository: LibraryRepository,
  ) {}

  async getDashboard() {
    const tenantId = this.requireTenantId();

    await this.libraryRepository.ensureDefaultCategories(tenantId);
    return this.libraryRepository.buildDashboard(tenantId);
  }

  async listCategories() {
    const tenantId = this.requireTenantId();

    await this.libraryRepository.ensureDefaultCategories(tenantId);
    return this.libraryRepository.listCategories(tenantId);
  }

  async createCategory(dto: CreateLibraryCategoryDto) {
    const tenantId = this.requireTenantId();
    const name = dto.name.trim();
    const code = (dto.code?.trim() || name).toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '');

    if (!name) {
      throw new BadRequestException('Library category name is required');
    }

    try {
      const category = await this.libraryRepository.createCategory({
        tenant_id: tenantId,
        code,
        name,
        description: dto.description?.trim() || `${name} resources for school library operations.`,
      });

      await this.logActivity('created category', name, 'library_category', category.id, {
        code,
      });

      return category;
    } catch (error) {
      this.rethrowUniqueConstraint(error, 'library category already exists in this tenant');
      throw error;
    }
  }

  async listBooks(query: ListLibraryBooksQueryDto) {
    return this.libraryRepository.listBooks(this.requireTenantId(), {
      search: query.search?.trim() || undefined,
      category: query.category?.trim() || undefined,
      status: query.status?.trim() || undefined,
      limit: query.limit ?? 50,
      offset: query.offset ?? 0,
    });
  }

  async createBook(dto: CreateLibraryBookDto) {
    return this.databaseService.withRequestTransaction(async () => {
      const tenantId = this.requireTenantId();
      const total = dto.quantity_total;
      const damaged = dto.quantity_damaged ?? 0;
      const lost = dto.quantity_lost ?? 0;
      const available = dto.quantity_available ?? Math.max(total - damaged - lost, 0);

      this.assertValidInventoryCounts(total, available, damaged, lost);

      try {
        const book = await this.libraryRepository.createBook({
          tenant_id: tenantId,
          accession_number: dto.accession_number.trim().toUpperCase(),
          isbn: dto.isbn?.trim() || null,
          title: dto.title.trim(),
          subtitle: dto.subtitle?.trim() || null,
          author: dto.author.trim(),
          publisher: dto.publisher?.trim() || null,
          category: dto.category.trim(),
          subject: dto.subject?.trim() || null,
          edition: dto.edition?.trim() || null,
          shelf_location: dto.shelf_location.trim(),
          quantity_total: total,
          quantity_available: available,
          quantity_damaged: damaged,
          quantity_lost: lost,
          unit_value: dto.unit_value ?? 0,
          status: dto.status?.trim() || this.resolveBookStatus(available, damaged, lost),
        });

        await this.logActivity('created book', book.title, 'library_book', book.id, {
          accession_number: book.accession_number,
          category: book.category,
          quantity_total: book.quantity_total,
        });

        return book;
      } catch (error) {
        this.rethrowUniqueConstraint(error, 'library accession number already exists in this tenant');
        throw error;
      }
    });
  }

  async updateBook(bookId: string, dto: UpdateLibraryBookDto) {
    return this.databaseService.withRequestTransaction(async () => {
      const tenantId = this.requireTenantId();
      const existing = await this.libraryRepository.findBookById(tenantId, bookId);

      if (!existing) {
        throw new NotFoundException(`Library book "${bookId}" was not found`);
      }

      const total = dto.quantity_total ?? existing.quantity_total;
      const available = dto.quantity_available ?? existing.quantity_available;
      const damaged = dto.quantity_damaged ?? existing.quantity_damaged;
      const lost = dto.quantity_lost ?? existing.quantity_lost;
      this.assertValidInventoryCounts(total, available, damaged, lost);

      const updated = await this.libraryRepository.updateBook(tenantId, bookId, {
        isbn: dto.isbn === undefined ? undefined : dto.isbn.trim() || null,
        title: dto.title?.trim(),
        subtitle: dto.subtitle === undefined ? undefined : dto.subtitle.trim() || null,
        author: dto.author?.trim(),
        publisher: dto.publisher === undefined ? undefined : dto.publisher.trim() || null,
        category: dto.category?.trim(),
        subject: dto.subject === undefined ? undefined : dto.subject.trim() || null,
        edition: dto.edition === undefined ? undefined : dto.edition.trim() || null,
        shelf_location: dto.shelf_location?.trim(),
        quantity_total: dto.quantity_total,
        quantity_available: dto.quantity_available,
        quantity_damaged: dto.quantity_damaged,
        quantity_lost: dto.quantity_lost,
        unit_value: dto.unit_value,
        status: dto.status?.trim() || this.resolveBookStatus(available, damaged, lost),
      });

      if (!updated) {
        throw new NotFoundException(`Library book "${bookId}" was not found`);
      }

      await this.logActivity('edited inventory', updated.title, 'library_book', updated.id, {
        accession_number: updated.accession_number,
        quantity_available: updated.quantity_available,
      });

      return updated;
    });
  }

  async listMembers(query: ListLibraryQueryDto) {
    return this.libraryRepository.listMembers(this.requireTenantId(), {
      search: query.search?.trim() || undefined,
      status: query.status?.trim() || undefined,
      limit: query.limit ?? 50,
      offset: query.offset ?? 0,
    });
  }

  async createMember(dto: CreateLibraryMemberDto) {
    const tenantId = this.requireTenantId();
    const member = await this.libraryRepository.createMember({
      tenant_id: tenantId,
      member_type: dto.member_type.trim(),
      admission_or_staff_no: dto.admission_or_staff_no.trim().toUpperCase(),
      full_name: dto.full_name.trim(),
      class_or_department: dto.class_or_department.trim(),
      contact: dto.contact?.trim() || null,
      status: dto.status?.trim() || 'active',
    });

    await this.logActivity('created member', member.full_name, 'library_member', member.id, {
      admission_or_staff_no: member.admission_or_staff_no,
      member_type: member.member_type,
    });

    return member;
  }

  async listBorrowings(query: ListLibraryQueryDto) {
    return this.libraryRepository.listBorrowings(this.requireTenantId(), {
      status: query.status?.trim() || undefined,
      limit: query.limit ?? 50,
      offset: query.offset ?? 0,
    });
  }

  async issueBook(dto: IssueLibraryBookDto) {
    return this.databaseService.withRequestTransaction(async () => {
      const tenantId = this.requireTenantId();
      const member = await this.libraryRepository.findMemberById(tenantId, dto.member_id);
      const book = await this.libraryRepository.findBookById(tenantId, dto.book_id);

      if (!member) {
        throw new NotFoundException('Library member was not found');
      }

      if (!book) {
        throw new NotFoundException('Library book was not found');
      }

      if (member.status !== 'active') {
        throw new BadRequestException('Only active library members can borrow books');
      }

      if (book.quantity_available <= 0 || book.status === 'lost' || book.status === 'damaged') {
        throw new BadRequestException(`No available copies for ${book.title}.`);
      }

      const duplicate = await this.libraryRepository.findOpenBorrowingForBookAndMember(
        tenantId,
        book.id,
        member.id,
      );

      if (duplicate) {
        throw new ConflictException(`${member.full_name} already has an open borrowing for ${book.title}`);
      }

      const receiptNumber = this.buildReference('LIB-ISS');
      const actorUserId = this.getActorUserId();
      const borrowing = await this.libraryRepository.createBorrowing({
        tenant_id: tenantId,
        receipt_number: receiptNumber,
        book_id: book.id,
        member_id: member.id,
        due_date: dto.due_date,
        status: 'borrowed',
        issued_by_user_id: actorUserId,
        submission_id: dto.submission_id?.trim() || null,
        notes: dto.notes?.trim() || null,
      });
      const nextAvailable = book.quantity_available - 1;

      await this.libraryRepository.updateBookQuantities(tenantId, book.id, {
        quantity_available: nextAvailable,
        status: this.resolveBookStatus(nextAvailable, book.quantity_damaged, book.quantity_lost),
      });
      await this.logActivity('issued book', book.title, 'library_borrowing', borrowing.id, {
        receipt_number: receiptNumber,
        accession_number: book.accession_number,
        borrower: member.full_name,
        admission_or_staff_no: member.admission_or_staff_no,
        due_date: dto.due_date,
      });

      return {
        borrowing,
        receipt: {
          reference: receiptNumber,
          borrower: member.full_name,
          admission_or_staff_no: member.admission_or_staff_no,
          class_or_department: member.class_or_department,
          title: book.title,
          accession_number: book.accession_number,
          issued_at: new Date().toISOString(),
          due_date: dto.due_date,
          quantity_available: nextAvailable,
        },
      };
    });
  }

  async returnBook(dto: ReturnLibraryBookDto) {
    return this.databaseService.withRequestTransaction(async () => {
      const tenantId = this.requireTenantId();
      const borrowing = await this.libraryRepository.findBorrowingById(tenantId, dto.borrowing_id);

      if (!borrowing) {
        throw new NotFoundException(`Library borrowing "${dto.borrowing_id}" was not found`);
      }

      if (borrowing.returned_at || borrowing.status === 'returned') {
        throw new ConflictException('This borrowing has already been returned');
      }

      const book = await this.libraryRepository.findBookById(tenantId, borrowing.book_id);

      if (!book) {
        throw new NotFoundException(`Library book "${borrowing.book_id}" was not found`);
      }

      if (!['good', 'damaged', 'lost'].includes(dto.condition)) {
        throw new BadRequestException('Return condition must be good, damaged, or lost');
      }

      const returnedAt = dto.returned_at?.trim() || new Date().toISOString().slice(0, 10);
      const overdueDays = this.calculateOverdueDays(borrowing.due_date, returnedAt);
      const penalty = this.calculateFineAmount(book, dto.condition, overdueDays, dto.fine_per_overdue_day);
      const nextQuantities = this.calculateReturnQuantities(book, dto.condition);
      const returnRecord = await this.libraryRepository.createReturn({
        tenant_id: tenantId,
        borrowing_id: borrowing.id,
        book_id: borrowing.book_id,
        member_id: borrowing.member_id,
        returned_at: returnedAt,
        condition: dto.condition,
        overdue_days: overdueDays,
        fine_amount: penalty.amount,
        received_by_user_id: this.getActorUserId(),
        notes: dto.notes?.trim() || null,
      });

      await this.libraryRepository.markBorrowingReturned(tenantId, borrowing.id, {
        returned_at: returnedAt,
        status: 'returned',
      });
      await this.libraryRepository.updateBookQuantities(tenantId, book.id, nextQuantities);

      let fine = null;
      if (penalty.amount > 0) {
        fine = await this.libraryRepository.createFine({
          tenant_id: tenantId,
          fine_number: this.buildReference('LIB-FINE'),
          member_id: borrowing.member_id,
          borrowing_id: borrowing.id,
          category: penalty.category,
          amount: penalty.amount,
          status: 'pending',
          assessed_by_user_id: this.getActorUserId(),
          notes: penalty.notes,
        });
      }

      await this.logActivity('returned book', borrowing.book_title ?? book.title, 'library_return', returnRecord.id, {
        accession_number: borrowing.accession_number ?? book.accession_number,
        borrower: borrowing.member_name,
        condition: dto.condition,
        overdue_days: overdueDays,
        fine_amount: penalty.amount,
      });

      return {
        return: returnRecord,
        fine,
        receipt: {
          reference: this.buildReference('LIB-RET'),
          borrower: borrowing.member_name,
          admission_or_staff_no: borrowing.admission_or_staff_no,
          class_or_department: borrowing.class_or_department,
          title: borrowing.book_title ?? book.title,
          accession_number: borrowing.accession_number ?? book.accession_number,
          returned_at: returnedAt,
          condition: dto.condition,
          overdue_days: overdueDays,
          fine_amount: penalty.amount,
          fine_status: fine ? 'pending' : 'none',
        },
      };
    });
  }

  async listReturns(query: ListLibraryQueryDto) {
    return this.libraryRepository.listReturns(this.requireTenantId(), query.limit ?? 50);
  }

  async listOverdue(query: ListLibraryQueryDto) {
    const reports = await this.libraryRepository.buildReports(this.requireTenantId());
    const rows = reports.overdue_books as Array<Record<string, unknown>>;
    const search = query.search?.trim().toLowerCase();

    if (!search) {
      return rows.slice(query.offset ?? 0, (query.offset ?? 0) + (query.limit ?? 50));
    }

    return rows
      .filter((row) =>
        ['full_name', 'class_or_department', 'contact', 'title', 'accession_number']
          .some((field) => String(row[field] ?? '').toLowerCase().includes(search)),
      )
      .slice(query.offset ?? 0, (query.offset ?? 0) + (query.limit ?? 50));
  }

  async listFines(query: ListLibraryQueryDto) {
    return this.libraryRepository.listFines(this.requireTenantId(), {
      status: query.status?.trim() || undefined,
      limit: query.limit ?? 50,
      offset: query.offset ?? 0,
    });
  }

  async updateFineStatus(fineId: string, dto: UpdateLibraryFineDto) {
    const tenantId = this.requireTenantId();
    const fine = await this.libraryRepository.updateFineStatus(tenantId, fineId, {
      status: dto.status,
      notes: dto.notes?.trim() || null,
      actor_user_id: this.getActorUserId(),
    });

    if (!fine) {
      throw new NotFoundException(`Library fine "${fineId}" was not found`);
    }

    await this.logActivity(`${dto.status} fine`, fine.fine_number, 'library_fine', fine.id, {
      amount: fine.amount,
      status: fine.status,
    });

    return fine;
  }

  async listActivity(query: ListLibraryQueryDto) {
    return this.libraryRepository.listActivity(this.requireTenantId(), query.limit ?? 50);
  }

  async getReports() {
    return this.libraryRepository.buildReports(this.requireTenantId());
  }

  private requireTenantId(): string {
    const tenantId = this.requestContext.getStore()?.tenant_id;

    if (!tenantId) {
      throw new UnauthorizedException('Tenant context is required for library operations');
    }

    return tenantId;
  }

  private getActorUserId(): string | null {
    return this.requestContext.getStore()?.user_id ?? null;
  }

  private assertValidInventoryCounts(total: number, available: number, damaged: number, lost: number): void {
    if (available + damaged + lost > total) {
      throw new BadRequestException('Library book inventory counts cannot exceed total quantity');
    }
  }

  private resolveBookStatus(available: number, damaged: number, lost: number): string {
    if (available > 0) {
      return 'available';
    }

    if (lost > 0 && damaged === 0) {
      return 'lost';
    }

    if (damaged > 0 && lost === 0) {
      return 'damaged';
    }

    return 'borrowed';
  }

  private calculateReturnQuantities(
    book: LibraryBookRecord,
    condition: string,
  ): {
    quantity_available: number;
    quantity_damaged: number;
    quantity_lost: number;
    status: string;
  } {
    const quantityAvailable = condition === 'good'
      ? book.quantity_available + 1
      : book.quantity_available;
    const quantityDamaged = condition === 'damaged'
      ? book.quantity_damaged + 1
      : book.quantity_damaged;
    const quantityLost = condition === 'lost'
      ? book.quantity_lost + 1
      : book.quantity_lost;

    return {
      quantity_available: quantityAvailable,
      quantity_damaged: quantityDamaged,
      quantity_lost: quantityLost,
      status: condition === 'good'
        ? this.resolveBookStatus(quantityAvailable, quantityDamaged, quantityLost)
        : condition,
    };
  }

  private calculateOverdueDays(dueDate: string, returnedAt: string): number {
    const due = this.parseDateOnly(dueDate);
    const returned = this.parseDateOnly(returnedAt);
    const days = Math.floor((returned.getTime() - due.getTime()) / 86_400_000);

    return Math.max(days, 0);
  }

  private parseDateOnly(value: string): Date {
    const [year, month, day] = value.slice(0, 10).split('-').map(Number);

    return new Date(Date.UTC(year, month - 1, day));
  }

  private calculateFineAmount(
    book: LibraryBookRecord,
    condition: string,
    overdueDays: number,
    finePerOverdueDay?: number,
  ): {
    amount: number;
    category: string;
    notes: string;
  } {
    const overdueAmount = overdueDays * (finePerOverdueDay ?? DEFAULT_OVERDUE_FINE_PER_DAY);

    if (condition === 'lost') {
      const lostPenalty = Math.max(book.unit_value ?? 0, DEFAULT_LOST_BOOK_PENALTY);

      return {
        amount: overdueAmount + lostPenalty,
        category: 'lost',
        notes: `Lost book penalty for ${book.title}`,
      };
    }

    if (condition === 'damaged') {
      return {
        amount: overdueAmount + DEFAULT_DAMAGED_BOOK_PENALTY,
        category: 'damaged',
        notes: `Damaged book penalty for ${book.title}`,
      };
    }

    return {
      amount: overdueAmount,
      category: 'overdue',
      notes: overdueDays > 0
        ? `${overdueDays} overdue day(s) at KES ${finePerOverdueDay ?? DEFAULT_OVERDUE_FINE_PER_DAY}`
        : 'No fine charged',
    };
  }

  private async logActivity(
    action: string,
    affectedItem: string,
    resourceType: string,
    resourceId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.libraryRepository.logActivity({
      tenant_id: this.requireTenantId(),
      actor_user_id: this.getActorUserId(),
      action,
      affected_item: affectedItem,
      resource_type: resourceType,
      resource_id: resourceId,
      metadata,
    });
  }

  private buildReference(prefix: string): string {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const suffix = Date.now().toString().slice(-5);

    return `${prefix}-${date}-${suffix}`;
  }

  private rethrowUniqueConstraint(error: unknown, message: string): void {
    const databaseError = error as { code?: string };

    if (databaseError?.code === '23505') {
      throw new ConflictException(message);
    }
  }
}
