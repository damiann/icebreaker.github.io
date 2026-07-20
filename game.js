/* global THREE, buildTruncatedIcosahedron */

const QUESTIONS = [
  "What's a skill you have that would surprise your coworkers?",
  "If you could only eat one cuisine for the rest of your life, what would it be?",
  "What's the strangest job you ever had before this one?",
  "Describe your perfect Saturday morning in three words.",
  "What TV show are you embarrassed to admit you love?",
  "If you could instantly master one new skill, what would it be?",
  "What's the most beautiful place you've ever visited?",
  "Morning person or night owl — and no, you can't say \"it depends.\"",
  "What's the last book or podcast that genuinely changed how you think?",
  "What's a food you loved as a kid that you refuse to eat now?",
  "If you had a theme song that played whenever you entered a room, what would it be?",
  "What hobby do you wish you had more time for?",
  "What's the best piece of advice you ever received?",
  "Tell us something you're unexpectedly good at.",
  "What's the most interesting place you've lived or worked?",
  "If you could have dinner with any person (living or historical), who and why?",
  "What's a cause or topic you could talk about for hours?",
  "Coffee, tea, or something else — and what does your order say about you?",
  "What's one thing on your bucket list that you've actually done?",
  "What's the most useful thing you learned in school that you still use?",
  "What's your go-to karaoke song?",
  "If you could work in any other industry for a year, what would you choose?",
  "What's the best thing about where you grew up?",
  "Dogs, cats, neither, or both — defend your answer.",
  "What's a small daily ritual that keeps you sane?",
  "If you could live in any era (not just the present), when would you pick?",
  "What's something you've done that you never expected to be good at?",
  "What's the most adventurous thing you've eaten?",
  "If work wasn't a factor, where in the world would you want to live?",
  "What's something you believed as a kid that turned out to be completely wrong?",
  "What's the best team you've ever been part of (sports, work, or other) and why?",
  "What's one thing you want people to know about you that rarely comes up at work?",
];

// --- Scene setup ---
const canvas = document.getElementById('ball-canvas');
const container = document.getElementById('canvas-container');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(devicePixelRatio);
renderer.setClearColor(0x0d1117);

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
camera.position.set(0, 0, 4);

scene.add(new THREE.AmbientLight(0xffffff, 0.45));
const sun = new THREE.DirectionalLight(0xffffff, 1.1);
sun.position.set(5, 8, 5);
scene.add(sun);
const fill = new THREE.DirectionalLight(0x8899ff, 0.35);
fill.position.set(-3, -5, -5);
scene.add(fill);

// --- Build ball ---
const { geometry, materials, faceCenters, faces } = buildTruncatedIcosahedron(QUESTIONS, 1.0);
const ball = new THREE.Mesh(geometry, materials);
scene.add(ball);

// Start with a nice non-trivial orientation
ball.rotation.set(0.3, 0.5, 0.1);

// --- Physics state ---
const DAMPING = 0.955;
const STOP_THRESHOLD = 0.001;
const angularVelocity = new THREE.Vector3();
let state = 'IDLE'; // 'IDLE' | 'SPINNING' | 'STOPPED'
let selectedFace = -1;
let rollCount = 0;

// --- UI refs ---
const spinBtn      = document.getElementById('spin-btn');
const rollCountEl  = document.getElementById('roll-count');
const questionCard = document.getElementById('question-card');
const faceLabelEl  = document.getElementById('face-label');
const questionEl   = document.getElementById('question-text');
const spinAgainBtn = document.getElementById('spin-again-btn');

function showQuestion(faceIdx) {
  const isPentagon = faces[faceIdx].length === 5;
  faceLabelEl.textContent = `Face ${faceIdx + 1} · ${isPentagon ? 'Pentagon' : 'Hexagon'}`;
  questionEl.textContent = QUESTIONS[faceIdx % QUESTIONS.length];
  questionCard.classList.remove('hidden');
}

function hideQuestion() {
  questionCard.classList.add('hidden');
}

function clearHighlights() {
  for (const mat of materials) {
    mat.emissive.set(0x000000);
    mat.emissiveIntensity = 0;
  }
}

