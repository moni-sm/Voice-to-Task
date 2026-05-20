import React, { useState, useEffect, useRef, useCallback } from 'react';

const NUM_TASKS = 14;
const API_URL = 'https://voice-to-task.onrender.com';


// Auto-growing textarea that resizes to fit its content
function TaskTextarea({ value, placeholder, onChange }) {
  const ref = useRef(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.style.height = 'auto';
      ref.current.style.height = ref.current.scrollHeight + 'px';
    }
  }, [value]);

  return (
    <textarea
      ref={ref}
      className="task-input"
      placeholder={placeholder}
      value={value}
      rows={1}
      onChange={e => onChange(e.target.value)}
    />
  );
}



function App() {
  const [form, setForm] = useState({
    site: '',
    date: new Date().toLocaleDateString('en-IN'),
    customerRep: '',
    zeeSenseRep: '',
    tasks: Array.from({ length: NUM_TASKS }, () => ({ description: '' })),
    followUpRequired: ''
  });

  // ── CHAT STATE ──
  const [chatMessages, setChatMessages] = useState([
    {
      role: 'ai',
      text: null,
      data: null,
      aiFormatted: null,
      accepted: false,
      id: 'welcome'
    }
  ]);
  const [chatInput, setChatInput] = useState('');
  const [isChatProcessing, setIsChatProcessing] = useState(false);
  const [isChatRecording, setIsChatRecording] = useState(false);
  const [chatTimer, setChatTimer] = useState(0);
  // 'report' = waiting for user to describe service | 'metadata' = waiting for site/date/names
  const [chatMode, setChatMode] = useState('report');
  const [pendingReportData, setPendingReportData] = useState(null);
  const chatEndRef = useRef(null);
  const chatTimerRef = useRef(null);
  const chatRecognitionRef = useRef(null);

  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

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

  // Scaling
  const [scale, setScale] = useState(1);
  const [pageHeight, setPageHeight] = useState(1123);
  const containerRef = useRef(null);
  const a4PageRef = useRef(null);

  useEffect(() => {
    return () => {
      clearInterval(chatTimerRef.current);
      if (chatRecognitionRef.current) chatRecognitionRef.current.stop();
    };
  }, []);

  // Freeze scroll when modal open
  useEffect(() => {
    if (sigModalOpen) {
      document.body.classList.add('modal-open');
    } else {
      document.body.classList.remove('modal-open');
    }
    return () => document.body.classList.remove('modal-open');
  }, [sigModalOpen]);

  // Scaling
  useEffect(() => {
    const handleResize = () => {
      if (!containerRef.current || !a4PageRef.current) return;
      const containerWidth = containerRef.current.offsetWidth;
      const pageWidth = 794;
      let currentScale = 1;
      if (containerWidth < pageWidth) currentScale = containerWidth / pageWidth;
      setScale(currentScale);
      setPageHeight(a4PageRef.current.offsetHeight);
    };
    const observer = new ResizeObserver(() => handleResize());
    if (containerRef.current) observer.observe(containerRef.current);
    if (a4PageRef.current) observer.observe(a4PageRef.current);
    handleResize();
    return () => observer.disconnect();
  }, []);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const formatTime = (s) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

  const handleFieldChange = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const handleTaskChange = (index, value) => {
    const newTasks = [...form.tasks];
    newTasks[index].description = value;
    setForm(prev => ({ ...prev, tasks: newTasks }));
  };

  // ── CHAT RECORDING (auto-send after stop) ──
  const startChatRecording = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { alert('Speech recognition not supported in this browser.'); return; }

    setIsChatRecording(true);
    setChatTimer(0);
    chatTimerRef.current = setInterval(() => setChatTimer(t => t + 1), 1000);

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
    recognition.onerror = () => stopChatRecording(transcript);
    recognition.onend = () => stopChatRecording(transcript);
    recognition.start();
    chatRecognitionRef.current = recognition;
    chatRecognitionRef.current._getTranscript = () => transcript;
  };

  const stopChatRecording = (tr) => {
    setIsChatRecording(false);
    clearInterval(chatTimerRef.current);
    if (chatRecognitionRef.current) {
      try { chatRecognitionRef.current.stop(); } catch(e) {}
    }
    const transcript = tr || (chatRecognitionRef.current?._getTranscript?.() || '');
    if (transcript.trim()) {
      sendChatMessage(transcript.trim());
    }
  };

  // ── SEND CHAT MESSAGE ──
  const sendChatMessage = async (overrideText) => {
    const text = overrideText || chatInput.trim();
    if (!text) return;
    setChatInput('');

    // ── METADATA MODE: user is answering the site/date/names question ──
    if (chatMode === 'metadata') {
      const userMsg = { role: 'user', text, id: Date.now() };
      setChatMessages(prev => [...prev, userMsg]);

      // Parse the user's answer by sending it to the AI to extract metadata fields
      setIsChatProcessing(true);
      const thinkingId = 'thinking-meta-' + Date.now();
      setChatMessages(prev => [...prev, { role: 'ai', text: null, data: null, aiFormatted: null, accepted: false, id: thinkingId }]);

      try {
        const formData = new FormData();
        formData.append('text', text);
        const response = await fetch(`${API_URL}/api/process`, { method: 'POST', body: formData });
        if (!response.ok) throw new Error('Server error');
        const metaData = await response.json();

        // Merge metadata into the pending report data
        const merged = {
          ...pendingReportData,
          site: metaData.site || pendingReportData?.site || '',
          date: metaData.date || pendingReportData?.date || '',
          customerRep: metaData.customerRep || pendingReportData?.customerRep || '',
          zeeSenseRep: metaData.zeeSenseRep || pendingReportData?.zeeSenseRep || '',
        };

        // Show a confirmation bubble with Accept button carrying merged data
        const confirmText = [
          merged.site       ? `📍 Site: ${merged.site}` : null,
          merged.date       ? `📅 Date: ${merged.date}` : null,
          merged.customerRep ? `👤 Customer Rep: ${merged.customerRep}` : null,
          merged.zeeSenseRep ? `🔧 Engineer: ${merged.zeeSenseRep}` : null,
          '\nAll done! Click Accept to fill the complete report.',
        ].filter(Boolean).join('\n');

        // Get the original formatted text from pending
        const originalFormatted = pendingReportData?._aiFormatted || '';

        setChatMessages(prev => prev.map(m =>
          m.id === thinkingId
            ? { ...m, text: confirmText, data: merged, aiFormatted: originalFormatted, accepted: false }
            : m
        ));

        setChatMode('report');
        setPendingReportData(null);
      } catch (e) {
        setChatMessages(prev => prev.map(m =>
          m.id === thinkingId
            ? { ...m, text: '❌ Could not process details. Please try again.', data: null }
            : m
        ));
      } finally {
        setIsChatProcessing(false);
      }
      return;
    }

    // ── REPORT MODE: user is describing the service visit ──
    const userMsg = { role: 'user', text, id: Date.now() };
    setChatMessages(prev => [...prev, userMsg]);
    setIsChatProcessing(true);

    const thinkingMsg = { role: 'ai', text: null, data: null, aiFormatted: null, accepted: false, id: 'thinking-' + Date.now() };
    setChatMessages(prev => [...prev, thinkingMsg]);

    try {
      const formData = new FormData();
      formData.append('text', text);

      const response = await fetch(`${API_URL}/api/process`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) throw new Error('Server error');
      const data = await response.json();

      const aiFormatted = formatAiResponse(data);

      setChatMessages(prev => prev.map(m =>
        m.id === thinkingMsg.id
          ? { ...m, text: aiFormatted, data, aiFormatted, accepted: false }
          : m
      ));

      // After showing structured tasks, automatically ask for missing header details
      const missingFields = [];
      if (!data.site)        missingFields.push('site name');
      if (!data.date)        missingFields.push('date');
      if (!data.customerRep) missingFields.push('customer representative name');
      if (!data.zeeSenseRep) missingFields.push('your name (ZeeSense engineer)');

      if (missingFields.length > 0) {
        // Store the report data and switch to metadata collection mode
        setPendingReportData({ ...data, _aiFormatted: aiFormatted });
        setChatMode('metadata');

        const askMsg = {
          role: 'ai',
          text: `📋 Got the report details! Before you accept, please share:\n${missingFields.map((f, i) => `${i + 1}. ${f}`).join('\n')}\n\nYou can reply in one line, e.g.: "Site: ABC Tower, Date: 20/05/2026, Customer: John, Engineer: Ravi"`,
          data: null,
          aiFormatted: null,
          accepted: false,
          isAsk: true,
          id: 'ask-meta-' + Date.now()
        };
        setChatMessages(prev => [...prev, askMsg]);
      }

    } catch (e) {
      setChatMessages(prev => prev.map(m =>
        m.id === thinkingMsg.id
          ? { ...m, text: '\u274c Failed to process. Please try again.', data: null }
          : m
      ));
    } finally {
      setIsChatProcessing(false);
    }
  };

  const formatAiResponse = (data) => {
    // Only include task lines in the chat bubble — followUpRequired is handled separately in the A4 form
    const lines = [];
    if (data.tasks && data.tasks.length > 0) {
      data.tasks.forEach(t => {
        if (t.description && t.description.trim()) lines.push(t.description.trim());
      });
    }
    return lines.join('\n');
  };

  // ── ACCEPT CHAT RESPONSE ──
  // Uses the exact displayed text from the chat bubble (aiFormatted) split line-by-line
  // so that what you SEE in the chat is exactly what fills the form rows.
  const acceptChatResponse = (msgId, data, aiFormatted) => {
    if (!data) return;

    setForm(prev => {
      const newForm = { ...prev };

      // Fill header metadata fields from structured data
      if (data.site) newForm.site = data.site;
      if (data.date) newForm.date = data.date;
      if (data.customerRep) newForm.customerRep = data.customerRep;
      if (data.zeeSenseRep) newForm.zeeSenseRep = data.zeeSenseRep;
      // Note: followUpRequired is intentionally NOT filled from chat.
      // User fills it separately using the mic/enhance buttons in the A4 form.

      // Split every visible line from the chat bubble into separate rows
      // This ensures exact 1:1 match between what user sees and what fills the form
      if (aiFormatted) {
        const lines = aiFormatted
          .split('\n')
          .map(l => l.trim())
          .filter(l => l.length > 0);

        // Start with enough blank rows (at least NUM_TASKS)
        const freshTasks = Array.from(
          { length: Math.max(NUM_TASKS, lines.length) },
          () => ({ description: '' })
        );

        lines.forEach((line, i) => {
          freshTasks[i].description = line;
        });

        newForm.tasks = freshTasks;
      } else if (data.tasks && data.tasks.length > 0) {
        // Fallback: use structured task list if no formatted text available
        const freshTasks = Array.from(
          { length: Math.max(NUM_TASKS, data.tasks.length) },
          () => ({ description: '' })
        );
        data.tasks.forEach((t, i) => {
          freshTasks[i].description = (t.description || t || '').trim();
        });
        newForm.tasks = freshTasks;
      }

      return newForm;
    });

    setChatMessages(prev => prev.map(m =>
      m.id === msgId ? { ...m, accepted: true } : m
    ));
  };

  const discardChatResponse = (msgId) => {
    setChatMessages(prev => prev.map(m =>
      m.id === msgId ? { ...m, accepted: 'discarded' } : m
    ));
  };

  // ── FOLLOW-UP MIC & ENHANCE ──
  const [followupRecording, setFollowupRecording] = useState(false);
  const [followupEnhancing, setFollowupEnhancing] = useState(false);
  const followupRecognitionRef = useRef(null);

  const startFollowupRecording = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { alert('Speech recognition not supported.'); return; }
    if (followupRecording) {
      followupRecognitionRef.current?.stop();
      setFollowupRecording(false);
      return;
    }

    setFollowupRecording(true);
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
      handleFieldChange('followUpRequired', (finalText + interim).trim());
    };
    recognition.onerror = () => setFollowupRecording(false);
    recognition.onend = () => setFollowupRecording(false);
    recognition.start();
    followupRecognitionRef.current = recognition;
  };

  const enhanceFollowup = async () => {
    if (!form.followUpRequired.trim()) return;
    setFollowupEnhancing(true);
    try {
      const formData = new FormData();
      formData.append('text', 'Follow-up for service report: ' + form.followUpRequired);
      const response = await fetch(`${API_URL}/api/process`, { method: 'POST', body: formData });
      if (!response.ok) throw new Error('Server error');
      const data = await response.json();
      if (data.followUpRequired) {
        handleFieldChange('followUpRequired', data.followUpRequired);
      } else if (data.tasks && data.tasks.length > 0) {
        handleFieldChange('followUpRequired', data.tasks.map(t => t.description || t).join('\n'));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setFollowupEnhancing(false);
    }
  };

  // ── PDF DOWNLOAD ──
  const downloadPdf = async () => {
    setIsGeneratingPdf(true);
    try {
      const payload = {
        site: form.site,
        date: form.date,
        customerRep: form.customerRep,
        zeeSenseRep: form.zeeSenseRep,
        tasks: form.tasks
          .map((t, i) => ({ slNo: i + 1, description: t.description }))
          .filter(t => t.description.trim() !== ''),
        followUpRequired: form.followUpRequired,
        signatures: sigData
      };

      // Server now returns the PDF binary directly
      const response = await fetch(`${API_URL}/api/generate-pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) throw new Error('Failed to generate PDF');

      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const filename = `ZeeSense_Report_${Date.now()}.pdf`;

      // Detect iOS Safari — it blocks programmatic link clicks after async
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

      if (isIOS) {
        // iOS Safari: open in new tab so user can use Share > Save to Files
        window.open(blobUrl, '_blank');
      } else {
        // Android / Desktop: trigger native file download
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = filename;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }

      // Clean up blob URL after a short delay
      setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);

    } catch (error) {
      console.error(error);
      alert('Error generating PDF: ' + error.message);
    } finally {
      setIsGeneratingPdf(false);
    }
  };


  // ── MOUSE HANDLERS ──
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

  // ── SIGNATURE CANVAS ──
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
          img.onload = () => ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          img.src = sigData[currentSigIdx];
        }
      };

      initCanvas();
      setSigHasContent(!!sigData[currentSigIdx]);

      const handleResize = () => {
        const dataURL = canvas.toDataURL();
        canvas.width = canvas.parentElement.offsetWidth || 432;
        canvas.height = 180;
        ctx.strokeStyle = '#1a1a2e';
        ctx.lineWidth = 2.2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        const img = new Image();
        img.onload = () => ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        img.src = dataURL;
      };

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

      const handleTouchEndEvent = () => { isDrawingRef.current = false; };

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

  const openSigModal = (idx) => { setCurrentSigIdx(idx); setSigModalOpen(true); };
  const closeSigModal = () => { setSigModalOpen(false); setCurrentSigIdx(null); };

  const clearModalCanvas = () => {
    if (sigModalCtxRef.current && sigModalCanvasRef.current) {
      sigModalCtxRef.current.clearRect(0, 0, sigModalCanvasRef.current.width, sigModalCanvasRef.current.height);
    }
    setSigHasContent(false);
  };

  const confirmSig = () => {
    if (!sigHasContent) { closeSigModal(); return; }
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

  // ── RENDER CHAT BUBBLE TEXT ──
  const renderAiBubble = (text) => {
    if (!text) return null;
    return text.split('\n').map((line, i) => {
      if (!line.trim()) return <div key={i} style={{height: 6}} />;
      const colonIdx = line.indexOf(':');
      if (colonIdx > 0 && colonIdx < 40) {
        const label = line.slice(0, colonIdx);
        const rest = line.slice(colonIdx + 1).trim();
        return (
          <div key={i} className="chat-bullet">
            <span className="chat-bullet-dot">•</span>
            <span>
              <strong className="chat-label">{label}:</strong>
              {rest ? ` ${rest}` : ''}
            </span>
          </div>
        );
      }
      return (
        <div key={i} className="chat-line">{line}</div>
      );
    });
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
          onClick={downloadPdf}
          disabled={isGeneratingPdf}
        >
          {isGeneratingPdf ? (
            <>
              <div className="spinner" style={{width: 16, height: 16, borderWidth: 2}}></div>
              Generating...
            </>
          ) : (
            <>
              <span>⬇</span> Download PDF
            </>
          )}
        </button>
      </div>

      {/* CHAT PANEL */}
      <div className="chat-panel">
        <div className="chat-header">
          <span className="chat-header-icon">🤖</span>
          <div>
            <div className="chat-header-title">ZeeSense AI Assistant</div>
            <div className="chat-header-sub">Describe your service visit and I'll structure it for you</div>
          </div>
        </div>

        <div className="chat-messages">
          {/* Welcome message */}
          <div className="chat-bubble chat-bubble-ai" style={{opacity: 0.85}}>
            <div className="chat-line">👋 Hi! Describe your service visit in plain language (typed or spoken) and I'll convert it into a structured service report with elaborated points.</div>
            <div className="chat-line" style={{marginTop: 6, fontSize: '0.82em', color: '#a0c4ff'}}>Example: <em>"I went to site, lift cameras not working, restarted switch in LMR room, now working..."</em></div>
          </div>

          {chatMessages.filter(m => m.id !== 'welcome').map((msg) => (
            <div key={msg.id}>
              {msg.role === 'user' && (
                <div className="chat-bubble chat-bubble-user">
                  {msg.text}
                </div>
              )}
              {msg.role === 'ai' && (
                <div className="chat-bubble-ai-wrap">
                  {msg.isAsk ? (
                    // Special "ask" bubble — visually distinct, no accept/discard
                    <div className="chat-bubble-ask">
                      {msg.text === null ? (
                        <div className="chat-thinking"><span></span><span></span><span></span></div>
                      ) : (
                        renderAiBubble(msg.text)
                      )}
                    </div>
                  ) : (
                    // Normal AI task bubble
                    <div className={`chat-bubble chat-bubble-ai ${msg.accepted === true ? 'accepted' : msg.accepted === 'discarded' ? 'discarded' : ''}`}>
                      {msg.text === null ? (
                        <div className="chat-thinking">
                          <span></span><span></span><span></span>
                        </div>
                      ) : (
                        renderAiBubble(msg.text)
                      )}
                    </div>
                  )}
                  {msg.data && msg.accepted === false && !msg.isAsk && (
                    <div className="chat-actions">
                      <button
                        className="chat-action-btn accept"
                        onClick={() => acceptChatResponse(msg.id, msg.data, msg.aiFormatted)}
                      >
                        ✓ Accept — Fill Report
                      </button>
                      <button
                        className="chat-action-btn discard"
                        onClick={() => discardChatResponse(msg.id)}
                      >
                        ✕ Discard
                      </button>
                    </div>
                  )}
                  {msg.accepted === true && (
                    <div className="chat-accepted-badge">✓ Applied to report</div>
                  )}
                  {msg.accepted === 'discarded' && (
                    <div className="chat-discarded-badge">✕ Discarded</div>
                  )}
                </div>
              )}

            </div>
          ))}
          <div ref={chatEndRef} />
        </div>

        <div className={`chat-input-row ${chatMode === 'metadata' ? 'metadata-mode' : ''}`}>
          <textarea
            className="chat-textarea"
            placeholder={chatMode === 'metadata'
              ? 'Reply with site, date, customer name, engineer name… or 🎤'
              : 'Describe your service visit here… or use 🎤'}
            value={chatInput}
            onChange={e => setChatInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendChatMessage();
              }
            }}
            rows={2}
            disabled={isChatProcessing || isChatRecording}
          />
          <div className="chat-input-btns">
            <button
              className={`chat-mic-btn ${isChatRecording ? 'recording' : ''}`}
              onClick={isChatRecording ? () => stopChatRecording(chatRecognitionRef.current?._getTranscript?.() || '') : startChatRecording}
              title={isChatRecording ? `Stop recording (${formatTime(chatTimer)})` : 'Record voice'}
              disabled={isChatProcessing}
            >
              {isChatRecording ? <><span className="rec-dot"></span>{formatTime(chatTimer)}</> : '🎤'}
            </button>
            <button
              className="chat-send-btn"
              onClick={() => sendChatMessage()}
              disabled={isChatProcessing || isChatRecording || !chatInput.trim()}
            >
              {isChatProcessing ? <div className="spinner" style={{width: 16, height: 16, borderWidth: 2}}></div> : '➤'}
            </button>
          </div>
        </div>
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

          {/* TASKS BODY - unified rows so sl and desc grow together */}
          <div className="tasks-body-unified" id="tasksBody">
            {form.tasks.map((t, i) => (
              <div key={i} className={`task-row-unified ${!t.description.trim() ? 'empty-task' : ''}`}>
                <div className="task-row-sl-cell">{i + 1}</div>
                <div className="task-row-desc-cell">
                  <TaskTextarea
                    value={t.description}
                    placeholder={i === 0 ? 'Accept from chat or type here…' : ''}
                    onChange={val => handleTaskChange(i, val)}
                  />
                </div>
              </div>
            ))}
          </div>

        </div>{/* /main-table */}

        {/* FOLLOW-UP */}
        {(() => {
          const hasDescription = form.tasks.some(t => t.description.trim());
          return (
            <div className={`followup-section ${!hasDescription ? 'followup-locked' : ''}`}>
              <div className="followup-label">
                <span>Follow-up required</span>
                {hasDescription && (
                  <div className="followup-actions print-hidden">
                    <button
                      className={`followup-btn ${followupRecording ? 'recording' : ''}`}
                      title={followupRecording ? 'Stop recording' : 'Speak follow-up'}
                      onClick={startFollowupRecording}
                    >
                      {followupRecording ? '⏹ Stop' : '🎤'}
                    </button>
                    <button
                      className={`followup-btn enhance ${followupEnhancing ? 'loading' : ''}`}
                      title="Enhance follow-up with AI"
                      onClick={enhanceFollowup}
                      disabled={followupEnhancing || !form.followUpRequired.trim()}
                    >
                      {followupEnhancing ? '⏳' : '✨ Enhance'}
                    </button>
                  </div>
                )}
              </div>
              <div className="followup-box">
                {!hasDescription ? (
                  <div className="followup-locked-msg">
                    ✏️ Fill the task description rows above first, then add follow-up here.
                  </div>
                ) : (
                  <textarea
                    className="followup-textarea"
                    id="f_followup"
                    placeholder={followupRecording ? '🎤 Listening…' : 'Speak 🎤 or type follow-up actions, recommendations, and status…'}
                    value={form.followUpRequired}
                    onChange={e => handleFieldChange('followUpRequired', e.target.value)}
                  ></textarea>
                )}
              </div>
            </div>
          );
        })()}


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
    </>
  );
}

export default App;