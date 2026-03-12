// ── Canvas Setup ──────────────────────────────────────────────
const canvas = document.getElementById("myCanvas");
const ctx = canvas.getContext("2d");

// ── Constants ─────────────────────────────────────────────────
const FPS = 60;
const JUMP_AMOUNT = -9;
const MAX_FALL_SPEED = 10;
const GRAVITY = 0.45;
const PIPE_SPEED = -2.5;
const PIPE_WIDTH = 52;
const PIPE_GAP_MIN = 130;
const PIPE_GAP_MAX = 180;
const PIPE_SPAWN_INTERVAL = 90; // frames

// ── Game State ────────────────────────────────────────────────
let gameMode = "prestart"; // prestart | running | over
let score = 0;
let bestScore = parseInt(localStorage.getItem("neonFlappyBest") || "0");
let frameCount = 0;
let comboCount = 0;
let lastPipePassed = -1;
let shakeFrames = 0;
let timeGameLastRunning;

// ── Particles ─────────────────────────────────────────────────
let particles = [];

function spawnParticles(x, y, color, count) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = Math.random() * 4 + 1;
    particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 1,
      decay: Math.random() * 0.04 + 0.02,
      size: Math.random() * 5 + 2,
      color
    });
  }
}

function updateParticles() {
  particles = particles.filter(p => p.life > 0);
  particles.forEach(p => {
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.1;
    p.life -= p.decay;
  });
}

