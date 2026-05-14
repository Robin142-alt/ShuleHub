export class CreateAcademicYearDto {
  name!: string;
  starts_on!: string;
  ends_on!: string;
}

export class CreateAcademicTermDto {
  academic_year_id!: string;
  name!: string;
  starts_on!: string;
  ends_on!: string;
}

export class CreateClassSectionDto {
  academic_year_id!: string;
  name!: string;
  grade_level!: string;
  stream?: string;
}

export class CreateSubjectDto {
  code!: string;
  name!: string;
}

export class AssignTeacherDto {
  academic_term_id!: string;
  class_section_id!: string;
  subject_id!: string;
  teacher_user_id!: string;
}
