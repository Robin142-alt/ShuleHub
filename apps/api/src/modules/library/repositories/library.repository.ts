import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../../../database/database.service';

export interface LibraryBookRecord {
  id: string;
  tenant_id: string;
  accession_number: string;
  isbn: string | null;
  title: string;
  subtitle?: string | null;
  author?: string | null;
  publisher?: string | null;
  category: string;
  subject?: string | null;
  edition?: string | null;
  shelf_location?: string | null;
  quantity_total: number;
  quantity_available: number;
  quantity_damaged: number;
  quantity_lost: number;
  unit_value?: number;
  status: string;
  created_at?: string;
  updated_at?: string;
}

export interface LibraryMemberRecord {
  id: string;
  tenant_id: string;
  member_type: string;
  admission_or_staff_no: string;
  full_name: string;
  class_or_department: string;
  contact: string | null;
  status: string;
}

export interface LibraryBorrowingRecord {
  id: string;
  tenant_id: string;
  receipt_number: string;
  book_id: string;
  member_id: string;
  borrowed_at: string;
  due_date: string;
  returned_at: string | null;
  status: string;
  issued_by_user_id?: string | null;
  submission_id?: string | null;
  notes?: string | null;
  book_title?: string | null;
  accession_number?: string | null;
  member_name?: string | null;
  admission_or_staff_no?: string | null;
  class_or_department?: string | null;
  contact?: string | null;
}

export interface LibraryReturnRecord {
  id: string;
  tenant_id: string;
  borrowing_id: string;
  book_id: string;
  member_id: string;
  returned_at: string;
  condition: string;
  overdue_days: number;
  fine_amount: number;
  notes: string | null;
}

export interface LibraryFineRecord {
  id: string;
  tenant_id: string;
  fine_number: string;
  member_id: string;
  borrowing_id: string | null;
  category: string;
  amount: number;
  status: string;
  assessed_at: string;
  notes: string | null;
  member_name?: string | null;
}

export interface LibraryActivityLogRecord {
  id: string;
  tenant_id: string;
  occurred_at: string;
  actor_user_id: string | null;
  librarian_name?: string | null;
  action: string;
  affected_item: string;
  resource_type: string | null;
  resource_id: string | null;
  metadata: Record<string, unknown>;
}

const defaultCategories = [
  'Mathematics',
  'English',
  'Kiswahili',
  'Sciences',
  'CBC Resources',
  'Literature',
  'History',
  'Geography',
  'Revision Books',
  'Story Books',
  'Dictionaries',
];

@Injectable()
export class LibraryRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async ensureDefaultCategories(tenantId: string): Promise<void> {
    for (const name of defaultCategories) {
      const code = name.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '');