function drawParticles() {
  particles.forEach(p => {
    ctx.save();
    ctx.globalAlpha = p.life;
    ctx.shadowBlur = 10;
    ctx.shadowColor = p.color;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
}

// ── Stars (background) ────────────────────────────────────────
const stars = [];
for (let i = 0; i < 80; i++) {
  stars.push({
    x: Math.random() * canvas.width,
    y: Math.random() * canvas.height,
    r: Math.random() * 1.5 + 0.3,
    twinkle: Math.random() * Math.PI * 2,
    speed: Math.random() * 0.3 + 0.05
  });
}

function drawStars() {
  stars.forEach(s => {
    s.twinkle += 0.05;
    s.x -= s.speed;
    if (s.x < 0) s.x = canvas.width;
    const alpha = 0.4 + 0.6 * Math.abs(Math.sin(s.twinkle));
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "#ffffff";
    ctx.shadowBlur = 4;
    ctx.shadowColor = "#aaccff";
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
}

// ── Ground ────────────────────────────────────────────────────
let groundOffset = 0;
const GROUND_HEIGHT = 40;

function drawGround() {
  if (gameMode === "running") {
    groundOffset += PIPE_SPEED;
    if (groundOffset < -40) groundOffset = 0;
  }

  // Ground base
  const gGrad = ctx.createLinearGradient(0, canvas.height - GROUND_HEIGHT, 0, canvas.height);
  gGrad.addColorStop(0, "#003322");
  gGrad.addColorStop(1, "#001a11");
  ctx.fillStyle = gGrad;
  ctx.fillRect(0, canvas.height - GROUND_HEIGHT, canvas.width, GROUND_HEIGHT);

  // Glowing top line
  ctx.strokeStyle = "#00ff88";
  ctx.lineWidth = 2;
  ctx.shadowBlur = 8;
  ctx.shadowColor = "#00ff88";
  ctx.beginPath();
  ctx.moveTo(0, canvas.height - GROUND_HEIGHT);
  ctx.lineTo(canvas.width, canvas.height - GROUND_HEIGHT);
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Animated grid lines
  ctx.strokeStyle = "rgba(0, 255, 100, 0.2)";
  ctx.lineWidth = 1;
  for (let x = groundOffset; x < canvas.width + 40; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, canvas.height - GROUND_HEIGHT);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }
}

// ── Bird ──────────────────────────────────────────────────────
const bird = {
  x: canvas.width / 3,
  y: canvas.height / 2,
  vx: 0,
  vy: 0,
  width: 34,
  height: 26,
  angle: 0,
  flap: 0,          // wing animation
  trail: [],         // motion trail
  shieldTimer: 0,    // power-up shield
  ghostTimer: 0      // slow-motion ghost power-up
};

function resetBird() {
  bird.x = canvas.width / 3;
  bird.y = canvas.height / 2;
  bird.vy = 0;
  bird.angle = 0;
  bird.trail = [];
  bird.shieldTimer = 0;
  bird.ghostTimer = 0;
}

function updateBird() {
  // gravity
  if (bird.vy < MAX_FALL_SPEED) bird.vy += GRAVITY;

  bird.y += bird.vy;
  bird.flap += 0.25;

  // tilt
  if (bird.vy < 0) {
    bird.angle = Math.max(bird.angle - 5, -25);
  } else {
    bird.angle = Math.min(bird.angle + 3, 75);
  }

  // trail
  bird.trail.unshift({ x: bird.x, y: bird.y, age: 0 });
  if (bird.trail.length > 12) bird.trail.pop();
  bird.trail.forEach(t => t.age++);

  // power-up timers
  if (bird.shieldTimer > 0) bird.shieldTimer--;
  if (bird.ghostTimer > 0) bird.ghostTimer--;

  // Boundary death
  if (bird.y > canvas.height - GROUND_HEIGHT - bird.height / 2) {
    bird.y = canvas.height - GROUND_HEIGHT - bird.height / 2;
    if (gameMode === "running") triggerDeath();
  }
  if (bird.y < bird.height / 2) {
    bird.y = bird.height / 2;
    if (gameMode === "running") triggerDeath();
  }
}

function drawBird() {
  // Draw trail
  bird.trail.forEach((t, i) => {
    const alpha = (1 - i / bird.trail.length) * 0.4;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.shadowBlur = 8;
    ctx.shadowColor = "#ff00ff";
    ctx.fillStyle = "#ff00aa";
    ctx.beginPath();
    ctx.ellipse(t.x, t.y, bird.width / 2 * (1 - i / bird.trail.length),
      bird.height / 2 * (1 - i / bird.trail.length), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });

  ctx.save();
  ctx.translate(bird.x, bird.y);
  ctx.rotate((bird.angle * Math.PI) / 180);

  // Shield effect
  if (bird.shieldTimer > 0) {
    ctx.save();
    ctx.globalAlpha = 0.5 + 0.3 * Math.sin(frameCount * 0.2);
    ctx.strokeStyle = "#00ffff";
    ctx.lineWidth = 3;
    ctx.shadowBlur = 20;
    ctx.shadowColor = "#00ffff";
    ctx.beginPath();
    ctx.arc(0, 0, bird.width * 0.9, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // Ghost effect
  if (bird.ghostTimer > 0) {
    ctx.globalAlpha = 0.6;
  }

  // Body gradient
  const bodyGrad = ctx.createRadialGradient(-4, -4, 2, 0, 0, bird.width / 2);
  bodyGrad.addColorStop(0, "#ffff88");
  bodyGrad.addColorStop(0.5, "#ffaa00");
  bodyGrad.addColorStop(1, "#ff5500");

  ctx.shadowBlur = 15;
  ctx.shadowColor = "#ffaa00";
  ctx.fillStyle = bodyGrad;
  ctx.beginPath();
  ctx.ellipse(0, 0, bird.width / 2, bird.height / 2, 0, 0, Math.PI * 2);
  ctx.fill();

  // Wing
  const wingY = Math.sin(bird.flap) * 6;
  ctx.fillStyle = "#ff8800";
  ctx.shadowColor = "#ffcc00";
  ctx.beginPath();
  ctx.ellipse(-2, wingY, 10, 6, -0.3, 0, Math.PI * 2);
  ctx.fill();

  // Eye
  ctx.fillStyle = "white";
  ctx.shadowBlur = 0;
  ctx.beginPath();
  ctx.arc(9, -5, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#111";
  ctx.beginPath();
  ctx.arc(10, -5, 3, 0, Math.PI * 2);
  ctx.fill();
  // Eye shine
  ctx.fillStyle = "white";
  ctx.beginPath();
  ctx.arc(11, -6, 1.2, 0, Math.PI * 2);
  ctx.fill();

  // Beak
  ctx.fillStyle = "#ff6600";
  ctx.beginPath();
  ctx.moveTo(14, -2);
  ctx.lineTo(20, 1);
  ctx.lineTo(14, 4);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

// ── Pipes ─────────────────────────────────────────────────────
let pipes = [];

const PIPE_COLORS = [
  { body: "#00ff88", glow: "#00ff88", cap: "#00cc66" },
  { body: "#ff00ff", glow: "#ff00ff", cap: "#cc00cc" },
  { body: "#00ccff", glow: "#00ccff", cap: "#0088cc" },
  { body: "#ffaa00", glow: "#ffaa00", cap: "#cc7700" }
];

function spawnPipe() {
  const colorIdx = Math.floor(Math.random() * PIPE_COLORS.length);
  const gap = PIPE_GAP_MIN + Math.random() * (PIPE_GAP_MAX - PIPE_GAP_MIN);
  const minTop = 60;
  const maxTop = canvas.height - GROUND_HEIGHT - gap - 60;
  const topHeight = minTop + Math.random() * (maxTop - minTop);

  pipes.push
\<Streaming stoppped because the conversation grew too long for this model\>