/* ============================================================================
   HATTAN OPS V18 — STABILITY RELEASE
   Keeps the live session masked during startup, makes same-day automatically
   mean RUSH, uses recorded-audio transcription by default on Windows, and
   removes false text-caret behavior from navigation controls.
============================================================================ */

const V18_VERSION = 'V18 Stability';
let v18BootPending = true;

function v18Wait(milliseconds) {
  return new Promise(resolve => window.setTimeout(resolve, milliseconds));
}

/* Retry only safe reads. A brief Wi-Fi interruption during reload should not
   turn into a false signed-out/setup screen. */
const v18BaseApi = v16Api;
v16Api = async function v18Api(path, options = {}) {
  const method = String(options.method || 'GET').toUpperCase();
  let response = await v18BaseApi(path, options);
  if (method === 'GET' && (response.networkError || response.status >= 500)) {
    await v18Wait(450);
    response = await v18BaseApi(path, options);
  }
  return response;
};

function v18LoadingHTML() {
  return `<div class="v18-loading-shell"><div><div class="spinner"></div><strong>Restoring secure session…</strong><div style="margin-top:5px;font-size:12px;opacity:.75">Please wait; no sign-in is required during a normal reload.</div></div></div>`;
}

/* Never render the seeded prototype staff while the shared server is still
   determining the real signed-in session and real employee list. */
const v18BaseRenderPosRoot = renderPosRoot;
renderPosRoot = function v18RenderPosRoot() {
  if (v18BootPending) {
    const root = document.getElementById('pos-root');
    if (root) root.innerHTML = v18LoadingHTML();
    return;
  }
  const result = v18BaseRenderPosRoot();
  v18ClearNavigationSelection();
  return result;
};

const v18BaseBoot = v16Boot;
v16Boot = async function v18Boot() {
  v18BootPending = true;
  const slowTimer = window.setTimeout(() => {
    const message = document.getElementById('v18-boot-message');
    const retry = document.getElementById('v18-boot-retry');
    if (message) message.textContent = 'Still connecting to the secure server…';
    if (retry) retry.hidden = false;
  }, 12000);
  try {
    await v18BaseBoot();
  } catch (error) {
    const root = document.getElementById('pos-root');
    if (root) root.innerHTML = `<div class="pos-login-wrap"><div class="pos-login-card v16-setup-gate"><div class="logo-mark" style="margin:0 auto 10px"></div><h2>Could not restore the secure POS</h2><p>${esc(error?.message || 'The server connection stopped unexpectedly.')}</p><button class="btn btn-primary btn-block" onclick="location.reload()">Retry connection</button></div></div>`;
  } finally {
    window.clearTimeout(slowTimer);
    v18BootPending = false;
    const gateIsShowing = !!document.querySelector('#pos-root .v16-setup-gate');
    if (!gateIsShowing && v16Live.config && (!v16IsShared() || v16Live.authenticated || v16Live.serverStaff.length)) renderPosRoot();
    document.documentElement.classList.remove('v18-booting', 'v17-booting');
    document.getElementById('v17-boot-screen')?.remove();
  }
};

/* ------------------------- SAME-DAY ALWAYS MEANS RUSH ------------------------- */
function v18IsToday(value) {
  return !!value && String(value).slice(0, 10) === v8TodayISO();
}

function v18SyncDraftRush(key, dueDate, requestedRush = false) {
  v14EnsureDraft(counterDraft);
  const groups = new Set(counterDraft.rushGroups || []);
  const rush = !!requestedRush || v18IsToday(dueDate);
  if (rush) {
    groups.add(key);
    counterDraft.serviceDueTimes[key] = counterDraft.serviceDueTimes[key] || state.workflowSettings.rushReadyTime || '16:00';
  } else groups.delete(key);
  counterDraft.rushGroups = [...groups];
  return rush;
}

v14SetDueDate = function v18SetDueDate(key, value, requestedRush) {
  v14EnsureDraft(counterDraft);
  counterDraft.serviceDueDates[key] = value;
  v18SyncDraftRush(key, value, requestedRush);
  renderPosContent();
};

const v18BaseDuePanelHTML = v14DuePanelHTML;
v14DuePanelHTML = function v18DuePanelHTML(group) {
  const key = v14GroupKey(group);
  const date = counterDraft.serviceDueDates[key] || counterDraft.serviceDueDates[group.service] || v8DefaultDue(group.service);
  v18SyncDraftRush(key, date, false);
  return v18BaseDuePanelHTML(group);
};

