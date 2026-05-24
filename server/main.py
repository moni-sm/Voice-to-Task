import os
import json
import time
import re
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import google.generativeai as genai
from fpdf import FPDF
from dotenv import load_dotenv

load_dotenv()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory="static"), name="static")

genai.configure(api_key=os.getenv("VITE_GEMINI_API_KEY"))

class ZeeSensePDF(FPDF):
    def header(self):
        # Header Box
        self.set_line_width(0.5)
        self.rect(10, 10, 190, 25)
        
        # Logo placeholder (left)
        self.set_font('Arial', 'B', 18)
        self.set_xy(15, 15)
        self.cell(40, 10, "ZeeSense", 0, 0, 'L')
        self.set_font('Arial', '', 8)
        self.set_xy(15, 22)
        self.cell(40, 5, "connecting with real world", 0, 0, 'L')
        
        # Title (right)
        self.set_font('Arial', 'B', 12)
        self.set_fill_color(200, 200, 200)
        self.set_xy(90, 12)
        self.cell(70, 6, "CUSTOMER SERVICE REPORT", border=1, align='C', fill=True)
        
        self.set_font('Arial', 'B', 16)
        self.set_xy(90, 20)
        self.cell(100, 10, "ZeeSense Systems Pvt. Ltd.", 0, 0, 'C')
        self.ln(15)

