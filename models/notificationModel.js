import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema({
    sender: {
        type: mongoose.Schema.ObjectId,
        ref: 'User',
        required: true
    },
    receiver: {
        type: mongoose.Schema.ObjectId,
        ref: 'User',
        required: true
    },
    type: {
        type: String,
        enum: ['LIKE', 'MATCH', 'MESSAGE', 'PROFILE_VIEW'],
        required: true
    },
    content: {
        type: String
    },
    status: {
        type: String,
        enum: ['sent', 'received'],
        default: 'sent'
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
})

const Notification = mongoose.model('Notification', notificationSchema)

export default Notification