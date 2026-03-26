const path = require('path');
// Load .env from server/ or project root
require('dotenv').config({ path: path.join(__dirname, '.env') });
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const express = require('express');
const nodemailer = require('nodemailer');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Serve static files from the parent directory (counttracker-pro)
app.use(express.static(path.join(__dirname, '..')));

// In-memory OTP storage (In production, use Redis or a DB with TTL)
const otpStore = {};

// Create SMTP transporter
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.SMTP_EMAIL,
        pass: process.env.SMTP_PASS
    }
});

// Generate a random 6-digit OTP
function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Endpoint: Send OTP
 * body: { email, type: 'register' | 'reset' }
 */
app.post('/api/otp/send', async (req, res) => {
    const { email, type } = req.body;
    if (!email) return res.status(400).json({ success: false, message: 'Email is required.' });

    const otp = generateOTP();
    const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes expiry

    otpStore[email] = { otp, expiresAt };

    const subject = type === 'register' ? 'Flow - Verification Code' : 'Flow - Password Reset Code';
    const message = `Your OTP code is: ${otp}. It will expire in 5 minutes.`;

    const mailOptions = {
        from: process.env.SMTP_EMAIL,
        to: email,
        subject: subject,
        text: message,
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
                <h2 style="color: #6366f1; text-align: center;">Flow</h2>
                <p>Hello,</p>
                <p>You requested a code for <strong>${type === 'register' ? 'Account Registration' : 'Password Reset'}</strong>.</p>
                <div style="background: #f3f4f6; padding: 15px; text-align: center; border-radius: 8px; margin: 20px 0;">
                    <span style="font-size: 24px; font-weight: bold; letter-spacing: 5px; color: #111827;">${otp}</span>
                </div>
                <p>This code will expire in 5 minutes. If you did not request this, please ignore this email.</p>
                <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
                <p style="font-size: 12px; color: #6b7280; text-align: center;">&copy; 2026 Flow. All rights reserved.</p>
            </div>
        `
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`OTP sent to ${email}: ${otp}`);
        res.json({ success: true, message: 'OTP sent successfully.' });
    } catch (error) {
        console.error('Error sending email:', error);
        res.status(500).json({ success: false, message: 'Failed to send OTP. Please try again later.' });
    }
});

/**
 * Endpoint: Verify OTP
 * body: { email, otp }
 */
app.post('/api/otp/verify', (req, res) => {
    const { email, otp } = req.body;

    if (!email || !otp) {
        return res.status(400).json({ success: false, message: 'Email and OTP are required.' });
    }

    const storedData = otpStore[email];
    if (!storedData) {
        return res.status(400).json({ success: false, message: 'No OTP found for this email.' });
    }

    if (Date.now() > storedData.expiresAt) {
        delete otpStore[email];
        return res.status(400).json({ success: false, message: 'OTP has expired.' });
    }

    if (storedData.otp === otp) {
        // OTP matches. We don't delete yet if the client needs to proceed with registration
        // (Usually you'd return a temporary token here, but for this simple POC, we'll just return success)
        res.json({ success: true, message: 'OTP verified successfully.' });
    } else {
        res.status(400).json({ success: false, message: 'Invalid OTP.' });
    }
});

// Cleanup expired OTPs every 10 minutes
setInterval(() => {
    const now = Date.now();
    for (const email in otpStore) {
        if (now > otpStore[email].expiresAt) {
            delete otpStore[email];
        }
    }
}, 10 * 60 * 1000);

// Serve index.html for the root path
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'index.html'));
});

// Catch-all handler for SPA routes
app.get(/^\/(?!api).*/, (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
