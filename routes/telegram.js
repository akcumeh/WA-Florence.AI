const express = require('express');
const { Telegraf } = require('telegraf');
const { default: axios } = require('axios');
const pdf = require('pdf-parse');
require('dotenv').config();

const BOT_TOKEN = process.env.BOT_TOKEN;
const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;
const PORT = process.env.PORT || 4000;
const WEBHOOK_URL = process.env.WEBHOOK_URL;

const { setTimeout } = require('timers/promises');

// Implement retry logic for webhook setup
async function setWebhookWithRetry(bot, webhookUrl, maxRetries = 5, initialDelay = 5000) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            await bot.telegram.setWebhook(webhookUrl);
            console.log(`Webhook successfully set to: ${webhookUrl}`);
            return true;
        } catch (error) {
            console.error(`Attempt ${attempt}/${maxRetries} failed to set webhook:`, error.message);

            if (attempt === maxRetries) {
                console.error('Max retries reached. Continuing without webhook setup...');
                return false;
            }

            // Exponential backoff: wait longer between each retry
            const delay = initialDelay * Math.pow(2, attempt - 1);
            console.log(`Retrying in ${delay / 1000} seconds...`);
            await setTimeout(delay);
        }
    }
}

if (!BOT_TOKEN) throw new Error("BOT_TOKEN is required in .env");
if (!CLAUDE_API_KEY) throw new Error("CLAUDE_API_KEY is required in .env");

const bot = new Telegraf(BOT_TOKEN);
const app = express();

// In-memory database (you might want to switch to a real database later)
const floDb = new Map();
const paymentRequests = new Map(); // Store timestamps of payment requests

// Claude API client
const claudeClient = axios.create({
    baseURL: 'https://api.anthropic.com/v1',
    headers: {
        'Content-Type': 'application/json',
        'x-api-key': CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01'
    }
});

// User management functions
async function newUserWalkthru(tgId, tokens) {
    await createMessage(
        `Hello there! Welcome to Florence*, your educational assistant at your fingertips.\n\n` +
        `Interacting with Florence* costs you tokens*. Every now and then you'll get these, ` +
        `but you can also purchase more of them at any time.\n\n` +
        `You currently have ${tokens} tokens*. Feel free to send your text (one token*), ` +
        `images (two tokens*), or documents (two tokens*) and get answers immediately.\n\n` +
        `Here are a few helpful commands for a smooth experience:\n\n` +
        `/start - Florence* is now listening to you.\n` +
        `/about - for more about Florence*.\n` +
        `/tokens - see how many tokens you have left.\n` +
        `/streak - see your streak.\n` +
        `/payments - Top up your tokens* in a click.\n\n` +
        `Please note: Every message except commands will be considered a prompt.`,
        tgId
    );
}
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
    floDb.set(user.id, userData);
    console.log(`User added: ${user.id}`);
    return userData;
}

function getUser(tgId) {
    return floDb.get(tgId);
}

// Message handling functions
async function createMessage(newMsg, tgId) {
    try {
        await bot.telegram.sendMessage(tgId, newMsg);
    } catch (error) {
        console.error('Error sending message:', error);
        throw error;
    }
}

async function askClaude(message) {
    try {
        const response = await claudeClient.post('/messages', {
            model: 'claude-3-sonnet-20240229',
            max_tokens: 1024,
            messages: [{
                role: 'user',
                content: message
            }],
            system: "You are a highly knowledgeable teacher on every subject. Your name is Florence*."
        });

        // The response structure has changed
        return response.data.content[0].text;
    } catch (error) {
        console.error('Error calling Claude API:', error.response?.data || error.message);
        throw error;
    }
};

async function verifyPaymentProof(pdfBuffer, requestTimestamp) {
    try {
        const data = await pdf(pdfBuffer);
        const text = data.text.toLowerCase();

        // Keywords to look for in the PDF
        const keywords = ['payment', 'flutterwave', 'florence', '1000'];
        const hasKeywords = keywords.some(keyword => text.includes(keyword));

        // Extract timestamp from PDF (this is a simplified example)
        const dateRegex = /\d{2}[-/]\d{2}[-/]\d{4}/g;
        const dates = text.match(dateRegex);

        if (!dates || !hasKeywords) {
            return {
                valid: false,
                reason: !dates ? 'No valid date found' : 'Missing required payment information'
            };
        }

        // Convert found date to timestamp and compare
        const paymentDate = new Date(dates[0]);
        if (paymentDate < requestTimestamp) {
            return {
                valid: false,
                reason: 'Payment proof predates payment request'
            };
        }

        return {
            valid: true,
            date: paymentDate
        };
    } catch (error) {
        console.error('Error verifying PDF:', error);
        return {
            valid: false,
            reason: 'Error processing PDF'
        };
    }
}

// Middleware
app.use(bot.webhookCallback('/telegram'));

