import User from "../models/userModel.js";
import nodemailer from 'nodemailer'
import twilio from 'twilio'
import Jwt from 'jsonwebtoken';
import axios from 'axios'


export const sendOTP = async (req, res) => {
    try {
        const { email, phoneNumber, forLogin } = req.body;
        console.log(req.body);

        let userField, method;

        if (email) {
            userField = { email };
            method = 'email';
        } else if (phoneNumber) {
            userField = { phoneNumber };
            method = 'phone';
        } else {
            return res.status(400).json({ message: 'No email or phone number provided' });
        }
        console.log(userField);
        console.log(method);
        const existingUser = await User.findOne(userField);
        if (forLogin) {
            if (!existingUser) {
                console.log("User not found for login.");
                return res.status(404).json({ message: 'User not found. Please register first.' });
            }
        } else {
            if (existingUser) {
                console.log("User already registered.");
                return res.status(409).json({ message: `${method} is already registered. Please log in.` });
            }
        }

        const otp = generateOTP();
        console.log(otp);
        req.session.otp = otp;
        req.session.userField = userField;
        req.session.method = method;
        req.session.isForLogin = forLogin;
        req.session.otpVerified = false;

        const sessionId = req.sessionID;

        if (method === 'email') {
            await sendEmail(userField.email, otp);
        } else {
            await sendSMS(userField.phoneNumber, otp);
        }

        return res.status(200).json({ message: 'OTP sent successfully', sessionId });
    } catch (error) {
        console.error('Error:', error);
        return res.status(500).json({ message: 'Internal server error' });
    }
}

export const verifyOTP = async (req, res) => {
    try {
        const { otp, sessionId } = req.body
        let userField;
        const getSessionData = (sid) => {
            return new Promise((resolve, reject) => {
                req.sessionStore.get(sid, (err, data) => {
                    if (err) reject(err);
                    else resolve(data);
                });
            });
        };

        const sessionData = await getSessionData(sessionId);
        userField = sessionData.userField;
        if (otp !== sessionData.otp) {
            return res.status(400).json({ message: 'Invalid OTP' });
        }
        if (sessionData.isForLogin) {
            const user = await User.findOne(userField)
                .populate('likedProfiles.userId', '_id')
                .lean();

            const token = Jwt.sign({ userId: user._id }, process.env.JWT_TOKEN);

            req.session.destroy((err) => {
                if (err) {
                    console.error('Error destroying session:', err);
                }
            });
            user.likedProfiles = user.likedProfiles.map(profile => profile.userId._id);
            console.log(user);

            return res.status(200).json({
                message: 'Login successful',
                token,
                user
            });

        }
        sessionData.otpVerified = true;
        const saveSessionData = (sid, data) => {
            return new Promise((resolve, reject) => {
                req.sessionStore.set(sid, data, (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });
        };

        await saveSessionData(sessionId, sessionData);

        return res.status(200).json({ message: 'OTP verified successfully' });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
}

export const generateOTP = () => {
    return Math.floor(10000 + Math.random() * 90000).toString();
};

export const sendEmail = async (email, otp) => {

    try {
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            host: process.env.SMTP_HOST,
            port: process.env.SMTP_PORT,
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS
            }
        });
        const mailOptions = {
            from: 'Dating APP',
            to: email,
            subject: 'Your OTP Code',
            text: `Your OTP code is ${otp}`
        };
        await transporter.sendMail(mailOptions);
    } catch (error) {
        console.log(error);
        throw new Error('Failed to send Email OTP ');
    }

};

export const sendSMS = async (phoneNumber, otp) => {
    try {
        const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

        await twilioClient.messages.create({
            body: `Your OTP code is ${otp}`,
            from: process.env.TWILIO_PHONE_NUMBER,
            to: phoneNumber
        });
    } catch (error) {
        console.error('Error sending OTP SMS:', error);
        throw new Error('Failed to send OTP SMS');
    }
}

export const registerUser = async (req, res) => {
    try {
        const { username, gender, dateOfBirth, bio, profilePic, preference, interests, address, sessionId } = req.body
        console.log(req.body);
        const getSessionData = (sid) => {
            return new Promise((resolve, reject) => {
                req.sessionStore.get(sid, (err, data) => {
                    if (err) reject(err);
                    else resolve(data);
                });
            });
        };

        const sessionData = await getSessionData(sessionId);

        if (!sessionData.otpVerified) {
            return res.status(400).json({ message: `${sessionData.method} not verified` });
        }


        const userField = sessionData.userField

        let location = null;
        if (address) {
            try {
                const { latitude, longitude } = await geocodeAddress(address);
                location = {
                    type: 'Point',
                    coordinates: [longitude, latitude]
                };
            } catch (geocodeError) {
                console.error('Geocoding error:', geocodeError);
                return res.status(400).json({ message: 'Invalid address or geocoding failed' });
            }
        } else {
            return res.status(400).json({ message: 'Address is required' });
        }

        const newUser = new User({
            ...userField,
            username,
            gender,
            dateOfBirth,
            bio,
            interests,
            profilePic,
            preference,
            address,
            location
        });
        await newUser.save();
        const token = Jwt.sign({ userId: newUser._id }, process.env.JWT_TOKEN);
        req.session.destroy((err) => {
            if (err) {
                console.error('Error destroying session:', err);
            }
        });
        return res.status(201).json({
            message: 'User registered successfully',
            token,
            user: newUser,
        });
    } catch (error) {
        console.error('Error:', error);
        return res.status(500).json({ message: 'Internal server error' });
    }
};


export async function geocodeAddress(address, retries = 3) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const response = await axios.get('https://nominatim.openstreetmap.org/search', {
                params: {
                    q: address,
                    format: 'json',
                    limit: 1
                },
            });
            if (response.data && response.data.length > 0) {
                const { lat, lon } = response.data[0];
                return { latitude: parseFloat(lat), longitude: parseFloat(lon) };
            }
            throw new Error('No results found');
        } catch (error) {
            console.error(`Geocoding attempt ${attempt} failed:`);
            if (attempt === retries) {
                throw new Error('Unable to geocode address after multiple attempts');
            }
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
    }
}

