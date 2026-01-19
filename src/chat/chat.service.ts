import { Injectable } from '@nestjs/common';
import { VertexAI } from '@google-cloud/vertexai';
import { MedicationService } from '../medication/medication.service';
import { MessagingService } from '../messaging/messaging.service';

@Injectable()
export class ChatService {
    private vertexAI: VertexAI;
    private model: any;

    constructor(
        private readonly medicationService: MedicationService,
        private readonly messagingService: MessagingService,
    ) {
        this.vertexAI = new VertexAI({
            project: process.env.FIREBASE_PROJECT_ID,
            location: 'us-central1',
        });
        this.model = this.vertexAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    }

    async generateResponse(message: string, userId: string): Promise<string> {
        const medications = await this.medicationService.getUserMedications(userId);

        const medicationList = medications
            .map((med: any) => `- ${med.medicationName} (${med.dosage})`)
            .join('\n');

        const prompt = `
You are a helpful medical assistant for the Iatros app.
The user is asking: "${message}"

Here is the user's current medication list:
${medicationList}

Please answer the user's question based on their medication list if relevant.
If the question is about medical advice, provide a helpful answer but include a disclaimer that you are an AI and they should consult a doctor.
Keep the answer concise and friendly.
    `;

        const result = await this.model.generateContent(prompt);
        const response = await result.response;
        return response.candidates[0].content.parts[0].text;
    }

    async summarizeConversation(conversationId: string, userId: string): Promise<string> {
        // 1. Fetch messages
        const messages = await this.messagingService.getMessages(conversationId, userId, 100);

        if (messages.length === 0) {
            return "No messages to summarize.";
        }

        // 2. Format transcript
        const transcript = messages
            .reverse() // Chronological order
            .map(msg => `${msg.senderName}: ${msg.text}`)
            .join('\n');

        // 3. Generate summary
        const prompt = `
Please summarize the following chat conversation between a patient and a doctor.
Highlight the key medical concerns, advice given, and any action items.
Keep it concise and easy to read (bullet points are good).

Conversation:
${transcript}
    `;

        const result = await this.model.generateContent(prompt);
        const response = await result.response;
        return response.candidates[0].content.parts[0].text;
    }
}