      await this.databaseService.query(
        `
          INSERT INTO library_categories (tenant_id, code, name, description)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (tenant_id, code)
          DO UPDATE SET
            name = EXCLUDED.name,
            description = COALESCE(library_categories.description, EXCLUDED.description),
            updated_at = NOW()
        `,
        [tenantId, code, name, `${name} resources for school library operations.`],
      );
    }
  }

  async buildDashboard(tenantId: string) {
    const [
      issuedToday,
      overdue,
      available,
      missing,
      damaged,
      activeBorrowers,
      popular,
      returned,
      activity,
      alerts,
    ] = await Promise.all([
      this.databaseService.query<{ total: string }>(
        `
          SELECT COUNT(*)::text AS total
          FROM library_borrowings
          WHERE tenant_id = $1
            AND borrowed_at::date = CURRENT_DATE
        `,
        [tenantId],
      ),
      this.databaseService.query<{ total: string }>(
        `
          SELECT COUNT(*)::text AS total
          FROM library_borrowings
          WHERE tenant_id = $1
            AND status IN ('borrowed', 'overdue')
            AND due_date < CURRENT_DATE
        `,
        [tenantId],
      ),
      this.databaseService.query<{ total: string }>(
        `
          SELECT COALESCE(SUM(quantity_available), 0)::text AS total
          FROM library_books
          WHERE tenant_id = $1
        `,
        [tenantId],
      ),
      this.databaseService.query<{ total: string }>(
        `
          SELECT COALESCE(SUM(quantity_lost), 0)::text AS total
          FROM library_books
          WHERE tenant_id = $1
        `,
        [tenantId],
      ),
      this.databaseService.query<{ total: string }>(
        `
          SELECT COALESCE(SUM(quantity_damaged), 0)::text AS total
          FROM library_books
          WHERE tenant_id = $1
        `,
        [tenantId],
      ),
      this.databaseService.query<{ total: string }>(
        `
          SELECT COUNT(DISTINCT member_id)::text AS total
          FROM library_borrowings
          WHERE tenant_id = $1
            AND status IN ('borrowed', 'overdue')
        `,
        [tenantId],
      ),
      this.databaseService.query(
        `
          SELECT
            book.id,
            book.accession_number,
            book.title,
            book.category,
            COUNT(borrowing.id)::int AS borrow_count,
            book.quantity_available,
            book.shelf_location
          FROM library_books book
          LEFT JOIN library_borrowings borrowing
            ON borrowing.tenant_id = book.tenant_id
           AND borrowing.book_id = book.id
          WHERE book.tenant_id = $1
          GROUP BY book.id
          ORDER BY borrow_count DESC, book.title ASC
          LIMIT 8
        `,
        [tenantId],
      ),
      this.databaseService.query(
        `
          SELECT
            ret.id,
            ret.returned_at,
            ret.condition,
            ret.fine_amount,
            book.title,
            book.accession_number,
            member.full_name
          FROM library_returns ret
          JOIN library_books book
            ON book.tenant_id = ret.tenant_id
           AND book.id = ret.book_id
          JOIN library_members member
            ON member.tenant_id = ret.tenant_id
           AND member.id = ret.member_id
          WHERE ret.tenant_id = $1
          ORDER BY ret.returned_at DESC
          LIMIT 8
        `,
        [tenantId],
      ),
      this.listActivity(tenantId, 8),
      this.databaseService.query(
        `
          SELECT
            borrowing.id,
            borrowing.due_date::text,
            book.title,
            member.full_name,
            member.class_or_department,
            member.contact
          FROM library_borrowings borrowing
          JOIN library_books book
            ON book.tenant_id = borrowing.tenant_id
           AND book.id = borrowing.book_id
          JOIN library_members member
            ON member.tenant_id = borrowing.tenant_id
           AND member.id = borrowing.member_id
          WHERE borrowing.tenant_id = $1
            AND borrowing.status IN ('borrowed', 'overdue')
            AND borrowing.due_date < CURRENT_DATE
          ORDER BY borrowing.due_date ASC
          LIMIT 8
        `,
        [tenantId],
      ),
    ]);

    return {
      books_issued_today: Number(issuedToday.rows[0]?.total ?? '0'),
      overdue_books: Number(overdue.rows[0]?.total ?? '0'),
      available_books: Number(available.rows[0]?.total ?? '0'),
      missing_books: Number(missing.rows[0]?.total ?? '0'),
      damaged_books: Number(damaged.rows[0]?.total ?? '0'),
      active_borrowers: Number(activeBorrowers.rows[0]?.total ?? '0'),
      popular_books: popular.rows,
      recently_returned_books: returned.rows,
      recent_activity: activity,
      alerts: alerts.rows,
    };
  }

  async listCategories(tenantId: string) {
    const result = await this.databaseService.query<LibraryFineRecord>(
      `
        SELECT id, tenant_id, code, name, description, created_at::text, updated_at::text
        FROM library_categories
        WHERE tenant_id = $1
        ORDER BY name ASC
      `,
      [tenantId],
    );

    return result.rows;
  }

  async createCategory(input: {
    tenant_id: string;
    code: string;
    name: string;
    description: string | null;
  }) {
    const result = await this.databaseService.query(
      `
        INSERT INTO library_categories (tenant_id, code, name, description)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (tenant_id, code)
        DO UPDATE SET
          name = EXCLUDED.name,
          description = EXCLUDED.description,
          updated_at = NOW()
        RETURNING id, tenant_id, code, name, description, created_at::text, updated_at::text
      `,
      [input.tenant_id, input.code, input.name, input.description],
    );

    return result.rows[0];
  }

  async listBooks(
    tenantId: string,
    options: {
      search?: string;
      category?: string;
      status?: string;
      limit: number;
      offset: number;
    },
  ): Promise<LibraryBookRecord[]> {
    const conditions = ['tenant_id = $1'];
    const values: unknown[] = [tenantId];
    let parameterIndex = 2;

    if (options.search) {
      conditions.push(
        `(accession_number ILIKE $${parameterIndex}
          OR isbn ILIKE $${parameterIndex}
          OR title ILIKE $${parameterIndex}
          OR author ILIKE $${parameterIndex}
          OR shelf_location ILIKE $${parameterIndex})`,
      );
      values.push(`%${options.search}%`);
      parameterIndex += 1;
    }

    if (options.category) {
      conditions.push(`category = $${parameterIndex}`);
      values.push(options.category);
      parameterIndex += 1;
    }

    if (options.status) {
      conditions.push(`status = $${parameterIndex}`);
      values.push(options.status);
      parameterIndex += 1;
    }

    values.push(options.limit, options.offset);
    const result = await this.databaseService.query<LibraryBookRecord>(
      `
        SELECT
          id,
          tenant_id,
          accession_number,
          isbn,
          title,
          subtitle,
          author,
          publisher,
          category,
          subject,
          edition,
          shelf_location,
          quantity_total,
          quantity_available,
          quantity_damaged,
          quantity_lost,
          unit_value,
          status,
          created_at::text,
          updated_at::text
        FROM library_books
        WHERE ${conditions.join(' AND ')}
        ORDER BY updated_at DESC, title ASC
        LIMIT $${parameterIndex}
        OFFSET $${parameterIndex + 1}
      `,
      values,
    );

    return result.rows.map((row) => this.mapBook(row));
  }

  async createBook(input: Omit<LibraryBookRecord, 'id'>): Promise<LibraryBookRecord> {
    const result = await this.databaseService.query<LibraryBookRecord>(
      `
        INSERT INTO library_books (
          tenant_id,
          accession_number,
          isbn,
          title,
          subtitle,
          author,
          publisher,
          category,
          subject,
          edition,
          shelf_location,
          quantity_total,
          quantity_available,
          quantity_damaged,
          quantity_lost,
          unit_value,
          status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
        RETURNING
          id,
          tenant_id,
          accession_number,
          isbn,
          title,
          subtitle,
          author,
          publisher,
          category,
          subject,
          edition,
          shelf_location,
          quantity_total,
          quantity_available,
          quantity_damaged,
          quantity_lost,
          unit_value,
          status,
          created_at::text,
          updated_at::text
      `,
      [
        input.tenant_id,
        input.accession_number,
        input.isbn,
        input.title,
        input.subtitle ?? null,
        input.author ?? null,
        input.publisher ?? null,
        input.category,
        input.subject ?? null,
        input.edition ?? null,
        input.shelf_location ?? null,
        input.quantity_total,
        input.quantity_available,
        input.quantity_damaged,
        input.quantity_lost,
        input.unit_value ?? 0,
        input.status,
      ],
    );

    return this.mapBook(result.rows[0]);
  }

  async updateBook(
    tenantId: string,
    bookId: string,
    input: Partial<Omit<LibraryBookRecord, 'id' | 'tenant_id' | 'accession_number'>>,
  ): Promise<LibraryBookRecord | null> {
    const assignments: string[] = [];
    const values: unknown[] = [tenantId, bookId];
    let parameterIndex = 3;

    const setField = (column: string, value: unknown) => {
      assignments.push(`${column} = $${parameterIndex}`);
      values.push(value);
      parameterIndex += 1;
    };

    if (input.isbn !== undefined) setField('isbn', input.isbn);
    if (input.title !== undefined) setField('title', input.title);
    if (input.subtitle !== undefined) setField('subtitle', input.subtitle);
    if (input.author !== undefined) setField('author', input.author);
    if (input.publisher !== undefined) setField('publisher', input.publisher);
    if (input.category !== undefined) setField('category', input.category);
    if (input.subject !== undefined) setField('subject', input.subject);
    if (input.edition !== undefined) setField('edition', input.edition);
    if (input.shelf_location !== undefined) setField('shelf_location', input.shelf_location);
    if (input.quantity_total !== undefined) setField('quantity_total', input.quantity_total);
    if (input.quantity_available !== undefined) setField('quantity_available', input.quantity_available);
    if (input.quantity_damaged !== undefined) setField('quantity_damaged', input.quantity_damaged);
    if (input.quantity_lost !== undefined) setField('quantity_lost', input.quantity_lost);
    if (input.unit_value !== undefined) setField('unit_value', input.unit_value);
    if (input.status !== undefined) setField('status', input.status);

    if (assignments.length === 0) {
      return this.findBookById(tenantId, bookId);
    }

    assignments.push('updated_at = NOW()');

    const result = await this.databaseService.query<LibraryBookRecord>(
      `
        UPDATE library_books
        SET ${assignments.join(', ')}
        WHERE tenant_id = $1
          AND id = $2::uuid
        RETURNING
          id,
          tenant_id,
          accession_number,
          isbn,
          title,
          subtitle,
          author,
          publisher,
          category,
          subject,
          edition,
          shelf_location,
          quantity_total,
          quantity_available,
          quantity_damaged,
          quantity_lost,
          unit_value,
          status,
          created_at::text,
          updated_at::text
      `,
      values,
    );

    return result.rows[0] ? this.mapBook(result.rows[0]) : null;
  }

  async findBookById(tenantId: string, bookId: string): Promise<LibraryBookRecord | null> {
    const result = await this.databaseService.query<LibraryBookRecord>(
      `
        SELECT
          id,
          tenant_id,
          accession_number,
          isbn,
          title,
          subtitle,
          author,
          publisher,
          category,
          subject,
          edition,
          shelf_location,
          quantity_total,
          quantity_available,
          quantity_damaged,
          quantity_lost,
          unit_value,
          status,
          created_at::text,
          updated_at::text
        FROM library_books
        WHERE tenant_id = $1
          AND id = $2::uuid
        LIMIT 1
      `,
      [tenantId, bookId],
    );

    return result.rows[0] ? this.mapBook(result.rows[0]) : null;
  }

  async updateBookQuantities(
    tenantId: string,
    bookId: string,
    input: Partial<{
      quantity_available: number;
      quantity_damaged: number;
      quantity_lost: number;
      status: string;
    }>,
  ): Promise<void> {
    const assignments: string[] = [];
    const values: unknown[] = [tenantId, bookId];
    let parameterIndex = 3;

    const setField = (column: string, value: unknown) => {
      assignments.push(`${column} = $${parameterIndex}`);
      values.push(value);
      parameterIndex += 1;
    };

    if (input.quantity_available !== undefined) setField('quantity_available', input.quantity_available);
    if (input.quantity_damaged !== undefined) setField('quantity_damaged', input.quantity_damaged);
    if (input.quantity_lost !== undefined) setField('quantity_lost', input.quantity_lost);
    if (input.status !== undefined) setField('status', input.status);

    if (assignments.length === 0) {
      return;
    }

    assignments.push('updated_at = NOW()');

    await this.databaseService.query(
      `
        UPDATE library_books
        SET ${assignments.join(', ')}
        WHERE tenant_id = $1
          AND id = $2::uuid
      `,
      values,
    );
  }

  async listMembers(tenantId: string, options: { search?: string; status?: string; limit: number; offset: number }) {
    const conditions = ['tenant_id = $1'];
    const values: unknown[] = [tenantId];
    let parameterIndex = 2;

    if (options.search) {
      conditions.push(
        `(full_name ILIKE $${parameterIndex}
          OR admission_or_staff_no ILIKE $${parameterIndex}
          OR class_or_department ILIKE $${parameterIndex})`,
      );
      values.push(`%${options.search}%`);
      parameterIndex += 1;
    }

    if (options.status) {
      conditions.push(`status = $${parameterIndex}`);
      values.push(options.status);
      parameterIndex += 1;
    }

    values.push(options.limit, options.offset);
    const result = await this.databaseService.query<LibraryMemberRecord>(
      `
        SELECT id, tenant_id, member_type, admission_or_staff_no, full_name, class_or_department, contact, status
        FROM library_members
        WHERE ${conditions.join(' AND ')}
        ORDER BY full_name ASC
        LIMIT $${parameterIndex}
        OFFSET $${parameterIndex + 1}
      `,
      values,
    );

    return result.rows;
  }

  async createMember(input: Omit<LibraryMemberRecord, 'id'>): Promise<LibraryMemberRecord> {
    const result = await this.databaseService.query<LibraryMemberRecord>(
      `
        INSERT INTO library_members (
          tenant_id,
          member_type,
          admission_or_staff_no,
          full_name,
          class_or_department,
          contact,
          status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id, tenant_id, member_type, admission_or_staff_no, full_name, class_or_department, contact, status
      `,
      [
        input.tenant_id,
        input.member_type,
        input.admission_or_staff_no,
        input.full_name,
        input.class_or_department,
        input.contact,
        input.status,
      ],
    );

    return result.rows[0];
  }

  async findMemberById(tenantId: string, memberId: string): Promise<LibraryMemberRecord | null> {
    const result = await this.databaseService.query<LibraryMemberRecord>(
      `
        SELECT id, tenant_id, member_type, admission_or_staff_no, full_name, class_or_department, contact, status
        FROM library_members
        WHERE tenant_id = $1
          AND id = $2::uuid
        LIMIT 1
      `,
      [tenantId, memberId],
    );

    return result.rows[0] ?? null;
  }

  async listBorrowings(tenantId: string, options: { status?: string; limit: number; offset: number }) {
    const conditions = ['borrowing.tenant_id = $1'];
    const values: unknown[] = [tenantId];
    let parameterIndex = 2;

    if (options.status) {
      conditions.push(`borrowing.status = $${parameterIndex}`);
      values.push(options.status);
      parameterIndex += 1;
    }

    values.push(options.limit, options.offset);
    const result = await this.databaseService.query<LibraryBorrowingRecord>(
      `
        SELECT
          borrowing.id,
          borrowing.tenant_id,
          borrowing.receipt_number,
          borrowing.book_id,
          borrowing.member_id,
          borrowing.borrowed_at::text,
          borrowing.due_date::text,
          borrowing.returned_at::text,
          borrowing.status,
          borrowing.issued_by_user_id,
          borrowing.submission_id,
          borrowing.notes,
          book.title AS book_title,
          book.accession_number,
          member.full_name AS member_name,
          member.admission_or_staff_no,
          member.class_or_department,
          member.contact
        FROM library_borrowings borrowing
        JOIN library_books book
          ON book.tenant_id = borrowing.tenant_id
         AND book.id = borrowing.book_id
        JOIN library_members member
          ON member.tenant_id = borrowing.tenant_id
         AND member.id = borrowing.member_id
        WHERE ${conditions.join(' AND ')}
        ORDER BY borrowing.borrowed_at DESC
        LIMIT $${parameterIndex}
        OFFSET $${parameterIndex + 1}
      `,
      values,
    );

    return result.rows;
  }

  async findBorrowingById(tenantId: string, borrowingId: string): Promise<LibraryBorrowingRecord | null> {
    const result = await this.databaseService.query<LibraryBorrowingRecord>(
      `
        SELECT
          borrowing.id,
          borrowing.tenant_id,
          borrowing.receipt_number,
          borrowing.book_id,
          borrowing.member_id,
          borrowing.borrowed_at::text,
          borrowing.due_date::text,
          borrowing.returned_at::text,
          borrowing.status,
          borrowing.issued_by_user_id,
          borrowing.submission_id,
          borrowing.notes,
          book.title AS book_title,
          book.accession_number,
          member.full_name AS member_name,
          member.admission_or_staff_no,
          member.class_or_department,
          member.contact
        FROM library_borrowings borrowing
        JOIN library_books book
          ON book.tenant_id = borrowing.tenant_id
         AND book.id = borrowing.book_id
        JOIN library_members member
          ON member.tenant_id = borrowing.tenant_id
         AND member.id = borrowing.member_id
        WHERE borrowing.tenant_id = $1
          AND borrowing.id = $2::uuid
        LIMIT 1
      `,
      [tenantId, borrowingId],
    );

    return result.rows[0] ?? null;
  }

  async findOpenBorrowingForBookAndMember(
    tenantId: string,
    bookId: string,
    memberId: string,
  ): Promise<LibraryBorrowingRecord | null> {
    const result = await this.databaseService.query<LibraryBorrowingRecord>(
      `
        SELECT id, tenant_id, receipt_number, book_id, member_id, borrowed_at::text, due_date::text, returned_at::text, status
        FROM library_borrowings
        WHERE tenant_id = $1
          AND book_id = $2::uuid
          AND member_id = $3::uuid
          AND status IN ('borrowed', 'overdue')
        LIMIT 1
      `,
      [tenantId, bookId, memberId],
    );

    return result.rows[0] ?? null;
  }

  async findBorrowingsBySubmissionId(
    tenantId: string,
    submissionId: string,
  ): Promise<LibraryBorrowingRecord[]> {
    const result = await this.databaseService.query<LibraryBorrowingRecord>(
      `
        SELECT id, tenant_id, receipt_number, book_id, member_id, borrowed_at::text, due_date::text, returned_at::text, status
        FROM library_borrowings
        WHERE tenant_id = $1
          AND submission_id = $2
        ORDER BY borrowed_at ASC
      `,
      [tenantId, submissionId],
    );

    return result.rows;
  }

  async createBorrowing(input: {
    tenant_id: string;
    receipt_number: string;
    book_id: string;
    member_id: string;
    due_date: string;
    status: string;
    issued_by_user_id: string | null;
    submission_id: string | null;
    notes: string | null;
  }): Promise<LibraryBorrowingRecord> {
    const result = await this.databaseService.query<LibraryBorrowingRecord>(
      `
        INSERT INTO library_borrowings (
          tenant_id,
          receipt_number,
          book_id,
          member_id,
          due_date,
          status,
          issued_by_user_id,
          submission_id,
          notes
        )
        VALUES ($1, $2, $3::uuid, $4::uuid, $5::date, $6, $7::uuid, $8, $9)
        RETURNING
          id,
          tenant_id,
          receipt_number,
          book_id,
          member_id,
          borrowed_at::text,
          due_date::text,
          returned_at::text,
          status,
          issued_by_user_id,
          submission_id,
          notes
      `,
      [
        input.tenant_id,
        input.receipt_number,
        input.book_id,
        input.member_id,
        input.due_date,
        input.status,
        input.issued_by_user_id,
        input.submission_id,
        input.notes,
      ],
    );

    return result.rows[0];
  }

  async markBorrowingReturned(
    tenantId: string,
    borrowingId: string,
    input: {
      returned_at: string;
      status: string;
    },
  ): Promise<void> {
    await this.databaseService.query(
      `
        UPDATE library_borrowings
        SET returned_at = $3::timestamptz,
            status = $4,
            updated_at = NOW()
        WHERE tenant_id = $1
          AND id = $2::uuid
      `,
      [tenantId, borrowingId, input.returned_at, input.status],
    );
  }

  async createReturn(input: {
    tenant_id: string;
    borrowing_id: string;
    book_id: string;
    member_id: string;
    returned_at: string;
    condition: string;
    overdue_days: number;
    fine_amount: number;
    received_by_user_id: string | null;
    notes: string | null;
  }): Promise<LibraryReturnRecord> {
    const result = await this.databaseService.query<LibraryReturnRecord>(
      `
        INSERT INTO library_returns (
          tenant_id,
          borrowing_id,
          book_id,
          member_id,
          returned_at,
          condition,
          overdue_days,
          fine_amount,
          received_by_user_id,
          notes
        )
        VALUES ($1, $2::uuid, $3::uuid, $4::uuid, $5::timestamptz, $6, $7, $8, $9::uuid, $10)
        RETURNING
          id,
          tenant_id,
          borrowing_id,
          book_id,
          member_id,
          returned_at::text,
          condition,
          overdue_days,
          fine_amount,
          notes
      `,
      [
        input.tenant_id,
        input.borrowing_id,
        input.book_id,
        input.member_id,
        input.returned_at,
        input.condition,
        input.overdue_days,
        input.fine_amount,
        input.received_by_user_id,
        input.notes,
      ],
    );

    return {
      ...result.rows[0],
      overdue_days: Number(result.rows[0].overdue_days),
      fine_amount: Number(result.rows[0].fine_amount),
    };
  }

  async listReturns(tenantId: string, limit: number) {
    const result = await this.databaseService.query(
      `
        SELECT
          ret.id,
          ret.borrowing_id,
          ret.returned_at::text,
          ret.condition,
          ret.overdue_days,
          ret.fine_amount,
          book.title,
          book.accession_number,
          member.full_name
        FROM library_returns ret
        JOIN library_books book
          ON book.tenant_id = ret.tenant_id
         AND book.id = ret.book_id
        JOIN library_members member
          ON member.tenant_id = ret.tenant_id
         AND member.id = ret.member_id
        WHERE ret.tenant_id = $1
        ORDER BY ret.returned_at DESC
        LIMIT $2
      `,
      [tenantId, limit],
    );

    return result.rows;
  }

  async createFine(input: {
    tenant_id: string;
    fine_number: string;
    member_id: string;
    borrowing_id: string | null;
    category: string;
    amount: number;
    status: string;
    assessed_by_user_id: string | null;
    notes: string | null;
  }): Promise<LibraryFineRecord> {
    const result = await this.databaseService.query<LibraryFineRecord>(
      `
        INSERT INTO library_fines (
          tenant_id,
          fine_number,
          member_id,
          borrowing_id,
          category,
          amount,
          status,
          assessed_by_user_id,
          notes
        )
        VALUES ($1, $2, $3::uuid, $4::uuid, $5, $6, $7, $8::uuid, $9)
        RETURNING id, tenant_id, fine_number, member_id, borrowing_id, category, amount, status, assessed_at::text, notes
      `,
      [
        input.tenant_id,
        input.fine_number,
        input.member_id,
        input.borrowing_id,
        input.category,
        input.amount,
        input.status,
        input.assessed_by_user_id,
        input.notes,
      ],
    );

    return this.mapFine(result.rows[0]);
  }

  async listFines(tenantId: string, options: { status?: string; limit: number; offset: number }) {
    const conditions = ['fine.tenant_id = $1'];
    const values: unknown[] = [tenantId];
    let parameterIndex = 2;

    if (options.status) {
      conditions.push(`fine.status = $${parameterIndex}`);
      values.push(options.status);
      parameterIndex += 1;
    }

    values.push(options.limit, options.offset);
    const result = await this.databaseService.query<LibraryFineRecord>(
      `
        SELECT
          fine.id,
          fine.tenant_id,
          fine.fine_number,
          fine.member_id,
          fine.borrowing_id,
          fine.category,
          fine.amount,
          fine.status,
          fine.assessed_at::text,
          fine.notes,
          member.full_name AS member_name
        FROM library_fines fine
        JOIN library_members member
          ON member.tenant_id = fine.tenant_id
         AND member.id = fine.member_id
        WHERE ${conditions.join(' AND ')}
        ORDER BY fine.assessed_at DESC
        LIMIT $${parameterIndex}
        OFFSET $${parameterIndex + 1}
      `,
      values,
    );

    return result.rows.map((row) => this.mapFine(row));
  }

  async updateFineStatus(
    tenantId: string,
    fineId: string,
    input: {
      status: string;
      notes: string | null;
      actor_user_id: string | null;
    },
  ) {
    const result = await this.databaseService.query<LibraryFineRecord>(
      `
        UPDATE library_fines
        SET status = $3,
            notes = COALESCE($4, notes),
            paid_at = CASE WHEN $3 = 'paid' THEN NOW() ELSE paid_at END,
            waived_at = CASE WHEN $3 = 'waived' THEN NOW() ELSE waived_at END,
            updated_at = NOW()
        WHERE tenant_id = $1
          AND id = $2::uuid
        RETURNING id, tenant_id, fine_number, member_id, borrowing_id, category, amount, status, assessed_at::text, notes
      `,
      [tenantId, fineId, input.status, input.notes],
    );

    return result.rows[0] ? this.mapFine(result.rows[0]) : null;
  }

  async logActivity(input: {
    tenant_id: string;
    actor_user_id: string | null;
    action: string;
    affected_item: string;
    resource_type?: string | null;
    resource_id?: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.databaseService.query(
      `
        INSERT INTO library_activity_logs (
          tenant_id,
          actor_user_id,
          action,
          affected_item,
          resource_type,
          resource_id,
          metadata
        )
        VALUES ($1, $2::uuid, $3, $4, $5, $6::uuid, $7::jsonb)
      `,
      [
        input.tenant_id,
        input.actor_user_id,
        input.action,
        input.affected_item,
        input.resource_type ?? null,
        input.resource_id ?? null,
        JSON.stringify(input.metadata ?? {}),
      ],
    );
  }

  async listActivity(tenantId: string, limit: number): Promise<LibraryActivityLogRecord[]> {
    const result = await this.databaseService.query<LibraryActivityLogRecord>(
      `
        SELECT
          log.id,
          log.tenant_id,
          log.occurred_at::text,
          log.actor_user_id,
          actor.display_name AS librarian_name,
          log.action,
          log.affected_item,
          log.resource_type,
          log.resource_id::text,
          log.metadata
        FROM library_activity_logs log
        LEFT JOIN users actor
          ON actor.id = log.actor_user_id
        WHERE log.tenant_id = $1
        ORDER BY log.occurred_at DESC
        LIMIT $2
      `,
      [tenantId, limit],
    );

    return result.rows;
  }

  async buildReports(tenantId: string) {
    const [borrowed, overdue, popular, lost, damaged, studentHistory, valuation] =
      await Promise.all([
        this.databaseService.query(
          `
            SELECT
              borrowing.receipt_number,
              borrowing.borrowed_at::text,
              member.full_name,
              member.admission_or_staff_no,
              member.class_or_department,
              book.accession_number,
              book.title,
              borrowing.due_date::text,
              borrowing.status
            FROM library_borrowings borrowing
            JOIN library_books book
              ON book.tenant_id = borrowing.tenant_id
             AND book.id = borrowing.book_id
            JOIN library_members member
              ON member.tenant_id = borrowing.tenant_id
             AND member.id = borrowing.member_id
            WHERE borrowing.tenant_id = $1
              AND borrowing.status IN ('borrowed', 'overdue')
            ORDER BY borrowing.borrowed_at DESC
          `,
          [tenantId],
        ),
        this.databaseService.query(
          `
            SELECT
              GREATEST(CURRENT_DATE - borrowing.due_date, 0)::int AS overdue_days,
              member.full_name,
              member.class_or_department,
              member.contact,
              book.title,
              book.accession_number,
              borrowing.due_date::text
            FROM library_borrowings borrowing
            JOIN library_books book
              ON book.tenant_id = borrowing.tenant_id
             AND book.id = borrowing.book_id
            JOIN library_members member
              ON member.tenant_id = borrowing.tenant_id
             AND member.id = borrowing.member_id
            WHERE borrowing.tenant_id = $1
              AND borrowing.status IN ('borrowed', 'overdue')
              AND borrowing.due_date < CURRENT_DATE
            ORDER BY borrowing.due_date ASC
          `,
          [tenantId],
        ),
        this.databaseService.query(
          `
            SELECT
              book.accession_number,
              book.title,
              book.category,
              COUNT(borrowing.id)::int AS borrow_count,
              book.quantity_available,
              book.shelf_location
            FROM library_books book
            LEFT JOIN library_borrowings borrowing
              ON borrowing.tenant_id = book.tenant_id
             AND borrowing.book_id = book.id
            WHERE book.tenant_id = $1
            GROUP BY book.id
            ORDER BY borrow_count DESC, book.title ASC
          `,
          [tenantId],
        ),
        this.databaseService.query(
          `
            SELECT accession_number, title, category, quantity_lost, (quantity_lost * unit_value)::text AS replacement_value
            FROM library_books
            WHERE tenant_id = $1
              AND quantity_lost > 0
            ORDER BY replacement_value DESC
          `,
          [tenantId],
        ),
        this.databaseService.query(
          `
            SELECT accession_number, title, category, quantity_damaged, shelf_location
            FROM library_books
            WHERE tenant_id = $1
              AND quantity_damaged > 0
            ORDER BY quantity_damaged DESC
          `,
          [tenantId],
        ),
        this.databaseService.query(
          `
            SELECT
              member.admission_or_staff_no,
              member.full_name,
              member.class_or_department,
              book.title,
              borrowing.borrowed_at::text,
              borrowing.due_date::text,
              borrowing.status
            FROM library_borrowings borrowing
            JOIN library_books book
              ON book.tenant_id = borrowing.tenant_id
             AND book.id = borrowing.book_id
            JOIN library_members member
              ON member.tenant_id = borrowing.tenant_id
             AND member.id = borrowing.member_id
            WHERE borrowing.tenant_id = $1
              AND member.member_type = 'student'
            ORDER BY member.admission_or_staff_no ASC, borrowing.borrowed_at DESC
          `,
          [tenantId],
        ),
        this.databaseService.query(
          `
            SELECT
              accession_number,
              title,
              category,
              quantity_total,
              quantity_available,
              quantity_damaged,
              quantity_lost,
              unit_value,
              (quantity_total * unit_value)::text AS total_value
            FROM library_books
            WHERE tenant_id = $1
            ORDER BY title ASC
          `,
          [tenantId],
        ),
      ]);

    return {
      borrowed_books: borrowed.rows,
      overdue_books: overdue.rows,
      popular_books: popular.rows,
      lost_books: lost.rows,
      damaged_books: damaged.rows,
      student_borrowing_history: studentHistory.rows,
      inventory_valuation: valuation.rows.map((row) => ({
        ...row,
        unit_value: Number((row as { unit_value: string | number }).unit_value ?? 0),
        total_value: Number((row as { total_value: string }).total_value ?? 0),
      })),
    };
  }

  private mapBook(row: LibraryBookRecord): LibraryBookRecord {
    return {
      ...row,
      quantity_total: Number(row.quantity_total ?? 0),
      quantity_available: Number(row.quantity_available ?? 0),
      quantity_damaged: Number(row.quantity_damaged ?? 0),
      quantity_lost: Number(row.quantity_lost ?? 0),
      unit_value: Number(row.unit_value ?? 0),
    };
  }

  private mapFine(row: LibraryFineRecord): LibraryFineRecord {
    return {
      ...row,
      amount: Number(row.amount ?? 0),
    };
  }
}