def generate_zeeseense_pdf(data):
    os.makedirs("static", exist_ok=True)
    pdf = ZeeSensePDF(orientation='P', unit='mm', format='A4')
    pdf.add_page()
    pdf.set_font("Arial", size=10)
    pdf.set_line_width(0.2)
    
    # Top section wrapper
    pdf.rect(10, 35, 190, 32)
    pdf.line(95, 35, 95, 67) # Vertical split
    
    # Left side (Address)
    pdf.set_font("Arial", 'B', 11)
    pdf.set_xy(12, 38)
    pdf.cell(80, 5, "M/s. ZeeSense systems Pvt. Ltd", 0, 1)
    pdf.set_font("Arial", '', 10)
    pdf.set_x(12)
    pdf.cell(80, 5, "No.40, East End Main,", 0, 1)
    pdf.set_x(12)
    pdf.cell(80, 5, "South End 'A' Cross, Jayanagar.", 0, 1)
    pdf.set_x(12)
    pdf.cell(80, 5, "9th Block, Bengaluru - 560069.", 0, 1)
    
    # Right side (Details)
    pdf.set_font("Arial", 'B', 10)
    pdf.set_xy(95, 35)
    pdf.cell(95, 8, f" Site : {data.get('site', '')}", border='B', ln=1)
    pdf.set_x(95)
    pdf.cell(95, 8, f" Date : {data.get('date', '')}", border='B', ln=1)
    pdf.set_x(95)
    pdf.cell(95, 8, f" Customer Rep : {data.get('customerRep', '')}", border='B', ln=1)
    pdf.set_x(95)
    pdf.cell(95, 8, f" Zee Sense Rep (s.) : {data.get('zeeSenseRep', '')}", border=0, ln=1)
    
    # Tasks Header
    pdf.set_y(67)
    pdf.set_font("Arial", 'B', 10)
    pdf.cell(20, 8, " Sl. No :", border=1, align='C')
    pdf.cell(170, 8, " Task Description", border=1, align='C', ln=1)
    
    # Helper to write highlighted text
    def write_highlighted_text(pdf_obj, text_str, line_height=5):
        red_pat = r"\b(?:Issue Observed|Issue|observed|Faulty|Failed|Not functioning|offline|intermittent)\b"
        blue_pat = r"\b(?:Troubleshooting Performed|Troubleshooting|Troubleshoot|Checked|Inspected|Identified|Shifted|Tested|Testing|restarted|recycle|restart)\b"
        green_pat = r"\b(?:Solved|Resolved|Fixed|Functioning properly|Working properly|successfully|confirmed|operational)\b"
        gray_pat = r"\b(?:work Done|Work Done|Status)\b"
        
        pattern = re.compile(f"({red_pat}|{blue_pat}|{green_pat}|{gray_pat})", re.IGNORECASE)
        parts = pattern.split(text_str)
        
        for part in parts:
            if not part:
                continue
            if re.match(red_pat, part, re.IGNORECASE):
                pdf_obj.set_text_color(220, 38, 38)
                pdf_obj.set_font("Arial", "B", 10)
            elif re.match(blue_pat, part, re.IGNORECASE):
                pdf_obj.set_text_color(37, 99, 235)
                pdf_obj.set_font("Arial", "B", 10)
            elif re.match(green_pat, part, re.IGNORECASE):
                pdf_obj.set_text_color(22, 163, 74)
                pdf_obj.set_font("Arial", "B", 10)
            elif re.match(gray_pat, part, re.IGNORECASE):
                pdf_obj.set_text_color(75, 85, 99)
                pdf_obj.set_font("Arial", "B", 10)
            else:
                pdf_obj.set_text_color(26, 64, 166)
                pdf_obj.set_font("Arial", "", 10)
            pdf_obj.write(line_height, part)
        
        pdf_obj.set_text_color(0, 0, 0)
        pdf_obj.set_font("Arial", "", 10)

    # Tasks Content
    pdf.set_font("Arial", '', 10)
    
    tasks = data.get('tasks', [])
    if not tasks:
        tasks = [{'slNo': 1, 'description': data.get('taskDescription', '')}]
        
    for task in tasks:
        sl_no = str(task.get('slNo', ''))
        description = str(task.get('description', ''))
        
        y_start = pdf.get_y()
        pdf.set_xy(30, y_start + 1.5)
        pdf.set_left_margin(30)
        
        write_highlighted_text(pdf, description, line_height=5)
        
        pdf.set_left_margin(10)
        y_end = pdf.get_y() + 1.5
        row_height = y_end - y_start
        if row_height < 8:
            row_height = 8
            y_end = y_start + 8
            
        pdf.set_xy(10, y_start)
        pdf.cell(20, row_height, sl_no, border='LR', align='C')
        pdf.set_xy(30, y_start)
        pdf.cell(170, row_height, "", border='R', ln=1)
        pdf.set_y(y_end)
        
    # Fill remaining space in task box
    while pdf.get_y() < 180:
        pdf.cell(20, 8, "", border='LR', align='C')
        pdf.cell(170, 8, "", border='R', ln=1)
    
    # Bottom border of task box
    pdf.cell(190, 0, "", border='T', ln=1)
    
    # Follow-up
    y_followup = max(185, pdf.get_y() + 5)
    pdf.set_y(y_followup)
    pdf.set_font("Arial", 'B', 10)
    pdf.cell(190, 6, "Follow-up required", 0, 1)
    pdf.set_font("Arial", '', 10)
    pdf.multi_cell(190, 20, data.get('followUpRequired', ''), border=1)
    
    # Signatures
    y_sigs = max(230, pdf.get_y() + 8)
    pdf.set_y(y_sigs)
    pdf.set_font("Arial", 'B', 10)
    pdf.cell(95, 5, "ZeeSense Engr.", 0, 0, 'C')
    pdf.cell(95, 5, "Customer Rep.", 0, 1, 'C')
    
    # Render signatures from base64
    import base64
    import tempfile
    
    sigs = data.get('signatures', [None, None])
    temp_files = []
    y_sig = y_sigs + 6
    w_sig = 50
    h_sig = 18
    
    for i, sig_base64 in enumerate(sigs):
        if sig_base64 and sig_base64.startswith("data:image"):
            try:
                # Extract the base64 part
                header, encoded = sig_base64.split(",", 1)
                data_bytes = base64.b64decode(encoded)
                # Create a temp file
                tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".png")
                tmp.write(data_bytes)
                tmp.close()
                temp_files.append(tmp.name)
                # Draw on PDF
                x_pos = 10 + i * 95 + (95 - w_sig) / 2
                pdf.image(tmp.name, x=x_pos, y=y_sig, w=w_sig, h=h_sig)
            except Exception as e:
                print(f"Error embedding signature {i}: {e}")
                
    pdf.set_y(y_sigs + 26)
    pdf.set_font("Arial", '', 10)
    pdf.cell(95, 5, "(Name & Signature)", 0, 0, 'C')
    pdf.cell(95, 5, "(Name & Signature)", 0, 1, 'C')
    
    filename = f"ZeeSense_Report_{int(time.time())}.pdf"
    path = os.path.join("static", filename)
    pdf.output(path)
    
    # Clean up temp files
    for tmp_name in temp_files:
        try:
            os.unlink(tmp_name)
        except:
            pass
            
    return filename

