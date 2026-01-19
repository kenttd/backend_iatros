import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { AxiosError } from 'axios';
import { CreateUserMedicationDto, FrequencyType } from './create-user-medication.dto';
import { FirestoreService } from '../database/firestore.service';
import { DayOfWeek } from './medication.types';
import { Timestamp } from 'firebase-admin/firestore';

@Injectable()
export class MedicationService {
  private readonly RXTERMS_BASE_URL =
    'https://clinicaltables.nlm.nih.gov/api/rxterms/v3';
  private readonly RXNORM_BASE_URL = 'https://rxnav.nlm.nih.gov/REST';

  constructor(
    private readonly httpService: HttpService,
    private readonly firestore: FirestoreService,
  ) { }

  async createUserMedication(
    userId: string,
    createUserMedicationDto: CreateUserMedicationDto,
  ) {
    const { rxcui, medicationName, dosage, instructions, schedule, duration } =
      createUserMedicationDto;

    const db = this.firestore.getFirestore();

    // Get references
    const userRef = db.collection('users').doc(userId);
    const medicationRef = userRef.collection('medications').doc();

    const medicationData = {
      rxcui,
      medicationName,
      dosage,
      instructions: instructions || null,
      frequencyType: schedule.frequencyType,
      startDate: Timestamp.fromDate(new Date(duration.startDate)),
      endDate: duration.endDate ? Timestamp.fromDate(new Date(duration.endDate)) : null,
      isActive: true,
      sideNote: null,
      prescribedByDoctorId: null,
      prescribedByDoctorName: null,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    // Create schedules data
    const schedulesData: Array<{ dayOfWeek: string | null; time: string }> = [];

    for (const time of schedule.times) {
      // If SPECIFIC_DAYS, create schedule for each day
      if (
        schedule.frequencyType === FrequencyType.SPECIFIC_DAYS &&
        schedule.days
      ) {
        for (const day of schedule.days) {
          schedulesData.push({
            dayOfWeek: day,
            time: time,
          });
        }
      } else {
        // For DAILY or AS_NEEDED, no specific day
        schedulesData.push({
          dayOfWeek: null,
          time: time,
        });
      }
    }

    // Use batch write to ensure user exists and create medication/schedules atomically
    const batch = db.batch();

    // Ensure user document exists (merge won't overwrite existing data)
    batch.set(userRef, {
      updatedAt: Timestamp.now(),
    }, { merge: true });

    // Write medication document
    batch.set(medicationRef, medicationData);

    // Write schedule documents
    for (const scheduleData of schedulesData) {
      const scheduleRef = medicationRef.collection('schedules').doc();
      batch.set(scheduleRef, {
        ...scheduleData,
        createdAt: Timestamp.now(),
      });
    }

    // Commit the batch
    await batch.commit();

    // Fetch the created medication with schedules for response
    const medicationDoc = await medicationRef.get();
    const schedulesSnapshot = await medicationRef.collection('schedules').get();

    const schedules = schedulesSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));

