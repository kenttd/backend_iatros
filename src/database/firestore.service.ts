import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';
import { Firestore } from 'firebase-admin/firestore';

@Injectable()
export class FirestoreService implements OnModuleInit {
    private readonly logger = new Logger(FirestoreService.name);
    private firestore: Firestore;

    constructor(private readonly configService: ConfigService) { }

    async onModuleInit() {
        try {
            // Initialize Firebase Admin SDK if not already initialized
            if (!admin.apps.length) {
                admin.initializeApp({
                    credential: admin.credential.applicationDefault(),
                });
                this.logger.log('Firebase Admin SDK initialized');
            }

            // Get Firestore instance with custom database ID
            const databaseId = this.configService.get<string>('FIRESTORE_DATABASE_ID', 'iatros-db');
            this.firestore = admin.firestore();
            this.firestore.settings({ databaseId });
            this.logger.log(`Firestore connection established to database: ${databaseId}`);
        } catch (error) {
            this.logger.error('Failed to initialize Firestore', error);
            throw error;
        }
    }

    /**
     * Get the Firestore instance
     */
    getFirestore(): Firestore {
        return this.firestore;
    }

    /**
     * Helper method to get a collection reference
     */
    collection(path: string) {
        return this.firestore.collection(path);
    }

    /**
     * Helper method to get a document reference
     */
    doc(path: string) {
        return this.firestore.doc(path);
    }

    /**
     * Batch operations
     */
    batch() {
        return this.firestore.batch();
    }

    /**
     * Transaction operations
     */
    runTransaction<T>(updateFunction: (transaction: FirebaseFirestore.Transaction) => Promise<T>): Promise<T> {
        return this.firestore.runTransaction(updateFunction);
    }
}
