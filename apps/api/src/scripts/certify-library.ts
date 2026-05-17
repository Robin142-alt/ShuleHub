import { runAndWriteModuleCertification } from './module-certification';

const result = runAndWriteModuleCertification('library');

console.log(`Library certification status: ${result.ok ? 'pass' : 'fail'}`);

if (!result.ok) {
  process.exitCode = 1;
}

