import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { FirestoreService } from '../database/firestore.service';
import * as admin from 'firebase-admin';
import { v2 } from '@google-cloud/translate';

export interface CreateConversationDto {
    participantId: string;
}

export interface SendMessageDto {
    text: string;
}

export interface Participant {
    displayName: string;
    role: string;
}

export interface ParticipantDetails {
    [userId: string]: Participant;
}

export interface Conversation {
    id: string;
    participants: string[];
    participantDetails: ParticipantDetails;
    lastMessage: string | null;
    lastMessageAt: Date | null;
    lastMessageSenderId: string | null;
    createdAt: Date;
}

export interface Message {
    id: string;
    senderId: string;
    senderName: string;
    text: string;
    createdAt: Date;
    readAt: Date | null;
    translatedText?: string;
    detectedLanguage?: string;
}

export interface Doctor {
    id: string;
    displayName: string;
    email: string | null;
    specialty: string | null;
    hospitalClinicName: string | null;
}

@Injectable()
export class MessagingService {
    private translate: v2.Translate;

    constructor(private readonly firestoreService: FirestoreService) {
        this.translate = new v2.Translate({
            projectId: process.env.FIREBASE_PROJECT_ID,
        });
    }

    /**
     * Get all conversations for a user
     */
    async getConversations(userId: string): Promise<Conversation[]> {
        const conversationsRef = this.firestoreService.collection('conversations');
        // Note: We avoid orderBy to prevent composite index requirement
        // Sorting is done in code instead
        const snapshot = await conversationsRef
            .where('participants', 'array-contains', userId)
            .get();

        const conversations = snapshot.docs.map((doc) => {
            const data = doc.data();
            return {
                id: doc.id,
                participants: data.participants,
                participantDetails: data.participantDetails,
                lastMessage: data.lastMessage || null,
                lastMessageAt: data.lastMessageAt?.toDate() || null,
                lastMessageSenderId: data.lastMessageSenderId || null,
                createdAt: data.createdAt?.toDate(),
            };
        });

        // Sort by lastMessageAt descending (most recent first)
        return conversations.sort((a, b) => {
            if (!a.lastMessageAt && !b.lastMessageAt) return 0;
            if (!a.lastMessageAt) return 1;
            if (!b.lastMessageAt) return -1;
            return b.lastMessageAt.getTime() - a.lastMessageAt.getTime();
        });
    }

    /**
     * Get a specific conversation by ID
     */
    async getConversation(conversationId: string, userId: string): Promise<Conversation> {
        const doc = await this.firestoreService
            .collection('conversations')
            .doc(conversationId)
            .get();

        if (!doc.exists) {
            throw new NotFoundException('Conversation not found');
        }

        const data = doc.data();

        if (!data) {
            throw new NotFoundException('Conversation data not found');
        }

        // Verify user is a participant
        if (!data.participants.includes(userId)) {
            throw new ForbiddenException('You are not a participant in this conversation');
        }

        return {
            id: doc.id,
            participants: data.participants,
            participantDetails: data.participantDetails,
            lastMessage: data.lastMessage || null,
            lastMessageAt: data.lastMessageAt?.toDate() || null,
            lastMessageSenderId: data.lastMessageSenderId || null,
            createdAt: data.createdAt?.toDate(),
        };
    }

    /**
     * Create a new conversation between two users
     */
    async createConversation(userId: string, dto: CreateConversationDto): Promise<Conversation> {
        const { participantId } = dto;

        // Check if conversation already exists between these users
        const existingConversation = await this.findExistingConversation(userId, participantId);
        if (existingConversation) {
            return existingConversation;
        }

        // Fetch user details for both participants
        const [userDetails, participantDetails] = await Promise.all([
            this.getUserDetails(userId),
            this.getUserDetails(participantId),
        ]);

        const now = admin.firestore.Timestamp.now();

        const conversationData = {
            participants: [userId, participantId],
            participantDetails: {
                [userId]: userDetails,
                [participantId]: participantDetails,
            },
            lastMessage: null,
            lastMessageAt: null,
            lastMessageSenderId: null,
            createdAt: now,
        };

        const docRef = await this.firestoreService
            .collection('conversations')
            .add(conversationData);

        return {
            id: docRef.id,
            participants: conversationData.participants,
            participantDetails: conversationData.participantDetails,
            lastMessage: null,
            lastMessageAt: null,
            lastMessageSenderId: null,
            createdAt: now.toDate(),
        };
    }

