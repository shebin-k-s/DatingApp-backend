import Message from "../models/messageModel.js"
import User from "../models/userModel.js"
import { DateTime } from "luxon"

export const sendMessage = async (req, res) => {
    try {
        const { profileId, message } = req.body
        const sender = req.user.userId
        console.log(sender);
        console.log(profileId);
        let receiverExist = await User.findById(profileId)

        if (!receiverExist) {
            return res.status(400).json({ message: "Receiver doesn't exist" })
        }

        const newMessage = new Message({
            sender,
            receiver: profileId,
            message
        })

        const io = req.app.get('io');
        const connectedUsers = req.app.get('connectedUsers');
        if (connectedUsers.has(profileId)) {
            newMessage.status = 'seen';
            io.to(connectedUsers.get(profileId)).emit('newMessage', newMessage);
        }
        await newMessage.save()
        console.log(newMessage);
        return res.status(201).json(newMessage);
    } catch (error) {
        console.log(error);
        return res.status(400).json({ error: error.message });
    }
}

export const getMessagedProfiles = async (req, res) => {
    try {
        const userId = req.user.userId;

        const messages = await Message.find({
            $or: [{ sender: userId }, { receiver: userId }]
        }).sort({ sendAt: -1 });

        const uniqueUsers = {};
        messages.forEach(message => {
            const otherUserId = message.sender.toString() !== userId.toString() ? message.sender.toString() : message.receiver.toString();
            if (!uniqueUsers[otherUserId]) {

                uniqueUsers[otherUserId] = {
                    userId: otherUserId,
                    latestMessage: message.message,
                    latestMessageSendAt: message.sendAt,
                    messageStatus: message.status,
                    unreadCount: 0
                };
            }
            if (message.receiver.toString() === userId.toString() && message.status != 'seen') {
                uniqueUsers[otherUserId].unreadCount++;
            }
        });

        const userIdsArray = Object.keys(uniqueUsers);
        const profiles = await User.find(
            {
                _id: { $in: userIdsArray }
            },
            { username: 1, profilePic: 1 }
        );

        const result = userIdsArray.map(id => {
            const profile = profiles.find(profile => profile._id.toString() === id);
            return {
                profile,
                latestMessage: uniqueUsers[id].latestMessage,
                latestMessageSendAt: uniqueUsers[id].latestMessageSendAt,
                messageStatus: uniqueUsers[id].messageStatus,
                unreadCount: uniqueUsers[id].unreadCount
            };
        });

        res.status(200).json({ messagedProfiles: result });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};


export const getConversation = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { profileId } = req.params;

        const recipientExist = await User.findById(profileId);
        if (!recipientExist) {
            return res.status(400).json({ message: "The user you're trying to converse with doesn't exist" });
        }

        const messages = await Message.find({
            $or: [
                { sender: userId, receiver: profileId },
                { sender: profileId, receiver: userId }
            ]
        }).sort({ sendAt: 1 });

        const groupedMessages = messages.reduce((acc, message) => {
            const istDate = DateTime.fromJSDate(message.sendAt, { zone: 'Asia/Kolkata' }).toISODate();

            if (!acc[istDate]) {
                acc[istDate] = [];
            }
            acc[istDate].push(message);
            return acc;
        }, {});

        const conversationByDate = Object.keys(groupedMessages).map(date => ({
            date,
            messages: groupedMessages[date]
        })).reverse();

        return res.status(200).json({
            conversation: conversationByDate,
        });
    } catch (error) {
        console.log(error);
        return res.status(400).json({ error: error.message });
    }
};