const express = require("express");
import("node-fetch");
const axios = require("axios");
const path = require("path");
const port = process.env.port || 5500;

const app = express();

const tg_api = "https://api.telegram.org/bot" + process.env.bot_token;

// webhook
const init = async () => {
    const res = await fetch(tg_api + "/setWebhook?url=https://tg-bot-2-ihmn7nq6q-angels-projects-9ba5ac71.vercel.app/webhook");
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

app.listen(port, async () => {
    console.log("Server is running on port 3000");
    await init();
});

bot.command("start", ctx=> {
    console.log(ctx.from);
    bot.telegram.sendMessage(ctx.chat.id, "Hello there! Welcome to Florence AI! Ask me something...", {})
});

bot.command("about", ctx=> {
    console.log(ctx.from);
    bot.telegram.sendMessage(ctx.chat.id, "Florence AI is an edtech AI.", {});
});

bot.on(String, ctx=> {
    console.log(ctx.from);
    ai_response = "Sorry, this functionality has not been set up yet. Please check later!"; // openai ai_response
    bot.telegram.sendMessage(ctx.chat.id, ai_response, {});
});

<<<<<<< HEAD:Telegram Chatbot/api/index.js
// app.use(bot.webhookCallback("/webhook"));
// bot.telegram.setWebhook("https://tg-bot-2-ndtd8jd5j-angels-projects-9ba5ac71.vercel.app");
=======
app.use(bot.webhookCallback("/webhook"));
bot.telegram.setWebhook("https://tg-bot-2-ndtd8jd5j-angels-projects-9ba5ac71.vercel.app/webhook");
>>>>>>> parent of 488b853 (flask attempt restart):tg-bot-2/index.js

bot.launch()