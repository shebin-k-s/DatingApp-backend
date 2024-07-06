import Message from "../models/messageModel.js"
import User from "../models/userModel.js"

export const sendMessage = async (req, res) => {
    try {
        const { receiver, message } = req.body
        const sender = req.user.userId

        let receiverExist = await User.findById(receiver)

        if (!receiverExist) {
            return res.status(400).json({ message: "Receiver doesn't exist" })
        }

        const newMessage = new Message({
            sender,
            receiver,
            message
        })

        const io = req.app.get('io');
        const connectedUsers = req.app.get('connectedUsers');
        if (connectedUsers.has(receiver)) {
            newMessage.status = 'received';
            io.to(connectedUsers.get(receiver)).emit('newMessage', newMessage);
        }
        if (connectedUsers.has(sender)) {
            io.to(connectedUsers.get(sender)).emit('newMessage', newMessage);
        }
        await newMessage.save()
        res.status(201).json(newMessage);
    } catch (error) {
        res.status(400).json({ error: error.message });
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
        const userId = req.user.userId
        const { recipientId } = req.params
        const recipientExist = await User.findById(recipientId);
        if (!recipientExist) {
            return res.status(400).json({ message: "The user you're trying to converse with doesn't exist" });
        }

        const messages = await Message.find({
            $or: [
                { sender: userId, receiver: recipientId },
                { sender: recipientId, receiver: userId }
            ]
        }).sort({ sendAt: 1 });

        res.status(200).json({ messages: messages });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};