from flask import Flask, request, jsonify
import openai
import requests
import logging

app = Flask(__name__)

# Configure logging
logging.basicConfig(level=logging.INFO)

openai.api_key = "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"
bot_token = "8176471076:AAE5DBP8c01HzF5xwp7JY-XBC_cY8xRnSwM"


def send_message(chat_id, msg):
    """
    Sends a message to a Telegram user or group.
    """

    url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
    payload = {'chat_id': chat_id, 'text': msg}
    response = requests.post(url, json=payload)
    return response.json()


def answer_inline_query(inline_query_id, results):
    """
    For inline queries to the bot.
    """
    url = f"https://api.telegram.org/bot{bot_token}/answerInlineQuery"
    payload = {
        "inline_query_id": inline_query_id,
        "results": results
    }
    response = requests.post(url, json=payload)
    return response.json()


def call_ai_api(message_text):
    try:
        response = openai.ChatCompletion.create(
            model="gpt-3.5-turbo",
            messages=[
                {"role": "system", "content": "You are a helpful assistant."},
                {"role": "user", "content": message_text}
            ]
        )
        return response.choices[0].message['content'].strip()
    except Exception as e:
        logging.error(f"Error calling OpenAI API: {str(e)}")
        return "I'm sorry, I'm having trouble processing your request right now."

@app.route('/webhook', methods=['POST'])


def webhook():
    """
    Telegram Webhook to process all bot activity.
    """
    try:
        update = request.get_json()
        logging.info(f"Received update: {update}")

        if "message" in update:
            chat_id = update['message']['chat']['id']
            message_text = update['message']['text']

            if message_text == "/start":
                response = "Hello! I'm Florence. How may I assist you today?"
            elif message_text == "/about":
                response = "Florence* is an edtech AI assistant."
            else:
                response = call_ai_api(message_text)

            send_result = send_message(chat_id, response)
            logging.info(f"Send message result: {send_result}")

        elif "inline_query" in update:
            inline_query_id = update["inline_query"]["id"]
            query = update["inline_query"]["query"]
            results = [{
                "type": "article",
                "id": "1",
                "title": "Sorry, this doesn't quite work right now.",
                "input_message_content": {"message_text": "Sorry!"},
                "reply_markup": {"inline_keyboard": [{"text": "Visit Florence*", "url": "https://t.me/FlorenceAIBot"}]}
            }]

            answer_result = answer_inline_query(inline_query_id, results)
            logging.info(f"Answer inline query result: {answer_result}")

        return jsonify({"status": "ok"}), 200

    except Exception as e:
        logging.error(f"Error in webhook: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True)