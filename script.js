// script.js
// Circle Pulse + Neon Glow + Spectrum Ring + Background Image Ready

const canvas = document.getElementById("visualizer");
const ctx = canvas.getContext("2d");
const startBtn = document.getElementById("startBtn");

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

let analyser;
let dataArray;

let radius = 100;
let velocity = 0;

// ===== BACKGROUND IMAGE =====
// Đổi tên ảnh thành: background.jpg
// rồi đặt cùng thư mục với:
// index.html
// style.css
// script.js

const bgImage = new Image();
bgImage.src = "background.png";

startBtn.addEventListener("click", async () => {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: true
        });

        const audioContext = new AudioContext();

        analyser = audioContext.createAnalyser();
        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = 0.8;

        const source = audioContext.createMediaStreamSource(stream);
        source.connect(analyser);

        dataArray = new Uint8Array(analyser.frequencyBinCount);

        startBtn.style.display = "none";

        animate();

    } catch (error) {
        console.error(error);
        alert("Cannot access microphone!");
    }
});

function animate() {
    requestAnimationFrame(animate);

    analyser.getByteFrequencyData(dataArray);

    // clear
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // ===== DRAW BACKGROUND IMAGE =====
    ctx.drawImage(
        bgImage,
        0,
        0,
        canvas.width,
        canvas.height
    );

    // dark overlay để visual nổi hơn
    ctx.fillStyle = "rgba(0,0,0,0.70)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // ===== BASS DETECTION =====
    let bass = 0;

    for (let i = 0; i < 40; i++) {
        bass += dataArray[i];
    }

    bass = bass / 40;

    let targetRadius = 100 + bass * 0.8;

    let force = (targetRadius - radius) * 0.08;
    velocity += force;
    velocity *= 0.82;
    radius += velocity;

    let shake = bass > 120 ? 6 : 0;

    let centerX = canvas.width / 2 + (Math.random() - 0.5) * shake;
    let centerY = canvas.height / 2 + (Math.random() - 0.5) * shake;

    // ===== SPECTRUM RING =====

    const bars = 128;
    const ringRadius = radius + 30;

    for (let i = 0; i < bars; i++) {
        const value = dataArray[i];
        const barHeight = value * 0.9;
        const angle = (i / bars) * Math.PI * 2;

        const x1 = centerX + Math.cos(angle) * ringRadius;
        const y1 = centerY + Math.sin(angle) * ringRadius;

        const x2 = centerX + Math.cos(angle) * (ringRadius + barHeight);
        const y2 = centerY + Math.sin(angle) * (ringRadius + barHeight);

        const hue = i * 3;

        ctx.strokeStyle = `hsl(${hue}, 100%, 60%)`;
        ctx.lineWidth = 4;
        ctx.shadowBlur = 30;
        ctx.shadowColor = `hsl(${hue}, 100%, 60%)`;

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
    }

    // ===== GLOW BACKGROUND CIRCLE =====

    ctx.beginPath();
    ctx.arc(centerX, centerY, radius + 25, 0, Math.PI * 2);

    ctx.fillStyle = "rgba(138, 43, 226, 0.08)";
    ctx.shadowBlur = 80;
    ctx.shadowColor = "#8a2be2";
    ctx.fill();

    // ===== MAIN CIRCLE =====

    const gradient = ctx.createLinearGradient(
        centerX - radius,
        centerY - radius,
        centerX + radius,
        centerY + radius
    );

    gradient.addColorStop(0, "#00f5ff");
    gradient.addColorStop(0.5, "#8a2be2");
    gradient.addColorStop(1, "#ff00ff");

    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);

    ctx.strokeStyle = gradient;
    ctx.lineWidth = 7;
    ctx.shadowBlur = 60;
    ctx.shadowColor = "#ff00ff";

    ctx.stroke();
}