function onBallStopped() {
  const cameraDir = new THREE.Vector3(0, 0, 1);
  let bestFace = 0;
  let bestDot = -Infinity;
  for (let i = 0; i < faceCenters.length; i++) {
    const worldCenter = faceCenters[i].clone().applyQuaternion(ball.quaternion);
    const dot = worldCenter.dot(cameraDir);
    if (dot > bestDot) { bestDot = dot; bestFace = i; }
  }
  selectedFace = bestFace;
  clearHighlights();
  materials[selectedFace].emissive.set(0xffdd44);
  materials[selectedFace].emissiveIntensity = 0.35;
  showQuestion(selectedFace);
  spinBtn.disabled = false;
}

function startSpin() {
  clearHighlights();
  hideQuestion();
  spinBtn.disabled = true;
  rollCount++;
  rollCountEl.textContent = `Roll #${rollCount}`;
  selectedFace = -1;
  angularVelocity.set(
    Math.random() * 2 - 1,
    Math.random() * 2 - 1,
    Math.random() * 2 - 1
  ).normalize().multiplyScalar(0.28 + Math.random() * 0.15);
  state = 'SPINNING';
}

spinBtn.addEventListener('click', startSpin);
spinAgainBtn.addEventListener('click', startSpin);

// --- Drag interaction ---
let pointerDown = false;
let lastPointer = null;
let lastDelta = { x: 0, y: 0 };
let lastPointerTime = 0;

function onPointerDown(e) {
  pointerDown = true;
  const pt = e.touches ? e.touches[0] : e;
  lastPointer = { x: pt.clientX, y: pt.clientY };
  lastDelta = { x: 0, y: 0 };
  lastPointerTime = performance.now();
  if (state === 'SPINNING') {
    angularVelocity.set(0, 0, 0);
    state = 'IDLE';
  }
}

function onPointerMove(e) {
  if (!pointerDown) return;
  const pt = e.touches ? e.touches[0] : e;
  const dx = pt.clientX - lastPointer.x;
  const dy = pt.clientY - lastPointer.y;
  const dt = Math.max(performance.now() - lastPointerTime, 1);

  const rotY = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), dx * 0.012);
  const rotX = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), dy * 0.012);
  ball.quaternion.premultiply(rotY).premultiply(rotX);

  lastDelta = { x: dx / dt, y: dy / dt };
  lastPointer = { x: pt.clientX, y: pt.clientY };
  lastPointerTime = performance.now();
}

function onPointerUp() {
  if (!pointerDown) return;
  pointerDown = false;
  const speed = Math.sqrt(lastDelta.x ** 2 + lastDelta.y ** 2);
  if (speed > 0.05) {
    angularVelocity.set(lastDelta.y * 0.012, lastDelta.x * 0.012, 0).multiplyScalar(14);
    const mag = angularVelocity.length();
    // Clamp max throw speed
    if (mag > 0.45) angularVelocity.multiplyScalar(0.45 / mag);
    state = 'SPINNING';
    hideQuestion();
    clearHighlights();
    spinBtn.disabled = true;
    rollCount++;
    rollCountEl.textContent = `Roll #${rollCount}`;
    selectedFace = -1;
  } else {
    state = 'IDLE';
    spinBtn.disabled = false;
  }
}

canvas.addEventListener('mousedown',  onPointerDown);
canvas.addEventListener('touchstart', onPointerDown, { passive: true });
window.addEventListener('mousemove',  onPointerMove);
canvas.addEventListener('touchmove',  onPointerMove, { passive: true });
window.addEventListener('mouseup',    onPointerUp);
window.addEventListener('touchend',   onPointerUp);

// --- Resize ---
function resize() {
  const w = container.clientWidth;
  const h = container.clientHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(container);
resize();

// --- Animation loop ---
function animate() {
  requestAnimationFrame(animate);

  if (state === 'SPINNING') {
    const speed = angularVelocity.length();
    if (speed < STOP_THRESHOLD) {
      angularVelocity.set(0, 0, 0);
      state = 'STOPPED';
      onBallStopped();
    } else {
      const axis = angularVelocity.clone().normalize();
      const dq = new THREE.Quaternion().setFromAxisAngle(axis, speed);
      ball.quaternion.premultiply(dq);
      angularVelocity.multiplyScalar(DAMPING);
    }
  }

  // Pulse highlight on stopped face
  if (state === 'STOPPED' && selectedFace >= 0) {
    const t = performance.now() / 1000;
    materials[selectedFace].emissiveIntensity = 0.2 + 0.15 * Math.sin(t * 2.5);
  }

  renderer.render(scene, camera);
}

animate();
