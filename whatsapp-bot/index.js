const express = require('express');
const bodyParser = require('body-parser');
const { MessagingResponse } = require('twilio').twiml;
const { Configuration, OpenAIApi } = require('openai');
require('dotenv').config();

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));

const configuration = new Configuration({
    apiKey: process.env.OpenAI_API_Key,
});
const openai = new OpenAIApi(configuration);

app.post('/whatsapp', (req, res) => {
    const twiml = new MessagingResponse();
    const message = req.body.Body;

    try {
        const response = await openai.createChatCompletion({
            model: "gpt-4.0",
            messages: [{
                role: "user",
                content: message,
            }],
        });

        const botResponse = response.data.choices[0].message.content;

        twiml.message(botResponse);
    } catch (error) {
        console.error("Error with OpenAI API. Please try again later.\n", error);
        twiml.message("Sorry, there was an issue processing your request. This service is still under construction.");
    };

    res.writeHead(200, { "Content-Type": 'text/xml' });
    res.end(twiml.toString());
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Server is running on port ${port}.`);
});