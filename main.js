const canvas = document.getElementById('visualizer');
const ctx = canvas.getContext('2d');
const startBtn = document.getElementById('start-btn');
const fullscreenBtn = document.getElementById('fullscreen-btn');
const centerImageContainer = document.querySelector('.center-image-container');
const visualizerWrapper = document.querySelector('.visualizer-wrapper');
const mainContainer = document.querySelector('.main-container');
const flashOverlay = document.getElementById('flash-overlay');
const intensityFill = document.getElementById('intensity-fill');

// Particle System Variables
const particlesCanvas = document.getElementById('particles-canvas');
const pCtx = particlesCanvas ? particlesCanvas.getContext('2d') : null;
const starColors = ['#ff00ff', '#00ffff', '#ff8c00', '#ffff00', '#00ff00', '#8a2be2'];
let stars = [];
const numStars = 150;
const speedNormal = 1.5;
let speedCurrent = speedNormal;

if (particlesCanvas) {
    function resizeParticles() {
        particlesCanvas.width = window.innerWidth;
        particlesCanvas.height = window.innerHeight;
    }
    window.addEventListener('resize', resizeParticles);
    resizeParticles();
    
    for(let i=0; i<numStars; i++) {
        stars.push(createStar());
    }
}

function createStar() {
    return {
        x: (Math.random() - 0.5) * window.innerWidth * 2.5,
        y: (Math.random() - 0.5) * window.innerHeight * 2.5,
        z: Math.random() * 1000 + 100, // Depth
        radius: Math.random() * 8 + 4, // Bigger Size (4 to 12 base radius)
        color: starColors[Math.floor(Math.random() * starColors.length)],
        rotation: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 0.05
    };
}

// Set canvas size
canvas.width = 900;
canvas.height = 900;

// Audio variables
let audioContext;
let analyser;
let dataArray;
let source;
let isAudioInitialized = false;

// Beat detection variables
let lastBeatTime = 0;
let shakeAmount = 0;
let beatMovingAvg = 0; // Dynamic threshold for reliable beat detection

// Physics variables for smooth pulse
let currentScale = 1;
let targetScale = 1;
let scaleVelocity = 0;

// Initialize Audio
async function initAudio() {
    if (isAudioInitialized) return;

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioContext.createAnalyser();
        
        source = audioContext.createMediaStreamSource(stream);
        source.connect(analyser);
        
        // FFT size determines the frequency resolution
        analyser.fftSize = 512;
        // Giảm smoothing mặc định của trình duyệt (0.8 -> 0.4) để lấy tín hiệu nhạy và sắc nét hơn
        analyser.smoothingTimeConstant = 0.4;
        const bufferLength = analyser.frequencyBinCount;
        dataArray = new Uint8Array(bufferLength);
        
        isAudioInitialized = true;
        startBtn.textContent = 'MIC ACTIVE';
        startBtn.style.color = 'var(--primary-color)';
        startBtn.style.borderColor = 'var(--primary-color)';
        
        // Hide button after a few seconds
        setTimeout(() => {
            startBtn.style.opacity = '0';
            setTimeout(() => startBtn.style.display = 'none', 500);
        }, 2000);

        animate();
    } catch (err) {
        console.error('Error accessing microphone:', err);
        alert('Microphone access denied or not available. Please check permissions.');
    }
}

