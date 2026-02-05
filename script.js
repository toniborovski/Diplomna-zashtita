// =============================
// Config
// =============================
const TARGET_MINUTES = 12;              // timer goal (change to 10/15 as you want)
const AUTOPLAY_SECONDS = 18;            // per slide during rehearsal
const PEN_WIDTH = 4;                    // drawing thickness
const IS_TOUCH_DEVICE = () => {
  return (
    (typeof window !== 'undefined' && 
     typeof navigator !== 'undefined' &&
     (navigator.maxTouchPoints > 0 || 
      navigator.msMaxTouchPoints > 0 ||
      ('ontouchstart' in window) ||
      ('onmsgesturechange' in window)))
  );
};
const IS_WINDOWS = /Windows/i.test(navigator.userAgent);
const IS_MOBILE = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

// =============================
// State
// =============================
let currentSlide = 1;
const slides = Array.from(document.querySelectorAll('.slide'));
const totalSlides = slides.length;

let notesEnabled = false;
let overviewOpen = false;
let helpOpen = false;

let laserEnabled = false;
let penEnabled = false;

let autoplayEnabled = false;
let autoplayTimer = null;

// Timer
let startTime = Date.now();
let timerTick = null;

// Drawing
const canvas = document.getElementById('drawCanvas');
const ctx = canvas.getContext('2d');
let drawing = false;
let lastPt = null;

// Image zoom/pan
let currentScale = 1;
let panX = 0, panY = 0;
let panning = false;
let panStart = null;
let mediaKind = null; // "img" | "pdf" | "placeholder"
let imgEl = null;
let iframeEl = null;

// =============================
// Elements
// =============================
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');

const progressBar = document.getElementById('progressBar');
const slideCounter = document.getElementById('slideCounter');

const timerChip = document.getElementById('timerChip');
const autoChip = document.getElementById('autoChip');
const modeChip = document.getElementById('modeChip');

const notesBox = document.getElementById('notesBox');
const notesText = document.getElementById('notesText');

const helpBtn = document.getElementById('helpBtn');
const helpOverlay = document.getElementById('helpOverlay');
const closeHelp = document.getElementById('closeHelp');

const overviewBtn = document.getElementById('overviewBtn');
const overviewOverlay = document.getElementById('overviewOverlay');
const closeOverview = document.getElementById('closeOverview');
const overviewGrid = document.getElementById('overviewGrid');

const notesBtn = document.getElementById('notesBtn');

const laserBtn = document.getElementById('laserBtn');
const penBtn = document.getElementById('penBtn');
const clearBtn = document.getElementById('clearBtn');
const laserDot = document.getElementById('laserDot');

const fsBtn = document.getElementById('fsBtn');
const autoBtn = document.getElementById('autoBtn');
const printBtn = document.getElementById('printBtn');

const jumpSelect = document.getElementById('jumpSelect');

const mediaModal = document.getElementById('mediaModal');
const modalTitle = document.getElementById('modalTitle');
const modalBody = document.getElementById('modalBody');
const closeModalBtn = document.getElementById('closeModalBtn');
const zoomInBtn = document.getElementById('zoomInBtn');
const zoomOutBtn = document.getElementById('zoomOutBtn');
const resetZoomBtn = document.getElementById('resetZoomBtn');

const openPdfBtn = document.getElementById('openPdfBtn');
const toggleToolbarBtn = document.getElementById('toggleToolbarBtn');
const nav = document.querySelector('.nav');

// =============================
// Helpers
// =============================
function clamp(n,min,max){ return Math.max(min, Math.min(max, n)); }

function setModeChip(){
  const bits = [];
  if (notesEnabled) bits.push('Notes');
  if (overviewOpen) bits.push('Overview');
  if (laserEnabled) bits.push('Laser');
  if (penEnabled) bits.push('Pen');
  if (autoplayEnabled) bits.push('Auto');
  if (document.documentElement.classList.contains('dark')) bits.push('Dark');
  modeChip.textContent = 'Mode: ' + (bits.length ? bits.join(' • ') : 'Normal');
}

function fmtTime(sec){
  sec = Math.max(0, Math.floor(sec));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0');
}

// =============================
// Navigation / Hash
// =============================
function readHash(){
  const h = (location.hash || '').replace('#','').trim();
  const n = parseInt(h, 10);
  if (!Number.isNaN(n)) currentSlide = clamp(n, 1, totalSlides);
}
function writeHash(){
  history.replaceState(null, '', '#' + currentSlide);
}