bot.use((ctx, next) => {
    console.log('Incoming message:', ctx.message);
    if (!ctx.from.is_bot) {
        let user = getUser(ctx.from.id);
        if (!user) {
            user = addUser(ctx.from);
            newUserWalkthru(user.id, user.tokens);
        }
        // Update last active timestamp
        user.lastActive = new Date();
        floDb.set(user.id, user);
    }
    return next();
});

// Bot commands
bot.command('about', (ctx) => {
    ctx.reply(`Florence* is the educational assistant at your fingertips. More info here: <link>.`);
});

bot.command('tokens', (ctx) => {
    const user = getUser(ctx.from.id);
    ctx.reply(`You have ${user.tokens} tokens. To top up, send /payments.`);
});

bot.command('streak', (ctx) => {
    const user = getUser(ctx.from.id);
    ctx.reply(`Your current streak is ${user.streak}.\n\nSend a message every day to keep it going!`);
});

bot.command('start', (ctx) => {
    const user = getUser(ctx.from.id);
    ctx.reply(`Hello ${ctx.from.first_name}, welcome to Florence*! What do you need help with today?\n\nYou have ${user.tokens} tokens.`);
});

bot.command('payments', (ctx) => {
    const user = getUser(ctx.from.id);
    paymentRequests.set(user.id, new Date());
    ctx.reply(
        'Tokens cost 1000 naira for 10. Make your payments here:\n\n' +
        'https://flutterwave.com/pay/jinkrgxqambh\n\n' +
        'then send the proof of payment (PDFs only) to get your tokens.'
    );
});

// Handle PDF uploads for payment verification
bot.on('document', async (ctx) => {
    const user = getUser(ctx.from.id);
    const document = ctx.message.document;

    if (!document.mime_type || document.mime_type !== 'application/pdf') {
        return ctx.reply('Please send a PDF file for payment verification.');
    }

    const requestTimestamp = paymentRequests.get(user.id);
    if (!requestTimestamp) {
        return ctx.reply('Please use /payments command first before sending proof of payment.');
    }

    try {
        ctx.reply('Verifying payment proof...');
        const file = await ctx.telegram.getFile(document.file_id);
        const response = await axios.get(`https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`, {
            responseType: 'arraybuffer'
        });

        const verificationResult = await verifyPaymentProof(response.data, requestTimestamp);

        if (verificationResult.valid) {
            user.tokens += 10;
            floDb.set(user.id, user);
            paymentRequests.delete(user.id);
            ctx.reply('Payment verified! 10 tokens have been added to your account.');
        } else {
            ctx.reply(`Payment verification failed: ${verificationResult.reason}`);
        }
    } catch (error) {
        console.error('Error processing payment proof:', error);
        ctx.reply('Error processing payment proof. Please try again or contact support.');
    }
});

// Handle regular messages
bot.on('message', async (ctx) => {
    if (ctx.message.document) return; // Skip if it's a document (handled above)

    const user = getUser(ctx.from.id);
    const photos = ctx.message.photo || [];

    // Validate number of attachments first
    if (photos.length > 5) {
        return ctx.reply('Please send a maximum of 5 attachments at a time.');
    }

    // Check token balance
    const requiredTokens = photos.length > 0 ? 2 * photos.length : 1;
    if (user.tokens < requiredTokens) {
        return ctx.reply('You do not have enough tokens for this request. Top up with /payments.');
    }

    try {
        // Only deduct tokens right before processing
        user.tokens -= requiredTokens;
        floDb.set(user.id, user);

        await ctx.reply('Processing your request...');

        // Prepare message for Claude
        let messageForClaude = ctx.message.text || '';
        if (photos.length > 0) {
            // Add photo processing logic here when implemented
            messageForClaude = `${messageForClaude}\n[Image analysis will be implemented soon]`;
        }

        // Get response from Claude
        const response = await askClaude(messageForClaude);
        ctx.reply(response);

    } catch (error) {
        console.error('Error processing message:', error);

        // Handle specific error cases
        if (error.message === 'IMAGE_PROCESSING_DISABLED') {
            ctx.reply('Image processing is currently not available. Please send text messages only.');
        } else {
            ctx.reply('Sorry, there was an error processing your request. Please try again.');
        }

        // Refund tokens on error
        user.tokens += requiredTokens;
        floDb.set(user.id, user);
    }
});

// Start Express server
app.listen(PORT, async () => {
    console.log(`Server is running on port ${PORT}. Telegram`);
    const webhookUrl = `${WEBHOOK_URL}/telegram`;

    // Try to set up webhook with retry logic
    const webhookSuccess = await setWebhookWithRetry(bot, webhookUrl);

    if (!webhookSuccess) {
        // Fall back to long polling if webhook setup fails
        console.log('Falling back to long polling...');
        bot.launch().catch(error => {
            console.error('Error launching bot:', error);
        });
    }
});

// Add graceful shutdown handling
process.once('SIGINT', () => {
    bot.stop('SIGINT');
});

process.once('SIGTERM', () => {
    bot.stop('SIGTERM');
});