@app.post("/api/process")
async def process_data(
    audio: UploadFile = File(None), 
    text: str = Form(None),
    x_gemini_api_key: str = Header(None),
    x_gemini_model: str = Header(None)
):
    try:
        api_key = x_gemini_api_key if x_gemini_api_key is not None else os.getenv("VITE_GEMINI_API_KEY")
        if api_key:
            api_key = api_key.strip()
        if not api_key:
            raise HTTPException(status_code=400, detail="Gemini API Key is missing. Please configure your API key in Settings (gear icon in toolbar).")
        
        # Configure genai dynamically
        genai.configure(api_key=api_key)
        
        user_model = x_gemini_model or "auto"
        default_models = [
            "gemini-2.5-flash",
            "gemini-2.5-pro",
            "gemini-1.5-flash",
            "gemini-1.5-pro"
        ]
        
        if user_model and user_model != "auto":
            models_to_try = [user_model] + [m for m in default_models if m != user_model]
        else:
            models_to_try = default_models

        last_error = None
        
        prompt = """
        You are a professional service report writer for a CCTV/networking company called ZeeSense.

        Your job is to extract and ELABORATE every single point from the technician's raw notes into a structured JSON service report.

        STRICT RULES — YOU MUST FOLLOW ALL OF THESE:
        1. ELABORATE the report using the exact phrasing style of standard customer service reports (CSR) as seen in the examples:
           - Task 1 must always be an initial observation of the problem, starting with: "During the site visit, it was observed that ..."
           - Task 2 must always be the troubleshooting details and findings, starting with: "Troubleshooting was carried out and it was found that ..."
           - Task 3 must always be the repair and test verification, starting with: "After completing the [rectification/installation/repair], all [devices/systems] were tested and confirmed to be working properly."
           - Each physical step performed under "work Done" must be output as a SEPARATE task item in the tasks array, line-by-line. Each must start with: "work Done: [number]) [Action] ..." (e.g. "work Done: 1) Checked ...", "work Done: 2) Inspected ...", etc.). Do NOT group them into a single string.
           - The last task must always be a statement of current final status, starting with: "Status: All [devices/systems] are now functioning properly."
        2. If the technician's notes contain multiple different issues or repairs, you can insert additional tasks following these steps (e.g. additional troubleshooting tasks or additional work done items), but keep this general flow: Observations -> Troubleshooting -> Rectification -> work Done -> Status.
        3. Never skip or summarize away any detail. If the technician mentions specific actions or items, make sure they are elaborated in the "work Done" tasks and the troubleshooting/rectification descriptions.
        4. The followUpRequired field must ALWAYS contain a detailed multi-line recommendation and current temporary status.

        Output a valid JSON object with EXACTLY this structure:
        {
          "site": "string (location/site name, or empty string if not mentioned)",
          "date": "string (date in DD/MM/YYYY, or today's date if not mentioned)",
          "customerRep": "string (customer name, or empty string)",
          "zeeSenseRep": "string (engineer name, or empty string)",
          "tasks": [
            {"slNo": 1, "description": "During the site visit, it was observed that ..."},
            {"slNo": 2, "description": "Troubleshooting was carried out and it was found that ..."},
            {"slNo": 3, "description": "After completing the ..., all ... were tested and confirmed to be working properly."},
            {"slNo": 4, "description": "work Done: 1) ..."},
            {"slNo": 5, "description": "work Done: 2) ..."},
            {"slNo": 6, "description": "Status: All ... are now functioning properly."}
          ],
          "followUpRequired": "Recommendation:\\n- point 1\\n- point 2\\n\\nTemporary Status:\\n..."
        }

        EXAMPLE — given this input:
        "When I was coming to site most of the lift camera was not working now I went to LMR room and restarted the devices like switch and Media converter and Wireless device POE injector Now cameras are working but Switches and media converter are 10/100 we have to do the trouble shoot if we change to giga switch and Giga Media converter and even if I did restart now it's working after few days or few hours it's go offline again and they have to go to LMR room and restart it again And my recommendation is that Going with Lift flat cable or we can just check by using Giga Switch"

        EXAMPLE output:
        {
          "site": "",
          "date": "",
          "customerRep": "",
          "zeeSenseRep": "",
          "tasks": [
            {"slNo": 1, "description": "During the site visit, it was observed that most of the lift cameras were offline and not displaying any video feed."},
            {"slNo": 2, "description": "Troubleshooting was carried out and it was found that the network switch, media converter, wireless bridge, and PoE injector in the Lift Machine Room (LMR) required a power recycle to restore connectivity."},
            {"slNo": 3, "description": "After completing the manual device restarts, all lift cameras were tested and confirmed to be working properly and back online."},
            {"slNo": 4, "description": "work Done: 1) Checked power status of lift cameras"},
            {"slNo": 5, "description": "work Done: 2) Inspected LMR room network switch, media converter, wireless bridge, and PoE injectors"},
            {"slNo": 6, "description": "work Done: 3) Performed manual power recycle on all network devices"},
            {"slNo": 7, "description": "work Done: 4) Restored camera connectivity successfully"},
            {"slNo": 8, "description": "work Done: 5) Monitored video feeds to verify stability."},
            {"slNo": 9, "description": "Status: All lift cameras are now functioning properly, but the underlying issue of legacy 10/100 Mbps hardware causing intermittent drops remains unresolved."}
          ],
          "followUpRequired": "Recommendation:\\n- Replace the existing 10/100 Mbps Network Switch with a Gigabit Switch to improve data throughput and reduce connection drops.\\n- Replace the existing 10/100 Mbps Media Converter with a Gigabit Media Converter for stable fiber signal conversion.\\n- If the issue persists after upgrading the switch and media converter, proceed with installing a dedicated Lift Flat Cable (structured cabling) to provide a more reliable and permanent connectivity solution.\\n- Conduct a detailed network audit of the LMR room infrastructure to identify any other aging or underperforming components.\\n\\nTemporary Status:\\nAll lift cameras are currently operational following the manual device restart. However, the fix is temporary. The root cause (aging 10/100 hardware and unstable network path) has not been permanently resolved. Continuous monitoring is recommended until a permanent hardware upgrade is completed."
        }

        Now apply these same rules to the following technician notes and output ONLY valid JSON:
        """
        
        content_parts = [prompt]
        if audio:
            audio_content = await audio.read()
            content_parts.append({
                "mime_type": audio.content_type or "audio/mpeg",
                "data": audio_content
            })
        elif text:
            content_parts.append(text)
        else:
            raise HTTPException(status_code=400, detail="Must provide either audio or text.")
            
        for model_name in models_to_try:
            try:
                model = genai.GenerativeModel(model_name)
                response = model.generate_content(
                    content_parts,
                    generation_config={"response_mime_type": "application/json"}
                )
                
                job_data = json.loads(response.text)
                return job_data
            except Exception as e:
                print(f"Failed with {model_name}: {e}")
                err_msg = str(e)
                if "API key was reported as leaked" in err_msg or "API_KEY_INVALID" in err_msg or "API key not valid" in err_msg:
                    raise e
                last_error = e
                continue
        
        raise last_error
    except HTTPException as he:
        raise he
    except Exception as e:
        print(f"Error: {e}")
        error_msg = str(e)
        if "API key was reported as leaked" in error_msg:
            raise HTTPException(status_code=400, detail="Your Gemini API key was reported as leaked. Please generate a new key in Google AI Studio and update it in Settings.")
        elif "API_KEY_INVALID" in error_msg or "API key not valid" in error_msg:
            raise HTTPException(status_code=400, detail="Invalid Gemini API key. Please check your key in Settings.")
        elif "quota" in error_msg.lower() or "429" in error_msg:
            raise HTTPException(status_code=429, detail="Gemini API rate limit or quota exceeded. Please try again in a few seconds or check your plan details.")
        raise HTTPException(status_code=500, detail=error_msg)

@app.post("/api/generate-pdf")
async def generate_pdf_endpoint(data: dict):
    try:
        pdf_filename = generate_zeeseense_pdf(data)
        pdf_path = os.path.join("static", pdf_filename)
        return FileResponse(
            path=pdf_path,
            media_type="application/pdf",
            filename=pdf_filename,
            headers={
                "Content-Disposition": f'attachment; filename="{pdf_filename}"',
                "Access-Control-Expose-Headers": "Content-Disposition",
            }
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
