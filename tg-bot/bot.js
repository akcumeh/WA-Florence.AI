require('dotenv').config();
const https = require('https');

// Environment variables
const token = process.env.BOT_TOKEN;
const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;
const PORT = process.env.PORT || 4000;

const tg_api = `https://api.telegram.org/bot${token}/`;

// Create HTTPS server
const server = https.createServer((req, res) => {
    if ((req.method === 'POST') && (req.url === '/webhook')) {
        let data = '';
        
        req.on('data', (chunk) => {
            data += chunk.toString();
        });

        req.on('end', async () => {
            try {
                await handleUpdate(JSON.parse(data));
                res.end("OK");
            } catch (error) {
                console.error('Error processing update:', error);
                res.writeHead(500);
                res.end("Error processing update");
            }
        });        
    } else {
        res.writeHead(404);
        res.end();
    }
});

// Handle different commands and messages
async function handleUpdate(update) {
    const message = update.message;
    
    if (!message || !message.text) return;

    const chatId = message.chat.id;
    const text = message.text;
    
    console.log('Received message:', text, 'from chat:', chatId);
    
    // Handle commands
    if (text.startsWith('/')) {
        switch (text) {
            case '/start':
                await sendMessage(chatId, 'Welcome! I am your AI assistant powered by Claude. You can send me messages or use these commands:\n\n/tokens - Check your remaining tokens\n/payments - View payment information\n/about - Learn more about me\n/streak - View your current streak');
                break;
            case '/tokens':
                await sendMessage(chatId, 'You have 100 tokens remaining.'); // Replace with actual token logic
                break;
            case '/payments':
                await sendMessage(chatId, 'Visit our website to manage your payments and subscription.');
                break;
            case '/about':
                await sendMessage(chatId, 'I am an AI assistant powered by Claude. I can help you with various tasks and answer your questions.');
                break;
            case '/streak':
                await sendMessage(chatId, 'Your current streak is 5 days! 🔥'); // Replace with actual streak logic
                break;
            default:
                await sendMessage(chatId, 'Unknown command. Type /start to see available commands.');
        }
    } else {
        // Handle regular messages by sending them to Claude API
        try {
            const claudeResponse = await askClaude(text);
            await sendMessage(chatId, claudeResponse);
        } catch (error) {
            console.error('Error getting Claude response:', error);
            await sendMessage(chatId, 'Sorry, I encountered an error while processing your message. Please try again later.');
        }
    }
}

// Send message to Telegram
async function sendMessage(chatId, text) {
    return new Promise((resolve, reject) => {
        const url = `${tg_api}sendMessage?chat_id=${chatId}&text=${encodeURIComponent(text)}`;
        
        https.get(url, (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                console.log('Message sent successfully');
                resolve(data);
            });
        }).on('error', (err) => {
            console.error('Error sending message:', err.message);
            reject(err);
        });
    });
}

// Function to interact with Claude API
async function askClaude(message) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'api.anthropic.com',
            path: '/v1/messages',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': CLAUDE_API_KEY,
                'anthropic-version': '2023-06-01'
            }
        };

        const requestData = JSON.stringify({
            model: 'claude-3-opus-20240229',
            max_tokens: 1024,
            messages: [{
                role: 'user',
                content: message
            }]
        });

        const req = https.request(options, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                try {
                    const response = JSON.parse(data);
                    if (response.content && response.content[0] && response.content[0].text) {
                        resolve(response.content[0].text);
                    } else {
                        reject(new Error('Invalid response format from Claude API'));
                    }
                } catch (error) {
                    reject(error);
                }
            });
        });

        req.on('error', (error) => {
            reject(error);
        });

        req.write(requestData);
        req.end();
    });
}

// Setup webhook and start server
async function startBot() {
    try {
        const webhookUrl = `${process.env.WEBHOOK_URL}/webhook`;
        const url = `https://api.telegram.org/bot${token}/setWebhook?url=${encodeURIComponent(webhookUrl)}`;
        
        await new Promise((resolve, reject) => {
            https.get(url, (res) => {
                let data = '';
                res.on('data', (chunk) => {
                    data += chunk.toString();
                });
                res.on('end', () => {
                    const response = JSON.parse(data);
                    if (response.ok) {
                        resolve();
                    } else {
                        reject(new Error(response.description));
                    }
                });
            }).on('error', reject);
        });

        server.listen(PORT, () => {
            console.log(`Server running on port ${PORT}`);
            console.log('Webhook set successfully');
        });
    } catch (error) {
        console.error('Failed to start bot:', error);
        process.exit(1);
    }
}

// Start the bot
startBot();