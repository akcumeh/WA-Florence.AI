import express from 'express';
import fetch from 'node-fetch'; // Changed to node-fetch
import bodyParser from 'body-parser';
import twilio from 'twilio';
import dotenv from 'dotenv';

dotenv.config();

import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
    default_headers: {
        "anthropic-beta": "pdfs-2024-09-25"
    }
});

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = twilio(accountSid, authToken);

var floDb = new Array();

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
function addNewUser(WaId, ProfileName, tokens, streak, referralId = `${ProfileName[0]}${WaId}`) {
    floDb.push({ WaId, ProfileName, tokens, referralId, streak });
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
        `images (two tokens*), or documents (two tokens*) and get answers immediately.\n\n`,
        WaId
    );
}

/**
 * Send message to Claude
 * @param {Array} messages 
 * @returns {Promise<string>}
 */
async function claudeMessage(messages) {
    try {
        const claudeMsg = await anthropic.messages.create({
            model: "claude-3-5-sonnet-20241022",
            max_tokens: 1024,
            system: "You are a highly knowledgeable teacher on every subject.",
            messages: messages,
        });

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
        const buffer = await response.buffer();
        return buffer.toString('base64');
    } catch (error) {
        console.error('Error fetching image:', error);
        throw error;
    }
}

/**
 * Determine media type from URL or content type
 * @param {string} url 
 * @param {string} contentType 
 * @returns {string}
 */
function determineMediaType(url, contentType) {
    if (contentType) return contentType;
    const extension = url.split('.').pop().toLowerCase();
    const mimeTypes = {
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'png': 'image/png',
        'gif': 'image/gif',
        'pdf': 'application/pdf',
        'doc': 'application/msword',
        'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    };
    return mimeTypes[extension] || 'application/octet-stream';
}

/**
 * Send message to Claude with attachments
 * @param {Array<string>} urls 
 * @param {string} prompt 
 * @returns {Promise<string>}
 */
async function claudeMessageWithAttachment(urls, prompt) {
    try {
        const attachmentPromises = urls.map(async (url) => {
            const imageData = await getBase64FromUrl(url);
            return {
                type: "image",
                source: {
                    type: "base64",
                    media_type: determineMediaType(url),
                    data: imageData
                }
            };
        });

        const attachments = await Promise.all(attachmentPromises);
        
        const claudeMsg = await anthropic.messages.create({
            model: "claude-3-5-sonnet-20241022",
            max_tokens: 1024,
            messages: [{
                role: "user",
                content: [
                    ...attachments,
                    {
                        type: "text",
                        text: prompt
                    }
                ]
            }]
        });

        return claudeMsg.content[0].text;
    } catch (error) {
        console.error('Error in claudeMessageWithAttachment:', error);
        throw error;
    }
}

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));

app.post('/whatsapp', async (req, res) => {
    let { WaId, MessageType, ProfileName, Body, NumMedia, MediaUrl0, MediaContentType0 } = req.body;

    console.log(req.body);

    try {
        if (isNewUser(WaId)) {
            addNewUser(WaId, ProfileName, 10, 0);
            await createMessage(`A new user, ${ProfileName} (+${WaId}) has joined Florence*.`, '2348164975875');
            console.dir(floDb);

            await newUserWalkthru(WaId, getUser(WaId).tokens);
        } else {
            const user = getUser(WaId);
            if (!user) {
                throw new Error(`User ${WaId} not found in database`);
            }

            switch(Body) {
                case '/start':
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
                    
                default:
                    console.log('Processing user message with Claude API');
                    if (user.tokens <= 0) {
                        await createMessage(
                            `You've run out of tokens. To top up, send /payments`,
                            WaId
                        );
                        break;
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
                            const urls = [MediaUrl0].filter(Boolean);
                            const claudeResponse = await claudeMessageWithAttachment(urls, Body);
                            await createMessage(claudeResponse, WaId);
                        }
                    } else if (MessageType === 'text') {
                        user.tokens -= 1;
                        const claudeResponse = await claudeMessage([{ role: "user", content: Body }]);
                        await createMessage(claudeResponse, WaId);
                    } else {
                        await createMessage(
                            `Sorry, this is a little too much for us to handle now. ` +
                            `Could you try simplifying your prompt?`,
                            WaId
                        );
                    }
            }
        }

        res.status(200).send('Request processed successfully');
    } catch (error) {
        console.error('Error processing request:', error);
        res.status(500).send('An error occurred while processing your request');
    }
});

const port = process.env.PORT;
app.listen(port, () => {
    console.log(`Server is running on port ${port}.`);
});