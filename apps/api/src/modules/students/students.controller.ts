import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';

import { Permissions } from '../../auth/decorators/permissions.decorator';
import { FeatureGate } from '../billing/decorators/feature-gate.decorator';
import { CreateStudentDto } from './dto/create-student.dto';
import { ListStudentsQueryDto } from './dto/list-students-query.dto';
import { StudentResponseDto } from './dto/student-response.dto';
import { UpdateStudentDto } from './dto/update-student.dto';
import { StudentsService } from './students.service';

@Controller('students')
@FeatureGate('students')
export class StudentsController {
  constructor(private readonly studentsService: StudentsService) {}

  @Post()
  @Permissions('students:write')
  async createStudent(@Body() dto: CreateStudentDto): Promise<StudentResponseDto> {
    return this.studentsService.createStudent(dto);
  }

  @Get()
  @Permissions('students:read')
  async listStudents(@Query() query: ListStudentsQueryDto): Promise<StudentResponseDto[]> {
    return this.studentsService.listStudents(query);
  }

  @Get(':studentId')
  @Permissions('students:read')
  async getStudent(
    @Param('studentId', new ParseUUIDPipe()) studentId: string,
  ): Promise<StudentResponseDto> {
    return this.studentsService.getStudent(studentId);
  }

  @Patch(':studentId')
  @Permissions('students:write')
  async updateStudent(
    @Param('studentId', new ParseUUIDPipe()) studentId: string,
    @Body() dto: UpdateStudentDto,
  ): Promise<StudentResponseDto> {
    return this.studentsService.updateStudent(studentId, dto);
  }
}
