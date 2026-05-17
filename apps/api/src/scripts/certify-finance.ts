import { runAndWriteModuleCertification } from './module-certification';

const result = runAndWriteModuleCertification('finance');

console.log(`Finance certification status: ${result.ok ? 'pass' : 'fail'}`);

if (!result.ok) {
  process.exitCode = 1;
}

