from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import google.generativeai as genai
import fitz  # PyMuPDF
import os
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__, static_folder="static")
CORS(app)

genai.configure(api_key=os.getenv("GEMINI_API_KEY"))
model = genai.GenerativeModel("gemini-1.5-flash")

pdf_store = {}

@app.route("/")
def index():
    return send_from_directory("static", "index.html")

@app.route("/upload", methods=["POST"])
def upload_pdf():
    if "file" not in request.files:
        return jsonify({"error": "No file uploaded"}), 400

    file = request.files["file"]
    if not file.filename.endswith(".pdf"):
        return jsonify({"error": "Only PDF files allowed"}), 400

    pdf_bytes = file.read()
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")

    text = ""
    for page in doc:
        text += page.get_text()
    doc.close()

    if not text.strip():
        return jsonify({"error": "Could not extract text from PDF"}), 400

    session_id = request.form.get("session_id", "default")
    pdf_store[session_id] = {
        "text": text[:50000],
        "filename": file.filename
    }

    return jsonify({
        "message": f"'{file.filename}' uploaded successfully!",
        "chars": len(text)
    })

@app.route("/chat", methods=["POST"])
def chat():
    data = request.json
    user_message = data.get("message", "").strip()
    session_id = data.get("session_id", "default")
    history = data.get("history", [])

    if not user_message:
        return jsonify({"error": "Empty message"}), 400

    if session_id in pdf_store:
        pdf_info = pdf_store[session_id]
        system_prompt = f"""You are a helpful AI assistant. The user has uploaded a PDF document.

PDF Filename: {pdf_info['filename']}

PDF Content:
---
{pdf_info['text']}
---

Answer the user's questions based on this PDF content. If the answer is not in the PDF, say so clearly. Be concise and helpful.

User question: {user_message}"""
    else:
        system_prompt = f"You are a helpful AI assistant. No PDF uploaded yet. Answer this: {user_message}"

    # Build history for Gemini
    gemini_history = []
    for msg in history[-10:]:
        role = "user" if msg["role"] == "user" else "model"
        gemini_history.append({"role": role, "parts": [msg["content"]]})

    chat_session = model.start_chat(history=gemini_history)
    response = chat_session.send_message(system_prompt)

    return jsonify({"reply": response.text})

@app.route("/clear", methods=["POST"])
def clear():
    session_id = request.json.get("session_id", "default")
    if session_id in pdf_store:
        del pdf_store[session_id]
    return jsonify({"message": "PDF cleared"})

if __name__ == "__main__":
    app.run(debug=True, port=5000)