    return {
      message: 'Medication created successfully',
      data: {
        id: medicationRef.id,
        ...medicationDoc.data(),
        schedules,
      },
    };
  }

  async getUserMedications(userId: string) {
    const db = this.firestore.getFirestore();

    try {
      // Query medications for the user
      const medicationsSnapshot = await db
        .collection('users')
        .doc(userId)
        .collection('medications')
        .where('isActive', '==', true)
        .orderBy('createdAt', 'desc')
        .get();

      // Fetch schedules for each medication
      const medications = await Promise.all(
        medicationsSnapshot.docs.map(async (medicationDoc) => {
          const medicationData = medicationDoc.data();

          // Get schedules subcollection
          const schedulesSnapshot = await medicationDoc.ref
            .collection('schedules')
            .get();

          const schedules = schedulesSnapshot.docs.map(scheduleDoc => ({
            id: scheduleDoc.id,
            ...scheduleDoc.data(),
          }));

          // Get inventory if it exists (single document)
          const inventoryDoc = await medicationDoc.ref
            .collection('inventory')
            .doc('current')
            .get();

          const inventory = inventoryDoc.exists ? inventoryDoc.data() : null;

          // Construct doctor info if prescribedByDoctorId exists
          const prescribedByDoctor = medicationData.prescribedByDoctorId
            ? {
              id: medicationData.prescribedByDoctorId,
              fullName: medicationData.prescribedByDoctorName || 'Unknown',
              email: null, // Not denormalized in current schema
            }
            : null;

          return {
            id: medicationDoc.id,
            ...medicationData,
            schedules,
            inventory,
            prescribedByDoctor,
          };
        }),
      );

      return medications;
    } catch (error) {
      // Handle Firestore NOT_FOUND error (error code 5)
      // This happens when the collection doesn't exist yet (no medications added)
      if (error.code === 5 || error.message?.includes('NOT_FOUND')) {
        console.log(`No medications found for user ${userId} (collection may not exist yet)`);
        return [];
      }
      // Re-throw other errors
      throw error;
    }
  }

  async deleteMedication(userId: string, medicationId: string) {
    const db = this.firestore.getFirestore();

    try {
      // Get reference to the medication document
      const medicationRef = db
        .collection('users')
        .doc(userId)
        .collection('medications')
        .doc(medicationId);

      // Check if the medication exists and belongs to the user
      const medicationDoc = await medicationRef.get();

      if (!medicationDoc.exists) {
        throw new HttpException(
          'Medication not found',
          HttpStatus.NOT_FOUND,
        );
      }

      // Soft delete by updating isActive to false
      await medicationRef.update({
        isActive: false,
        updatedAt: Timestamp.now(),
      });

      return {
        message: 'Medication deleted successfully',
        medicationId,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Failed to delete medication',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async searchMedications(term: string, maxResults: number = 15) {
    try {
      const url = `${this.RXTERMS_BASE_URL}/search`;
      const params = {
        terms: term,
        ef: 'RXCUIS',
        maxList: maxResults.toString(),
      };

      const response = await firstValueFrom(
        this.httpService.get(url, { params }),
      );

      const [count, medications, , rxcuis] = response.data;

      return {
        count,
        results: medications.map((name: string, index: number) => ({
          name,
          rxcui: rxcuis?.[index]?.[0] || null,
        })),
      };
    } catch (error) {
      this.handleError(error, 'Failed to search medications');
    }
  }

  async getMedicationDetails(rxcui: string) {
    try {
      const url = `${this.RXNORM_BASE_URL}/rxcui/${rxcui}/allrelated.json`;

      const response = await firstValueFrom(this.httpService.get(url));

      const allRelated = response.data.allRelatedGroup?.conceptGroup || [];

      const extractConcepts = (tty: string) => {
        const group = allRelated.find((g: any) => g.tty === tty);
        return (
          group?.conceptProperties?.map((c: any) => ({
            name: c.name,
            rxcui: c.rxcui,
          })) || []
        );
      };

      return {
        rxcui,
        brandNames: extractConcepts('BN'),
        genericNames: extractConcepts('IN'),
        strengths: extractConcepts('SCDC'),
        dosageForms: extractConcepts('DF'),
        allRelated: allRelated.map((group: any) => ({
          type: group.tty,
          concepts:
            group.conceptProperties?.map((c: any) => ({
              name: c.name,
              rxcui: c.rxcui,
            })) || [],
        })),
      };
    } catch (error) {
      this.handleError(error, 'Failed to fetch medication details');
    }
  }

  async getSpellingSuggestions(term: string) {
    try {
      const url = `${this.RXNORM_BASE_URL}/spellingsuggestions.json`;
      const params = { name: term };

      const response = await firstValueFrom(
        this.httpService.get(url, { params }),
      );

      return {
        originalTerm: term,
        suggestions: response.data.suggestionGroup?.suggestionList || [],
      };
    } catch (error) {
      this.handleError(error, 'Failed to fetch spelling suggestions');
    }
  }

  private handleError(error: unknown, message: string): never {
    if (error instanceof AxiosError) {
      throw new HttpException(
        {
          statusCode:
            error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR,
          message,
          error: error.response?.data || error.message,
        },
        error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
    throw new HttpException(message, HttpStatus.INTERNAL_SERVER_ERROR);
  }
}
