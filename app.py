import os
import json
import uuid
import datetime
from flask import Flask, render_template, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()

app = Flask(__name__)
app.secret_key = os.getenv("SECRET_KEY", "aqlli-chatbot-secret-2026")
CORS(app)

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
os.makedirs(DATA_DIR, exist_ok=True)

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "")

SYSTEM_PROMPT = """Sen Aqlli ChatBot - O'zbek tilidagi aqlli AI yordamchisan.
Sen foydalanuvchilarga har qanday savollarda yordam berasan:
- Bilim va ma'lumot berish
- Muammolarni hal qilish
- Ijodiy yozish va tarjima
- Matematika va fan
- Dasturlash va texnologiya
- Hayot maslahatlari

Sen doim samimiy, foydali va aniq javob berasan.
O'zbek tilida so'rasalar o'zbek tilida javob ber.
Boshqa tillarda so'rasalar o'sha tilda javob ber.
Har doim hurmat bilan muomala qil."""

MODELS = [
    {"id": "meta-llama/llama-3.3-70b-instruct:free",   "name": "Llama 3.3 70B ⚡ (Bepul)"},
    {"id": "mistralai/mistral-7b-instruct:free",         "name": "Mistral 7B 🚀 (Bepul)"},
    {"id": "deepseek/deepseek-r1:free",                  "name": "DeepSeek R1 🧠 (Bepul)"},
    {"id": "google/gemma-3-27b-it:free",                 "name": "Gemma 3 27B 💎 (Bepul)"},
    {"id": "qwen/qwq-32b:free",                          "name": "Qwen QwQ 32B 🌟 (Bepul)"},
]


def get_client():
    return OpenAI(
        api_key=OPENROUTER_API_KEY,
        base_url="https://openrouter.ai/api/v1",
        default_headers={
            "HTTP-Referer": "http://localhost:5000",
            "X-Title": "Aqlli ChatBot",
        }
    )


def get_conversation_file(conv_id):
    return os.path.join(DATA_DIR, f"{conv_id}.json")


def load_conversation(conv_id):
    filepath = get_conversation_file(conv_id)
    if os.path.exists(filepath):
        with open(filepath, "r", encoding="utf-8") as f:
            return json.load(f)
    return {
        "id": conv_id,
        "title": "Yangi suhbat",
        "messages": [],
        "created_at": datetime.datetime.now().isoformat()
    }


def save_conversation(conv_data):
    filepath = get_conversation_file(conv_data["id"])
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(conv_data, f, ensure_ascii=False, indent=2)


def get_all_conversations():
    conversations = []
    if os.path.exists(DATA_DIR):
        for filename in sorted(os.listdir(DATA_DIR), reverse=True):
            if filename.endswith(".json"):
                filepath = os.path.join(DATA_DIR, filename)
                with open(filepath, "r", encoding="utf-8") as f:
                    conv = json.load(f)
                    conversations.append({
                        "id": conv["id"],
                        "title": conv.get("title", "Yangi suhbat"),
                        "created_at": conv.get("created_at", ""),
                        "message_count": len(conv.get("messages", []))
                    })
    return conversations


def generate_title(first_message):
    words = first_message.strip().split()
    title = " ".join(words[:6])
    if len(words) > 6:
        title += "..."
    return title if title else "Yangi suhbat"


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/conversations", methods=["GET"])
def get_conversations():
    return jsonify(get_all_conversations())


@app.route("/api/conversations/new", methods=["POST"])
def new_conversation():
    conv_id = str(uuid.uuid4())
    conv_data = {
        "id": conv_id,
        "title": "Yangi suhbat",
        "messages": [],
        "created_at": datetime.datetime.now().isoformat()
    }
    save_conversation(conv_data)
    return jsonify(conv_data)


@app.route("/api/conversations/<conv_id>", methods=["GET"])
def get_conversation(conv_id):
    return jsonify(load_conversation(conv_id))


@app.route("/api/conversations/<conv_id>", methods=["DELETE"])
def delete_conversation(conv_id):
    filepath = get_conversation_file(conv_id)
    if os.path.exists(filepath):
        os.remove(filepath)
    return jsonify({"success": True})


@app.route("/api/chat", methods=["POST"])
def chat():
    data = request.json
    user_message = data.get("message", "").strip()
    conv_id = data.get("conversation_id", str(uuid.uuid4()))
    model_name = data.get("model", "meta-llama/llama-3.3-70b-instruct:free")

    if not user_message:
        return jsonify({"error": "Xabar bo'sh bo'lishi mumkin emas"}), 400

    if not OPENROUTER_API_KEY:
        return jsonify({"error": "OpenRouter API kalit topilmadi."}), 401

    conv_data = load_conversation(conv_id)

    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    for msg in conv_data["messages"][-20:]:
        role = "user" if msg["role"] == "user" else "assistant"
        messages.append({"role": role, "content": msg["content"]})
    messages.append({"role": "user", "content": user_message})

    try:
        client = get_client()
        response = client.chat.completions.create(
            model=model_name,
            messages=messages,
            max_tokens=2048,
            temperature=0.7,
        )
        assistant_message = response.choices[0].message.content

        if not conv_data["messages"]:
            conv_data["title"] = generate_title(user_message)

        conv_data["messages"].append({
            "role": "user",
            "content": user_message,
            "timestamp": datetime.datetime.now().isoformat()
        })
        conv_data["messages"].append({
            "role": "assistant",
            "content": assistant_message,
            "timestamp": datetime.datetime.now().isoformat()
        })
        save_conversation(conv_data)

        return jsonify({
            "response": assistant_message,
            "conversation_id": conv_id,
            "title": conv_data["title"],
            "demo_mode": False
        })

    except Exception as e:
        err = str(e)
        if "401" in err or "authentication" in err.lower():
            return jsonify({"error": "API kalit noto'g'ri."}), 401
        if "429" in err or "rate" in err.lower():
            return jsonify({"error": "So'rovlar juda tez yuborildi. 10 soniya kuting va qayta yuboring."}), 429
        if "402" in err or "credit" in err.lower():
            return jsonify({"error": "OpenRouter kredit tugagan. openrouter.ai dan to'ldiring."}), 402
        if "connection" in err.lower() or "timeout" in err.lower() or "network" in err.lower():
            return jsonify({"error": "Server bilan ulanishda xatolik. Qayta urinib ko'ring."}), 503
        return jsonify({"error": f"Xatolik yuz berdi. Qayta urinib ko'ring."}), 500


@app.route("/api/settings", methods=["GET"])
def get_settings():
    return jsonify({
        "has_api_key": bool(OPENROUTER_API_KEY),
        "provider": "OpenRouter",
        "models": MODELS
    })


if __name__ == "__main__":
    port = int(os.getenv("PORT", 5000))
    debug = os.getenv("FLASK_ENV") != "production"
    print("=" * 50)
    print("  AQLLI CHATBOT - OpenRouter AI")
    print("=" * 50)
    print(f"  Brauzerda oching: http://localhost:{port}")
    print("=" * 50)
    app.run(debug=debug, host="0.0.0.0", port=port)
