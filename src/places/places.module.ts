import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { PlacesController } from './places.controller';

@Module({
    imports: [HttpModule],
    controllers: [PlacesController],
})
export class PlacesModule { }
