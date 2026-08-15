const db = require("../models");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const crypto = require("crypto");
const bcrypt = require("bcrypt");
const validator = require("validator");
const rateLimit = require("express-rate-limit");
const { getFirebaseAuth } = require("../services/firebase");
const { isAtLeastAge, parseBirthday } = require("../utils/age");
require("dotenv").config();

const { Users, Credentials, UserSessions, PasswordResetTokens, Psychologist } =
    db;

function safeUser(user) {
    return {
        user_id: user.user_id,
        email: user.email,
        name: user.name,
        birthday: user.birthday,
        profile_photo_url: user.profile_photo_url,
        role: user.credentials.role,
    };
}

async function createFirebaseSessionToken(user, transaction, preferredUid) {
    if (!user.credentials) {
        throw new Error("User credentials could not be loaded");
    }

    const firebaseUid = user.credentials.firebase_uid
        || preferredUid
        || `mentalq-user-${user.user_id}`;
    if (!user.credentials.firebase_uid) {
        await user.credentials.update(
            { firebase_uid: firebaseUid },
            { transaction }
        );
    }

    return getFirebaseAuth().createCustomToken(firebaseUid, {
        app_user_id: String(user.user_id),
        role: user.credentials.role,
    });
}

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD,
    },
});

async function sendVerificationEmail(email, token) {
    const verificationLink = `${process.env.FRONTEND_URL}/verify-email/${token}`;

    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: email,
        subject: "Verify Your Email",
        html: `
            <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                <div style="text-align: center; background-color: #f4f4f4; padding: 20px;">
                    <h2 style="color: #555;">Email Verification</h2>
                </div>
                <div style="padding: 20px; background-color: #fff; border: 1px solid #ddd;">
                    <p>Hello,</p>
                    <p>Please verify your email by clicking the button below:</p>
                    <div style="text-align: center; margin: 20px 0;">
                        <a href="${verificationLink}" style="
                            display: inline-block; 
                            padding: 10px 20px; 
                            background-color: #4CAF50; 
                            color: white; 
                            text-decoration: none; 
                            border-radius: 5px;
                            font-weight: bold;
                        ">Verify Email</a>
                    </div>
                    <p>This link will expire in 1 hour. If you did not create an account, you can ignore this email.</p>
                    <p>Thank you,</p>
                    <p>The Support Team</p>
                </div>
                <div style="text-align: center; background-color: #f4f4f4; padding: 10px; color: #777; font-size: 12px;">
                    <p>&copy; 2024 MentalQ. All rights reserved.</p>
                </div>
            </div>
        `,
    };

    await transporter.sendMail(mailOptions);
}

exports.registerUser = async (req, res) => {
    const { email, password, name, birthday } = req.body;
    let t;

    try {
        if (!email || !password || !name || !birthday) {
            return res.status(400).json({
                error: true,
                message: "All fields are required",
            });
        }

        const birthdayDate = parseBirthday(birthday);

        if (!birthdayDate) {
            return res.status(400).json({
                error: true,
                message: "Invalid birthday format",
            });
        }
        if (!isAtLeastAge(birthdayDate, 18)) {
            return res.status(400).json({
                error: true,
                message: "You must be at least 18 years old to use MentalQ",
            });
        }
        t = await db.sequelize.transaction();

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const emailVerificationToken = crypto.randomBytes(32).toString("hex");
        const emailVerificationExpires = Date.now() + 3600000;

        const existingUser = await Users.findOne({
            where: { email },
            transaction: t,
        });
        if (existingUser) {
            await t.rollback();
            return res.status(400).json({
                error: true,
                message: "Email is already registered",
            });
        }

        const newCredentials = await Credentials.create(
            {
                email,
                password: hashedPassword,
                email_verification_token: emailVerificationToken,
                email_verification_expires: emailVerificationExpires,
            },
            { transaction: t }
        );

        await Users.create(
            {
                credentials_id: newCredentials.credentials_id,
                email,
                name,
                birthday: birthdayDate,
            },
            { transaction: t }
        );

        await sendVerificationEmail(email, emailVerificationToken);

        await t.commit();

        res.status(201).json({
            error: false,
            message:
                "User registered successfully! Please check your email to verify your account.",
        });
    } catch (error) {
        if (t) await t.rollback();
        res.status(400).json({ error: true, message: error.message });
    }
};

