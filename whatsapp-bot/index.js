const express = require('express');
const bodyParser = require('body-parser');
const twilio = require('twilio');

require('dotenv').config();
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = twilio(accountSid, authToken);

var floDb = new Array();

function isNewUser(WaId) {
    return ((floDb.filter(item => item.WaId === WaId)).length === 0)
};

// ??????????
function addNewUser(WaId, ProfileName, tokens, referralId=`${ProfileName[0]+WaId}`, streak) {
    floDb.push({WaId, ProfileName, tokens, referralId, streak});
};

// This function sends a message to the user at WaId.
/** @param
 * 
 */
async function createMessage(newMsg, WaId) {
    const message = await client.messages.create({
        body: newMsg,
        from: "whatsapp:+14155238886",
        to: "whatsapp:+" + WaId,
    });
}

async function changeProfileName(WaId, buttonContents) {
    const buttonMessage = await client.messages.create({
        contentSid: 'HX3282e6a1fab39e47675f1ab69e39b38e',
        contentVariables: JSON.stringify(buttonContents),
        from: "whatsapp:+14155238886",
        to: "whatsapp:+" + WaId,
    });

    console.log(buttonMessage.to[10]);
};

async function newUserWalkthru(WaId) {
    await createMessage(`Hello there! Welcome to Florence! Feel free to send Florence a question at any time.\n\n\nInteracting with Florence costs you *tokens**. Every now and then you'll get these as you interact with Florence. You can also purchase more of them at any time. You currently have ${tokens} tokens.\n\n\nFlorence* is your educational assistant at your fingertips. Feel free to send your text, images, or documents and get answers immediately.`, WaId);

    await changeProfileName(WaId, {
        1: 'Choose a new name:',
        2: 'Not now, I\'m fine with my name'
    });
};

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));


app.post('/whatsapp', async (req, res) => {
    let { WaId, MessageType, ProfileName, Body } = req.body;
    let tokens = 10;
    let streak = 0;
    
    if (isNewUser(WaId)) {
        addNewUser(parseInt(WaId), ProfileName);
        await createMessage(`A new user, ${ProfileName} (${'+'+WaId}) has joined Florence*.`, 2348164975875);
        await createMessage(`A new user, ${ProfileName} (${'+'+WaId}) has joined Florence*.`, 2348143770724);

        await createMessage(`Hello ${ProfileName}, welcome to Florence*! What do you need help with today?\n\n\nYou have ${tokens} tokens.`, WaId);

        console.dir(floDb);


        await newUserWalkthru(WaId);

        if (MessageType=='button') {
            if (Body == buttonContents[1]) {
                await createMessage('Type your preferred name.');
                ProfileName = Body;
                console.log(floDb[WaId]);
            };
        };
    } else {
        console.log('Is not a new user.');
        await createMessage(`Hello again, ${ProfileName}. You currently have ${tokens} tokens. What would you like to do today?`);
    };



    // res.writeHead(200, { "Content-Type": 'text/xml' });
    // res.end(twiml.toString());
    res.send('HIIIIIIII.', 200);
});

const port = process.env.PORT
console.log(port);

app.listen(port, () => {
    console.log(`Server is running on port ${port}.`);
});

