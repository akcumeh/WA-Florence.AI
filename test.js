const { Configuration, OpenAIApi } = require("openai");
require("dotenv").config();

const configuration = new Configuration({
    apiKey: process.env.OpenAI_API_Key,
});

const openai = new OpenAIApi(configuration);

async function testOpenAI() {
    try {
        const response = await openai.createChatCompletion({
            model: "gpt-3.5-turbo",
            messages: [{
                role: "user",
                content: "Hello World!",
            }],
        });

        console.log(response.data.choices[0].message.content);
    } catch (error) {
        console.error("Error: ", error);
    };
};

testOpenAI();
console.log(Configuration);