from flask import Flask, request
import openai
import requests

app = Flask(__name__)
openai.api_key = "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"

@app.route('/webhook', methods=['POST'])


def webhook():
    update = request.get_json()
    if "message" in update:
        chat_id = update['message']['chat']['id']
        message_text = update['message']['text']

        #AI API
        ai_response = "This is currently being worked on. Please check back!" # call_ai_api(message_text)

        #Telegram API response
        send_message(chat_id, ai_response)

        return '', 200



def call_ai_api(message_text):
    response = openai.Completion.create(
        engine="davinci",
        prompt=message_text,
        max_tokens=100
    )

    return response.choices[0].text.strip()


def send_message(chat_id, msg):
    token = "8176471076:AAEUjHiy6ZD5KHK88CU6G34WWfYVAkZq26E"
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    payload = {'chat_id': chat_id, 'text': msg}
    requests.post(url, json=payload)


if __name__ == '__main__':
    app.run(debug=True)