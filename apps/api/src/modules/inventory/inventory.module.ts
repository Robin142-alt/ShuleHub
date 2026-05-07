import { Module } from '@nestjs/common';

import { InventoryController } from './inventory.controller';
import { InventorySchemaService } from './inventory-schema.service';
import { InventoryService } from './inventory.service';
import { InventoryRepository } from './repositories/inventory.repository';

@Module({
  controllers: [InventoryController],
  providers: [
    InventorySchemaService,
    InventoryService,
    InventoryRepository,
  ],
  exports: [InventoryService, InventoryRepository],
})
export class InventoryModule {}
