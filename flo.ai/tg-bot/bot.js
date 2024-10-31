const https = require('https');
const { send } = require('process');
const token = process.env.BOT_TOKEN;
const tg_api = `https://api.telegram.org/bot${token}/`;
const PORT = process.env.PORT || 3000;
const server = https.createServer((req, res) => {
    if ((req.method === 'POST') && (req.url === '/webhook')) {
        let data = '';
        
        req.on('data', (chunk) => {
            data += chunk.toString();
        });

        req.on('end', () => {
            handleUpdate(JSON.parse(data));
            res.end("OK");
        });
    } else {
        res.writeHead(404);
        res.end();
    };
});

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

// function getUpdates() {
//     //xyz
// };

function sendMessage(chatId, text) {
    const url = `${tg_api}sendMessage?chat_id=${chatId}&text=${encodeURIComponent(text)};`;

    https.get(url, (res) => {
        let data = '';

        res.on('data', (chunk) => {
            data += chunk;
        });

        res.on('end', () => {
            console.log('Message sent:', data);
        });
    }).on('error', (err) => {
        console.error('Error sending message:', err.message);
    });
};

function handleUpdate(update) {
    const message = update.message;

    if (message && (message.text)) {
        const chatId = message.chat.id;
        const text = message.text;

        if (text == '/start') {
            sendMessage(chatId, 'Hello there, welcome! I am Florence*.');
        } else if (text == '/about') {
            sendMessage(chatId, 'Florence* is your educational companion.');
        } else {
            sendMessage(chatId, `Sorry, this service is still under construction. Here's what you said:\n\n${text}`)
        };
    };
};

function setWebHook() {
    const url = `https://api.telegram.org/bot${token}/setWebhook?url=${process.env.WEBHOOK_URL}`;

    https.get(url, (res) => {
        res.on('data', (d) => {
            process.stdout.write(d);
        });
    }).on('error', (e) => {
        console.error(e);
    });
}

setWebHook();