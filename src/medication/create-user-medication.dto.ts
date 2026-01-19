import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsArray,
  IsDateString,
  ValidateNested,
  IsEnum,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum FrequencyType {
  DAILY = 'DAILY',
  SPECIFIC_DAYS = 'SPECIFIC_DAYS',
  AS_NEEDED = 'AS_NEEDED',
}

class ScheduleDto {
  @IsEnum(FrequencyType)
  @IsNotEmpty()
  frequencyType: FrequencyType;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  // Example: ['MONDAY', 'WEDNESDAY']
  days?: string[];

  @IsArray()
  @IsString({ each: true })
  // Example: ['08:00', '20:00']
  times: string[];
}

class DurationDto {
  @IsDateString()
  @IsNotEmpty()
  startDate: string;

  @IsDateString()
  @IsOptional()
  endDate?: string;
}

export class CreateUserMedicationDto {
  @IsString()
  @IsNotEmpty()
  rxcui: string;

  @IsString()
  @IsNotEmpty()
  medicationName: string;

  @IsString()
  @IsNotEmpty()
  dosage: string;

  @IsString()
  @IsOptional()
  instructions?: string;

  @ValidateNested()
  @Type(() => ScheduleDto)
  schedule: ScheduleDto;

  @ValidateNested()
  @Type(() => DurationDto)
  duration: DurationDto;
}
