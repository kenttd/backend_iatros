import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { MedicationModule } from '../medication/medication.module';
import { MessagingModule } from '../messaging/messaging.module';

@Module({
    imports: [MedicationModule, MessagingModule],
    controllers: [ChatController],
    providers: [ChatService],
})
export class ChatModule { }
