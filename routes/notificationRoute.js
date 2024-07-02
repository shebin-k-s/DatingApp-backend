import express from 'express'
import { getNotifications, setFcmToken, updateNotificationStatus } from '../controllers/notificationController.js'

const router = express.Router()


router.route('/')
    .get(getNotifications)

router.route('/changeStatus')
    .put(updateNotificationStatus)

router.route('/set-fcmtoken')
    .put(setFcmToken)

export default router