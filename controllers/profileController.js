import mongoose from "mongoose";
import User from "../models/userModel.js";
import { geocodeAddress } from "./authController.js";
import axios from "axios";
import { createNotification, deleteNotification } from "./notificationController.js";


export const getPersonalDetails = async (req, res) => {
    try {
        const userId = req.user.userId;
        console.log(userId);

        const user = await User.findById(userId).select('-fcmToken -location -__v');

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        console.log(user);
        return res.status(200).json(user);
    } catch (error) {
        console.error('Error fetching personal details:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const getUser = async (req, res) => {
    try {

        const { profileId } = req.params

        const user = await User.findById(profileId).select('-_id -__v -likedProfiles -favouriteProfiles -matches');

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        console.log(user);
        return res.status(200).json({ user });
    } catch (error) {
        console.error('Error fetching personal details:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const editProfile = async (req, res) => {
    try {
        const userId = req.user.userId

        const { username, profilePic, gender, dateOfBirth, bio, preference, address } = req.body
        console.log(req.body);
        const updatedProfile = {
            username,
            profilePic,
            gender,
            dateOfBirth,
            bio,
            preference,
            address
        }
        const updatedUser = await User.findByIdAndUpdate(userId, updatedProfile, { new: true });
        console.log(updatedUser);

        res.status(200).json({ message: 'Profile updated successfully', profile: updatedUser });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const searchProfiles = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { minAge, maxAge, gender, location, maxDistance = 30, page = 1, limit = 20 } = req.query;

        console.log(req.query);
        const filter = { _id: { $ne: userId } };
        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);

        if (minAge || maxAge) {
            filter.dateOfBirth = {};
            const currentDate = new Date();
            if (minAge) filter.dateOfBirth.$lte = new Date(currentDate.getFullYear() - minAge, currentDate.getMonth(), currentDate.getDate());
            if (maxAge) filter.dateOfBirth.$gte = new Date(currentDate.getFullYear() - maxAge, currentDate.getMonth(), currentDate.getDate());
        }

        if (gender) filter.gender = gender;

        let profiles, totalProfiles;

        if (location) {
            const userLocation = await geocodeAddress(location);
            const earthRadiusKm = 6371;
            const latDelta = (parseFloat(maxDistance) / earthRadiusKm) * (180 / Math.PI);
            const lonDelta = latDelta / Math.cos(userLocation.latitude * Math.PI / 180);

            filter.location = {
                $geoWithin: {
                    $box: [
                        [userLocation.longitude - lonDelta, userLocation.latitude - latDelta],
                        [userLocation.longitude + lonDelta, userLocation.latitude + latDelta]
                    ]
                }
            };

            profiles = await User.find(filter).select('username gender dateOfBirth bio profilePic address location').lean();
            console.log(profiles.length);

            const batchSize = 25;
            const profileDistances = [];

            for (let i = 0; i < profiles.length; i += batchSize) {
                const batch = profiles.slice(i, i + batchSize);
                const batchLocations = batch.map(profile => ({
                    longitude: profile.location.coordinates[0],
                    latitude: profile.location.coordinates[1]
                }));

                const distances = await getBatchRoadDistances(userLocation, batchLocations);

                batch.forEach((profile, index) => {
                    const distance = distances[index];
                    if (distance !== null && distance <= maxDistance) {
                        const { location, ...profileWithoutLocation } = profile;
                        profileDistances.push({
                            ...profileWithoutLocation,
                            distanceInKm: parseFloat(distance.toFixed(2))
                        });
                    }
                });
            }

            profiles = profileDistances.sort((a, b) => a.distanceInKm - b.distanceInKm);
            totalProfiles = profiles.length;
            profiles = profiles.slice((pageNum - 1) * limitNum, pageNum * limitNum);
        } else {
            profiles = await User.find(filter)
                .select('username gender dateOfBirth bio profilePic address')
                .skip((pageNum - 1) * limitNum)
                .limit(limitNum)
                .lean();

            totalProfiles = await User.countDocuments(filter);
        }
        console.log(totalProfiles);

        const totalPages = Math.ceil(totalProfiles / limitNum);
        const hasNextPage = pageNum < totalPages;
        const hasPrevPage = pageNum > 1;
        return res.status(200).json({
            profiles,
            currentPage: pageNum,
            totalPages,
            totalProfiles,
            hasNextPage,
            hasPrevPage,
            nextPage: hasNextPage ? pageNum + 1 : null,
            prevPage: hasPrevPage ? pageNum - 1 : null
        });
    } catch (error) {
        console.error('Search error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

async function getBatchRoadDistances(start, ends) {
    const url = process.env.ORS_API_URL;

    const data = {
        locations: [
            [start.longitude, start.latitude],
            ...ends.map(end => [end.longitude, end.latitude])
        ],
        metrics: ["distance"],
        units: "km"
    };

    const config = {
        headers: {
            'Authorization': process.env.ORS_API_KEY,
            'Content-Type': 'application/json'
        }
    };

    try {
        const response = await axios.post(url, data, config);
        return response.data.distances[0].slice(1);
    } catch (error) {
        console.error('Error calculating batch ORS distances:', error);
        if (error.response) {
            console.error('Response data:', error.response.data);
            console.error('Response status:', error.response.status);
        }
        return ends.map(() => null);
    }
}

export const addFavouriteProfile = async (req, res) => {
    try {
        const { profileId } = req.params
        const userId = req.user.userId


        if (!profileId || !mongoose.Types.ObjectId.isValid(profileId)) {
            return res.status(400).json({ message: 'Invalid profile ID' });
        }

        if (userId === profileId) {
            return res.status(400).json({ message: 'Cannot add yourself to favorites' });
        }

        const profile = await User.findById(profileId)
        if (!profile) {
            return res.status(404).json({ message: 'Profile not found' })
        }


        const updatedUser = await User.findOneAndUpdate(
            { _id: userId, favouriteProfiles: { $ne: profileId } },
            { $addToSet: { favouriteProfiles: profileId } },
            { new: true }
        );
        if (!updatedUser) {
            return res.status(400).json({ message: "Profile already in favorites" });
        }

        return res.status(200).json({ message: "Profile added to favorites", addedId: profileId });

    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const getFavouriteProfiles = async (req, res) => {
    try {
        const userId = req.user.userId;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;

        const skip = (page - 1) * limit;

        const profiles = await User.findById(userId)
            .populate({
                path: 'favouriteProfiles',
                select: 'username profilePic gender dateOfBirth bio address',
                options: { skip, limit }
            });

        const totalProfiles = profiles.favouriteProfiles.length;
        const totalPages = Math.ceil(totalProfiles / limit);
        const hasNextPage = page < totalPages;
        const hasPrevPage = page > 1;

        return res.status(200).json({
            profiles: profiles.favouriteProfiles,
            currentPage: page,
            totalPages,
            totalProfiles,
            hasNextPage,
            hasPrevPage,
            nextPage: hasNextPage ? page + 1 : null,
            prevPage: hasPrevPage ? page - 1 : null
        });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};


export const removeFavouriteProfile = async (req, res) => {
    try {
        const { profileId } = req.params
        const userId = req.user.userId

        if (!profileId || !mongoose.Types.ObjectId.isValid(profileId)) {
            return res.status(400).json({ message: 'Invalid profile ID' });
        }

        const updatedUser = await User.findOneAndUpdate(
            { _id: userId, favouriteProfiles: profileId },
            { $pull: { favouriteProfiles: profileId } },
            { new: true }
        )

        if (!updatedUser) {
            return res.status(404).json({ message: 'Profile not in favorite list' });
        }
        return res.status(200).json({ message: 'User removed from favorites', removedId: profileId });
    } catch (error) {
        console.log(error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
}

export const likeProfile = async (req, res) => {
    try {
        const { profileId } = req.params
        const userId = req.user.userId

        if (!profileId || !mongoose.Types.ObjectId.isValid(profileId)) {
            return res.status(400).json({ message: 'Invalid profile ID' });
        }

        if (userId === profileId) {
            return res.status(400).json({ message: 'Cannot like yourself' });
        }

        const likedUser = await User.findById(profileId)
        if (!likedUser) {
            return res.status(404).json({ message: 'Profile not found' })
        }


        const likerUser = await User.findOneAndUpdate(
            { _id: userId, likedProfiles: { $ne: profileId } },
            { $addToSet: { likedProfiles: profileId } },
            { new: true }
        );
        if (!likerUser) {
            return res.status(400).json({ success: false, message: 'You have already liked this profile.' })
        }

        await createNotification(userId, profileId, 'LIKE', "Someone liked your profile!");

        if (likedUser.likedProfiles.includes(userId)) {
            likerUser.matches.push(profileId)
            await likerUser.save()

            likedUser.matches.push(userId)
            await likedUser.save()

            await createNotification(userId, profileId, 'MATCH', "You have a new match!");
            await createNotification(profileId, userId, 'MATCH', "You have a new match!");
        }

        return res.status(200).json({ success: true, message: 'Profile liked successfully' })

    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const unlikeProfile = async (req, res) => {

    try {
        const { profileId } = req.params;
        const userId = req.user.userId;
        if (!profileId || !mongoose.Types.ObjectId.isValid(profileId)) {
            return res.status(400).json({ message: 'Invalid profile ID' });
        }

        const unlikedUser = await User.findById(profileId)
        if (!unlikedUser) {
            return res.status(404).json({ message: 'Profile not found' });
        }

        const unlikerUser = await User.findOneAndUpdate(
            { _id: userId, likedProfiles: profileId },
            { $pull: { likedProfiles: profileId, matches: profileId } },
            { new: true }
        );

        if (!unlikerUser) {
            return res.status(400).json({ success: false, message: 'You have not liked this profile.' })
        }

        if (unlikedUser.matches.includes(userId)) {
            unlikedUser.matches.pull(userId)
            await unlikedUser.save()
            await deleteNotification(userId, profileId, 'MATCH')
            await deleteNotification(profileId, userId, 'MATCH')


        }
        await deleteNotification(userId, profileId, 'LIKE')

        return res.status(200).json({ success: true, message: 'Profile unliked successfully' });

    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};



export const getLikedProfiles = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { page = 1, limit = 20 } = req.query

        const user = await User.findById(userId).populate('likedProfiles');

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const startIndex = (pageNum - 1) * limitNum;
        const endIndex = pageNum * limitNum;

        const likedProfiles = user.likedProfiles.slice(startIndex, endIndex);
        const totalProfiles = user.likedProfiles.length;
        const totalPages = Math.ceil(totalProfiles / limitNum);
        const hasNextPage = pageNum < totalPages;
        const hasPrevPage = pageNum > 1;

        res.status(200).json({
            profiles: likedProfiles,
            currentPage: pageNum,
            totalPages: totalPages,
            totalProfiles: totalProfiles,
            hasNextPage: hasNextPage,
            hasPrevPage: hasPrevPage,
            nextPage: hasNextPage ? pageNum + 1 : null,
            prevPage: hasPrevPage ? pageNum - 1 : null
        });
    } catch (error) {
        console.error('Error fetching liked profiles:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

