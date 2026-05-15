# Voice2Task 🎙️⚡ (Rebuilt)

AI-Driven "Voice-to-Task" assistant with a professional Python + React stack.

## 📁 New Tech Stack
- **Frontend**: React (Vite) + **Tailwind CSS** + `mic-recorder-to-mp3`.
- **Backend**: **FastAPI** (Python) + `google-generativeai`.
- **PDF**: `fpdf2` (Python).

## 🚀 Getting Started

### 1. Backend (Python)
1. Go to the `server/` folder.
2. Install requirements:
   ```bash
   pip install fastapi uvicorn google-generativeai fpdf2 python-multipart python-dotenv
   ```
3. Run the server:
   ```bash
   uvicorn main:app --reload
   ```
   *Backend runs on http://localhost:8000*

### 2. Frontend (React)
1. Go to the `client/` folder.
2. Install requirements:
   ```bash
   npm install
   ```
3. Run the dev server:
   ```bash
   npm run dev
   ```
   *Frontend runs on http://localhost:5173*

## 🛠️ Usage
- The app now records in **MP3 format** for better compatibility.
- Gemini extracts job details and the backend generates a **ReportLab/FPDF2 PDF** instantly.
- The UI is built with **Tailwind CSS** for a premium, responsive look.

---
Rebuilt for high performance and professional reporting.