// Visualizer animation loop
function animate() {
    requestAnimationFrame(animate);

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (isAudioInitialized) {
        analyser.getByteFrequencyData(dataArray);
        
        // Cập nhật thanh cường độ âm thanh tổng thể (Intensity Bar)
        let totalSum = 0;
        for(let i = 0; i < dataArray.length; i++) {
            totalSum += dataArray[i];
        }
        let totalAvg = totalSum / dataArray.length;
        // Scale so that an average of 120 (which is very loud for the entire spectrum) = 100%
        let intensityPct = Math.min((totalAvg / 120) * 100, 100);
        if(intensityFill) {
            intensityFill.style.width = `${intensityPct}%`;
        }
        
        // Phân tích dải tần số (Frequency Analysis):
        // Sample rate = ~44100Hz. FFT Size = 512. Bins = 256. Each bin = ~86Hz.
        // BASS: Bins 0-2 (0Hz - 258Hz) - Chuẩn dải Bass/Kick thực thụ, tránh bị dính Mid (giọng hát).
        // Dùng MAX thay vì AVG (Trung bình) vì nhiều micro laptop tự động lọc tiếng trầm sâu.
        let bassMax = 0;
        for (let i = 0; i <= 2; i++) {
            if (dataArray[i] > bassMax) {
                bassMax = dataArray[i];
            }
        }
        const bassAvg = bassMax; 
        
        // MID: Bins 4-28 (344Hz - 2400Hz) -> Used below for the spectrum
        // TREBLE: Bins 29-100 (2400Hz - 8600Hz) -> Available for future effects
        
        // Update dynamic moving average (Envelope Follower - Slow Attack, Fast Release)
        // Nếu bass đang đánh, average tăng RẤT CHẬM để không "nuốt" mất transient của nhịp tiếp theo
        // Nếu bass tụt, average giảm RẤT NHANH để reset lại chuẩn bị bắt nhịp mới
        if (bassAvg > beatMovingAvg) {
            beatMovingAvg = beatMovingAvg * 0.95 + bassAvg * 0.05;
        } else {
            beatMovingAvg = beatMovingAvg * 0.50 + bassAvg * 0.50;
        }
        
        // Dynamic Beat Detection
        // Tăng khoảng cách nhạy cảm (+35 thay vì +20) để nó "lì" hơn, không bị kích hoạt bởi những tiếng bass phụ/nhẹ.
        const isBeat = (bassAvg > beatMovingAvg + 35) || (bassAvg > beatMovingAvg * 1.15 && bassAvg > 220);

        // Giảm cooldown xuống 120ms để bắt kịp nhịp siêu nhanh (tới 250 BPM - double kicks)
        // Ngưỡng tối thiểu tăng lên 70 (từ 40) để tránh nhảy loạn xạ ở nhạc nền quá nhỏ
        if (isBeat && bassAvg > 70 && Date.now() - lastBeatTime > 120) {
            lastBeatTime = Date.now();
            // Trigger effects
            shakeAmount = 15; // lighter shake
            targetScale = 1.25; // Lighter pulse on beat (was 1.45)
            speedCurrent = 45; // Warp speed for particles!
            if(flashOverlay) {
                flashOverlay.style.opacity = '0.7'; // Flash bright
                setTimeout(() => {
                    flashOverlay.style.opacity = '0';
                }, 100);
            }
        } else {
            // Shrink smaller when silent, making the pulse range much wider
            targetScale = 0.85 + Math.pow(bassAvg / 255, 3) * 0.08; 
        }

        // Apply Screen Shake to the main container only (leaves background video smooth)
        if (shakeAmount > 0) {
            const rx = (Math.random() - 0.5) * shakeAmount;
            const ry = (Math.random() - 0.5) * shakeAmount;
            mainContainer.style.transform = `translate3d(${rx}px, ${ry}px, 0)`; // translate3d forces hardware acceleration
            shakeAmount *= 0.85; // Decay
            if (shakeAmount < 0.5) {
                shakeAmount = 0;
                mainContainer.style.transform = 'translate3d(0, 0, 0)';
            }
        }

        // Apply Spring Physics for "giãn ra, co vào" bounce effect
        let force = (targetScale - currentScale) * 0.45; // Snappier spring stiffness
        scaleVelocity += force;
        scaleVelocity *= 0.75; // Less damping for stronger bounce
        currentScale += scaleVelocity;
        
        // Scale the entire wrapper so both spectrum and image pulse together seamlessly
        visualizerWrapper.style.transform = `scale(${currentScale})`;
    }

    // Particle Animation Loop (Runs constantly, even without audio)
    if (pCtx) {
        speedCurrent += (speedNormal - speedCurrent) * 0.08; // Smooth friction back to normal speed
        
        pCtx.clearRect(0, 0, particlesCanvas.width, particlesCanvas.height);
        const cx = particlesCanvas.width / 2;
        const cy = particlesCanvas.height / 2;
        
        for(let i=0; i<stars.length; i++) {
            let s = stars[i];
            s.z -= speedCurrent;
            s.rotation += s.rotSpeed;
            
            if (s.z <= 0) {
                stars[i] = createStar();
                stars[i].z = 1000;
                continue;
            }
            
            let perspective = 500 / s.z;
            let sx = cx + s.x * perspective;
            let sy = cy + s.y * perspective;
            let sr = s.radius * perspective;
            
            // Only draw if within screen bounds to save performance
            if (sx > -50 && sx < particlesCanvas.width + 50 && sy > -50 && sy < particlesCanvas.height + 50) {
                pCtx.save();
                pCtx.translate(sx, sy);
                pCtx.rotate(s.rotation);
                pCtx.shadowBlur = 15;
                pCtx.shadowColor = s.color;
                pCtx.fillStyle = s.color;
                
                // Draw 5-pointed star
                pCtx.beginPath();
                for (let j = 0; j < 10; j++) {
                    let r = (j % 2 === 0) ? sr : sr * 0.4;
                    let angle = -Math.PI / 2 + (j * Math.PI / 5);
                    if (j === 0) pCtx.moveTo(Math.cos(angle) * r, Math.sin(angle) * r);
                    else pCtx.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
                }
                pCtx.closePath();
                pCtx.fill();
                pCtx.restore();
            }
        }
    }

    drawCircularVisualizer();
}

