import express from 'express'
import { addFavouriteProfile, editProfile, getFavouriteProfiles, getLikedProfiles, getPersonalDetails, getUser, likeProfile, removeFavouriteProfile, searchProfiles, unlikeProfile } from '../controllers/profileController.js'


const router = express.Router()

router.route('/')
    .get(getPersonalDetails)

router.route('/getProfile/:profileId')
    .get(getUser)

router.route('/like')
    .post(likeProfile)

router.route('/unlkike')
    .post(unlikeProfile)

router.route('/likedProfiles')
    .get(getLikedProfiles)

router.route("/edit")
    .put(editProfile)

router.route("/search")
    .get(searchProfiles)

router.route('/favourite')
    .get(getFavouriteProfiles)
router.route('/addFavourite')
    .post(addFavouriteProfile)

router.route('/removeFavourite/:profileId')
    .delete(removeFavouriteProfile)





export default router
