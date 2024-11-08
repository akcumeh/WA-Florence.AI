const http = require('http');
const https = require('https');

// Configuration
const BOT_TOKEN = process.env.BOT_TOKEN;
const PORT = process.env.PORT || 3000;
const webhook = process.env.WEBHOOK_URL;

// Create HTTP server to receive webhook updates
const server = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url === `/webhook/${BOT_TOKEN}`) {
        let data = '';
        
        req.on('data', chunk => {
            data += chunk;
        });
        
        req.on('end', () => {
            try {
                const update = JSON.parse(data);
                handleUpdate(update);
                res.writeHead(200);
                res.end('OK');
            } catch (error) {
                console.error('Error processing update:', error);
                res.writeHead(500);
                res.end('Error');
            }
        });
    } else {
        res.writeHead(404);
        res.end('Not Found');
    }
});

// Handle incoming updates
function handleUpdate(update) {
    if (update.message) {
        const { message } = update;
        
        // Echo the received message back
        if (message.text) {
            sendMessage(message.chat.id, `You said: ${message.text}`);
        }
    }
}

// Send message to Telegram
function sendMessage(chatId, text) {
    const data = JSON.stringify({
        chat_id: chatId,
        text: text
    });

    const options = {
        hostname: 'api.telegram.org',
        port: 443,
        path: `/bot${BOT_TOKEN}/sendMessage`,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': data.length
        }
    };

    const req = https.request(options, res => {
        let responseData = '';
        
        res.on('data', chunk => {
            responseData += chunk;
        });
        
        res.on('end', () => {
            console.log('Message sent:', responseData);
        });
    });

    req.on('error', error => {
        console.error('Error sending message:', error);
    });

    req.write(data);
    req.end();
}

// Set webhook URL (run this once)
function setWebhook(url) {
    const webhookData = JSON.stringify({
        url: `${url}/webhook`
    });

    const options = {
        hostname: 'api.telegram.org',
        port: PORT,
        path: `/bot${BOT_TOKEN}/setWebhook`,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': webhookData.length
        }
    };

    const req = https.request(options, res => {
        let data = '';
        
        res.on('data', chunk => {
            data += chunk;
        });
        
        res.on('end', () => {
            console.log('Webhook set response:', data);
        });
    });

    req.on('error', error => {
        console.error('Error setting webhook:', error);
    });

    req.write(webhookData);
    req.end();
}

// Start the server
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

setWebhook(webhook);