const v18BaseCompleteDropOff = posCompleteDropOff;
posCompleteDropOff = function v18CompleteDropOff() {
  v14EnsureDraft(counterDraft);
  v8DraftGroups().forEach(group => {
    const key = v14GroupKey(group);
    const dueDate = counterDraft.serviceDueDates[key] || counterDraft.serviceDueDates[group.service] || v8DefaultDue(group.service);
    v18SyncDraftRush(key, dueDate, false);
  });
  return v18BaseCompleteDropOff();
};

function v18NormalizeOrderRush(order) {
  if (!order || !v18IsToday(order.dueDate)) return order;
  order.rush = true;
  order.dueTime = order.dueTime && order.dueTime !== '04:00 PM'
    ? order.dueTime
    : v17FormatClock(state.workflowSettings?.rushReadyTime || '16:00');
  order.tags = [...new Set([...(order.tags || []).filter(Boolean), 'rush'])];
  if (!/\bRUSH\b/i.test(String(order.notes || ''))) order.notes = ['RUSH — SAME DAY', order.notes].filter(Boolean).join(' · ');
  return order;
}

const v18BaseReceiptTicketHTML = receiptTicketHTML;
receiptTicketHTML = function v18ReceiptTicketHTML(order) {
  return v18BaseReceiptTicketHTML(v18NormalizeOrderRush(order));
};

const v18BaseCreateTicketEditDraft = v15CreateTicketEditDraft;
v15CreateTicketEditDraft = function v18CreateTicketEditDraft(order) {
  const draft = v18BaseCreateTicketEditDraft(v18NormalizeOrderRush(order));
  draft.rush = !!draft.rush || v18IsToday(draft.dueDate);
  return draft;
};

const v18BaseApplyTicketEdit = v15ApplyTicketEdit;
v15ApplyTicketEdit = function v18ApplyTicketEdit(orderId, draft) {
  if (draft) draft.rush = !!draft.rush || v18IsToday(draft.dueDate);
  const result = v18BaseApplyTicketEdit(orderId, draft);
  if (result?.ok) v18NormalizeOrderRush(result.order);
  return result;
};

/* ----------------------- NAVIGATION IS NEVER EDITABLE ----------------------- */
function v18NavigationTarget(target) {
  return target?.closest?.('button,.btn,a,[role="button"],.v14-counter-back,.pos-nav');
}

function v18ClearNavigationSelection() {
  const selection = window.getSelection?.();
  if (!selection?.rangeCount) return;
  const node = selection.anchorNode?.nodeType === Node.TEXT_NODE ? selection.anchorNode.parentElement : selection.anchorNode;
  if (v18NavigationTarget(node)) selection.removeAllRanges();
}

document.addEventListener('pointerdown', event => {
  if (!v18NavigationTarget(event.target)) return;
  window.getSelection?.().removeAllRanges?.();
}, true);
document.addEventListener('click', event => {
  if (v18NavigationTarget(event.target)) window.getSelection?.().removeAllRanges?.();
}, true);
document.addEventListener('selectionchange', v18ClearNavigationSelection);
document.addEventListener('keydown', event => {
  if (event.key === 'F7' && !['INPUT', 'TEXTAREA'].includes(event.target?.tagName)) event.preventDefault();
});

/* --------------------- RELIABLE WINDOWS VOICE INTAKE --------------------- */
const V18_MIC_STORAGE = 'hattan_v18_microphone';
const v18BaseBrowserVoice = posToggleAiVoice;
const v18BaseEnhanceCounter = v17EnhanceCounter;
let v18RecordContext = null, v18RecordAnalyser = null, v18RecordAnimation = null, v18RecordPeak = null;
let v18DiagnosticStream = null, v18DiagnosticContext = null, v18DiagnosticAnimation = null;

function v18IsWindows() {
  const platform = navigator.userAgentData?.platform || navigator.platform || navigator.userAgent || '';
  return /win/i.test(String(platform));
}

function v18VoiceConfigured() {
  return !!v16Live.config?.voice?.configured;
}

function v18SavedMicrophone() {
  try { return localStorage.getItem(V18_MIC_STORAGE) || ''; }
  catch (_) { return ''; }
}

function v18SaveMicrophone(deviceId) {
  try {
    if (deviceId) localStorage.setItem(V18_MIC_STORAGE, deviceId);
    else localStorage.removeItem(V18_MIC_STORAGE);
  } catch (_) { /* device choice is optional */ }
}

function v18AudioConstraints(deviceId = v18SavedMicrophone()) {
  return {
    echoCancellation:true,
    noiseSuppression:true,
    autoGainControl:true,
    ...(deviceId ? { deviceId:{ exact:deviceId } } : {}),
  };
}

