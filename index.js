// Imports & Integrations
import express from 'express';
import fetch from 'node-fetch';
import bodyParser from 'body-parser';
import twilio from 'twilio';
import dotenv from 'dotenv';
import telegramRouter from './routes/telegram.js';

dotenv.config();

import Anthropic from '@anthropic-ai/sdk';

// Setup
const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
    default_headers: {
        "anthropic-beta": "pdfs-2024-09-25"
    }
});

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = twilio(accountSid, authToken);

// Database
var floDb = new Array();

// Handy Functions
/**
 * Check if a user is new based on WaId
 * @param {string} WaId - WhatsApp ID
 * @returns {boolean}
 */
function isNewUser(WaId) {
    return floDb.filter(item => item.WaId === WaId).length === 0;
}

/**
 * Add a new user to the database
 * @param {string} WaId - WhatsApp ID
 * @param {string} ProfileName 
 * @param {number} tokens 
 * @param {number} streak 
 * @param {string} referralId 
 */
function addUser(WaId, ProfileName, tokens, streak, referralId = `${ProfileName[0]}${WaId}`) {
    floDb.push({
        WaId,
        ProfileName,
        tokens,
        referralId,
        streak,
        lastTokenReward: new Date().toISOString(),
        lastActivity: new Date().toISOString(),
        streakDate: new Date().toISOString(),
        conversationHistory: [] // Add this to store message history
    });
}

/**
 * Get user by WhatsApp ID
 * @param {string} WaId - WhatsApp ID
 * @returns {Object|undefined}
 */
function getUser(WaId) {
    return floDb.find(item => item.WaId === WaId);
}

/**
 * Send a WhatsApp message
 * @param {string} newMsg 
 * @param {string} WaId 
 */
async function createMessage(newMsg, WaId) {
    try {
        const message = await client.messages.create({
            body: newMsg,
            from: "whatsapp:+14155238886",
            to: `whatsapp:+${WaId}`,
        });
        return message;
    } catch (error) {
        console.error('Error sending message:', error);
        throw error;
    }
}

/**
 * Send welcome message to new users
 * @param {string} WaId 
 * @param {number} tokens 
 */
async function newUserWalkthru(WaId, tokens) {
    await createMessage(
        `Hello there! Welcome to Florence*, your educational assistant at your fingertips.\n\n` +
        `Interacting with Florence* costs you *tokens**. Every now and then you'll get these, ` +
        `but you can also purchase more of them at any time.\n\n` +
        `You currently have ${tokens} tokens*. Feel free to send your text (one token*), ` +
        `images (two tokens*), or documents (two tokens*) and get answers immediately.\n\n` +
        `Here are a few helpful commands for a smooth experience:\n\n` +
        `*/start* - Florence* is now listening to you.\n` +
        `*/about* - for more about Florence*.\n` +
        `*/tokens* - see how many tokens you have left.\n` +
        `*/streak* - see your streak.\n` +
        `*/payments* - Top up your tokens* in a click.\n\n` +
        `*Please note:* Every other message will be considered a prompt.`,
        WaId
    );
}

/**
 * Send message to Claude
 * @param {Array} messages 
 * @returns {Promise<string>}
 */
async function claudeMessage(messages, user) {
    try {
        // Add conversation history to the context
        const fullContext = [
            ...user.conversationHistory,
            ...messages
        ].slice(-10); // Keep last 10 messages for context

        const claudeMsg = await anthropic.messages.create({
            model: "claude-3-5-sonnet-20241022",
            max_tokens: 1024,
            system: "You are Florence*, a highly knowledgeable teacher on every subject. You help people gain a deeper understanding on any topic. Respond with a clear and detailed, but not necessarily long explanation. Remember previous context from the conversation when responding.",
            messages: fullContext
        });

        // Store the interaction in conversation history
        user.conversationHistory.push(...messages, {
            role: "assistant",
            content: claudeMsg.content[0].text
        });

        // Keep conversation history manageable
        if (user.conversationHistory.length > 20) {
            user.conversationHistory = user.conversationHistory.slice(-20);
        }

        return claudeMsg.content[0].text;
    } catch (error) {
        console.error('Error in Claude message:', error);
        throw error;
    }
}

/**
 * Convert URL to base64
 * @param {string} url 
 * @returns {Promise<string>}
 */
async function getBase64FromUrl(url) {
    try {
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        return buffer.toString('base64');
    } catch (error) {
        console.error('Error fetching image:', error);
        throw error;
    }
}

/**
 * Validate media type
 * @param {string} mediaType 
 * @returns {boolean}
 */
function isValidMediaType(mediaType) {
    const validTypes = [
        'image/jpeg',
        'image/png',
        'image/gif',
        'image/webp',
        'application/pdf'
    ];
    return validTypes.includes(mediaType.toLowerCase());
}

