import { runAndWriteModuleCertification } from './module-certification';

const result = runAndWriteModuleCertification('discipline');

console.log(`Discipline certification status: ${result.ok ? 'pass' : 'fail'}`);

if (!result.ok) {
  process.exitCode = 1;
}

