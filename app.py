import os
import json
import uuid
import logging
import datetime
import requests
from flask import Flask, render_template, request, jsonify, Response, stream_with_context
from flask_cors import CORS
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

app = Flask(__name__)
app.secret_key = os.getenv("SECRET_KEY", "aqlli-chatbot-secret-2026")
CORS(app)

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
os.makedirs(DATA_DIR, exist_ok=True)

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "")
SITE_URL = os.getenv("SITE_URL", "https://aqlli-chatbot.onrender.com")

SYSTEM_PROMPT = """Sen Aqlli ChatBot - O'zbek tilidagi aqlli AI yordamchisan.
O'zbek tilida so'rasalar o'zbek tilida javob ber.
Boshqa tillarda so'rasalar o'sha tilda javob ber.
Har doim samimiy, foydali va aniq javob ber."""

MODELS = [
    {"id": "openai/gpt-oss-20b:free",                 "name": "GPT-OSS 20B ⚡ (Tez)"},
    {"id": "openai/gpt-oss-120b:free",                "name": "GPT-OSS 120B 🧠 (Kuchli)"},
    {"id": "meta-llama/llama-3.3-70b-instruct:free",  "name": "Llama 3.3 70B 🦙"},
    {"id": "google/gemma-4-31b-it:free",              "name": "Gemma 4 31B 💎"},
    {"id": "deepseek/deepseek-v4-flash:free",         "name": "DeepSeek V4 Flash 🚀"},
]

# Rate limit bo'lganda avtomatik sinab ko'riladigan modellar
FALLBACK_CHAIN = [
    "openai/gpt-oss-20b:free",
    "openai/gpt-oss-120b:free",
    "meta-llama/llama-3.3-70b-instruct:free",
    "meta-llama/llama-3.2-3b-instruct:free",
    "google/gemma-4-31b-it:free",
]

OR_HEADERS = {
    "Authorization": f"Bearer {OPENROUTER_API_KEY}",
    "Content-Type": "application/json",
    "HTTP-Referer": SITE_URL,
    "X-Title": "Aqlli ChatBot",
}


def get_headers():
    return {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
        "HTTP-Referer": SITE_URL,
        "X-Title": "Aqlli ChatBot",
    }


# ===== CONVERSATION HELPERS =====
def conv_path(conv_id):
    return os.path.join(DATA_DIR, f"{conv_id}.json")


def load_conv(conv_id):
    p = conv_path(conv_id)
    if os.path.exists(p):
        with open(p, "r", encoding="utf-8") as f:
            return json.load(f)
    return {"id": conv_id, "title": "Yangi suhbat", "messages": [],
            "created_at": datetime.datetime.now().isoformat()}


def save_conv(conv):
    with open(conv_path(conv["id"]), "w", encoding="utf-8") as f:
        json.dump(conv, f, ensure_ascii=False, indent=2)


def make_title(msg):
    words = msg.strip().split()
    t = " ".join(words[:6])
    return (t + "...") if len(words) > 6 else (t or "Yangi suhbat")


def all_convs():
    result = []
    for fn in sorted(os.listdir(DATA_DIR), reverse=True):
        if fn.endswith(".json"):
            with open(os.path.join(DATA_DIR, fn), "r", encoding="utf-8") as f:
                c = json.load(f)
                result.append({"id": c["id"], "title": c.get("title", "Yangi suhbat"),
                                "created_at": c.get("created_at", ""),
                                "message_count": len(c.get("messages", []))})
    return result


# ===== ROUTES =====
@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/test")
def test_api():
    if not OPENROUTER_API_KEY:
        return jsonify({"status": "error", "message": "OPENROUTER_API_KEY sozlanmagan!"}), 500
    try:
        r = requests.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers=get_headers(),
            json={"model": "openai/gpt-oss-20b:free",
                  "messages": [{"role": "user", "content": "Say OK"}],
                  "max_tokens": 10},
            timeout=15,
        )
        r.raise_for_status()
        ans = r.json()["choices"][0]["message"]["content"]
        return jsonify({"status": "ok", "response": ans})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/api/settings")
def get_settings():
    return jsonify({
        "has_api_key": bool(OPENROUTER_API_KEY),
        "provider": "OpenRouter",
        "models": MODELS,
    })


@app.route("/api/conversations")
def get_conversations():
    return jsonify(all_convs())


