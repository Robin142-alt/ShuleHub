export class CreateExamSeriesDto {
  academic_term_id!: string;
  name!: string;
  starts_on!: string;
  ends_on!: string;
}

export class CreateExamAssessmentDto {
  exam_series_id!: string;
  subject_id!: string;
  name!: string;
  max_score!: number;
  weight!: number;
}

export class EnterExamMarkDto {
  exam_series_id!: string;
  assessment_id!: string;
  academic_term_id!: string;
  class_section_id!: string;
  subject_id!: string;
  student_id!: string;
  score!: number;
  remarks?: string;
}

export class CorrectLockedExamMarkDto {
  mark_id!: string;
  score!: number;
  reason!: string;
}

export class PublishReportCardDto {
  exam_series_id!: string;
  student_id!: string;
  report_snapshot_id!: string;
}