    /**
     * Get messages for a conversation
     */
    async getMessages(conversationId: string, userId: string, limit = 50): Promise<Message[]> {
        // Verify user is a participant
        await this.getConversation(conversationId, userId);

        const messagesRef = this.firestoreService
            .collection('conversations')
            .doc(conversationId)
            .collection('messages');

        const snapshot = await messagesRef
            .orderBy('createdAt', 'desc')
            .limit(limit)
            .get();

        return snapshot.docs
            .map((doc) => {
                const data = doc.data();
                return {
                    id: doc.id,
                    senderId: data.senderId,
                    senderName: data.senderName,
                    text: data.text,
                    createdAt: data.createdAt?.toDate(),
                    readAt: data.readAt?.toDate() || null,
                    translatedText: data.translatedText || null,
                    detectedLanguage: data.detectedLanguage || null,
                };
            })
            .reverse(); // Return in chronological order
    }

    /**
     * Send a message in a conversation
     */
    async sendMessage(
        conversationId: string,
        userId: string,
        dto: SendMessageDto,
    ): Promise<Message> {
        // Verify user is a participant and get conversation
        const conversation = await this.getConversation(conversationId, userId);

        // Get sender name from participant details
        const senderName = conversation.participantDetails[userId]?.displayName || 'Unknown';

        const now = admin.firestore.Timestamp.now();

        let translatedText: string | null = null;
        let detectedLanguage: string | null = null;

        try {
            // Detect language
            const [detection] = await this.translate.detect(dto.text);
            detectedLanguage = detection.language;

            // If not English, translate to English
            if (detectedLanguage !== 'en') {
                const [translation] = await this.translate.translate(dto.text, 'en');
                translatedText = translation;
            }
        } catch (error) {
            console.error('Translation failed:', error);
            // Continue without translation
        }

        const messageData = {
            senderId: userId,
            senderName: senderName,
            text: dto.text,
            createdAt: now,
            readAt: null,
            translatedText: translatedText,
            detectedLanguage: detectedLanguage,
        };

        // Add message to subcollection
        const messageRef = await this.firestoreService
            .collection('conversations')
            .doc(conversationId)
            .collection('messages')
            .add(messageData);

        // Update conversation with last message info
        await this.firestoreService
            .collection('conversations')
            .doc(conversationId)
            .update({
                lastMessage: dto.text,
                lastMessageAt: now,
                lastMessageSenderId: userId,
            });

        // Send notification asynchronously
        const recipientIds = conversation.participants.filter((p) => p !== userId);
        this.sendPushNotification(
            recipientIds,
            `Message from ${senderName}`,
            translatedText || dto.text,
            {
                conversationId: conversationId,
                messageId: messageRef.id,
            },
        ).catch((err) => console.error('Error sending notification:', err));

        return {
            id: messageRef.id,
            senderId: userId,
            senderName: senderName,
            text: dto.text,
            createdAt: now.toDate(),
            readAt: null,
            translatedText: translatedText || undefined,
            detectedLanguage: detectedLanguage || undefined,
        };
    }

    /**
     * Send push notification to other participants
     */
    private async sendPushNotification(
        recipientIds: string[],
        title: string,
        body: string,
        data: Record<string, string>,
    ): Promise<void> {
        for (const userId of recipientIds) {
            try {
                const tokensSnapshot = await this.firestoreService
                    .collection('users')
                    .doc(userId)
                    .collection('fcmTokens')
                    .get();

                const tokens = tokensSnapshot.docs.map((doc) => doc.data().token);

                if (tokens.length > 0) {
                    await admin.messaging().sendEachForMulticast({
                        tokens: tokens,
                        notification: {
                            title: title,
                            body: body,
                        },
                        data: data,
                    });
                }
            } catch (error) {
                console.error(`Failed to send notification to ${userId}:`, error);
            }
        }
    }

