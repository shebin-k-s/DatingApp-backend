import admin from 'firebase-admin'
import serviceAccount from '../firebase-adminsdk.json' assert { type: 'json' };

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
})

export default admin