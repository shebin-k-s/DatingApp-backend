import express from 'express';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { authRoute, messageRoute, notificationRoute, profileRoute, uploadRoutes } from './routes/index.js';
import session from 'express-session';
import http from 'http';
import { Server } from 'socket.io';
import { verifyToken } from './middleware/authMiddleware.js';
import Message from './models/messageModel.js';
import Jwt from 'jsonwebtoken';
import { ensureUploadDirectory } from './utils/fileUtils.js';
import path from 'path';
import { fileURLToPath } from 'url';


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use(session({
    secret: process.env.SESSION_KEY,
    resave: false,
    saveUninitialized: true,
    cookie: {
        secure: false,
        maxAge: 900000,
    }
}));

const connectedUsers = new Map();
app.set('io', io);
app.set('connectedUsers', connectedUsers);

app.use('/api/v1/auth', authRoute);
app.use('/api/v1/message', verifyToken, messageRoute);
app.use('/api/v1/profile', verifyToken, profileRoute);
app.use('/api/v1/profile/notifications', verifyToken, notificationRoute);

app.use('/api/v1/upload', uploadRoutes);


ensureUploadDirectory();
io.on('connection', async (socket) => {
    console.log('A user connected');

    const token = socket.handshake.query.token || socket.handshake.headers['authorization'];
    if (!token) {
        console.log('No token provided');
        return socket.disconnect();
    }

    try {
        const decodedToken = Jwt.verify(token, process.env.JWT_TOKEN);
        const userId = decodedToken.userId;

        const initializationComplete = new Promise(async (resolve) => {
            connectedUsers.set(userId, { socketId: socket.id, interactingWith: null });

            try {
                const messagesToUpdate = await Message.updateMany(
                    { receiver: userId, status: 'sent' },
                    { $set: { status: 'received' } }
                );
                console.log(`Updated ${messagesToUpdate.modifiedCount} messages to "received" for user ${userId}`);
            } catch (error) {
                console.log(error);
            }

            resolve();
        });

        await initializationComplete;


        socket.isReady = true;
        
        socket.on('startInteraction', (interactingUserId) => {
            if (!socket.isReady) {
                console.log('Socket not ready, ignoring startInteraction event');
                return;
            }

            const userData = connectedUsers.get(userId);
            if (userData) {
                userData.interactingWith = interactingUserId;
                connectedUsers.set(userId, userData);
            }
            console.log(`User ${userId} started interacting with ${interactingUserId}`);
        });

        socket.on('stopInteraction', () => {
            if (!socket.isReady) {
                console.log('Socket not ready, ignoring stopInteraction event');
                return;
            }

            const userData = connectedUsers.get(userId);
            if (userData) {
                userData.interactingWith = null;
                connectedUsers.set(userId, userData);
            }
            console.log(`User ${userId} stopped interacting`);
        });

        socket.on('messageSeen', async (receiverId) => {
            if (!socket.isReady) {
                console.log('Socket not ready, ignoring messageSeen event');
                return;
            }

            console.log(`id : ${receiverId}`);
            try {
                const result = await Message.updateMany(
                    { sender: receiverId, receiver: userId, status: { $ne: 'seen' } },
                    { $set: { status: 'seen' } }
                );
                console.log(`Updated ${result.modifiedCount} messages to "seen" for user ${userId} from ${receiverId}`);
            } catch (error) {
                console.error('Error updating message status to "seen":', error);
            }
        });

        socket.on('disconnect', () => {
            connectedUsers.forEach((value, key) => {
                if (value === socket.id) {
                    connectedUsers.delete(key);
                }
            });
            console.log('A user disconnected');
        });

        socket.emit('ready');

    } catch (error) {
        console.log('Failed to authenticate token');
        return socket.disconnect();
    }
});

const PORT = process.env.PORT || 5000;

mongoose.connect(process.env.CONNECTION_URL)
    .then(() => {
        server.listen(PORT, () => {
            console.log(`Server running at ${PORT}`);
        });
    })
    .catch((error) => {
        console.log(error);
    });
