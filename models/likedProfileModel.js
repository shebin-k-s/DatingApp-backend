import mongoose from "mongoose";

export const likedProfileSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    dateLiked: {
        type: Date,
        default: Date.now
    }
});
