import { Controller, Post, Body, UseGuards, Request } from '@nestjs/common';
import { ChatService } from './chat.service';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';

@Controller('chat')
@UseGuards(FirebaseAuthGuard)
export class ChatController {
    constructor(private readonly chatService: ChatService) { }

    @Post()
    async chat(@Body('message') message: string, @Request() req) {
        return this.chatService.generateResponse(message, req.user.uid);
    }

    @Post('summary')
    async summarize(@Body('conversationId') conversationId: string, @Request() req) {
        return this.chatService.summarizeConversation(conversationId, req.user.uid);
    }
}
