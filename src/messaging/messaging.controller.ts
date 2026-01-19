import {
    Controller,
    Get,
    Post,
    Body,
    Param,
    Query,
    Request,
    Delete,
} from '@nestjs/common';
import { MessagingService } from './messaging.service';

// DTO classes for request body validation
class CreateConversationDto {
    participantId: string;
}

class SendMessageDto {
    text: string;
}

@Controller('messaging')
export class MessagingController {
    constructor(private readonly messagingService: MessagingService) { }

    /**
     * Get all conversations for the authenticated user
     */
    @Get('conversations')
    async getConversations(@Request() req) {
        return this.messagingService.getConversations(req.user.uid);
    }

    /**
     * Get a specific conversation by ID
     */
    @Get('conversations/:id')
    async getConversation(@Param('id') id: string, @Request() req) {
        return this.messagingService.getConversation(id, req.user.uid);
    }

    /**
     * Create a new conversation
     */
    @Post('conversations')
    async createConversation(
        @Body() dto: CreateConversationDto,
        @Request() req,
    ) {
        return this.messagingService.createConversation(req.user.uid, dto);
    }

    /**
     * Get messages for a conversation
     */
    @Get('conversations/:id/messages')
    async getMessages(
        @Param('id') id: string,
        @Query('limit') limit: string,
        @Request() req,
    ) {
        const messageLimit = limit ? parseInt(limit, 10) : 50;
        return this.messagingService.getMessages(id, req.user.uid, messageLimit);
    }

    /**
     * Send a message in a conversation
     */
    @Post('conversations/:id/messages')
    async sendMessage(
        @Param('id') id: string,
        @Body() dto: SendMessageDto,
        @Request() req,
    ) {
        return this.messagingService.sendMessage(id, req.user.uid, dto);
    }

    /**
     * Delete a message
     */
    @Delete('conversations/:conversationId/messages/:messageId')
    async deleteMessage(
        @Param('conversationId') conversationId: string,
        @Param('messageId') messageId: string,
        @Request() req,
    ) {
        return this.messagingService.deleteMessage(conversationId, messageId, req.user.uid);
    }

    /**
     * Get list of available doctors
     */
    @Get('doctors')
    async getDoctors() {
        return this.messagingService.getDoctors();
    }
}
