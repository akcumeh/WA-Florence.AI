const express = require('express');
const { Telegraf } = require('telegraf');
require('dotenv').config();

const BOT_TOKEN = process.env.BOT_TOKEN;
const PORT = process.env.PORT || 4000;
const WEBHOOK_URL = process.env.WEBHOOK_URL;

if (!BOT_TOKEN) throw new Error("BOT_TOKEN is required in .env");

const bot = new Telegraf(BOT_TOKEN);
const app = express();

var floDb = new Array();

// Handy Functions
/** 
 * Add user to database
 * @param {Object} user - Telegram user object
 * @returns {void}
*/
function addUser(user) {
    const userId = user.id;
    floDb.push({
        id: userId,
        first_name: user.first_name,
        last_name: user.last_name || '',
        username: user.username || '',
        language_code: user.language_code || '',
        streak: 0,
        tokens: 10
    });
    console.log(`User added: ${userId}`);
}

/**
 * Get user by Telegram ID
 * @param {string} tgId - Telegram ID
 * @returns {Object|undefined}
 */
function getUser(tgId) {
    return floDb.find(item => item.id === tgId);
}

/**
 * Send a Telegram message
 * @param {string} newMsg 
 * @param {string} tgId 
 */
async function createMessage(newMsg, tgId) {
    try {
        await bot.telegram.sendMessage(tgId, newMsg);
    } catch (error) {
        console.error('Error sending message:', error);
        throw error;
    }
}

/**
 * Send welcome message to new users
 * @param {string} tgId 
 * @param {number} tokens 
 */
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
        `Please note: Every other message will be considered a prompt.`,
        tgId
    );
}


// Middleware for bot webhook
app.use(bot.webhookCallback('/webhook'));

try {
    bot.use((ctx, next) => {
        console.log(ctx.message);
        if (!ctx.from.is_bot && (getUser(ctx.from.id) === undefined)) {
            addUser(ctx.from);
            console.log(floDb);

            let user = getUser(ctx.from.id);

            newUserWalkthru(user.id, user.tokens);
        }
        return next();
    });

    let ai_response = '';

    // Bot Commands
    bot.start((ctx) => {
        ctx.reply(`Hello ${ctx.from.first_name}, welcome to Florence*! What do you need help with today?\n\n` + `You have ${getUser(ctx.from.id).tokens} tokens.`)
    });
    bot.command('about', (ctx) => {
        ctx.reply(`Florence* is the educational assistant at your fingertips. More info here: <link>.`)
    });
    bot.command('payments', (ctx) => {
        ctx.reply(`Tokens cost 1000 naira for 10. Make your payments here:\n\n` + `https://flutterwave.com/pay/jinkrgxqambh` + `\n\nthen send the proof of payment (PDFs only) to the bot to get your tokens.`);
        bot.on('message', (ctx) => {
            const documents = ctx.message.document;
            if (documents && documents.file_name.includes('.pdf') && documents.length === 1) {
                const user = getUser(ctx.from.id);
                user.tokens += 10;
                ctx.reply('Tokens added successfully!');
            } else {
                ctx.reply('Please send a PDF of your proof of payment.');
            };
        });
    });
    bot.command('streak', (ctx) => {
        ctx.reply(`Your current streak is ${getUser(ctx.from.id).streak}.\n\nSend a message every day to keep it going!`);
    });
    bot.command('tokens', (ctx) => {
        ctx.reply(`You have ${user.tokens} tokens. To top up, send /payments.`)
    });

    // Fallback for other messages
    bot.on('message', (ctx) => {
        const user = getUser(ctx.from.id);
        const photos = ctx.message.photo;
        const documents = ctx.message.document;
        if ((photos.length + documents.length > 5)) {
            ctx.reply('Please send a maximum of 5 attachments at a time.');
        } else {
            if ((photos.length > 0) || documents.length > 0) {
                if (user.tokens > (2 * (photos.length + documents.length))) {
                    user.tokens -= (2 * (photos.length + documents.length));
                    ctx.reply('Processing...');
                    ctx.reply(ai_response || 'Sorry, this service is still under construction.');
                } else {
                    ctx.reply('You do not have enough tokens for this request. Top up with /payments.');
                }
            } else {
                user.tokens -= 1;
                ctx.reply('Processing text...');
                ctx.reply(ai_response || 'Sorry, this service is still under construction.');
            }
        }
    });
} catch (e) {
    console.error('Error!', e);
}

// Start Express server
app.listen(PORT, async () => {
    console.log(`Server is running on port ${PORT}`);

    // Set webhook
    const webhookUrl = `${WEBHOOK_URL}/webhook`;
    await bot.telegram.setWebhook(webhookUrl);
    console.log(`Webhook set to: ${webhookUrl}`);
});
