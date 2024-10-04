const express = require("express");
const fetch = require("node-fetch");
const axios = require("axios");
const path = require("path");
const port = process.env.PORT || 3000;

const app = express();

const bot_token = "8176471076:AAE5DBP8c01HzF5xwp7JY-XBC_cY8xRnSwM";
const tg_api = "https://api.telegram.org/bot" + bot_token;

// webhook
const init = async () => {
    const res = await fetch("${tg_api}/setWebhook?url=https://tg-bot-2-k0bic325d-angels-projects-9ba5ac71.vercel.app/webhook");
    const data = await res.json();
    console.log(data);
}

app.use(express.static("static"))
app.use(express.json());
require("dotenv").config();

const { Telegraf } = require("telegraf");
const bot = new Telegraf(process.env.bot_token);

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

app.post("/webhook", async (req, res) => {
    const { message } = req.body;
    if (message) {
        const chatId = message.chat.id;
        const text = message.text;

        // reply
        //fetch(`${tg_api}/sendMessage?chat_id=${chatId}&text=${text}`);
        fetch(`${tg_api}/sendMessage`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                chat_id: chatId,
                text: text
            })
        });
    };

    res.sendStatus(200);
});

app.listen(3000, async () => {
    console.log("Server is running on port 3000");
    await init();
});

bot.command("start", ctx=> {
    console.log(ctx.from);
    bot.telegram.sendMessage(ctx.chat.id, "Hello there! Welcome to Florence.AI! Ask me something...", {})
});

bot.command("about", ctx=> {
    console.log(ctx.from);
    bot.telegram.sendMessage(ctx.chat.id, message, {});
});

bot.launch()