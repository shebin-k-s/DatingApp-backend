import express from 'express';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { authRoute, messageRoute, notificationRoute, profileRoute } from './routes/index.js';
import session from 'express-session';
import http from 'http';
import { Server } from 'socket.io';
import { verifyToken } from './middleware/authMiddleware.js';
import Message from './models/messageModel.js';
import Jwt from 'jsonwebtoken';

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
        connectedUsers.set(userId, socket.id);

        try {
            const messagesToUpdate = await Message.updateMany(
                { receiver: userId, status: 'sent' },
                { $set: { status: 'received' } }
            );
            console.log(`Updated ${messagesToUpdate.modifiedCount} messages to "received" for user ${userId}`);
        } catch (error) {
            console.log(error);
        }

        socket.on('messageSeen', async (receiverId) => {
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