/**
 * Determine media type from URL or content type
 * @param {string} url 
 * @param {string|undefined} contentType 
 * @returns {string}
 */
function determineMediaType(url, contentType) {
    // If content type is provided directly
    if (contentType) {
        const normalizedType = contentType.toLowerCase();
        const typeMap = {
            'jpeg': 'image/jpeg',
            'jpg': 'image/jpeg',
            'png': 'image/png',
            'gif': 'image/gif',
            'webp': 'image/webp',
            'pdf': 'application/pdf'
        };

        for (const [key, value] of Object.entries(typeMap)) {
            if (normalizedType.includes(key)) {
                return value;
            }
        }
    }

    // If determining from URL
    const extension = url.split('.').pop().toLowerCase();
    const mimeTypes = {
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'png': 'image/png',
        'gif': 'image/gif',
        'webp': 'image/webp',
        'pdf': 'application/pdf'
    };

    return mimeTypes[extension] || 'image/jpeg'; // default to jpeg if unable to determine
}

/**
 * Enhanced function to handle image and document analysis
 * @param {Array<{url: string, contentType: string}>} mediaItems 
 * @param {string} prompt 
 * @param {Object} user 
 * @returns {Promise<string>}
 */
async function claudeMessageWithAttachment(mediaItems, prompt, user) {
    try {
        const attachmentPromises = mediaItems.map(async ({ url, contentType }) => {
            const mediaType = determineMediaType(url, contentType);

            // Validate media type before processing
            if (!isValidMediaType(mediaType)) {
                throw new Error(`Unsupported media type: ${mediaType}. Supported types are: JPEG, PNG, GIF, WebP, and PDF`);
            }

            const base64Data = await getBase64FromUrl(url);

            return {
                type: "image",
                source: {
                    type: "base64",
                    media_type: mediaType,
                    data: base64Data
                }
            };
        });

        const attachments = await Promise.all(attachmentPromises);

        const message = {
            role: "user",
            content: [
                ...attachments,
                {
                    type: "text",
                    text: prompt || "Please analyze this attachment."
                }
            ]
        };

        // Add conversation history for context
        const fullContext = [
            ...user.conversationHistory,
            message
        ].slice(-10);

        const claudeMsg = await anthropic.messages.create({
            model: "claude-3-5-sonnet-20241022",
            max_tokens: 1024,
            system: "You are Florence*, a highly knowledgeable teacher who helps analyze images and documents. Provide clear, detailed explanations about what you see.",
            messages: fullContext
        });

        // Store the interaction in conversation history
        user.conversationHistory.push(message, {
            role: "assistant",
            content: claudeMsg.content[0].text
        });

        // Keep conversation history manageable
        if (user.conversationHistory.length > 20) {
            user.conversationHistory = user.conversationHistory.slice(-20);
        }

        return claudeMsg.content[0].text;
    } catch (error) {
        console.error('Error in claudeMessageWithAttachment:', error);

        // Provide more user-friendly error message
        if (error.message.includes('Unsupported media type')) {
            return "Sorry, I can only process images (JPEG, PNG, GIF, WebP) and PDF documents. Please try again with a supported file type.";
        }

        if (error.message.includes('Could not process image')) {
            return "Sorry, I couldn't process that image. This might be because the file is too large or corrupted. Please try sending a different image or the same image in a different format.";
        }

        throw error;
    }
}

/**
 * Check and update user's token rewards
 * @param {Object} user - User object
 * @returns {number} - Number of tokens awarded
 */
function checkAndUpdateTokenRewards(user) {
    const now = new Date();
    const lastReward = new Date(user.lastTokenReward);
    const hoursSinceLastReward = (now - lastReward) / (1000 * 60 * 60);
    
    let tokensAwarded = 0;
    
    // Award tokens every 8 hours
    if ((hoursSinceLastReward >= 8) && (user.tokens <= 4)) {
        const rewardCount = Math.floor(hoursSinceLastReward / 8);
        tokensAwarded = rewardCount * 10;
        user.tokens += tokensAwarded;
        user.lastTokenReward = now.toISOString();
    }
    
    return tokensAwarded;
}

/**
 * Check and update user's streak
 * @param {Object} user - User object
 * @returns {Object} - Streak information
 */
function checkAndUpdateStreak(user) {
    const now = new Date();
    const lastActivity = new Date(user.lastActivity);
    const streakDate = new Date(user.streakDate);
    
    // Reset streak if more than 48 hours have passed since last activity
    if ((now - lastActivity) > (48 * 60 * 60 * 1000)) {
        user.streak = 0;
        user.streakDate = now.toISOString();
        return { streakBroken: true, streakReward: 0 };
    }
    
    // Check if it's a new day (different date from streak date)
    if (now.toDateString() !== streakDate.toDateString()) {
        user.streak += 1;
        user.streakDate = now.toISOString();
        
        // Award tokens for streak milestones (multiples of 10)
        if (user.streak % 10 === 0) {
            user.tokens += 10;
            return { streakBroken: false, streakReward: 10 };
        }
    }
    
    return { streakBroken: false, streakReward: 0 };
}

