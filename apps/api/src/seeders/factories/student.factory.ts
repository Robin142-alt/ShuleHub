import { Injectable } from '@nestjs/common';

import { StudentGuardianSeedRecord, StudentSeedRecord } from '../../modules/seeder/seeder.types';
import { DeterministicRandom, isoDate, toEmail, toSafaricomPhone } from './factory.utils';

const BOY_NAMES = [
  'Amani',
  'Brian',
  'Caleb',
  'Dennis',
  'Elijah',
  'Franklin',
  'Gift',
  'Ian',
  'Japheth',
  'Kevin',
  'Liam',
  'Martin',
  'Nicholas',
  'Omondi',
  'Peter',
  'Ryan',
  'Tobias',
  'Victor',
] as const;

const GIRL_NAMES = [
  'Achieng',
  'Brenda',
  'Charity',
  'Diana',
  'Esther',
  'Faith',
  'Grace',
  'Hellen',
  'Imani',
  'Joy',
  'Lynn',
  'Mercy',
  'Nadia',
  'Purity',
  'Ruth',
  'Sharon',
  'Tracy',
  'Wanjiku',
] as const;

const LAST_NAMES = [
  'Chebet',
  'Kamau',
  'Kariuki',
  'Kiptoo',
  'Maina',
  'Makena',
  'Moraa',
  'Mwangi',
  'Mutiso',
  'Ndungu',
  'Odhiambo',
  'Omondi',
  'Were',
  'Wekesa',
] as const;

const OCCUPATIONS = [
  'Small business owner',
  'Boda boda operator',
  'Farmer',
  'Teacher',
  'County officer',
  'Nurse',
  'Shop attendant',
  'Mechanic',
  'Driver',
  'Accountant',
] as const;

@Injectable()
export class StudentFactory {
  buildStudents(input: {
    tenant: string;
    stream_codes: string[];
    stream_class_codes: Map<string, string>;
    student_count_per_stream: number;
  }): StudentSeedRecord[] {
    const records: StudentSeedRecord[] = [];

    input.stream_codes
      .slice()
      .sort((left, right) => left.localeCompare(right))
      .forEach((streamCode, streamIndex) => {
        for (let index = 0; index < input.student_count_per_stream; index += 1) {
          const ordinal = index + 1;
          const seedKey = `${streamCode}-${String(ordinal).padStart(3, '0')}`;
          const random = new DeterministicRandom(`student:${input.tenant}:${seedKey}`);
          const gender = ordinal % 2 === 0 ? 'female' : 'male';
          const classCode = input.stream_class_codes.get(streamCode) ?? 'G1';
          const gradeNumber = Number(classCode.replace(/\D+/g, '')) || 1;
          const firstName = gender === 'female' ? random.pick(GIRL_NAMES) : random.pick(BOY_NAMES);
          const middleName = random.next() > 0.55 ? random.pick(gender === 'female' ? GIRL_NAMES : BOY_NAMES) : null;
          const lastName = random.pick(LAST_NAMES);
          const birthDate = this.resolveBirthDate(gradeNumber, random, ordinal);
          const guardians = this.buildGuardians(input.tenant, firstName, lastName, seedKey, streamIndex + ordinal);

          records.push({
            seed_key: seedKey,
            admission_number: `ADM-${classCode}-${streamCode.split('-').slice(-1)[0]}-${String(ordinal).padStart(3, '0')}`,
            first_name: firstName,
            middle_name: middleName,
            last_name: lastName,
            gender,
            date_of_birth: birthDate,
            class_code: classCode,
            stream_code: streamCode,
            status: 'active',
            guardians,
          });
        }
      });

    return records;
  }

  private buildGuardians(
    tenant: string,
    firstName: string,
    lastName: string,
    seedKey: string,
    numericSeed: number,
  ): StudentGuardianSeedRecord[] {
    const motherName = `${this.pickGuardianName('mother', numericSeed)} ${lastName}`;
    const fatherName = `${this.pickGuardianName('father', numericSeed + 1)} ${lastName}`;

    return [
      {
        seed_key: `${seedKey}:mother`,
        full_name: motherName,
        relationship: 'mother',
        phone_number: toSafaricomPhone(numericSeed + 900),
        email: toEmail(`${firstName}.${lastName}.mother`, tenant),
        occupation: OCCUPATIONS[Math.abs(numericSeed) % OCCUPATIONS.length],
        is_primary: true,
      },
      {
        seed_key: `${seedKey}:father`,
        full_name: fatherName,
        relationship: 'father',
        phone_number: toSafaricomPhone(numericSeed + 1200),
        email: toEmail(`${firstName}.${lastName}.father`, tenant),
        occupation: OCCUPATIONS[Math.abs(numericSeed + 2) % OCCUPATIONS.length],
        is_primary: false,
      },
    ];
  }

  private resolveBirthDate(gradeNumber: number, random: DeterministicRandom, ordinal: number): string {
    const birthYear = 2026 - (gradeNumber + 5);
    const month = random.int(1, 12);
    const day = random.int(1, 28);
    return isoDate(new Date(Date.UTC(birthYear, month - 1, day + (ordinal % 2))));
  }

  private pickGuardianName(type: 'mother' | 'father', numericSeed: number): string {
    const source = type === 'mother' ? GIRL_NAMES : BOY_NAMES;
    return source[Math.abs(numericSeed) % source.length];
  }
}