exports.registerPsikologi = async (req, res) => {
    const {
        email,
        password,
        name,
        birthday,
        prefix_title,
        suffix_title,
        certificate,
        price,
    } = req.body;
    let t;

    try {
        if (
            !email ||
            !password ||
            !name ||
            !birthday ||
            !prefix_title ||
            !suffix_title ||
            !certificate ||
            !price
        ) {
            return res.status(400).json({
                error: true,
                message: "All fields are required",
            });
        }

        const birthdayDate = parseBirthday(birthday);

        if (!birthdayDate) {
            return res.status(400).json({
                error: true,
                message: "Invalid birthday format",
            });
        }
        if (!isAtLeastAge(birthdayDate, 18)) {
            return res.status(400).json({
                error: true,
                message: "You must be at least 18 years old to use MentalQ",
            });
        }

        t = await db.sequelize.transaction();

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const emailVerificationToken = crypto.randomBytes(32).toString("hex");
        const emailVerificationExpires = Date.now() + 3600000;

        const existingUser = await Users.findOne({
            where: { email },
            transaction: t,
        });
        if (existingUser) {
            await t.rollback();
            return res.status(400).json({
                error: true,
                message: "Email is already registered",
            });
        }

        const newCredentials = await Credentials.create(
            {
                email,
                password: hashedPassword,
                email_verification_token: emailVerificationToken,
                email_verification_expires: emailVerificationExpires,
                role: "psychologist",
            },
            { transaction: t }
        );

        const user = await Users.create(
            {
                credentials_id: newCredentials.credentials_id,
                email,
                name,
                birthday: birthdayDate,
            },
            { transaction: t }
        );

        await Psychologist.create(
            {
                user_id: user.user_id,
                prefix_title,
                suffix_title,
                certificate,
                price,
            },
            { transaction: t }
        );

        await sendVerificationEmail(email, emailVerificationToken);
        await t.commit();

        res.status(201).json({
            error: false,
            message:
                "User registered successfully! Please check your email to verify your account.",
        });
    } catch (error) {
        if (t) await t.rollback();
        res.status(400).json({ error: true, message: error.message });
    }
};

exports.verifyEmail = async (req, res) => {
    const { token } = req.params;

    try {
        const credentials = await Credentials.findOne({
            where: {
                email_verification_token: token,
                email_verification_expires: { [db.Sequelize.Op.gt]: Date.now() }
            }
        });

        if (!credentials) {
            return res.render('email-register-verification', {
                status: 'error',
                message: 'Invalid or expired verification token'
            });
        }

        credentials.is_email_verified = true;
        credentials.email_verification_token = null;
        credentials.email_verification_expires = null;
        await credentials.save();

        res.render('email-register-verification', {
            status: 'success',
            message:
                'Email verified successfully! You can now open MentalQ App and login'
        });
    } catch (error) {
        res.render('email-register-verification', {
            status: 'error',
            message: error.message
        });
    }
};

exports.loginUser = async (req, res) => {
    const { email, password } = req.body;
    let t;

    try {
        if (!email || !password) {
            return res.status(400).json({
                error: true,
                message: 'Email and password are required'
            });
        }

        t = await db.sequelize.transaction();

        const user = await Users.findOne({
            where: { email },
            include: 'credentials',
            transaction: t,
        });

        if (!user) {
            await t.rollback();
            return res.status(404).json({
                error: true,
                message: 'User not found'
            });
        }

        if (!user.credentials.is_email_verified) {
            await t.rollback();
            return res.status(401).json({
                error: true,
                message: 'Email is not verified'
            });
        }

        const validPassword = await bcrypt.compare(
            password,
            user.credentials.password
        );

        if (!validPassword) {
            await t.rollback();
            return res.status(401).json({
                error: true,
                message: 'Invalid password'
            });
        }

        const token = jwt.sign(
            { user_id: user.user_id },
            process.env.TOKEN_SECRET
        );

        await UserSessions.upsert(
            {
                user_id: user.user_id,
                session_token: token
            },
            { transaction: t }
        );

        const firebaseCustomToken = await createFirebaseSessionToken(user, t);

        await t.commit();

        res.status(200).json({
            error: false,
            message: 'User logged in successfully',
            user: safeUser(user),
            token,
            firebase_custom_token: firebaseCustomToken,
        });
    } catch (error) {
        if (t && !t.finished) await t.rollback();
        res.status(400).json({
            error: true,
            message: error.message
        });
    }
};

