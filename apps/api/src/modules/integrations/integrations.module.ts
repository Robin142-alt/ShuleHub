import { Module } from '@nestjs/common';

import { SecurityModule } from '../security/security.module';
import { DarajaIntegrationController } from './daraja-integration.controller';
import { DarajaIntegrationRepository } from './daraja-integration.repository';
import { DarajaIntegrationService } from './daraja-integration.service';
import { IntegrationsSchemaService } from './integrations-schema.service';
import { PlatformSmsController } from './platform-sms.controller';
import { PlatformSmsRepository } from './platform-sms.repository';
import { PlatformSmsService } from './platform-sms.service';
import { ParentPortalAuthController } from './parent-portal-auth.controller';
import { ParentPortalAuthRepository } from './parent-portal-auth.repository';
import { ParentPortalAuthService } from './parent-portal-auth.service';
import { SchoolSmsController } from './school-sms.controller';
import { SchoolSmsWalletRepository } from './school-sms-wallet.repository';
import { SchoolSmsWalletService } from './school-sms-wallet.service';
import { SmsDispatchService } from './sms-dispatch.service';

@Module({
  imports: [SecurityModule],
  controllers: [
    PlatformSmsController,
    SchoolSmsController,
    DarajaIntegrationController,
    ParentPortalAuthController,
  ],
  providers: [
    IntegrationsSchemaService,
    PlatformSmsRepository,
    PlatformSmsService,
    SmsDispatchService,
    SchoolSmsWalletRepository,
    SchoolSmsWalletService,
    DarajaIntegrationRepository,
    DarajaIntegrationService,
    ParentPortalAuthRepository,
    ParentPortalAuthService,
  ],
  exports: [
    IntegrationsSchemaService,
    PlatformSmsService,
    SmsDispatchService,
    SchoolSmsWalletService,
    DarajaIntegrationService,
    DarajaIntegrationRepository,
  ],
})
export class IntegrationsModule {}