async function v18OpenAudioStream(deviceId = v18SavedMicrophone()) {
  if (!window.isSecureContext) throw new Error('Open the HTTPS Netlify address before using the microphone.');
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('This browser cannot access a microphone. Update Chrome.');
  try {
    return await navigator.mediaDevices.getUserMedia({ audio:v18AudioConstraints(deviceId) });
  } catch (error) {
    if (deviceId && ['OverconstrainedError', 'NotFoundError'].includes(error?.name)) {
      v18SaveMicrophone('');
      return navigator.mediaDevices.getUserMedia({ audio:v18AudioConstraints('') });
    }
    throw error;
  }
}

function v18StopRecordMeter() {
  if (v18RecordAnimation) cancelAnimationFrame(v18RecordAnimation);
  v18RecordAnimation = null;
  try { v18RecordContext?.close?.(); } catch (_) { /* already closed */ }
  v18RecordContext = null; v18RecordAnalyser = null;
}

function v18StartRecordMeter(stream) {
  v18RecordPeak = null;
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;
  v18RecordContext = new AudioContext();
  v18RecordAnalyser = v18RecordContext.createAnalyser();
  v18RecordAnalyser.fftSize = 1024;
  v18RecordContext.createMediaStreamSource(stream).connect(v18RecordAnalyser);
  const values = new Uint8Array(v18RecordAnalyser.fftSize);
  v18RecordPeak = 0;
  const sample = () => {
    v18RecordAnalyser.getByteTimeDomainData(values);
    let squared = 0;
    values.forEach(value => { const normalized = (value - 128) / 128; squared += normalized * normalized; });
    v18RecordPeak = Math.max(v18RecordPeak, Math.sqrt(squared / values.length));
    v18RecordAnimation = requestAnimationFrame(sample);
  };
  v18RecordContext.resume?.();
  sample();
}

const v18BaseServerVoiceButton = v17ServerVoiceButton;
v17ServerVoiceButton = function v18ServerVoiceButton(recording) {
  v18BaseServerVoiceButton(recording);
  v17SetListening(recording);
  document.querySelectorAll('#v3-mic-btn').forEach(button => {
    button.classList.toggle('v18-recording', recording);
    button.setAttribute('aria-label', recording ? 'Stop and transcribe voice intake' : 'Record voice intake');
    button.title = recording ? 'Stop and transcribe' : 'Record voice intake';
  });
};

function v18VoiceSetupNotice() {
  openPosModal(`<h3>${icon('mic', 18)} Turn on reliable Windows voice</h3><p class="pm-sub">This counter will use a short recording instead of Chrome’s unreliable Windows live-speech service.</p><div class="v18-mic-state bad"><strong>One server variable is missing:</strong><br>Add <code>OPENAI_API_KEY</code> in Netlify → Project configuration → Environment variables, then redeploy. Never paste that private key into the POS screen.</div><button class="btn btn-primary btn-block" style="margin-top:12px" onclick="closePosModal();v17OpenMicDiagnostic()">Test This Windows Microphone</button><button class="btn btn-secondary btn-block" style="margin-top:8px" onclick="closePosModal();v18TryBrowserVoice()">Try Chrome Live Voice Anyway</button><button class="btn btn-ghost btn-block" style="margin-top:8px" onclick="closePosModal()">Keep Typing Instead</button>`);
}

function v18TryBrowserVoice() {
  return v18BaseBrowserVoice();
}

