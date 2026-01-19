import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { APP_GUARD } from '@nestjs/core';
import { MedicationModule } from './medication/medication.module';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { FirebaseAuthGlobalGuard } from './auth/firebase-auth-global.guard';
import { ChatModule } from './chat/chat.module';
import { MessagingModule } from './messaging/messaging.module';
import { PlacesModule } from './places/places.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true, // Makes ConfigService available globally
      envFilePath: '.env', // Explicitly specify .env file
    }),
    DatabaseModule,
    HttpModule,
    AuthModule,
    MedicationModule,
    ChatModule,
    MessagingModule,
    PlacesModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: FirebaseAuthGlobalGuard,
    },
  ],
})
export class AppModule { }
