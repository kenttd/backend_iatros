import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-custom';
import { FirestoreService } from '../database/firestore.service';
import * as admin from 'firebase-admin';
import { Request } from 'express';

@Injectable()
export class FirebaseStrategy extends PassportStrategy(Strategy, 'firebase') {
    constructor(
        private configService: ConfigService,
        private firestoreService: FirestoreService,
    ) {
        super();

        // Initialize Firebase Admin SDK if not already initialized
        if (!admin.apps.length) {
            const serviceAccountPath = this.configService.get<string>('GOOGLE_APPLICATION_CREDENTIALS');
            const projectId = this.configService.get<string>('FIREBASE_PROJECT_ID');

            console.log('Initializing Firebase Admin SDK...');
            console.log('Project ID:', projectId);
            console.log('Service Account Path:', serviceAccountPath);

            // Option 1: Use explicit service account file
            if (serviceAccountPath) {
                try {
                    const serviceAccount = require(`../../${serviceAccountPath}`);
                    admin.initializeApp({
                        credential: admin.credential.cert(serviceAccount),
                    });
                    console.log('✅ Firebase Admin initialized with service account file');
                } catch (error) {
                    console.error('❌ Failed to load service account:', error.message);
                    throw new Error('Failed to initialize Firebase Admin SDK with service account');
                }
            }
            // Option 2: Try using individual environment variables (for production)
            else {
                const serviceAccount = {
                    projectId: projectId,
                    clientEmail: this.configService.get<string>('FIREBASE_CLIENT_EMAIL'),
                    privateKey: this.configService.get<string>('FIREBASE_PRIVATE_KEY')?.replace(/\\n/g, '\n'),
                };

                if (serviceAccount.projectId && serviceAccount.clientEmail && serviceAccount.privateKey) {
                    admin.initializeApp({
                        credential: admin.credential.cert(serviceAccount as admin.ServiceAccount),
                    });
                    console.log('✅ Firebase Admin initialized with environment variables');
                } else if (projectId) {
                    // Minimal initialization with just project ID
                    admin.initializeApp({
                        projectId: projectId,
                    });
                    console.log('⚠️ Firebase Admin initialized with project ID only');
                } else {
                    throw new Error('Firebase configuration is missing. Please set FIREBASE_PROJECT_ID in .env');
                }
            }
        }
    }

    async validate(req: Request): Promise<any> {
        const authHeader = req.headers.authorization;

        // console.log('=== Firebase Auth Debug ===');
        // console.log('Authorization header:', authHeader);

        if (!authHeader) {
            console.error('❌ No authorization header found');
            throw new UnauthorizedException('No authorization header found');
        }

        const token = authHeader.replace('Bearer ', '').trim();

        if (!token) {
            console.error('❌ No token provided');
            throw new UnauthorizedException('No token provided');
        }

        // console.log('Token (first 20 chars):', token.substring(0, 20) + '...');

        try {
            // Verify the Firebase ID token
            const decodedToken = await admin.auth().verifyIdToken(token);

            // console.log('✅ Token verified successfully for user:', decodedToken.uid);

            // Fetch user role from Firestore
            let role = 'USER';
            try {
                const userDoc = await this.firestoreService
                    .collection('users')
                    .doc(decodedToken.uid)
                    .get();

                if (userDoc.exists) {
                    const userData = userDoc.data();
                    if (userData && userData.role) {
                        role = userData.role;
                    }
                }
            } catch (firestoreError) {
                console.warn(`⚠️ Failed to fetch user role from Firestore for ${decodedToken.uid}, defaulting to USER`, firestoreError);
            }

            // Return user data that will be attached to req.user
            return {
                uid: decodedToken.uid,
                email: decodedToken.email,
                emailVerified: decodedToken.email_verified,
                name: decodedToken.name,
                picture: decodedToken.picture,
                phoneNumber: decodedToken.phone_number,
                role: role,
                // Include auth time and other useful fields
                authTime: decodedToken.auth_time,
                iat: decodedToken.iat,
                exp: decodedToken.exp,
            };
        } catch (error) {
            console.error('❌ Firebase token verification failed:', error.message);
            console.error('Error details:', error);
            throw new UnauthorizedException('Invalid or expired token');
        }
    }
}
