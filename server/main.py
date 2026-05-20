import os
import json
import time
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
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
    
    # Tasks Content
    pdf.set_font("Arial", '', 10)
    
    tasks = data.get('tasks', [])
    if not tasks:
        tasks = [{'slNo': 1, 'description': data.get('taskDescription', '')}]
        
    for task in tasks:
        pdf.cell(20, 8, str(task.get('slNo', '')), border='LR', align='C')
        pdf.cell(170, 8, " " + str(task.get('description', '')), border='R', ln=1)
        
    # Fill remaining space in task box
    while pdf.get_y() < 180:
        pdf.cell(20, 8, "", border='LR', align='C')
        pdf.cell(170, 8, "", border='R', ln=1)
    
    # Bottom border of task box
    pdf.cell(190, 0, "", border='T', ln=1)
    
    # Follow-up
    pdf.set_y(185)
    pdf.set_font("Arial", 'B', 10)
    pdf.cell(190, 6, "Follow-up required", 0, 1)
    pdf.set_font("Arial", '', 10)
    pdf.multi_cell(190, 20, data.get('followUpRequired', ''), border=1)
    
    # Signatures
    pdf.set_y(230)
    pdf.set_font("Arial", 'B', 10)
    pdf.cell(95, 5, "ZeeSense Engr.", 0, 0, 'C')
    pdf.cell(95, 5, "Customer Rep.", 0, 1, 'C')
    
    # Render signatures from base64
    import base64
    import tempfile
    
    sigs = data.get('signatures', [None, None])
    temp_files = []
    y_sig = 236
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
                
    pdf.set_y(256)
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
async def process_data(audio: UploadFile = File(None), text: str = Form(None)):
    try:
        models_to_try = ["gemini-3.1-pro-preview", "gemini-2.5-flash", "gemini-2.5-pro"]
        last_error = None
        
        prompt = """
        Extract the following fields from the provided service report notes into a JSON object:
        {
          "site": "string (location or site name)",
          "date": "string (YYYY-MM-DD or provided date)",
          "customerRep": "string (customer representative name)",
          "zeeSenseRep": "string (ZeeSense engineer name)",
          "tasks": [{"slNo": number, "description": "string (detailed task description)"}],
          "followUpRequired": "string (detailed follow-up recommendations and status)"
        }
        
        Guidelines for formatting:
        1. For the 'tasks' list:
           - Structurally break down the troubleshooting, observations, and actions performed chronologically.
           - Prepend labels and structure them exactly like:
             * 'Issue Observed: [Detail]'
             * 'Troubleshooting Performed: [Detail]'
             * 'Observation: [Detail]'
           - Ensure clean, professional grammar and clear detail.
           
        2. For the 'followUpRequired' field:
           - Structure it with clear headings: 'Recommendation:' and 'Temporary Status:'.
           - List recommended actions clearly.
           - Specify the current temporary status under 'Temporary Status:'.
           
        Example input:
        'When I was coming to site most of the lift camera was not working now I went to LMR room and restarted the devicees like switch and Media converter and Wirless device POE injector Now cameras are working but Switches and media converter are 10/100 we have to do the trouble shoot if we change to giga switch and Guga Media converter and even if I did restart now it's working after few days or few hours it's go offline again and they have to go to LMR room and restart it again And my recommendation is that Going with Lift flat cable or we can just check by using Giga Switch'
        
        Example output JSON:
        {
          "site": "",
          "date": "",
          "customerRep": "",
          "zeeSenseRep": "",
          "tasks": [
            {"slNo": 1, "description": "Issue Observed: During the site visit, it was observed that most of the lift cameras were offline/not working."},
            {"slNo": 2, "description": "Troubleshooting Performed: Visited the LMR (Lift Machine Room)."},
            {"slNo": 3, "description": "Troubleshooting Performed: Restarted the following devices: Network Switch, Media Converter, Wireless Device, and POE Injector."},
            {"slNo": 4, "description": "Troubleshooting Performed: After restarting the devices, all lift cameras came online and started working properly."},
            {"slNo": 5, "description": "Observation: Currently installed switches and media converters are operating on 10/100 Mbps devices."},
            {"slNo": 6, "description": "Observation: However, the issue may reoccur after a few hours or days, as the devices are becoming offline repeatedly and require manual restarting from the LMR room."}
          ],
          "followUpRequired": "Recommendation:\\nFurther troubleshooting is required to identify the root cause. Recommended actions are:\\n- Replace existing 10/100 switches and media converters with Gigabit Switches and Gigabit Media Converters for stable communication.\\n- If the issue still persists, recommend proceeding with Lift Flat Cable installation for reliable connectivity.\\n\\nTemporary Status:\\nSystem restored temporarily after device restart. Continuous monitoring recommended."
        }
        
        Ensure you follow this structure and style for any service report notes input.
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
                last_error = e
                continue
        
        raise last_error
    except Exception as e:
        print(f"Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/generate-pdf")
async def generate_pdf_endpoint(data: dict):
    try:
        pdf_filename = generate_zeeseense_pdf(data)
        return {"pdf_url": f"/static/{pdf_filename}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
