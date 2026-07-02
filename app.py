from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from groq import Groq
import fitz
import os
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__, static_folder="static", static_url_path="")
CORS(app)

client = Groq(api_key=os.getenv("GROQ_API_KEY"))

pdf_store = {}

@app.route("/")
def index():
    return send_from_directory("static", "index.html")

@app.route("/upload", methods=["POST"])
def upload_pdf():
    if "file" not in request.files:
        return jsonify({"error": "No file uploaded"}), 400
    file = request.files["file"]
    pdf_bytes = file.read()
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    text = ""
    for page in doc:
        text += page.get_text()
    doc.close()
    session_id = request.form.get("session_id", "default")
    pdf_store[session_id] = {"text": text[:20000], "filename": file.filename}
    return jsonify({"message": file.filename + " uploaded!"})

@app.route("/chat", methods=["POST"])
def chat():
    try:
        data = request.json
        user_message = data.get("message", "").strip()
        session_id = data.get("session_id", "default")
        history = data.get("history", [])
        if session_id in pdf_store:
            info = pdf_store[session_id]
            system = "You are a helpful AI. Answer based on this PDF named " + info["filename"] + ". Content: " + info["text"]
        else:
            system = "You are a helpful AI assistant."
        messages = [{"role": "system", "content": system}]
        for msg in history[-10:]:
            messages.append({"role": msg["role"], "content": msg["content"]})
        messages.append({"role": "user", "content": user_message})
        response = client.chat.completions.create(
            model="llama-3.1-8b-instant",
            messages=messages,
            max_tokens=1024
        )
        return jsonify({"reply": response.choices[0].message.content})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/clear", methods=["POST"])
def clear():
    session_id = request.json.get("session_id", "default")
    if session_id in pdf_store:
        del pdf_store[session_id]
    return jsonify({"message": "cleared"})

if __name__ == "__main__":
    app.run(debug=True, port=5000)
