import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Query,
  Param,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { MedicationService } from './medication.service';
import { CreateUserMedicationDto } from './create-user-medication.dto';
import { GetUser } from '../auth/get-user.decorator';

@Controller('medications')
export class MedicationController {
  constructor(private readonly medicationService: MedicationService) { }

  // Protected endpoint (global auth active)
  @Get('profile')
  async getUserProfile(@GetUser() user: any) {
    return {
      message: 'Authenticated user profile',
      user: {
        uid: user.uid,
        email: user.email,
        name: user.name,
        emailVerified: user.emailVerified,
      },
    };
  }

  // Protected endpoint (global auth active)
  @Post()
  async createUserMedication(
    @Body() createUserMedicationDto: CreateUserMedicationDto,
    @GetUser('uid') userId: string,
  ) {
    console.log('Creating medication for user:', userId);
    return this.medicationService.createUserMedication(
      userId,
      createUserMedicationDto,
    );
  }

  // Get all medications for the authenticated user
  @Get()
  async getUserMedications(@GetUser('uid') userId: string) {
    return this.medicationService.getUserMedications(userId);
  }

  // Delete a medication for the authenticated user
  @Delete(':medicationId')
  async deleteMedication(
    @Param('medicationId') medicationId: string,
    @GetUser('uid') userId: string,
  ) {
    if (!medicationId) {
      throw new HttpException(
        'Medication ID is required',
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.medicationService.deleteMedication(userId, medicationId);
  }

  @Get('search')
  async searchMedications(
    @Query('term') term: string,
    @Query('maxResults') maxResults?: number,
  ) {
    if (!term) {
      throw new HttpException(
        'Search term is required',
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.medicationService.searchMedications(term, maxResults);
  }

  @Get('details/:rxcui')
  async getMedicationDetails(@Param('rxcui') rxcui: string) {
    if (!rxcui) {
      throw new HttpException('RXCUI is required', HttpStatus.BAD_REQUEST);
    }
    return this.medicationService.getMedicationDetails(rxcui);
  }

  @Get('spelling-suggestions')
  async getSpellingSuggestions(@Query('term') term: string) {
    if (!term) {
      throw new HttpException(
        'Search term is required',
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.medicationService.getSpellingSuggestions(term);
  }
}
