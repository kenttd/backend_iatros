import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { ConfigService } from '@nestjs/config';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';

@Controller('places')
@UseGuards(FirebaseAuthGuard)
export class PlacesController {
    private readonly apiKey: string;

    constructor(
        private readonly httpService: HttpService,
        private readonly configService: ConfigService,
    ) {
        this.apiKey = this.configService.get<string>('GOOGLE_PLACES_API_KEY') || '';
    }

    @Get('nearby')
    async searchNearby(
        @Query('location') location: string,
        @Query('radius') radius: string = '5000',
        @Query('type') type: string = 'pharmacy',
        @Query('keyword') keyword?: string,
    ) {
        const params = new URLSearchParams({
            location,
            radius,
            type,
            key: this.apiKey,
        });

        if (keyword) {
            params.append('keyword', keyword);
        }

        const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?${params.toString()}`;

        try {
            const response = await firstValueFrom(this.httpService.get(url));
            return response.data;
        } catch (error) {
            throw error;
        }
    }
}
