 // routes/telegram.js
import express from 'express';
import Anthropic from '@anthropic-ai/sdk';
import axios from 'axios';
import pdf from 'pdf-parse';
import { setTimeout } from 'timers/promises';

const router = express.Router();

// Configuration
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const WEBHOOK_URL = process.env.WEBHOOK_URL;

// Database
const telegramDb = new Map();
const paymentRequests = new Map();

// Initialize Anthropic client
const anthropic = new Anthropic({
    apiKey: process.env.TELEGRAM_ANTHROPIC_API_KEY,
});

// Helper Functions
async function sendTelegramMessage(chatId, text, parse_mode = 'HTML') {
    try {
        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            chat_id: chatId,
            text,
            parse_mode
        });
    } catch (error) {
        console.error('Error sending Telegram message:', error);
        throw error;
    }
}

async function getFile(fileId) {
    try {
        const response = await axios.get(
            `https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileId}`
        );
        return response.data.result;
    } catch (error) {
        console.error('Error getting file:', error);
        throw error;
    }
}

async function downloadFile(filePath) {
    try {
        const response = await axios.get(
            `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`,
            { responseType: 'arraybuffer' }
        );
        return response.data;
    } catch (error) {
        console.error('Error downloading file:', error);
        throw error;
    }
}

async function claudeMessage(content) {
    try {
        const claudeMsg = await anthropic.messages.create({
            model: "claude-3-sonnet-20240229",
            max_tokens: 1024,
            system: "You are Florence*, a highly knowledgeable teacher on every subject. Help people gain a deeper understanding on any topic.",
            messages: [{ role: "user", content }]
        });
        return claudeMsg.content[0].text;
    } catch (error) {
        console.error('Error in Claude message:', error);
        throw error;
    }
}

// User Management
function addUser(user) {
    const userData = {
        id: user.id,
        first_name: user.first_name,
        last_name: user.last_name || '',
        username: user.username || '',
        language_code: user.language_code || '',
        streak: 0,
        tokens: 10,
        lastActive: new Date()
    };
    telegramDb.set(user.id, userData);
    return userData;
}

function getUser(id) {
    return telegramDb.get(id);
}

// Message Handlers
async function handleCommand(command, msg) {
    const user = getUser(msg.from.id);

    switch (command) {
        case '/start':
            return `Hello ${msg.from.first_name}, welcome to Florence*! What do you need help with today?\n\nYou have ${user.tokens} tokens.`;

        case '/about':
            return `Florence* is the educational assistant at your fingertips. More info here: <link>.`;

        case '/tokens':
            return `You have ${user.tokens} tokens. To top up, send /payments.`;

        case '/streak':
            return `Your current streak is ${user.streak}.\n\nSend a message every day to keep it going!`;

        case '/payments':
            paymentRequests.set(user.id, new Date());
            return 'Tokens cost 1000 naira for 10. Make your payments here:\n\nhttps://flutterwave.com/pay/jinkrgxqambh\n\nthen send the proof of payment (PDFs only) to get your tokens.';

        default:
            return null;
    }
}

async function handleDocument(msg) {
    const user = getUser(msg.from.id);
    const document = msg.document;

    if (!document.mime_type || document.mime_type !== 'application/pdf') {
        return 'Please send a PDF file for payment verification.';
    }

    const requestTimestamp = paymentRequests.get(user.id);
    if (!requestTimestamp) {
        return 'Please use /payments command first before sending proof of payment.';
    }

    try {
        await sendTelegramMessage(msg.chat.id, 'Verifying payment proof...');
        const file = await getFile(document.file_id);
        const pdfData = await downloadFile(file.file_path);

        const verificationResult = await verifyPaymentProof(pdfData, requestTimestamp);

        if (verificationResult.valid) {
            user.tokens += 10;
            telegramDb.set(user.id, user);
            paymentRequests.delete(user.id);
            return 'Payment verified! 10 tokens have been added to your account.';
        } else {
            return `Payment verification failed: ${verificationResult.reason}`;
        }
    } catch (error) {
        console.error('Error processing payment:', error);
        return 'Error processing payment proof. Please try again or contact support.';
    }
}

async function handleMessage(msg) {
    const user = getUser(msg.from.id);
    const photos = msg.photo || [];

    if (photos.length > 5) {
        return 'Please send a maximum of 5 attachments at a time.';
    }

    const requiredTokens = photos.length > 0 ? 2 * photos.length : 1;
    if (user.tokens < requiredTokens) {
        return 'You do not have enough tokens for this request. Top up with /payments.';
    }

    try {
        user.tokens -= requiredTokens;
        telegramDb.set(user.id, user);

        await sendTelegramMessage(msg.chat.id, 'Processing your request...');

        let messageForClaude = msg.text || '';
        if (photos.length > 0) {
            messageForClaude = `${messageForClaude}\n[Image analysis will be implemented soon]`;
        }

        return await claudeMessage(messageForClaude);
    } catch (error) {
        console.error('Error processing message:', error);
        user.tokens += requiredTokens;
        telegramDb.set(user.id, user);

        if (error.message === 'IMAGE_PROCESSING_DISABLED') {
            return 'Image processing is currently not available. Please send text messages only.';
        }
        return 'Sorry, there was an error processing your request. Please try again.';
    }
}

// Main webhook handler
router.post('/', express.json(), async (req, res) => {
    try {
        const msg = req.body.message;
        if (!msg) {
            return res.sendStatus(200); // Ignore non-message updates
        }

        // Initialize user if new
        if (!getUser(msg.from.id)) {
            addUser(msg.from);
            await sendTelegramMessage(msg.chat.id, `
Hello there! Welcome to Florence*, your educational assistant at your fingertips.

Interacting with Florence* costs you tokens*. Every now and then you'll get these, but you can also purchase more of them at any time.

You currently have 10 tokens*. Feel free to send your text (one token*), images (two tokens*), or documents (two tokens*) and get answers immediately.

Here are a few helpful commands for a smooth experience:

/start - Florence* is now listening to you.
/about - for more about Florence*.
/tokens - see how many tokens you have left.
/streak - see your streak.
/payments - Top up your tokens* in a click.

Please note: Every message except commands will be considered a prompt.
            `);
        }

        let response;
        if (msg.text && msg.text.startsWith('/')) {
            response = await handleCommand(msg.text, msg);
        } else if (msg.document) {
            response = await handleDocument(msg);
        } else {
            response = await handleMessage(msg);
        }

        if (response) {
            await sendTelegramMessage(msg.chat.id, response);
        }

        res.sendStatus(200);
    } catch (error) {
        console.error('Error handling webhook:', error);
        res.sendStatus(500);
    }
});

// Set webhook on startup
async function setWebhook() {
    try {
        const webhookUrl = `${WEBHOOK_URL}/telegram`;
        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`, {
            url: webhookUrl
        });
        console.log('Telegram webhook set successfully');
    } catch (error) {
        console.error('Error setting webhook:', error);
    }
}

setWebhook();

export { router as telegramRouter };