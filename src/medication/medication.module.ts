import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { MedicationController } from './medication.controller';
import { MedicationService } from './medication.service';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [HttpModule, DatabaseModule],
  controllers: [MedicationController],
  providers: [MedicationService],
  exports: [MedicationService],
})
export class MedicationModule { }
