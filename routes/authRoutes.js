import express from 'express'
import { registerUser, sendOTP, verifyOTP } from '../controllers/authController.js'

const router = express.Router()

router.route("/sendOTP")
    .post(sendOTP)
router.route("/verifyOTP")
    .post(verifyOTP)
router.route("/registerUser")
    .post(registerUser)


export default router
