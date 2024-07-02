import express from 'express'
import { getConversation, getMessagedProfiles, sendMessage } from "../controllers/messageController.js"

const router = express.Router()


router.route('/send')
    .post(sendMessage)

router.route('/profiles')
    .get(getMessagedProfiles)

router.route('/conversation/:recipientId')
    .get(getConversation)


export default router