function drawCircularVisualizer() {
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const baseRadius = 225;
    
    // Slightly more bars for smoother curves
    const numBars = 32; 
    
    // Collect points
    const dataPoints = [];
    let maxH = 0;
    
    // Map spectrum strictly to MID frequencies (e.g. bins 4 to 28, covering ~340Hz to ~2400Hz)
    const midStartBin = 4;
    const midEndBin = 28;
    const binsPerBar = (midEndBin - midStartBin) / numBars;

    // Right side (top to bottom)
    for (let i = 0; i < numBars; i++) {
        const index = midStartBin + Math.floor(i * binsPerBar);
        const value = isAudioInitialized ? dataArray[index] : 0;
        
        // Baseline is 0. When silent, it collapses to the border.
        const h = Math.pow(value / 255, 1.8) * 160; 
        if (h > maxH) maxH = h;
        const angle = -Math.PI / 2 + (i / (numBars - 1)) * Math.PI;
        dataPoints.push({ angle, h });
    }
    // Left side (bottom to top)
    for (let i = numBars - 2; i > 0; i--) {
        const index = midStartBin + Math.floor(i * binsPerBar);
        const value = isAudioInitialized ? dataArray[index] : 0;
        
        const h = Math.pow(value / 255, 1.8) * 160; 
        if (h > maxH) maxH = h;
        const angle = Math.PI / 2 + ((numBars - 1 - i) / (numBars - 1)) * Math.PI;
        dataPoints.push({ angle, h });
    }

    // Calculate nodes (midpoints) that the splines will pass through perfectly
    const nodes = [];
    for (let i = 0; i < dataPoints.length; i++) {
        let p0 = dataPoints[i];
        let p1 = dataPoints[(i + 1) % dataPoints.length];
        
        let midAngle = (p0.angle + p1.angle) / 2;
        // Fix wrap around at the top
        if (i === dataPoints.length - 1) {
            midAngle = (p0.angle + (p1.angle + Math.PI * 2)) / 2;
        }
        let midH = (p0.h + p1.h) / 2;
        nodes.push({ angle: midAngle, h: midH });
    }

    // Synthwave Gradient (Magenta -> Cyan -> Orange)
    const gradient = ctx.createLinearGradient(
        centerX, centerY - baseRadius - 150, 
        centerX, centerY + baseRadius + 150
    );
    gradient.addColorStop(0, '#ff00ff');
    gradient.addColorStop(0.5, '#00ffff');
    gradient.addColorStop(1, '#ff8c00');

    ctx.strokeStyle = gradient;
    ctx.fillStyle = gradient;
    // We will set shadow properties dynamically per stroke pass below
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const gridLevels = 4; // Inner circle + 3 outer wavy lines

    // 0. Fill the spectrum area with a semi-transparent gradient
    if (maxH >= 2) {
        ctx.beginPath();
        // Outer boundary (clockwise)
        let startX = centerX + Math.cos(nodes[0].angle) * (baseRadius + nodes[0].h);
        let startY = centerY + Math.sin(nodes[0].angle) * (baseRadius + nodes[0].h);
        ctx.moveTo(startX, startY);
        
        for (let i = 0; i < dataPoints.length; i++) {
            let nextIndex = (i + 1) % dataPoints.length;
            let cX = centerX + Math.cos(dataPoints[nextIndex].angle) * (baseRadius + dataPoints[nextIndex].h);
            let cY = centerY + Math.sin(dataPoints[nextIndex].angle) * (baseRadius + dataPoints[nextIndex].h);
            let nX = centerX + Math.cos(nodes[nextIndex].angle) * (baseRadius + nodes[nextIndex].h);
            let nY = centerY + Math.sin(nodes[nextIndex].angle) * (baseRadius + nodes[nextIndex].h);
            ctx.quadraticCurveTo(cX, cY, nX, nY);
        }
        
        // Inner boundary hole (counter-clockwise)
        ctx.arc(centerX, centerY, baseRadius, nodes[0].angle, nodes[0].angle - Math.PI * 2, true);
        ctx.closePath();
        
        const fillGradient = ctx.createLinearGradient(centerX, centerY - baseRadius - 150, centerX, centerY + baseRadius + 150);
        fillGradient.addColorStop(0, 'rgba(255, 0, 255, 0.25)'); // Magenta
        fillGradient.addColorStop(0.5, 'rgba(0, 255, 255, 0.25)'); // Cyan
        fillGradient.addColorStop(1, 'rgba(255, 140, 0, 0.25)'); // Orange
        
        ctx.shadowBlur = 0; // Disable shadow for the fill to avoid bloom blowout
        ctx.fillStyle = fillGradient;
        ctx.fill();
        
        // Restore fillStyle for later
        ctx.fillStyle = gradient;
    }

    // 1. Draw concentric rings using quadratic splines for softness
    for (let level = 0; level <= gridLevels; level++) {
        // If silent, only draw the solid base ring
        if (level > 0 && maxH < 2) continue;
        
        ctx.beginPath();
        let fraction = level / gridLevels;
        
        let startX = centerX + Math.cos(nodes[0].angle) * (baseRadius + nodes[0].h * fraction);
        let startY = centerY + Math.sin(nodes[0].angle) * (baseRadius + nodes[0].h * fraction);
        ctx.moveTo(startX, startY);
        
        for (let i = 0; i < dataPoints.length; i++) {
            let nextIndex = (i + 1) % dataPoints.length;
            
            // The data point pulls the curve like a control point
            let cX = centerX + Math.cos(dataPoints[nextIndex].angle) * (baseRadius + dataPoints[nextIndex].h * fraction);
            let cY = centerY + Math.sin(dataPoints[nextIndex].angle) * (baseRadius + dataPoints[nextIndex].h * fraction);
            
            // The node is where the curve physically passes through
            let nX = centerX + Math.cos(nodes[nextIndex].angle) * (baseRadius + nodes[nextIndex].h * fraction);
            let nY = centerY + Math.sin(nodes[nextIndex].angle) * (baseRadius + nodes[nextIndex].h * fraction);
            
            ctx.quadraticCurveTo(cX, cY, nX, nY);
        }
        
        if (level === 0) ctx.lineWidth = 5; // Base ring even bolder
        else ctx.lineWidth = 2.5; // Outer rings bolder
        
        // Pass 1: Cyber Cyan Outer Glow
        ctx.shadowColor = '#00ffff';
        ctx.shadowBlur = 30;
        ctx.stroke();

        // Pass 2: White Inner Core Glow
        ctx.shadowColor = '#ffffff';
        ctx.shadowBlur = 10;
        ctx.stroke();
    }

    // 2. Draw radial lines perfectly connecting the nodes
    if (maxH >= 2) {
        ctx.lineWidth = 2.5; // Radial lines bolder
        ctx.beginPath();
        for (let i = 0; i < nodes.length; i++) {
            let pt = nodes[i];
            let innerX = centerX + Math.cos(pt.angle) * baseRadius;
            let innerY = centerY + Math.sin(pt.angle) * baseRadius;
            let outerX = centerX + Math.cos(pt.angle) * (baseRadius + pt.h);
            let outerY = centerY + Math.sin(pt.angle) * (baseRadius + pt.h);
            
            ctx.moveTo(innerX, innerY);
            ctx.lineTo(outerX, outerY);
        }
        // Pass 1: Cyber Cyan Outer Glow
        ctx.shadowColor = '#00ffff';
        ctx.shadowBlur = 30;
        ctx.stroke();

        // Pass 2: White Inner Core Glow
        ctx.shadowColor = '#ffffff';
        ctx.shadowBlur = 10;
        ctx.stroke();
    }

    // 3. Draw dots on the outermost ring (which collapses to inner ring when silent)
    for (let i = 0; i < nodes.length; i++) {
        let pt = nodes[i];
        let outerX = centerX + Math.cos(pt.angle) * (baseRadius + pt.h);
        let outerY = centerY + Math.sin(pt.angle) * (baseRadius + pt.h);
        
        ctx.beginPath();
        ctx.arc(outerX, outerY, 4, 0, Math.PI * 2);
        ctx.fill();
    }
}

// Initial draw to show the circle before audio starts
animate();

// Event Listeners
startBtn.addEventListener('click', () => {
    if (audioContext && audioContext.state === 'suspended') {
        audioContext.resume();
    }
    initAudio();
});

fullscreenBtn.addEventListener('click', () => {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(err => {
            console.error(`Error attempting to enable fullscreen: ${err.message}`);
        });
    } else {
        document.exitFullscreen();
    }
});
