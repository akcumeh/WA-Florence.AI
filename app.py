from flask import Flask, request
import requests
import os

app = Flask(__name__)

TOKEN = os.environ.get("bot_token") # set bot_token in vercel env var
TG_API_URL = f"https://api.telegram.org/bot{TOKEN}"

@app.route('/webhook', methods=['POST'])
def webhook():
    data = request.json

    if "message" in data:
        chat_id = data['message']['chat']['id']
        text = data['message']['text']

        if text == '/start':
            send_message(chat_id, "Welcome to Florence AI.")
        elif text == '/about':
            send_message(chat_id, "Florence AI is your homework assistant.")
        else:
            send_message(chat_id, ai_response(text))
    
    return '', 200


def send_message(chat_id, text):
    url = f"{TG_API_URL}/sendMessage"
    payload = {
        'chat_id': chat_id,
        'text': text,
    }
    requests.post(url, json=payload)


if __name__ == '__main__':
    app.run(debug=True)

def ai_response(text):
    ai_response = "Sorry, this service doesn't work yet!"
    return ai_response



@app.route('/')
def home():
    return "You are Home.", 200