exports.authFirebase = async (req, res) => {
    const { firebaseToken } = req.body;
    let t;

    try {
        if (!firebaseToken) {
            return res.status(400).json({
                error: true,
                message: 'Firebase token is required',
            });
        }

        const firebaseAuth = getFirebaseAuth();
        const decodedToken = await firebaseAuth.verifyIdToken(firebaseToken, true);
        const { email, name, picture } = decodedToken;
        if (!email || decodedToken.email_verified !== true) {
            return res.status(401).json({
                error: true,
                message: 'Google account email is not verified',
            });
        }

        t = await db.sequelize.transaction();
        let user = await Users.findOne({
            where: { email },
            include: 'credentials',
            transaction: t,
        });

        if (!user) {
            const newCredentials = await Credentials.create(
                {
                    email: email,
                    firebase_uid: decodedToken.uid,
                    is_email_verified: true,
                    role: 'user'
                },
                { transaction: t }
            );

            user = await Users.create(
                {
                    credentials_id: newCredentials.credentials_id,
                    email,
                    name: name || email.split('@')[0],
                    profile_photo_url: picture
                },
                { transaction: t }
            );

            user = await Users.findByPk(user.user_id, {
                include: 'credentials',
                transaction: t,
            });
        }

        const token = jwt.sign(
            { user_id: user.user_id },
            process.env.TOKEN_SECRET
        );

        await UserSessions.upsert(
            {
                user_id: user.user_id,
                session_token: token
            },
            { transaction: t }
        );

        const firebaseCustomToken = await createFirebaseSessionToken(
            user,
            t,
            decodedToken.uid
        );
        await t.commit();

        res.status(200).json({
            error: false,
            message: 'User logged in successfully',
            user: safeUser(user),
            token,
            firebase_custom_token: firebaseCustomToken,
        });
    } catch (error) {
        if (t && !t.finished) await t.rollback();
        res.status(400).json({
            error: true,
            message: error.message
        });
    }
};

exports.createFirebaseToken = async (req, res) => {
    let t;

    try {
        t = await db.sequelize.transaction();
        const user = await Users.findByPk(req.user_id, {
            include: 'credentials',
            transaction: t,
        });
        if (!user) {
            await t.rollback();
            return res.status(404).json({ error: true, message: 'User not found' });
        }

        const firebaseCustomToken = await createFirebaseSessionToken(user, t);
        await t.commit();
        return res.status(200).json({
            error: false,
            firebase_custom_token: firebaseCustomToken,
        });
    } catch (error) {
        if (t && !t.finished) await t.rollback();
        return res.status(500).json({ error: true, message: error.message });
    }
};

const generateOTP = () => {
    return crypto.randomInt(100000, 1000000).toString();
};

const sendOTPEmail = async (email, otp) => {
    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: email,
        subject: 'Password Reset OTP',
        html: `
            <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                <div style="text-align: center; background-color: #f4f4f4; padding: 20px;">
                    <h2 style="color: #555;">Password Reset Request</h2>
                </div>
                <div style="padding: 20px; background-color: #fff; border: 1px solid #ddd;">
                    <p>Hello,</p>
                    <p>Your OTP for resetting your password is:</p>
                    <div style="text-align: center; margin: 20px 0;">
                        <span style="font-size: 24px; font-weight: bold; color: #333;">${otp}</span>
                    </div>
                    <p>This OTP will expire in 15 minutes. Please use it to complete your password reset request.</p>
                    <p>If you did not make this request, you can ignore this email.</p>
                    <p>Thank you,</p>
                    <p>The Support Team</p>
                </div>
                <div style="text-align: center; background-color: #f4f4f4; padding: 10px; color: #777; font-size: 12px;">
                    <p>&copy; 2024 MentalQ. All rights reserved.</p>
                </div>
            </div>
        `,
    };

    await transporter.sendMail(mailOptions);
};

const otpRequestLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 3,
    message: {
        error: true,
        message: 'Too many OTP requests. Please try again later.',
    },
});

exports.requestPasswordReset = [otpRequestLimiter, async (req, res) => {
    const { email } = req.body;
    let t;

    try {
        if (!email) {
            return res.status(400).json({
                error: true,
                message: 'Email is required',
            });
        }

        if (!validator.isEmail(email)) {
            return res.status(400).json({
                error: true,
                message: 'Invalid email format',
            });
        }

        t = await db.sequelize.transaction();

        const user = await Users.findOne({
            where: { email },
            transaction: t,
        });

        if (!user) {
            await t.rollback();
            return res.status(404).json({
                error: true,
                message: 'User not found',
            });
        }

        const otp = generateOTP();
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

        await PasswordResetTokens.upsert(
            {
                user_id: user.user_id,
                token: otp,
                expiresAt: expiresAt,
            },
            { transaction: t }
        );

        await sendOTPEmail(email, otp);

        await t.commit();

        res.json({
            error: false,
            message: 'Password reset OTP has been sent to your email',
        });
    } catch (error) {
        if (t) await t.rollback();
        res.status(500).json({
            error: true,
            message: error.message,
        });
    }
}];

