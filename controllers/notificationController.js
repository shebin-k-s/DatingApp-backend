import admin from "../config/firebase-config.js";
import Notification from "../models/notificationModel.js";
import User from "../models/userModel.js";

export const getNotifications = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { page = 1, limit = 20 } = req.query;

        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const skip = (pageNum - 1) * limitNum;

        const totalNotifications = await Notification.countDocuments({ receiver: userId });

        const notifications = await Notification.find({ receiver: userId })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limitNum)
            .populate('sender', 'username profilePic')
            .select('-receiver');

        const totalPages = Math.ceil(totalNotifications / limitNum);
        const hasNextPage = pageNum < totalPages;
        const hasPrevPage = pageNum > 1;

        return res.status(200).json({
            notifications,
            currentPage: pageNum,
            totalPages,
            totalNotifications,
            hasNextPage,
            hasPrevPage,
            nextPage: hasNextPage ? pageNum + 1 : null,
            prevPage: hasPrevPage ? pageNum - 1 : null
        });
    } catch (error) {
        console.error('Error fetching notifications:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export async function createNotification(sender, receiver, type, content) {
    try {
        const notification = new Notification({
            sender,
            receiver,
            type,
            content
        });
        await notification.save();

        const receiverUser = await User.findById(receiver);
        if (!receiverUser || !receiverUser.fcmToken) {
            console.log('Receiver device token not found');
            return notification;
        }

        let title, body;
        switch (type) {
            case 'LIKE':
                title = 'New Like';
                body = 'Someone liked your profile!';
                break;
            case 'MATCH':
                title = 'New Match';
                body = 'You have a new match!';
                break;
            case 'MESSAGE':
                title = 'New Message';
                body = 'You have a new message!';
                break;
            case 'PROFILE_VIEW':
                title = 'Profile View';
                body = 'Someone viewed your profile!';
                break;
            default:
                title = 'New Notification';
                body = 'You have a new notification!';
        }

        await sendPushNotification(receiverUser.fcmToken, title, body, {
            type,
            notificationId: notification._id.toString()
        });

        console.log('Notification created and push notification sent');
        return notification;
    } catch (error) {
        console.error('Error creating notification:', error);
        throw error;
    }
}

export async function deleteNotification(sender, receiver, type) {
    try {
        const result = await Notification.findOneAndDelete({
            sender,
            receiver,
            type
        });
        if (result) {
            console.log('Notification deleted successfully');
        } else {
            console.log('No matching notification found to delete');
        }
    } catch (error) {
        console.error('Error deleting notification:', error);
    }
}

export async function sendPushNotification(fcmToken, title, body, data) {
    const message = {
        notification: { title, body },
        data,
        token: fcmToken
    };

    try {
        const response = await admin.messaging().send(message);
        console.log('Push notification sent:', response);
    } catch (error) {
        console.error('Error sending message:', error);
        throw error;
    }
}

export const updateNotificationStatus = async (req, res) => {
    try {
        const { notificationId, status } = req.body;

        if (!notificationId || !status) {
            return res.status(400).json({ message: 'Notification ID and status are required' });
        }

        const notification = await Notification.findByIdAndUpdate(
            notificationId,
            { status },
        );

        if (!notification) {
            return res.status(404).json({ message: 'Notification not found' });
        }

        return res.status(200).json({ message: 'Notification status updated successfully' });
    } catch (error) {
        console.error('Error updating notification status:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const setFcmToken = async (req, res) => {
    const { fcmToken } = req.body;

    const userId = req.user.userId
    if (!fcmToken) {
        return res.status(400).json({ message: 'FCM Token is required' });
    }

    try {
        const user = await User.findByIdAndUpdate(
            userId,
            { fcmToken: token },
            { new: true, upsert: true }
        );

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        return res.status(200).json({ message: 'FCM token updated successfully' });
    } catch (error) {
        console.error('Error updating FCM token:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
}