v17ToggleServerVoice = async function v18ToggleServerVoice() {
  if (v17ServerRecorder?.state === 'recording') {
    v17VoiceStatus('Finishing the Windows recording…');
    v17ServerRecorder.stop();
    return;
  }
  if (!v18VoiceConfigured()) return v18VoiceSetupNotice();
  if (!window.MediaRecorder) return toast('Update Chrome before using Windows voice intake.', false, 'alerttriangle');
  try {
    v17VoiceWanted = false;
    try { posVoiceRecognition?.stop(); } catch (_) { /* browser recognition is not running */ }
    v17ServerVoiceStream = await v18OpenAudioStream();
    v18StartRecordMeter(v17ServerVoiceStream);
    const preferred = ['audio/webm;codecs=opus', 'audio/webm'].find(type => MediaRecorder.isTypeSupported?.(type));
    v17ServerVoiceChunks = [];
    const recorder = new MediaRecorder(v17ServerVoiceStream, preferred ? { mimeType:preferred } : undefined);
    v17ServerRecorder = recorder;
    recorder.ondataavailable = event => { if (event.data?.size) v17ServerVoiceChunks.push(event.data); };
    recorder.onerror = () => {
      v18StopRecordMeter(); v17StopServerVoiceTracks(); v17ServerVoiceButton(false);
      v17VoiceStatus('Recording stopped unexpectedly. Open the microphone test and choose the correct input.');
    };
    recorder.onstop = async () => {
      const peak = v18RecordPeak;
      v18StopRecordMeter(); v17StopServerVoiceTracks(); v17ServerVoiceButton(false);
      const blob = new Blob(v17ServerVoiceChunks, { type:recorder.mimeType || 'audio/webm' });
      v17ServerVoiceChunks = [];
      if (blob.size < 800 || (peak !== null && peak < 0.004)) {
        v17VoiceStatus('The recording was silent. Choose the correct Windows microphone and try again.');
        toast('No voice reached the selected microphone', false, 'alerttriangle');
        return v17OpenMicDiagnostic();
      }
      if (blob.size > 4.5 * 1024 * 1024) return v17VoiceStatus('That recording is too long. Try a shorter intake.');
      v17VoiceStatus('Transcribing the Windows recording…');
      try {
        const response = await v16Api('voice-transcribe', { method:'POST', body:JSON.stringify({ audioDataUrl:await v17FileDataUrl(blob) }) });
        if (!response.ok) throw new Error(response.data?.error || 'The secure transcription service could not complete the recording.');
        const transcript = String(response.data?.transcript || '').trim();
        if (!transcript) throw new Error('No speech was found in the recording.');
        const existing = String(document.getElementById('v3-ai-transcript')?.value || counterDraft?.aiTranscript || '').trim();
        const combined = [existing, transcript].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
        counterDraft.aiTranscript = combined;
        const box = document.getElementById('v3-ai-transcript'); if (box) box.value = combined;
        v17VoiceStatus('Voice captured. Review the words, then choose Interpret.');
        toast('Windows voice intake captured', true, 'checkcircle');
      } catch (error) {
        v17VoiceStatus(error.message); toast(error.message, false, 'alerttriangle');
      }
    };
    recorder.start(250);
    v17ServerVoiceButton(true);
    v17VoiceStatus('Recording from the selected Windows microphone… tap again to stop.');
    v17ServerVoiceTimer = window.setTimeout(() => {
      if (v17ServerRecorder?.state === 'recording') v17ServerRecorder.stop();
    }, 45000);
  } catch (error) {
    v18StopRecordMeter(); v17StopServerVoiceTracks(); v17ServerVoiceButton(false);
    const blocked = ['NotAllowedError', 'SecurityError'].includes(error?.name);
    v17VoiceStatus(blocked ? 'Microphone permission is blocked in Chrome or Windows.' : (error?.message || 'Windows did not provide a working microphone.'));
    toast(blocked ? 'Allow microphone access in Chrome and Windows' : 'Choose a working Windows microphone', false, 'alerttriangle');
    v17OpenMicDiagnostic();
  }
};

posToggleAiVoice = async function v18ToggleAiVoice() {
  if (v18IsWindows()) return v17ToggleServerVoice();
  return v18BaseBrowserVoice();
};

v17EnhanceCounter = function v18EnhanceCounter(content) {
  v18BaseEnhanceCounter(content);
  if (!v18IsWindows()) return;
  content.querySelectorAll('#v3-mic-btn').forEach(button => button.classList.add('v18-voice-primary'));
  content.querySelectorAll('#v17-server-voice-btn').forEach(button => {
    button.onclick = () => posToggleAiVoice();
    button.innerHTML = `${icon('mic', 14)} Record with Windows microphone`;
  });
  const note = content.querySelector('.v17-mic-tools .v2-note');
  if (note) note.textContent = v18VoiceConfigured()
    ? 'Windows uses recorded audio for reliable transcription.'
    : 'Add OPENAI_API_KEY in Netlify to enable reliable Windows voice.';
};

function v18StopDiagnostic() {
  if (v18DiagnosticAnimation) cancelAnimationFrame(v18DiagnosticAnimation);
  v18DiagnosticAnimation = null;
  v18DiagnosticStream?.getTracks?.().forEach(track => track.stop()); v18DiagnosticStream = null;
  try { v18DiagnosticContext?.close?.(); } catch (_) { /* already closed */ }
  v18DiagnosticContext = null;
}

v17StopMicDiagnostic = v18StopDiagnostic;

