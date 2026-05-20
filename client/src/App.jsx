import React, { useState, useEffect, useRef } from 'react';

const NUM_TASKS = 14;

function App() {
  const [form, setForm] = useState({
    site: '',
    date: new Date().toLocaleDateString('en-IN'),
    customerRep: '',
    zeeSenseRep: '',
    tasks: Array.from({ length: NUM_TASKS }, () => ({ description: '' })),
    followUpRequired: ''
  });

  const [aiText, setAiText] = useState("");
  const [isGlobalRecording, setIsGlobalRecording] = useState(false);
  const [globalTimer, setGlobalTimer] = useState(0);
  const [processingIdx, setProcessingIdx] = useState(null);
  const globalTimerRef = useRef(null);

  // Row Recording
  const [activeRow, setActiveRow] = useState(0);
  const [rowRecording, setRowRecording] = useState(false);
  const [currentRowIdx, setCurrentRowIdx] = useState(null);
  const [rowTimer, setRowTimer] = useState(0);
  const [rowTranscript, setRowTranscript] = useState('Listening…');
  const rowTimerRef = useRef(null);
  const rowRecognitionRef = useRef(null);
  const globalRecognitionRef = useRef(null);

  // Signatures
  const [sigData, setSigData] = useState([null, null]);
  const [sigNames, setSigNames] = useState(['', '']);
  const [sigTimes, setSigTimes] = useState(['', '']);
  const [sigModalOpen, setSigModalOpen] = useState(false);
  const [currentSigIdx, setCurrentSigIdx] = useState(null);
  const [sigHasContent, setSigHasContent] = useState(false);
  
  const sigModalCanvasRef = useRef(null);
  const sigModalCtxRef = useRef(null);
  const isDrawingRef = useRef(false);

  // Scaling refs & state for responsive layout preservation on mobile
  const [scale, setScale] = useState(1);
  const [pageHeight, setPageHeight] = useState(1123);
  const containerRef = useRef(null);
  const a4PageRef = useRef(null);

  useEffect(() => {
    return () => {
      clearInterval(globalTimerRef.current);
      clearInterval(rowTimerRef.current);
      if (globalRecognitionRef.current) globalRecognitionRef.current.stop();
      if (rowRecognitionRef.current) rowRecognitionRef.current.stop();
    };
  }, []);

  useEffect(() => {
    const handleResize = () => {
      if (!containerRef.current || !a4PageRef.current) return;
      const containerWidth = containerRef.current.offsetWidth;
      const pageWidth = 794; // approx 210mm in pixels
      let currentScale = 1;
      if (containerWidth < pageWidth) {
        currentScale = containerWidth / pageWidth;
      }
      setScale(currentScale);
      setPageHeight(a4PageRef.current.offsetHeight);
    };

    const observer = new ResizeObserver(() => handleResize());
    if (containerRef.current) observer.observe(containerRef.current);
    if (a4PageRef.current) observer.observe(a4PageRef.current);

    handleResize();
    return () => observer.disconnect();
  }, []);

  const handleFieldChange = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const handleTaskChange = (index, value) => {
    const newTasks = [...form.tasks];
    newTasks[index].description = value;
    setForm(prev => ({ ...prev, tasks: newTasks }));
  };

  const formatTime = (s) => {
    return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
  };


  // ── GLOBAL RECORDING ──
  const toggleGlobalRecording = () => {
    if (isGlobalRecording) stopGlobalRecording();
    else startGlobalRecording();
  };

  const startGlobalRecording = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { alert("Speech recognition not supported in this browser."); return; }
    
    setIsGlobalRecording(true);
    setGlobalTimer(0);

    globalTimerRef.current = setInterval(() => {
      setGlobalTimer(t => t + 1);
    }, 1000);

    const recognition = new SR();
    recognition.lang = 'en-IN';
    recognition.interimResults = false;
    recognition.continuous = true;

    let transcript = '';
    recognition.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) transcript += e.results[i][0].transcript + ' ';
      }
    };
    recognition.onerror = () => stopGlobalRecording(transcript);
    recognition.onend = () => {
      if (isGlobalRecording) stopGlobalRecording(transcript);
    };
    recognition.start();
    globalRecognitionRef.current = recognition;
    globalRecognitionRef.current._getTranscript = () => transcript;
  };

  const stopGlobalRecording = (tr) => {
    setIsGlobalRecording(false);
    clearInterval(globalTimerRef.current);
    if (globalRecognitionRef.current) {
      try { globalRecognitionRef.current.stop(); } catch(e){}
    }
    
    const transcript = tr || (globalRecognitionRef.current && globalRecognitionRef.current._getTranscript ? globalRecognitionRef.current._getTranscript() : '');
    if (transcript.trim()) {
      setAiText(transcript.trim());
      handleImprovise(transcript.trim());
    }
  };

  // ── ROW RECORDING ──
  const startRowRecording = (idx) => {
    if (rowRecording) { stopRowRecording(); return; }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { alert("Speech recognition not supported. Please type."); return; }

    setCurrentRowIdx(idx);
    setRowRecording(true);
    setRowTimer(0);
    setRowTranscript('Listening…');

    rowTimerRef.current = setInterval(() => {
      setRowTimer(t => t + 1);
    }, 1000);

    const recognition = new SR();
    recognition.lang = 'en-IN';
    recognition.interimResults = true;
    recognition.continuous = true;

    let finalText = '';
    recognition.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) finalText += e.results[i][0].transcript + ' ';
        else interim = e.results[i][0].transcript;
      }
      setRowTranscript(finalText + interim);
      if (idx === 'followup') {
        handleFieldChange('followUpRequired', (finalText + interim).trim());
      } else {
        handleTaskChange(idx, (finalText + interim).trim());
      }
    };
    recognition.onerror = () => stopRowRecording();
    recognition.start();
    rowRecognitionRef.current = recognition;
  };

  const stopRowRecording = () => {
    setRowRecording(false);
    clearInterval(rowTimerRef.current);
    if (rowRecognitionRef.current) {
      try { rowRecognitionRef.current.stop(); } catch(e){}
    }

    let textToImprovise = '';
    if (currentRowIdx === 'followup') textToImprovise = form.followUpRequired;
    else if (currentRowIdx !== null) textToImprovise = form.tasks[currentRowIdx].description;

    if (textToImprovise.trim() && textToImprovise !== 'Listening…') {
      handleImprovise(textToImprovise, currentRowIdx);
    }

    setCurrentRowIdx(null);
  };

  // ── AI IMPROVISE ──
  const handleImprovise = async (textToUse, targetIdx = null) => {
    const text = typeof textToUse === 'string' ? textToUse : aiText;
    if (!text.trim()) return;
    setProcessingIdx(targetIdx === null ? 'global' : targetIdx);

    const formData = new FormData();
    formData.append('text', text);

    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'https://voice-to-task.onrender.com';
      const response = await fetch(`${apiUrl}/api/process`, {
        method: 'POST',
        body: formData,
      });
      if (!response.ok) throw new Error("Server failed");
      const data = await response.json();

      setForm(prev => {
        const newForm = { ...prev };
        
        if (targetIdx === 'followup') {
          if (data.followUpRequired) newForm.followUpRequired = data.followUpRequired;
          else if (data.tasks && data.tasks.length > 0) newForm.followUpRequired = data.tasks.map(t => t.description || t).join('\n');
        } else if (typeof targetIdx === 'number') {
          if (data.tasks && data.tasks.length > 0) {
            const mergedTasks = [...prev.tasks];
            for(let i=0; i<data.tasks.length; i++) {
              if(targetIdx + i < mergedTasks.length) {
                  mergedTasks[targetIdx + i].description = data.tasks[i].description || data.tasks[i];
              }
            }
            newForm.tasks = mergedTasks;
          }
        } else {
          // Global Update
          if (data.site) newForm.site = data.site;
          if (data.date) newForm.date = data.date;
          if (data.customerRep) newForm.customerRep = data.customerRep;
          if (data.zeeSenseRep) newForm.zeeSenseRep = data.zeeSenseRep;
          if (data.followUpRequired) newForm.followUpRequired = data.followUpRequired;
          
          if (data.tasks && data.tasks.length > 0) {
            const mergedTasks = [...prev.tasks];
            for(let i=0; i<data.tasks.length; i++) {
              if(i < mergedTasks.length) {
                  mergedTasks[i].description = data.tasks[i].description || data.tasks[i];
              }
            }
            newForm.tasks = mergedTasks;
          }
        }
        return newForm;
      });

      if (targetIdx === null) setAiText('');
      setProcessingIdx('done-' + (targetIdx === null ? 'global' : targetIdx));
      setTimeout(() => setProcessingIdx(null), 2500);
    } catch (e) {
      setProcessingIdx('error-' + (targetIdx === null ? 'global' : targetIdx));
      console.error(e);
      setTimeout(() => setProcessingIdx(null), 2500);
    }
  };

  const printReport = () => {
    window.print();
  };

  const getPos = (e, canvas) => {
    const r = canvas.getBoundingClientRect();
    const scaleX = canvas.width / r.width;
    const scaleY = canvas.height / r.height;
    return { x: (e.clientX - r.left) * scaleX, y: (e.clientY - r.top) * scaleY };
  };

  const getTouchPos = (e, canvas) => {
    const r = canvas.getBoundingClientRect();
    const scaleX = canvas.width / r.width;
    const scaleY = canvas.height / r.height;
    const t = e.touches[0];
    return { x: (t.clientX - r.left) * scaleX, y: (t.clientY - r.top) * scaleY };
  };

  const handleMouseDown = (e) => {
    isDrawingRef.current = true;
    setSigHasContent(true);
    const p = getPos(e, sigModalCanvasRef.current);
    sigModalCtxRef.current.beginPath();
    sigModalCtxRef.current.moveTo(p.x, p.y);
  };

  const handleMouseMove = (e) => {
    if (!isDrawingRef.current) return;
    const p = getPos(e, sigModalCanvasRef.current);
    sigModalCtxRef.current.lineTo(p.x, p.y);
    sigModalCtxRef.current.stroke();
  };

  const handleMouseUp = () => { isDrawingRef.current = false; };

  // ── SIGNATURES ──
  useEffect(() => {
    if (sigModalOpen && sigModalCanvasRef.current) {
      const canvas = sigModalCanvasRef.current;
      const ctx = canvas.getContext('2d');
      sigModalCtxRef.current = ctx;

      const initCanvas = () => {
        canvas.width = canvas.parentElement.offsetWidth || 432;
        canvas.height = 180;
        ctx.strokeStyle = '#1a1a2e';
        ctx.lineWidth = 2.2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        if (sigData[currentSigIdx]) {
          const img = new Image();
          img.onload = () => {
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          };
          img.src = sigData[currentSigIdx];
        }
      };

      initCanvas();
      setSigHasContent(!!sigData[currentSigIdx]);

      // Handle screen resize/rotation on mobile
      const handleResize = () => {
        const dataURL = canvas.toDataURL();
        canvas.width = canvas.parentElement.offsetWidth || 432;
        canvas.height = 180;
        
        ctx.strokeStyle = '#1a1a2e';
        ctx.lineWidth = 2.2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        const img = new Image();
        img.onload = () => {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        };
        img.src = dataURL;
      };

      // Define touch event listeners manually with { passive: false } to prevent browser scroll warnings and page dragging
      const handleTouchStartEvent = (e) => {
        e.preventDefault();
        isDrawingRef.current = true;
        setSigHasContent(true);
        const p = getTouchPos(e, canvas);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
      };

      const handleTouchMoveEvent = (e) => {
        e.preventDefault();
        if (!isDrawingRef.current) return;
        const p = getTouchPos(e, canvas);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
      };

      const handleTouchEndEvent = () => {
        isDrawingRef.current = false;
      };

      canvas.addEventListener('touchstart', handleTouchStartEvent, { passive: false });
      canvas.addEventListener('touchmove', handleTouchMoveEvent, { passive: false });
      canvas.addEventListener('touchend', handleTouchEndEvent);

      window.addEventListener('resize', handleResize);
      return () => {
        window.removeEventListener('resize', handleResize);
        canvas.removeEventListener('touchstart', handleTouchStartEvent);
        canvas.removeEventListener('touchmove', handleTouchMoveEvent);
        canvas.removeEventListener('touchend', handleTouchEndEvent);
      };
    }
  }, [sigModalOpen, currentSigIdx, sigData]);

  const openSigModal = (idx) => {
    setCurrentSigIdx(idx);
    setSigModalOpen(true);
  };

  const closeSigModal = () => {
    setSigModalOpen(false);
    setCurrentSigIdx(null);
  };

  const clearModalCanvas = () => {
    if (sigModalCtxRef.current && sigModalCanvasRef.current) {
      sigModalCtxRef.current.clearRect(0, 0, sigModalCanvasRef.current.width, sigModalCanvasRef.current.height);
    }
    setSigHasContent(false);
  };

  const confirmSig = () => {
    if (!sigHasContent) {
      closeSigModal();
      return;
    }
    const dataURL = sigModalCanvasRef.current.toDataURL('image/png');
    
    const newSigData = [...sigData];
    newSigData[currentSigIdx] = dataURL;
    setSigData(newSigData);

    const now = new Date();
    const newSigTimes = [...sigTimes];
    newSigTimes[currentSigIdx] = `Signed ${now.toLocaleDateString('en-IN')} ${now.toLocaleTimeString('en-IN', {hour:'2-digit',minute:'2-digit'})}`;
    setSigTimes(newSigTimes);

    closeSigModal();
  };

  const clearSig = (idx) => {
    const newSigData = [...sigData];
    newSigData[idx] = null;
    setSigData(newSigData);

    const newSigTimes = [...sigTimes];
    newSigTimes[idx] = '';
    setSigTimes(newSigTimes);
  };

  return (
    <>
      {/* TOOLBAR */}
      <div className="toolbar" style={{ justifyContent: 'center' }}>
        <button 
          className="btn btn-green" 
          style={{ 
            padding: '10px 30px', 
            fontSize: '14px', 
            borderRadius: '6px', 
            display: 'flex', 
            alignItems: 'center', 
            gap: '8px',
            boxShadow: '0 4px 12px rgba(22, 163, 74, 0.3)' 
          }} 
          onClick={printReport}
        >
          <span>⬇</span> Download PDF
        </button>
      </div>

      {/* A4 PAGE CONTAINER */}
      <div 
        ref={containerRef}
        className="a4-container"
        style={{
          width: '100%',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'flex-start',
          overflow: 'hidden',
          height: scale < 1 ? `${pageHeight * scale}px` : 'auto',
          padding: scale < 1 ? '0' : '0 10px',
        }}
      >
        <div 
          ref={a4PageRef}
          className="a4-page" 
          id="a4Page"
          style={scale < 1 ? {
            transform: `scale(${scale})`,
            transformOrigin: 'top center',
            flexShrink: 0,
            margin: '0',
            width: '210mm',
            minWidth: '210mm',
            maxWidth: 'none',
          } : {
            margin: '0 auto 20px',
          }}
        >

        {/* HEADER */}
        <div className="header">
          <div className="logo-area">
            <div className="logo-row">
              <div className="logo-circle"><span className="logo-z">Z</span></div>
              <span className="brand-name">ZeeSense</span>
            </div>
            <div className="tagline">connecting with real world</div>
          </div>
          <div className="header-right">
            <div className="csr-badge">CUSTOMER SERVICE REPORT</div><br/>
            <span className="company-name">ZeeSense Systems Pvt. Ltd.</span>
          </div>
        </div>

        {/* MAIN TABLE */}
        <div className="main-table">

          {/* INFO ROW */}
          <div className="info-row">
            <div className="address-cell">
              <div className="address-company">M/s. ZeeSense systems Pvt. Ltd</div>
              <div className="address-text">No.40, East End Main,<br/>South End 'A' Cross, Jayanagar.<br/>9th Block, Bengaluru - 560069.</div>
            </div>
            <div className="fields-cell">
              <div className="field-row">
                <span className="field-label">Site :</span>
                <input className="field-input" id="f_site" placeholder="Enter site…" value={form.site} onChange={e => handleFieldChange('site', e.target.value)} />
              </div>
              <div className="field-row">
                <span className="field-label">Date :</span>
                <input className="field-input" id="f_date" type="text" placeholder="DD/MM/YYYY" value={form.date} onChange={e => handleFieldChange('date', e.target.value)} />
              </div>
              <div className="field-row">
                <span className="field-label">Customer Rep :</span>
                <input className="field-input" id="f_customerRep" placeholder="Name…" value={form.customerRep} onChange={e => handleFieldChange('customerRep', e.target.value)} />
              </div>
              <div className="field-row">
                <span className="field-label">Zee Sense Rep (s.) :</span>
                <input className="field-input" id="f_zeeSenseRep" placeholder="Name(s)…" value={form.zeeSenseRep} onChange={e => handleFieldChange('zeeSenseRep', e.target.value)} />
              </div>
            </div>
          </div>

          {/* TASKS HEADER */}
          <div className="tasks-header">
            <div className="th-sl">Sl. No :</div>
            <div className="th-desc">Task Description</div>
          </div>

          {/* TASKS BODY */}
          <div className="tasks-body">
            <div className="sl-col" id="slCol">
              {form.tasks.map((t, i) => (
                <div key={i} className={`task-row-sl ${!t.description.trim() ? 'empty-task' : ''}`}>{i + 1}</div>
              ))}
            </div>
            <div className="desc-col" id="descCol">
              {form.tasks.map((t, i) => (
                <div key={i} className={`task-row-input-wrap ${!t.description.trim() ? 'empty-task' : ''}`}>
                  <input 
                    type="text" 
                    className="task-input" 
                    placeholder={i === 0 ? 'Type task or click 🎤 to speak…' : ''}
                    value={t.description}
                    onChange={e => handleTaskChange(i, e.target.value)}
                    onFocus={() => setActiveRow(i)}
                  />
                  {activeRow === i && (
                    <>
                      <button 
                        className={`mic-row-btn ${currentRowIdx === i && rowRecording ? 'recording-row' : ''}`} 
                        title="Speak this task"
                        onClick={() => startRowRecording(i)}
                      >
                        🎤
                      </button>
                      <button
                        className="mic-row-btn"
                        title="Improvise this task"
                        onClick={() => handleImprovise(t.description, i)}
                        disabled={processingIdx === i}
                      >
                        {processingIdx === i ? '⏳' : processingIdx === `done-${i}` ? '✓' : processingIdx === `error-${i}` ? '❌' : '✨'}
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>

        </div>{/* /main-table */}

        {/* FOLLOW-UP */}
        <div className="followup-section">
          <div className="followup-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Follow-up required</span>
            {activeRow === 'followup' && (
              <div style={{ display: 'flex' }} className="print:hidden">
                <button 
                  className={`mic-row-btn ${currentRowIdx === 'followup' && rowRecording ? 'recording-row' : ''}`} 
                  title="Speak follow-up"
                  onClick={() => startRowRecording('followup')}
                >
                  🎤
                </button>
                <button
                  className="mic-row-btn"
                  title="Improvise follow-up"
                  onClick={() => handleImprovise(form.followUpRequired, 'followup')}
                  disabled={processingIdx === 'followup'}
                >
                  {processingIdx === 'followup' ? '⏳' : processingIdx === 'done-followup' ? '✓' : processingIdx === 'error-followup' ? '❌' : '✨'}
                </button>
              </div>
            )}
          </div>
          <div className="followup-box">
            <textarea 
              className="followup-textarea" 
              id="f_followup" 
              placeholder="Describe any follow-up actions required…"
              value={form.followUpRequired}
              onChange={e => handleFieldChange('followUpRequired', e.target.value)}
              onFocus={() => setActiveRow('followup')}
            ></textarea>
          </div>
        </div>

        <div className="spacer"></div>

        {/* SIGNATURES */}
        <div className="signatures">
          <div className="sig-block">
            <div className="sig-name">ZeeSense Engr.</div>
            <div className="sig-sub">(Name &amp; Signature)</div>
            <div className={`sig-pad-area ${sigData[0] ? 'has-sig' : ''}`} onClick={() => openSigModal(0)}>
              {sigData[0] && <img src={sigData[0]} style={{display:'block', width:'100%', height:'100%'}} alt="Signature" />}
              <div className="sig-placeholder">✍ Click to sign</div>
            </div>
            <input 
              className="sig-name-input" 
              placeholder="Type name here…" 
              value={sigNames[0]} 
              onChange={e => {
                const ns = [...sigNames];
                ns[0] = e.target.value;
                setSigNames(ns);
              }}
            />
            <div className="sig-actions">
              <button className="sig-btn primary" onClick={(e) => { e.stopPropagation(); openSigModal(0); }}>✍ Sign</button>
              <button className="sig-btn danger" onClick={(e) => { e.stopPropagation(); clearSig(0); }}>✕ Clear</button>
            </div>
            <div className="sig-timestamp">{sigTimes[0]}</div>
          </div>
          <div className="sig-block">
            <div className="sig-name">Customer Rep.</div>
            <div className="sig-sub">(Name &amp; Signature)</div>
            <div className={`sig-pad-area ${sigData[1] ? 'has-sig' : ''}`} onClick={() => openSigModal(1)}>
              {sigData[1] && <img src={sigData[1]} style={{display:'block', width:'100%', height:'100%'}} alt="Signature" />}
              <div className="sig-placeholder">✍ Click to sign</div>
            </div>
            <input 
              className="sig-name-input" 
              placeholder="Type name here…" 
              value={sigNames[1]} 
              onChange={e => {
                const ns = [...sigNames];
                ns[1] = e.target.value;
                setSigNames(ns);
              }}
            />
            <div className="sig-actions">
              <button className="sig-btn primary" onClick={(e) => { e.stopPropagation(); openSigModal(1); }}>✍ Sign</button>
              <button className="sig-btn danger" onClick={(e) => { e.stopPropagation(); clearSig(1); }}>✕ Clear</button>
            </div>
            <div className="sig-timestamp">{sigTimes[1]}</div>
          </div>
        </div>

      </div>{/* /a4-page */}
      </div>{/* /a4-container */}

      {/* SIGNATURE MODAL */}
      <div className={`sig-overlay ${sigModalOpen ? 'active' : ''}`} onClick={(e) => { if (e.target.classList.contains('sig-overlay')) closeSigModal(); }}>
        <div className="sig-modal">
          <div className="sig-modal-title" id="sigModalTitle">
            {currentSigIdx === 0 ? 'ZeeSense Engr. Signature' : 'Customer Rep. Signature'}
          </div>
          <div className="sig-modal-sub">Sign inside the box using your mouse or finger</div>
          <div className={`sig-modal-canvas-wrap ${sigHasContent ? 'drawing' : ''}`} id="sigModalWrap">
            <canvas 
              ref={sigModalCanvasRef}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            ></canvas>
            <div className="sig-modal-hint">✍ Draw your signature here</div>
          </div>
          <div className="sig-modal-actions">
            <button className="sig-btn" onClick={clearModalCanvas}>✕ Clear</button>
            <button className="sig-btn" onClick={closeSigModal}>Cancel</button>
            <button className="sig-btn primary" onClick={confirmSig}>✓ Confirm</button>
          </div>
        </div>
      </div>

      {/* VOICE MODAL */}
      <div className={`voice-overlay ${rowRecording ? 'active' : ''}`}>
        <div className="voice-modal">
          <div className="voice-title">Recording for task</div>
          <div className="voice-row-label">{currentRowIdx === 'followup' ? 'Follow-up' : `Row #${currentRowIdx !== null ? currentRowIdx + 1 : ''}`}</div>
          <div className="voice-wave">
            <div className="wave-bar"></div><div className="wave-bar"></div><div className="wave-bar"></div>
            <div className="wave-bar"></div><div className="wave-bar"></div><div className="wave-bar"></div>
            <div className="wave-bar"></div><div className="wave-bar"></div>
          </div>
          <div className="voice-timer-modal">{formatTime(rowTimer)}</div>
          <button className="btn-stop-modal" onClick={stopRowRecording}>■ Stop</button>
          <div className="voice-transcript">{rowTranscript}</div>
        </div>
      </div>
    </>
  );
}

export default App;