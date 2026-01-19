
import * as admin from 'firebase-admin';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
const projectId = process.env.FIREBASE_PROJECT_ID;

if (!projectId) {
    console.error('FIREBASE_PROJECT_ID is not set in .env');
    process.exit(1);
}

// Initialize Firebase Admin
try {
    if (serviceAccountPath) {
        const serviceAccount = require(path.resolve(__dirname, '../../', serviceAccountPath));
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            projectId: projectId,
        });
    } else {
        admin.initializeApp({
            projectId: projectId,
            credential: admin.credential.applicationDefault(),
        });
    }
} catch (error) {
    console.error('Failed to initialize Firebase Admin:', error);
    process.exit(1);
}

const db = admin.firestore();
const databaseId = process.env.FIRESTORE_DATABASE_ID || 'iatros-db';
db.settings({ databaseId });
console.log(`Using Firestore Database ID: ${databaseId}`);

async function setDoctorRole(userId: string) {
    if (!userId) {
        console.error('Please provide a User ID');
        console.log('Usage: npx ts-node src/scripts/set-doctor-role.ts <USER_ID>');
        process.exit(1);
    }

    console.log(`Setting role to DOCTOR for user: ${userId}`);

    try {
        const userRef = db.collection('users').doc(userId);
        const userDoc = await userRef.get();

        if (!userDoc.exists) {
            console.log('User document does not exist. Creating default doctor profile...');
            await userRef.set({
                role: 'DOCTOR',
                createdAt: admin.firestore.Timestamp.now(),
                updatedAt: admin.firestore.Timestamp.now(),
            }, { merge: true });
        } else {
            await userRef.update({
                role: 'DOCTOR',
                updatedAt: admin.firestore.Timestamp.now(),
            });
        }

        // Also create/update doctor profile if needed
        const doctorProfileRef = userRef.collection('profile').doc('doctor');
        const doctorProfile = await doctorProfileRef.get();

        if (!doctorProfile.exists) {
            await doctorProfileRef.set({
                specialty: 'General Practitioner',
                hospitalClinicName: 'Iatros Clinic',
                createdAt: admin.firestore.Timestamp.now(),
                updatedAt: admin.firestore.Timestamp.now(),
            });
            console.log('Created default doctor profile.');
        }

        console.log('✅ Successfully updated user role to DOCTOR');
    } catch (error) {
        console.error('❌ Failed to update user role:', error);
    } finally {
        process.exit(0);
    }
}

// Get user ID from command line arguments
const userId = process.argv[2];
setDoctorRole(userId);