v17OpenMicDiagnostic = function v18OpenMicDiagnostic() {
  openPosModal(`<div class="v17-mic-diagnostic"><h3>${icon('mic', 18)} Windows Microphone Check</h3><p class="pm-sub">Choose the microphone this counter should use. The choice stays on this Windows computer only.</p><div id="v17-mic-result" class="v18-mic-state">Press Start Test, allow microphone access, and speak normally.</div><div class="v17-mic-meter"><span id="v17-mic-level"></span></div><div class="v18-mic-choice"><label>Microphone<select id="v18-mic-select" class="text-input" onchange="v18ChooseMicrophone(this.value)" disabled><option>Start the test to find microphones</option></select></label><button class="btn btn-secondary" onclick="v17StartMicDiagnostic()">Start Test</button></div><div class="v18-mic-state"><strong>If no voice reaches the meter:</strong><br>1. Windows Settings → Privacy &amp; security → Microphone → allow access.<br>2. Windows Settings → System → Sound → Input → choose the same microphone and raise its volume.<br>3. Chrome → icon left of the address → Site settings → Microphone → Allow.<br>4. If Windows lists no input, connect a USB microphone or headset.</div><button class="btn btn-ghost btn-block" onclick="v17StopMicDiagnostic();closePosModal()">Close</button></div>`);
};

async function v18ChooseMicrophone(deviceId) {
  v18SaveMicrophone(deviceId);
  await v17StartMicDiagnostic(deviceId);
}

v17StartMicDiagnostic = async function v18StartMicDiagnostic(requestedDeviceId = '') {
  v18StopDiagnostic();
  const result = document.getElementById('v17-mic-result');
  const select = document.getElementById('v18-mic-select');
  try {
    const permissionStream = await navigator.mediaDevices.getUserMedia({ audio:true });
    permissionStream.getTracks().forEach(track => track.stop());
    const microphones = (await navigator.mediaDevices.enumerateDevices()).filter(device => device.kind === 'audioinput');
    if (!microphones.length) throw new Error('Windows did not find a microphone. Connect a USB microphone or headset.');
    let selected = requestedDeviceId || v18SavedMicrophone();
    if (!microphones.some(device => device.deviceId === selected)) selected = microphones[0].deviceId;
    v18SaveMicrophone(selected);
    if (select) {
      select.disabled = false;
      select.innerHTML = microphones.map((device, index) => `<option value="${esc(device.deviceId)}" ${device.deviceId === selected ? 'selected' : ''}>${esc(device.label || `Microphone ${index + 1}`)}</option>`).join('');
    }
    v18DiagnosticStream = await v18OpenAudioStream(selected);
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) throw new Error('Chrome cannot measure this microphone. Update Chrome.');
    v18DiagnosticContext = new AudioContext();
    const analyser = v18DiagnosticContext.createAnalyser(); analyser.fftSize = 1024;
    v18DiagnosticContext.createMediaStreamSource(v18DiagnosticStream).connect(analyser);
    v18DiagnosticContext.resume?.();
    const values = new Uint8Array(analyser.fftSize);
    const update = () => {
      analyser.getByteTimeDomainData(values);
      let squared = 0;
      values.forEach(value => { const normalized = (value - 128) / 128; squared += normalized * normalized; });
      const level = Math.sqrt(squared / values.length);
      const percent = Math.min(100, level * 850);
      const meter = document.getElementById('v17-mic-level'); if (meter) meter.style.width = `${percent}%`;
      if (result) {
        result.className = `v18-mic-state ${percent > 5 ? 'good' : ''}`;
        result.innerHTML = percent > 5 ? '<strong>Microphone is working.</strong> Voice is reaching the POS.' : 'Microphone connected. Speak and watch for the green meter.';
      }
      v18DiagnosticAnimation = requestAnimationFrame(update);
    };
    update();
  } catch (error) {
    v18StopDiagnostic();
    if (result) {
      result.className = 'v18-mic-state bad';
      result.innerHTML = `<strong>Microphone test failed.</strong> ${esc(error?.message || error?.name || 'Windows input error')}`;
    }
  }
};

/* Version label and startup state. */
const v18BasePosShellHTML = posShellHTML;
posShellHTML = function v18PosShellHTML() {
  return v18BasePosShellHTML().replace(/Staff POS(?: · V[\w. ]+)?/g, `Staff POS · ${V18_VERSION}`);
};

const v18BaseRenderSettings = renderPosSettings;
renderPosSettings = function v18RenderSettings(content) {
  v18BaseRenderSettings(content);
  content?.querySelectorAll?.('.v16-eyebrow').forEach(node => { node.textContent = V18_VERSION; });
};

window.setTimeout(() => {
  if (!v18BootPending) return;
  const message = document.getElementById('v18-boot-message');
  const retry = document.getElementById('v18-boot-retry');
  if (message) message.textContent = 'The secure server is taking longer than expected.';
  if (retry) retry.hidden = false;
}, 15000);
