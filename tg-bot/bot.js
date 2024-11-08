require('dotenv').config();
const https = require('https');
const { send, listeners } = require('process');
const token = process.env.BOT_TOKEN;
const tg_api = `https://api.telegram.org/bot${token}/`;
const PORT = process.env.PORT || 3000;
const server = https.createServer((req, res) => {
    if ((req.method === 'POST') && (req.url === '/webhook')) {
        console.log('Received webhook request'); // Add this debug log
        let data = '';
        
        req.on('data', (chunk) => {
            data += chunk.toString();
        });

        req.on('end', () => {
            try {
                console.log('Received update data:', data); // Add this debug log
                handleUpdate(JSON.parse(data));
                res.end("OK");
            } catch (error) {
                console.error('Error processing update:', error);
                res.writeHead(500);
                res.end("Error processing update");
            }
        });        
    } else {
        console.log('Received non-webhook request:', req.method, req.url); // Add this debug log
        res.writeHead(404);
        res.end();
    };
});

function handleUpdate(update) {
    console.log('Processing update:', update); // Add this debug log
    const message = update.message;
    
    if (message && (message.text)) {
        const chatId = message.chat.id;
        const text = message.text;
        
        console.log('Received message:', text, 'from chat:', chatId); // Add this debug log
        
        if (text == '/start') {
            sendMessage(chatId, 'Hello there, welcome! I am Florence*.');
            console.log("User entered a preset command, ", text);
        } else if (text == '/about') {
            sendMessage(chatId, 'Florence* is your educational companion.');
            console.log("User entered a preset command, ", text);
        } else {
            sendMessage(chatId, `Sorry, this service is still under construction. Here's what you said:\n\n${text}`)
        };
    };
};

function sendMessage(chatId, text) {
    const url = `${tg_api}sendMessage?chat_id=${chatId}&text=${encodeURIComponent(text)}`;
    console.log('Sending message to URL:', url); // Add this debug log
    
    https.get(url, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
            data += chunk;
        });
        
        res.on('end', () => {
            console.log('Message sent response:', data); // Modified this log
        });
    }).on('error', (err) => {
        console.error('Error sending message:', err.message);
    });
};

function checkWebhook() {
    const url = `https://api.telegram.org/bot${token}/getWebhookInfo`;
    
    https.get(url, (res) => {
        let data = '';
        res.on('data', (chunk) => {
            data += chunk.toString();
        });
        res.on('end', () => {
            console.log('webhook set.\n');
        });
    }).on('error', (e) => {
        console.error('Error checking webhook:', e);
    });
}

async function startBot() {
    try {
        await new Promise((resolve, reject) => {
            const webhookUrl = `${process.env.WEBHOOK_URL}/webhook`;
            const url = `https://api.telegram.org/bot${token}/setWebhook?url=${encodeURIComponent(webhookUrl)}`;
            
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
        });
    } catch (error) {
        console.error('Failed to start bot:', error);
        process.exit(1);
    }
}

startBot();
setTimeout(checkWebhook, 500);