@app.route("/api/conversations/new", methods=["POST"])
def new_conversation():
    conv_id = str(uuid.uuid4())
    conv = {"id": conv_id, "title": "Yangi suhbat", "messages": [],
            "created_at": datetime.datetime.now().isoformat()}
    save_conv(conv)
    return jsonify(conv)


@app.route("/api/conversations/<conv_id>")
def get_conversation(conv_id):
    return jsonify(load_conv(conv_id))


@app.route("/api/conversations/<conv_id>", methods=["DELETE"])
def delete_conversation(conv_id):
    p = conv_path(conv_id)
    if os.path.exists(p):
        os.remove(p)
    return jsonify({"success": True})


@app.route("/api/chat/stream", methods=["POST"])
def chat_stream():
    """Streaming endpoint — matn token-token chiqadi."""
    data = request.json or {}
    user_message = data.get("message", "").strip()
    conv_id = data.get("conversation_id") or str(uuid.uuid4())
    model_name = data.get("model", "openai/gpt-oss-20b:free")

    if not user_message:
        return jsonify({"error": "Xabar bo'sh"}), 400
    if not OPENROUTER_API_KEY:
        return jsonify({"error": "API kalit sozlanmagan"}), 401

    conv = load_conv(conv_id)

    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    for m in conv["messages"][-16:]:
        messages.append({
            "role": "user" if m["role"] == "user" else "assistant",
            "content": m["content"]
        })
    messages.append({"role": "user", "content": user_message})

    if not conv["messages"]:
        conv["title"] = make_title(user_message)

    def try_stream(model):
        """Bitta model bilan stream qilishga harakat qiladi. 429 bo'lsa None qaytaradi."""
        resp = requests.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers=get_headers(),
            json={"model": model, "messages": messages,
                  "max_tokens": 1024, "temperature": 0.7, "stream": True},
            stream=True, timeout=30,
        )
        return resp

    def generate():
        full_response = ""

        # Tanlangan model + fallback zanjiri
        models_to_try = [model_name] + [m for m in FALLBACK_CHAIN if m != model_name]
        used_model = model_name

        resp = None
        for attempt_model in models_to_try:
            try:
                log.info(f"Trying stream: {attempt_model}")
                r = try_stream(attempt_model)
                if r.status_code == 429:
                    log.warning(f"429 on {attempt_model}, trying next...")
                    r.close()
                    continue
                if r.status_code == 401:
                    yield f"data: {json.dumps({'error': 'API kalit noto-g-ri. Render Environment ni tekshiring.'})}\n\n"
                    return
                if r.status_code != 200:
                    r.close()
                    continue
                resp = r
                used_model = attempt_model
                log.info(f"Streaming with: {used_model}")
                break
            except requests.exceptions.Timeout:
                log.warning(f"Timeout: {attempt_model}")
                continue
            except Exception as e:
                log.warning(f"Error {attempt_model}: {e}")
                continue

        if resp is None:
            yield f"data: {json.dumps({'error': 'Barcha modellar band. 30 soniya kuting va qayta yuboring.'})}\n\n"
            return

        try:
            for line in resp.iter_lines():
                if not line:
                    continue
                line = line.decode("utf-8")
                if not line.startswith("data: "):
                    continue
                chunk = line[6:]
                if chunk == "[DONE]":
                    break
                try:
                    obj = json.loads(chunk)
                    token = obj["choices"][0].get("delta", {}).get("content", "")
                    if token:
                        full_response += token
                        yield f"data: {json.dumps({'token': token})}\n\n"
                except Exception:
                    continue
        except Exception as e:
            log.error(f"Stream read error: {e}")
        finally:
            resp.close()

        if full_response:
            ts = datetime.datetime.now().isoformat()
            conv["messages"].append({"role": "user", "content": user_message, "timestamp": ts})
            conv["messages"].append({"role": "assistant", "content": full_response, "timestamp": ts})
            save_conv(conv)
            yield f"data: {json.dumps({'done': True, 'conv_id': conv_id, 'title': conv['title'], 'model_used': used_model})}\n\n"
        else:
            yield f"data: {json.dumps({'error': 'Bo-sh javob keldi. Qayta urinib ko-ring.'})}\n\n"

    return Response(
        stream_with_context(generate()),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        }
    )


if __name__ == "__main__":
    port = int(os.getenv("PORT", 5000))
    debug = os.getenv("FLASK_ENV") != "production"
    log.info(f"Starting on port {port}, key={'set' if OPENROUTER_API_KEY else 'NOT SET'}")
    app.run(debug=debug, host="0.0.0.0", port=port, threaded=True)