/**
 * Update user's activity timestamps
 * @param {Object} user - User object
 */
function updateUserActivity(user) {
    user.lastActivity = new Date().toISOString();
}

// Application
const app = express();

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.post('/whatsapp', async (req, res) => {
    let { WaId, MessageType, ProfileName, Body, NumMedia, MediaUrl0, MediaContentType0 } = req.body;

    try {
        if (isNewUser(WaId)) {
            addUser(WaId, ProfileName, 25, 0);
            await createMessage(`A new user, ${ProfileName} (+${WaId}) has joined Florence*.`, '2348164975875');
            await createMessage(`A new user, ${ProfileName} (+${WaId}) has joined Florence*.`, '2348143770724');

            await newUserWalkthru(WaId, getUser(WaId).tokens);
        } else {
            const user = getUser(WaId);
            if (!user) {
                throw new Error(`User ${WaId} not found in database`);
            }

            const tokenReward = checkAndUpdateTokenRewards(user);
            if (tokenReward > 0) {
                await createMessage(
                    `You've earned ${tokenReward} tokens for staying active! 🎉`,
                    WaId
                );
            }

            switch (Body) {
                case '/start':
                    // Reset conversation history on /start
                    user.conversationHistory = [];
                    await createMessage(
                        `Hello ${ProfileName}, welcome to Florence*! What do you need help with today?\n\n` +
                        `You have ${user.tokens} tokens.`,
                        WaId
                    );
                    break;
                    
                case '/about':
                    console.log('Informing the user.');
                    await createMessage(
                        `Florence* is the educational assistant at your fingertips. More info here: <link>.`,
                        WaId
                    );
                    break;
                    
                case '/payments':
                    console.log('payment!');
                    await createMessage(
                        `Tokens cost 1000 naira for 10. Make your payments here:\n\n` +
                        `https://flutterwave.com/pay/jinkrgxqambh`,
                        WaId
                    );
                    break;
                    
                case '/tokens':
                    await createMessage(
                        `Hey ${ProfileName.split(' ')[0]}, you have ${user.tokens} tokens.`,
                        WaId
                    );

                    if (user.tokens <= 4) {
                        await createMessage(
                            `You are running low on tokens. Top up by sending /payments.`,
                            WaId
                        );
                    }
                    break;
                
                case '/streak':
                    await createMessage(
                        `Hey ${ProfileName.split(' ')[0]}, you are on a ${user.streak}-day streak. Send one prompt a day to keep it going!`,
                        WaId
                    );
                    break;
                
                default:
                    console.log('Processing user message with Claude API');
                    await createMessage(`Processing your request...`, WaId);
                    if (user.tokens <= 0) {
                        await createMessage(
                            `You've run out of tokens. Please purchase more using /payments`,
                            WaId
                        );
                        break;
                    }

                    updateUserActivity(user);
                    const { streakBroken, streakReward } = checkAndUpdateStreak(user);

                    if (streakReward > 0) {
                        await createMessage(
                            `🔥 Congratulations! You've maintained a ${user.streak}-day streak! ` +
                            `You've earned ${streakReward} bonus tokens! 🎉`,
                            WaId
                        );
                    }

                    if (MessageType === 'image' || MessageType === 'document') {
                        if (parseInt(NumMedia) > 5) {
                            await createMessage(
                                `Sorry, we can't handle that many images/documents right now. ` +
                                `Please send 5 or fewer at a time.`,
                                WaId
                            );
                        } else {
                            user.tokens -= 2;
                            const mediaItems = [
                                {
                                    url: MediaUrl0,
                                    contentType: MediaContentType0
                                }
                            ].filter(item => item.url);

                            const claudeResponse = await claudeMessageWithAttachment(mediaItems, Body, user);
                            await createMessage(claudeResponse, WaId);
                        }
                    } else if (MessageType === 'text') {
                        user.tokens -= 1;
                        const claudeResponse = await claudeMessage([{ role: "user", content: Body }], user);
                        await createMessage(claudeResponse, WaId);
                    }
            }
        }

        res.status(200).send('Request processed successfully');
    } catch (error) {
        console.error('Error processing request:', error);
        res.status(500).send('An error occurred while processing your request');
    }
});

app.use('/telegram', telegramRouter);

// Start the server
const port = process.env.PORT;
app.listen(port, () => {
    console.log(`Server is running on port ${port}. WhatsApp`);
});