import mongoose from "mongoose"
import validator from "validator"
import { likedProfileSchema } from "./likedProfileModel.js";

const userSchema = new mongoose.Schema({
    username: {
        type: String,
        required: [true, 'Username is required']
    },
    profilePic: {
        type: String
    },
    email: {
        type: String,
        validatr: {
            validator: validator.isEmail,
            message: "Invalid Email Address"
        }
    },
    phoneNumber: {
        type: String,
    },
    gender: {
        type: String,
        enum: ['Male', 'Female', 'Other'],
        required: [true, 'Gender is required']
    },
    dateOfBirth: {
        type: Date,
        required: [true, 'Date of birth is required']
    },
    bio: {
        type: String,
        maxlength: [500, 'Bio can have a maximum of 500 characters']
    },
    interests: [{
        type: String
    }],
    photos: [{
        type: String
    }],
    matches: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    likedProfiles: [likedProfileSchema],
    favouriteProfiles: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    createdAt: {
        type: Date,
        default: Date.now
    },
    preference: {
        type: String,
        enum: ['Love', 'Friends', 'Business']
    },
    address: {
        type: String
    },
    location: {
        type: { type: String, default: 'Point' },
        coordinates: [Number]
    },
    fcmToken: {
        type: String,
        default: '',
    },

})

userSchema.index({ 'location': '2dsphere' });


const User = mongoose.model('User', userSchema)

export default User