import { FileInterceptor } from '@nestjs/platform-express';

import {
  UPLOAD_FORM_LIMITS,
  supportFileFilter,
} from './upload-policy';

export function StreamingUploadInterceptor(fieldName = 'file') {
  return FileInterceptor(fieldName, {
    limits: UPLOAD_FORM_LIMITS,
    fileFilter: supportFileFilter,
  });
}