    /**
     * Get list of available doctors
     */
    async getDoctors(): Promise<Doctor[]> {
        const usersRef = this.firestoreService.collection('users');
        const snapshot = await usersRef.where('role', '==', 'DOCTOR').get();

        const doctors: Doctor[] = [];

        for (const doc of snapshot.docs) {
            const userData = doc.data();

            // Try to get doctor profile for additional details
            let specialty: string | null = null;
            let hospitalClinicName: string | null = null;

            try {
                const profileDoc = await this.firestoreService
                    .collection('users')
                    .doc(doc.id)
                    .collection('profile')
                    .doc('doctor')
                    .get();

                if (profileDoc.exists) {
                    const profileData = profileDoc.data();
                    specialty = profileData?.specialty || null;
                    hospitalClinicName = profileData?.hospitalClinicName || null;
                }
            } catch (error) {
                // Ignore errors fetching profile
            }

            doctors.push({
                id: doc.id,
                displayName: userData.displayName || userData.name || 'Dr. Unknown',
                email: userData.email || null,
                specialty,
                hospitalClinicName,
            });
        }

        return doctors;
    }

    /**
     * Find existing conversation between two users
     */
    private async findExistingConversation(
        userId1: string,
        userId2: string,
    ): Promise<Conversation | null> {
        const conversationsRef = this.firestoreService.collection('conversations');

        // Query for conversations where userId1 is a participant
        const snapshot = await conversationsRef
            .where('participants', 'array-contains', userId1)
            .get();

        // Filter to find one that also includes userId2
        for (const doc of snapshot.docs) {
            const data = doc.data();
            if (data.participants.includes(userId2)) {
                return {
                    id: doc.id,
                    participants: data.participants,
                    participantDetails: data.participantDetails,
                    lastMessage: data.lastMessage || null,
                    lastMessageAt: data.lastMessageAt?.toDate() || null,
                    lastMessageSenderId: data.lastMessageSenderId || null,
                    createdAt: data.createdAt?.toDate(),
                };
            }
        }

        return null;
    }

    /**
     * Get user details for participant info
     */
    private async getUserDetails(userId: string): Promise<Participant> {
        // First try to get from Firestore
        const userDoc = await this.firestoreService
            .collection('users')
            .doc(userId)
            .get();

        if (userDoc.exists) {
            const data = userDoc.data();
            if (data?.displayName || data?.name) {
                return {
                    displayName: data.displayName || data.name,
                    role: data?.role || 'USER',
                };
            }
        }

        // If no displayName in Firestore, try Firebase Auth
        try {
            const admin = await import('firebase-admin');
            const authUser = await admin.auth().getUser(userId);
            const displayName = authUser.displayName || authUser.email?.split('@')[0] || 'Unknown User';
            const role = userDoc.exists ? userDoc.data()?.role || 'USER' : 'USER';

            return {
                displayName,
                role,
            };
        } catch (error) {
            console.warn(`Failed to get user details for ${userId}:`, error);
            return {
                displayName: 'Unknown User',
                role: 'USER',
            };
        }
    }

    /**
     * Delete a message
     */
    async deleteMessage(
        conversationId: string,
        messageId: string,
        userId: string,
    ): Promise<void> {
        // Verify user is a participant
        await this.getConversation(conversationId, userId);

        const messageRef = this.firestoreService
            .collection('conversations')
            .doc(conversationId)
            .collection('messages')
            .doc(messageId);

        const messageDoc = await messageRef.get();

        if (!messageDoc.exists) {
            throw new NotFoundException('Message not found');
        }

        const messageData = messageDoc.data();
        if (messageData?.senderId !== userId) {
            throw new ForbiddenException('You can only delete your own messages');
        }

        await messageRef.delete();
    }
}