exports.verifyOTP = [otpRequestLimiter, async (req, res) => {
    const { email, otp } = req.body;
    let t;

    try {
        if (!email || !otp) {
            return res.status(400).json({
                error: true,
                message: 'Email and OTP are required',
            });
        }

        if (!validator.isEmail(email)) {
            return res.status(400).json({
                error: true,
                message: 'Invalid email format',
            });
        }

        t = await db.sequelize.transaction();

        const user = await Users.findOne({
            where: { email },
            transaction: t,
        });

        if (!user) {
            await t.rollback();
            return res.status(404).json({
                error: true,
                message: 'User not found',
            });
        }

        const resetToken = await PasswordResetTokens.findOne({
            where: {
                user_id: user.user_id,
                token: otp,
                expiresAt: {
                    [db.Sequelize.Op.gt]: new Date(),
                },
            },
            transaction: t,
        });

        if (!resetToken) {
            await t.rollback();
            return res.status(400).json({
                error: true,
                message: 'Invalid or expired OTP',
            });
        }

        await t.commit();

        res.json({
            error: false,
            message: 'OTP verified successfully',
        });
    } catch (error) {
        if (t) await t.rollback();
        res.status(500).json({
            error: true,
            message: error.message,
        });
    }
}];

exports.resetPassword = async (req, res) => {
    const { email, otp, newPassword } = req.body;
    let t;
 
    try {
       if (!email || !otp || !newPassword) {
          return res.status(400).json({
             error: true,
             message: "Email, OTP, and new password are required",
          });
       }
 
       if (!validator.isEmail(email)) {
          return res.status(400).json({
             error: true,
             message: "Invalid email format",
          });
       }
 
       if (
          newPassword.length < 8 ||
          !/[A-Z]/.test(newPassword) ||
          !/\d/.test(newPassword)
       ) {
          return res.status(400).json({
             error: true,
             message:
                "Password must be at least 8 characters long, include an uppercase letter, and a number",
          });
       }
 
       try {
          t = await db.sequelize.transaction();
       } catch (error) {
          console.error("Failed to start database transaction:", error);
          return res.status(500).json({
             error: true,
             message: "Failed to process the request. Please try again later.",
          });
       }
 
       let user;
       try {
          user = await Users.findOne({
             where: { email },
             include: "credentials",
             transaction: t,
          });
       } catch (error) {
          console.error("Database error while finding user:", error);
          await t.rollback();
          return res.status(500).json({
             error: true,
             message: "An error occurred while finding the user.",
          });
       }
 
       if (!user) {
          await t.rollback();
          return res.status(404).json({
             error: true,
             message: "User not found",
          });
       }
 
       let resetToken;
       try {
          resetToken = await PasswordResetTokens.findOne({
             where: {
                user_id: user.user_id,
                token: otp,
                expiresAt: {
                   [db.Sequelize.Op.gt]: new Date(),
                },
             },
             transaction: t,
          });
       } catch (error) {
          console.error("Database error while finding reset token:", error);
          await t.rollback();
          return res.status(500).json({
             error: true,
             message: "An error occurred while validating the OTP.",
          });
       }
 
       if (!resetToken) {
          await t.rollback();
          return res.status(400).json({
             error: true,
             message: "Invalid or expired OTP",
          });
       }
 
       let hashedPassword;
       try {
          const salt = await bcrypt.genSalt(10);
          hashedPassword = await bcrypt.hash(newPassword, salt);
       } catch (error) {
          console.error("Error while hashing the password:", error);
          await t.rollback();
          return res.status(500).json({
             error: true,
             message: "Failed to reset the password. Please try again later.",
          });
       }
 
       try {
          await user.credentials.update(
             { password: hashedPassword },
             { transaction: t }
          );
       } catch (error) {
          console.error("Error while updating user credentials:", error);
          await t.rollback();
          return res.status(500).json({
             error: true,
             message: "Failed to update the password. Please try again later.",
          });
       }
 
       try {
          await PasswordResetTokens.destroy({
             where: { user_id: user.user_id },
             transaction: t,
          });
       } catch (error) {
          console.error("Error while deleting the reset token:", error);
          await t.rollback();
          return res.status(500).json({
             error: true,
             message: "Failed to complete the password reset process.",
          });
       }
 
       try {
          await t.commit();
       } catch (error) {
          console.error("Error while committing the transaction:", error);
          return res.status(500).json({
             error: true,
             message: "An error occurred while finalizing the password reset.",
          });
       }
 
       try {
          const mailOptions = {
             from: process.env.EMAIL_USER,
             to: email,
             subject: "Password Reset Successful",
             html: `
                     <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                         <h2>Password Reset Successful</h2>
                         <p>Your password has been reset successfully. If you did not perform this action, please contact support immediately.</p>
                     </div>
                 `,
          };
          await transporter.sendMail(mailOptions);
       } catch (error) {
          console.error("Error while sending confirmation email:", error);
          return res.status(500).json({
             error: true,
             message:
                "Password reset succeeded, but failed to send confirmation email.",
          });
       }
 
       res.json({
          error: false,
          message: "Password has been reset successfully",
       });
    } catch (error) {
       console.error("Unhandled error during password reset:", error);
       if (t) await t.rollback();
       res.status(500).json({
          error: true,
          message: "An unexpected error occurred while resetting the password.",
       });
    }
};