function updateNotes(){
  const active = slides[currentSlide - 1];
  notesText.textContent = active?.getAttribute('data-notes') || '—';
  notesBox.style.display = notesEnabled ? 'block' : 'none';
}

function updateProgress(){
  const pct = totalSlides <= 1 ? 0 : ((currentSlide - 1) / (totalSlides - 1)) * 100;
  progressBar.style.width = `${pct}%`;
}

function updateCounter(){
  slideCounter.textContent = `${currentSlide} / ${totalSlides}`;
}

function updateButtons(){
  prevBtn.disabled = currentSlide === 1;
  nextBtn.textContent = currentSlide === totalSlides ? 'Край' : '▶';
}

function renderSlides(){
  slides.forEach((slide, idx) => {
    slide.classList.remove('active','prev');
    const i = idx + 1;
    if (i === currentSlide) slide.classList.add('active');
    else if (i < currentSlide) slide.classList.add('prev');
  });
}

function goToSlide(n, updateUrl=true){
  currentSlide = clamp(n, 1, totalSlides);
  renderSlides();
  updateButtons();
  updateCounter();
  updateProgress();
  updateNotes();
  if (updateUrl) writeHash();
  jumpSelect.value = String(currentSlide);
  setModeChip();
}

function next(){
  if (currentSlide < totalSlides) goToSlide(currentSlide + 1, true);
  else goToSlide(1, true);
}
function prev(){
  if (currentSlide > 1) goToSlide(currentSlide - 1, true);
}

window.addEventListener('hashchange', () => {
  readHash();
  goToSlide(currentSlide, false);
});

// =============================
// Timer
// =============================
function resetTimer(){
  startTime = Date.now();
}
function tickTimer(){
  const elapsed = (Date.now() - startTime) / 1000;
  const target = TARGET_MINUTES * 60;
  timerChip.textContent = `⏱ ${fmtTime(elapsed)} / ${fmtTime(target)}`;

  // color hint
  const over = elapsed - target;
  if (over > 0) {
    timerChip.style.borderColor = 'rgba(255, 0, 0, 0.55)';
  } else if (elapsed > target * 0.85) {
    timerChip.style.borderColor = 'rgba(245, 158, 11, 0.7)';
  } else {
    timerChip.style.borderColor = 'var(--border-color)';
  }
}

// =============================
// Overview
// =============================
function buildOverview(){
  overviewGrid.innerHTML = '';
  slides.forEach((slide, idx) => {
    const i = idx + 1;
    const h2 = slide.querySelector('h2');
    const h1 = slide.querySelector('h1');
    const title = (h2?.textContent || h1?.textContent || `Слайд ${i}`).trim().replace(/\s+/g,' ');
    const section = slide.getAttribute('data-section') || '';
    const div = document.createElement('div');
    div.className = 'thumb';
    div.innerHTML = `<b>${i}. ${title}</b><span>${section ? section + ' • ' : ''}#${i}</span>`;
    div.addEventListener('click', () => {
      closeOverviewOverlay();
      goToSlide(i, true);
    });
    overviewGrid.appendChild(div);
  });
}

function openOverviewOverlay(){
  overviewOpen = true;
  buildOverview();
  overviewOverlay.style.display = 'flex';
  setModeChip();
}
function closeOverviewOverlay(){
  overviewOpen = false;
  overviewOverlay.style.display = 'none';
  setModeChip();
}
function toggleOverview(){
  if (overviewOpen) closeOverviewOverlay();
  else openOverviewOverlay();
}

// =============================
// Help
// =============================
function openHelp(){
  helpOpen = true;
  helpOverlay.style.display = 'flex';
}
function closeHelpOverlay(){
  helpOpen = false;
  helpOverlay.style.display = 'none';
}
function toggleHelp(){
  if (helpOpen) closeHelpOverlay();
  else openHelp();
}

// =============================
// Fullscreen / Dark / Print
// =============================
function toggleFullscreen(){
  if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
  else document.exitFullscreen?.();
}

