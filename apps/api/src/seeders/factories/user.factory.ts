import { Injectable } from '@nestjs/common';

import { UserSeedRecord } from '../../modules/seeder/seeder.types';
import { DeterministicRandom, titleCase, toEmail, toSafaricomPhone } from './factory.utils';

const FIRST_NAMES = [
  'Akinyi',
  'Baraka',
  'Chebet',
  'David',
  'Edna',
  'Faith',
  'George',
  'Hellen',
  'Ian',
  'Jacinta',
  'Kevin',
  'Linet',
  'Mercy',
  'Naomi',
  'Otieno',
  'Purity',
  'Quinter',
  'Ruth',
  'Samuel',
  'Talia',
  'Victor',
  'Wanjiku',
  'Yvonne',
  'Zawadi',
] as const;

const LAST_NAMES = [
  'Achieng',
  'Chebet',
  'Kiptoo',
  'Kimani',
  'Mwangi',
  'Mutiso',
  'Naliaka',
  'Ndegwa',
  'Odhiambo',
  'Omondi',
  'Wambui',
  'Were',
] as const;

@Injectable()
export class UserFactory {
  buildUsers(tenant: string): UserSeedRecord[] {
    const random = new DeterministicRandom(`users:${tenant}`);
    const records: UserSeedRecord[] = [];

    records.push(
      this.buildRecord(tenant, 'owner', 'Owner', 'owner', 'ADM-001', 'admin', ['students', 'billing']),
      this.buildRecord(tenant, 'admin', 'Operations Admin', 'admin', 'ADM-002', 'admin', ['students']),
      this.buildRecord(tenant, 'bursar', 'Bursar', 'admin', 'FIN-001', 'finance', ['billing']),
      this.buildRecord(tenant, 'storekeeper', 'Storekeeper', 'storekeeper', 'STK-001', 'admin', ['inventory', 'procurement']),
      this.buildRecord(tenant, 'librarian', 'Librarian', 'librarian', 'LIB-001', 'admin', ['library']),
      this.buildRecord(tenant, 'admissions', 'Admissions', 'admissions', 'ADM-003', 'admin', ['students', 'admissions']),
    );

    const subjectGroups = [
      ['ENG', 'KIS'],
      ['MAT', 'SCI'],
      ['SST', 'CRE'],
      ['ART', 'PE'],
      ['AGR', 'PRETECH'],
      ['BUS', 'COMP'],
      ['SCI', 'AGR'],
      ['MAT', 'COMP'],
      ['ENG', 'SST'],
    ];

    for (let index = 0; index < subjectGroups.length; index += 1) {
      const firstName = random.pick(FIRST_NAMES);
      const lastName = random.pick(LAST_NAMES);
      const displayName = titleCase(`${firstName} ${lastName}`);
      const seedKey = `teacher-${String(index + 1).padStart(3, '0')}`;
      records.push({
        seed_key: seedKey,
        display_name: displayName,
        email: toEmail(`${firstName}.${lastName}.${seedKey}`, tenant),
        role_code: 'teacher',
        staff_type: 'teacher',
        employee_number: `TCH-${String(index + 1).padStart(3, '0')}`,
        phone_number: toSafaricomPhone(index + 300),
        tsc_number: `TSC${String(430000 + index).padStart(6, '0')}`,
        subject_codes: subjectGroups[index],
      });
    }

    return records;
  }

  private buildRecord(
    tenant: string,
    seedKey: string,
    namePrefix: string,
    roleCode: string,
    employeeNumber: string,
    staffType: 'teacher' | 'admin' | 'finance',
    subjectCodes: string[],
  ): UserSeedRecord {
    const displayName = `${namePrefix} ${titleCase(tenant.replace(/[-_]+/g, ' '))}`;

    return {
      seed_key: seedKey,
      display_name: displayName,
      email: toEmail(seedKey, tenant),
      role_code: roleCode,
      staff_type: staffType,
      employee_number: employeeNumber,
      phone_number: toSafaricomPhone(employeeNumber.length * 97),
      tsc_number: staffType === 'teacher' ? `TSC${employeeNumber.replace(/\D+/g, '').padStart(6, '0')}` : null,
      subject_codes: subjectCodes,
    };
  }
}