// =============================
// Auto-play
// =============================
function setAutoplay(on){
  autoplayEnabled = on;
  autoChip.style.display = autoplayEnabled ? 'inline-flex' : 'none';
  if (autoplayTimer) { clearInterval(autoplayTimer); autoplayTimer = null; }
  if (autoplayEnabled) {
    autoplayTimer = setInterval(() => next(), AUTOPLAY_SECONDS * 1000);
  }
  setModeChip();
}
function toggleAutoplay(){ setAutoplay(!autoplayEnabled); }

// =============================
// Laser + Pen
// =============================
function resizeCanvas(){
  const dpr = window.devicePixelRatio || 1;
  const width = window.innerWidth;
  const height = window.innerHeight;
  
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  canvas.style.width = width + 'px';
  canvas.style.height = height + 'px';
  
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
}

function setLaser(on){
  laserEnabled = on;
  if (!laserEnabled) laserDot.style.display = 'none';
  if (laserEnabled && penEnabled) setPen(false); // avoid conflicts
  setModeChip();
}

function setPen(on){
  penEnabled = on;
  if (penEnabled && laserEnabled) setLaser(false);
  canvas.style.pointerEvents = penEnabled ? 'auto' : 'none';
  setModeChip();
}

function clearDrawing(){
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function pointerPos(e){
  let x = 0, y = 0;
  
  if (e.clientX !== undefined && e.clientY !== undefined) {
    x = e.clientX;
    y = e.clientY;
  } else if (e.touches && e.touches.length > 0) {
    x = e.touches[0].clientX;
    y = e.touches[0].clientY;
  } else if (e.changedTouches && e.changedTouches.length > 0) {
    x = e.changedTouches[0].clientX;
    y = e.changedTouches[0].clientY;
  } else if (e.pageX !== undefined && e.pageY !== undefined) {
    x = e.pageX - window.scrollX;
    y = e.pageY - window.scrollY;
  }
  
  return {x, y};
}

// Mouse/Pointer move for laser (exclude touch on mobile)
document.addEventListener('mousemove', (e) => {
  if (!laserEnabled || IS_TOUCH_DEVICE()) return;
  const {x,y} = pointerPos(e);
  laserDot.style.left = x + 'px';
  laserDot.style.top = y + 'px';
  laserDot.style.display = 'block';
}, {passive: true});

// Pen drawing
function startDraw(e){
  if (!penEnabled) return;
  if (e.type.includes('touch')) e.preventDefault();
  drawing = true;
  lastPt = pointerPos(e);
}
function moveDraw(e){
  if (!penEnabled || !drawing) return;
  if (e.type.includes('touch')) e.preventDefault();
  const pt = pointerPos(e);
  ctx.strokeStyle = 'rgba(255, 59, 48, 0.92)'; // red ink
  ctx.lineWidth = PEN_WIDTH;
  ctx.beginPath();
  ctx.moveTo(lastPt.x, lastPt.y);
  ctx.lineTo(pt.x, pt.y);
  ctx.stroke();
  lastPt = pt;
}
function endDraw(e){
  if (e && e.type.includes('touch')) e.preventDefault();
  drawing = false;
  lastPt = null;
}

// Mouse drawing
canvas.addEventListener('mousedown', startDraw, {passive: true});
canvas.addEventListener('mousemove', moveDraw, {passive: true});
window.addEventListener('mouseup', endDraw, {passive: true});

// Touch drawing (high priority)
canvas.addEventListener('touchstart', startDraw, {passive: false});
canvas.addEventListener('touchmove', moveDraw, {passive: false});
canvas.addEventListener('touchend', endDraw, {passive: false});

// Pointer events (unified handling for Windows pen, mouse, and touch)
if (window.PointerEvent) {
  canvas.addEventListener('pointerdown', startDraw, {passive: false});
  canvas.addEventListener('pointermove', moveDraw, {passive: false});
  window.addEventListener('pointerup', endDraw, {passive: true});
}

// =============================
// Media modal (images / placeholders / pdf)
// =============================
function resetMediaTransform(){
  currentScale = 1;
  panX = 0; panY = 0;
  applyMediaTransform();
}

function applyMediaTransform(){
  if (mediaKind !== 'img' || !imgEl) return;
  imgEl.style.transform = `translate(${panX}px, ${panY}px) scale(${currentScale})`;
}

function openImageViewer({title, src, placeholderText}){
  mediaKind = src ? 'img' : 'placeholder';
  modalTitle.textContent = title || 'Viewer';
  modalBody.innerHTML = '';
  imgEl = null; iframeEl = null;

  if (src) {
    const img = document.createElement('img');
    img.src = src;
    img.alt = title || 'image';
    img.style.maxWidth = 'none';
    img.style.maxHeight = 'none';
    img.style.transform = 'translate(0px,0px) scale(1)';
    img.style.cursor = 'grab';
    img.style.touchAction = 'none';
    imgEl = img;
    modalBody.appendChild(imgEl);

    imgEl.addEventListener('mousedown', (e) => {
      if (mediaKind !== 'img') return;
      panning = true;
      imgEl.style.cursor = 'grabbing';
      panStart = {x: e.clientX, y: e.clientY, px: panX, py: panY};
    }, {passive: true});
    
    imgEl.addEventListener('touchstart', (e) => {
      if (mediaKind !== 'img' || IS_TOUCH_DEVICE() === false) return;
      e.preventDefault();
      panning = true;
      const touch = e.touches[0];
      panStart = {x: touch.clientX, y: touch.clientY, px: panX, py: panY};
    }, {passive: false});
    
    window.addEventListener('mousemove', (e) => {
      if (!panning || !panStart || mediaKind !== 'img') return;
      panX = panStart.px + (e.clientX - panStart.x);
      panY = panStart.py + (e.clientY - panStart.y);
      applyMediaTransform();
    }, {passive: true});
    
    window.addEventListener('touchmove', (e) => {
      if (!panning || !panStart || mediaKind !== 'img') return;
      e.preventDefault();
      const touch = e.touches[0];
      panX = panStart.px + (touch.clientX - panStart.x);
      panY = panStart.py + (touch.clientY - panStart.y);
      applyMediaTransform();
    }, {passive: false});
    
    window.addEventListener('mouseup', () => {
      if (!panning) return;
      panning = false;
      if (imgEl) imgEl.style.cursor = 'grab';
      panStart = null;
    }, {passive: true});
    
    window.addEventListener('touchend', () => {
      if (!panning) return;
      panning = false;
      panStart = null;
    }, {passive: true});

    modalBody.addEventListener('wheel', (e) => {
      if (mediaKind !== 'img') return;
      e.preventDefault();
      const delta = Math.sign(e.deltaY);
      const factor = delta > 0 ? 0.92 : 1.08;
      currentScale = clamp(currentScale * factor, 0.25, 6);
      applyMediaTransform();
    }, { passive:false });

  } else {
    // Placeholder zoom view
    const div = document.createElement('div');
    div.style.width = '100%';
    div.style.height = '100%';
    div.style.display = 'flex';
    div.style.alignItems = 'center';
    div.style.justifyContent = 'center';
    div.style.padding = '24px';
    div.style.background = 'linear-gradient(135deg, rgba(226,232,240,0.35), rgba(203,213,225,0.20))';
    div.style.color = 'white';
    div.innerHTML = `
      <div style="max-width:920px;width:100%;background:rgba(0,0,0,0.45);border:1px solid rgba(255,255,255,0.15);border-radius:18px;padding:18px;">
        <div style="font-weight:900;font-size:1.25rem;margin-bottom:10px;">${title || 'Placeholder'}</div>
        <div style="opacity:.9;font-weight:650;line-height:1.5;">
          ${placeholderText || 'Тук постави изображение (data-img="...") за реален zoom.'}
        </div>
      </div>
    `;
    modalBody.appendChild(div);
  }

  resetMediaTransform();
  mediaModal.style.display = 'flex';
}

function openPdfViewer({title, url}){
  mediaKind = 'pdf';
  modalTitle.textContent = title || 'PDF Viewer';
  modalBody.innerHTML = '';
  imgEl = null; iframeEl = null;

  const iframe = document.createElement('iframe');
  iframe.src = url;
  iframeEl = iframe;
  modalBody.appendChild(iframeEl);

  mediaModal.style.display = 'flex';
}

function closeMedia(){
  mediaModal.style.display = 'none';
  modalBody.innerHTML = '';
  imgEl = null; iframeEl = null;
  mediaKind = null;
  panning = false;
  resetMediaTransform();
}

// Zoom controls (image only)
function zoomIn(){ if (mediaKind==='img'){ currentScale = clamp(currentScale * 1.15, 0.25, 6); applyMediaTransform(); } }
function zoomOut(){ if (mediaKind==='img'){ currentScale = clamp(currentScale / 1.15, 0.25, 6); applyMediaTransform(); } }

// Hook clickables
document.querySelectorAll('.zoomable').forEach(el => {
  el.addEventListener('click', () => {
    const title = el.getAttribute('data-title') || 'Viewer';
    const img = el.getAttribute('data-img'); // set this to your real figure path
    const kind = el.getAttribute('data-kind') || 'placeholder';
    const placeholderText = el.innerText?.trim() || '';

    if (img) {
      openImageViewer({ title, src: img });
    } else {
      openImageViewer({ title: title + ' (placeholder)', src: null, placeholderText });
    }
  });
});

// Example PDF open (replace with your real PDF URL or local file)
openPdfBtn.addEventListener('click', () => {
  // If you have a local file: set url to "thesis.pdf" (must be in same folder)
  // Note: some browsers restrict file:// if not served via local server.
  openPdfViewer({
    title: 'Дипломна работа - Тони Боровски',
    url: 'assets/diplom_final.pdf'
  });
});

closeModalBtn.addEventListener('click', closeMedia);
zoomInBtn.addEventListener('click', zoomIn);
zoomOutBtn.addEventListener('click', zoomOut);
resetZoomBtn.addEventListener('click', resetMediaTransform);

// Close modal when clicking outside card
mediaModal.addEventListener('click', (e) => {
  if (e.target === mediaModal) closeMedia();
});

// =============================
// Jump menu
// =============================
function buildJumpMenu(){
  jumpSelect.innerHTML = '';
  slides.forEach((slide, idx) => {
    const i = idx + 1;
    const h2 = slide.querySelector('h2');
    const h1 = slide.querySelector('h1');
    const title = (h2?.textContent || h1?.textContent || `Слайд ${i}`).trim().replace(/\s+/g,' ');
    const sec = slide.getAttribute('data-section') || '';
    const opt = document.createElement('option');
    opt.value = String(i);
    opt.textContent = `${String(i).padStart(2,'0')} • ${sec ? sec + ' — ' : ''}${title}`;
    jumpSelect.appendChild(opt);
  });
  jumpSelect.value = String(currentSlide);
}

jumpSelect.addEventListener('change', () => {
  const n = parseInt(jumpSelect.value, 10);
  if (!Number.isNaN(n)) goToSlide(n, true);
});

// =============================
// Buttons
// =============================
prevBtn.addEventListener('click', prev);
nextBtn.addEventListener('click', next);

overviewBtn.addEventListener('click', toggleOverview);
closeOverview.addEventListener('click', closeOverviewOverlay);
overviewOverlay.addEventListener('click', (e) => { if (e.target === overviewOverlay) closeOverviewOverlay(); });

notesBtn.addEventListener('click', () => { notesEnabled = !notesEnabled; updateNotes(); setModeChip(); });

helpBtn.addEventListener('click', toggleHelp);
closeHelp.addEventListener('click', closeHelpOverlay);
helpOverlay.addEventListener('click', (e) => { if (e.target === helpOverlay) closeHelpOverlay(); });

laserBtn.addEventListener('click', () => setLaser(!laserEnabled));
penBtn.addEventListener('click', () => setPen(!penEnabled));
clearBtn.addEventListener('click', clearDrawing);

fsBtn.addEventListener('click', toggleFullscreen);

autoBtn.addEventListener('click', toggleAutoplay);
printBtn.addEventListener('click', () => window.print());

// Toggle toolbar visibility
let toolbarHidden = false;
toggleToolbarBtn.addEventListener('click', () => {
  toolbarHidden = !toolbarHidden;
  if (toolbarHidden) {
    nav.classList.add('hidden');
    toggleToolbarBtn.textContent = '+';
    toggleToolbarBtn.title = 'Show toolbar';
  } else {
    nav.classList.remove('hidden');
    toggleToolbarBtn.textContent = '−';
    toggleToolbarBtn.title = 'Hide toolbar';
  }
});

// =============================
// Keyboard + Touch slide nav
// =============================
document.addEventListener('keydown', (e) => {
  // Ignore if typing in input/select
  if (e.target?.tagName === 'INPUT' || e.target?.tagName === 'SELECT' || e.target?.tagName === 'TEXTAREA') {
    return;
  }
  
  // If modal/overlays open
  if (e.key === 'Escape') {
    if (helpOpen) { closeHelpOverlay(); return; }
    if (overviewOpen) { closeOverviewOverlay(); return; }
    if (mediaModal.style.display === 'flex') { closeMedia(); return; }
    // If nothing open, disable tools quickly
    if (laserEnabled) setLaser(false);
    if (penEnabled) setPen(false);
    return;
  }

  if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') { prev(); e.preventDefault(); }
  else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') { next(); e.preventDefault(); }
  else if (e.key === ' ') { e.preventDefault(); next(); }

  else if (e.key === 'o' || e.key === 'O') { toggleOverview(); e.preventDefault(); }
  else if (e.key === 'p' || e.key === 'P') { notesEnabled = !notesEnabled; updateNotes(); setModeChip(); e.preventDefault(); }

  else if (e.key === 'l' || e.key === 'L') { setLaser(!laserEnabled); e.preventDefault(); }
  else if (e.key === 'r' || e.key === 'R') { setPen(!penEnabled); e.preventDefault(); }
  else if (e.key === 'c' || e.key === 'C') { clearDrawing(); e.preventDefault(); }

  else if (e.key === 'f' || e.key === 'F') { toggleFullscreen(); e.preventDefault(); }

  else if (e.key === 't' || e.key === 'T') { toggleAutoplay(); e.preventDefault(); }

  else if (e.key === '?') { toggleHelp(); e.preventDefault(); }
  else if (e.key === '+' || e.key === '=') { zoomIn(); e.preventDefault(); }
  else if (e.key === '-' || e.key === '_') { zoomOut(); e.preventDefault(); }
}, {passive: false});

// Touch/swipe for slides (on whole doc)
let startX = 0;
let startY = 0;

document.addEventListener('touchstart', (e) => {
  if (penEnabled || helpOpen || overviewOpen || mediaModal.style.display === 'flex') return;
  startX = e.touches[0].clientX;
  startY = e.touches[0].clientY;
  startTime = Date.now();
}, {passive:true});

document.addEventListener('touchend', (e) => {
  if (!startX || !startY) return;
  if (penEnabled || helpOpen || overviewOpen || mediaModal.style.display === 'flex') return;
  
  const endX = e.changedTouches[0].clientX;
  const endY = e.changedTouches[0].clientY;
  const deltaX = startX - endX;
  const deltaY = startY - endY;
  const duration = Date.now() - startTime;
  
  // Only register as swipe if primarily horizontal and quick
  if (Math.abs(deltaX) > Math.abs(deltaY) * 2 && Math.abs(deltaX) > 40 && duration < 500) {
    if (deltaX > 0) next();      // swipe left -> next
    else if (deltaX < 0) prev(); // swipe right -> prev
  }
  
  startX = 0;
  startY = 0;
}, {passive:true});

// =============================
// Init
// =============================
function init(){
  // Prevent unwanted zoom on double-tap
  document.addEventListener('touchstart', (e) => {
    if (e.touches.length > 1) e.preventDefault();
  }, {passive: false});
  
  // Prevent scroll on body (handle with modal overflow)
  document.body.style.position = 'fixed';
  document.body.style.width = '100%';
  document.body.style.height = '100%';
  
  // Prevent iOS Safari from zooming on input focus
  if (IS_MOBILE) {
    document.addEventListener('touchmove', (e) => {
      if (!penEnabled) e.preventDefault();
    }, {passive: false});
  }
  
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas, {passive: true});
  window.addEventListener('orientationchange', resizeCanvas, {passive: true});

  buildJumpMenu();
  readHash();
  goToSlide(currentSlide, false);

  // Timer loop
  if (timerTick) clearInterval(timerTick);
  timerTick = setInterval(tickTimer, 250);
  tickTimer();

  setModeChip();
  
  // Log device info for debugging
  if (window.location.hash === '#debug') {
    console.log('Device Info:', {
      isTouchDevice: IS_TOUCH_DEVICE(),
      isWindows: IS_WINDOWS,
      isMobile: IS_MOBILE,
      userAgent: navigator.userAgent,
      maxTouchPoints: navigator.maxTouchPoints || 0,
      screenWidth: window.innerWidth,
      screenHeight: window.innerHeight,
      dpr: window.devicePixelRatio
    });
  }
}

init();

