const canvas = document.getElementById('visualizer');
const ctx = canvas.getContext('2d');
const startBtn = document.getElementById('start-btn');
const stopBtn = document.getElementById('stop-btn');
const fullscreenBtn = document.getElementById('fullscreen-btn');
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
const speedNormal = 10; 
let speedCurrent = speedNormal;

// Pre-calculate unit star vertices to save trig calls per frame
const starVertices = [];
for (let j = 0; j < 10; j++) {
    let r = (j % 2 === 0) ? 1 : 0.4;
    let angle = -Math.PI / 2 + (j * Math.PI / 5);
    starVertices.push({ x: Math.cos(angle) * r, y: Math.sin(angle) * r });
}

if (particlesCanvas) {
    function resizeParticles() {
        particlesCanvas.width = window.innerWidth;
        particlesCanvas.height = window.innerHeight;
    }
    window.addEventListener('resize', resizeParticles);
    resizeParticles();
    
    for(let i=0; i<numStars; i++) stars.push(createStar());
}

function createStar() {
    return {
        x: (Math.random() - 0.5) * window.innerWidth * 2.5,
        y: (Math.random() - 0.5) * window.innerHeight * 2.5,
        z: Math.random() * 1000 + 100,
        radius: Math.random() * 10 + 6,
        color: starColors[Math.floor(Math.random() * starColors.length)],
        rotation: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 0.05
    };
}

// Set canvas size (Fixed)
canvas.width = 900;
canvas.height = 900;
const canvasCenterX = 450;
const canvasCenterY = 450;
const baseRadius = 225;

// Pre-calculate circular visualizer geometry
const numBars = 32; 
const angles = [];
const cosAngles = [];
const sinAngles = [];

for (let i = 0; i < numBars; i++) {
    const angle = -Math.PI / 2 + (i / (numBars - 1)) * Math.PI;
    angles.push(angle);
    cosAngles.push(Math.cos(angle));
    sinAngles.push(Math.sin(angle));
}
for (let i = numBars - 2; i > 0; i--) {
    const angle = Math.PI / 2 + ((numBars - 1 - i) / (numBars - 1)) * Math.PI;
    angles.push(angle);
    cosAngles.push(Math.cos(angle));
    sinAngles.push(Math.sin(angle));
}

const nodeAngles = [];
const nodeCosAngles = [];
const nodeSinAngles = [];
for (let i = 0; i < angles.length; i++) {
    let a0 = angles[i];
    let a1 = angles[(i + 1) % angles.length];
    let midAngle = (a0 + a1) / 2;
    if (i === angles.length - 1) midAngle = (a0 + (a1 + Math.PI * 2)) / 2;
    
    nodeAngles.push(midAngle);
    nodeCosAngles.push(Math.cos(midAngle));
    nodeSinAngles.push(Math.sin(midAngle));
}

const midStartBin = 4;
const midEndBin = 28;
const binsPerBar = (midEndBin - midStartBin) / numBars;
const dataIndices = [];
for (let i = 0; i < numBars; i++) dataIndices.push(midStartBin + Math.floor(i * binsPerBar));
for (let i = numBars - 2; i > 0; i--) dataIndices.push(midStartBin + Math.floor(i * binsPerBar));

const hVals = new Float32Array(dataIndices.length);
const nodeHVals = new Float32Array(dataIndices.length);

// Pre-create Gradients
const strokeGradient = ctx.createLinearGradient(
    canvasCenterX, canvasCenterY - baseRadius - 150, 
    canvasCenterX, canvasCenterY + baseRadius + 150
);
strokeGradient.addColorStop(0, '#ff00ff');
strokeGradient.addColorStop(0.5, '#00ffff');
strokeGradient.addColorStop(1, '#ff8c00');

const fillGradient = ctx.createLinearGradient(
    canvasCenterX, canvasCenterY - baseRadius - 150, 
    canvasCenterX, canvasCenterY + baseRadius + 150
);
fillGradient.addColorStop(0, 'rgba(255, 0, 255, 0.25)');
fillGradient.addColorStop(0.5, 'rgba(0, 255, 255, 0.25)');
fillGradient.addColorStop(1, 'rgba(255, 140, 0, 0.25)');

// Audio variables
let audioContext;
let analyser;
let dataArray;
let source;
let isAudioInitialized = false;
let activeStream = null;

// Beat detection variables
let lastBeatTime = 0;
let shakeAmount = 0;
let beatMovingAvg = 0;

// Physics variables
let currentScale = 1;
let targetScale = 1;
let scaleVelocity = 0;

// Initialize Audio
async function initAudio() {
    if (isAudioInitialized) return;

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        activeStream = stream;
        
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioContext.createAnalyser();
        
        source = audioContext.createMediaStreamSource(stream);
        source.connect(analyser);
        
        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = 0.4;
        dataArray = new Uint8Array(analyser.frequencyBinCount);
        
        isAudioInitialized = true;
        startBtn.style.display = 'none';
        stopBtn.style.display = 'flex';
        
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
        
        let totalSum = 0;
        for(let i = 0; i < dataArray.length; i++) totalSum += dataArray[i];
        
        if(intensityFill) {
            intensityFill.style.width = `${Math.min((totalSum / dataArray.length / 120) * 100, 100)}%`;
        }
        
        let bassAvg = 0;
        for (let i = 0; i <= 2; i++) {
            if (dataArray[i] > bassAvg) bassAvg = dataArray[i];
        }
        
        if (bassAvg > beatMovingAvg) {
            beatMovingAvg = beatMovingAvg * 0.95 + bassAvg * 0.05;
        } else {
            beatMovingAvg = beatMovingAvg * 0.50 + bassAvg * 0.50;
        }
        
        const isBeat = (bassAvg > beatMovingAvg + 35) || (bassAvg > beatMovingAvg * 1.15 && bassAvg > 220);

        if (isBeat && bassAvg > 70 && Date.now() - lastBeatTime > 120) {
            lastBeatTime = Date.now();
            shakeAmount = 15;
            targetScale = 1.15; 
            speedCurrent = 80;
            if(flashOverlay) {
                flashOverlay.style.opacity = '0.7';
                setTimeout(() => { flashOverlay.style.opacity = '0'; }, 100);
            }
        } else {
            targetScale = 0.85 + Math.pow(bassAvg / 255, 3) * 0.08; 
        }

        if (shakeAmount > 0) {
            const rx = (Math.random() - 0.5) * shakeAmount;
            const ry = (Math.random() - 0.5) * shakeAmount;
            mainContainer.style.transform = `translate3d(${rx}px, ${ry}px, 0)`;
            shakeAmount *= 0.85;
            if (shakeAmount < 0.5) {
                shakeAmount = 0;
                mainContainer.style.transform = 'translate3d(0, 0, 0)';
            }
        }

        let force = (targetScale - currentScale) * 0.45;
        scaleVelocity += force;
        scaleVelocity *= 0.75;
        currentScale += scaleVelocity;
        
        visualizerWrapper.style.transform = `scale(${currentScale})`;
    }

    if (pCtx) {
        speedCurrent += (speedNormal - speedCurrent) * 0.08;
        
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
            
            if (sx > -50 && sx < particlesCanvas.width + 50 && sy > -50 && sy < particlesCanvas.height + 50) {
                pCtx.save();
                pCtx.translate(sx, sy);
                pCtx.rotate(s.rotation);
                pCtx.shadowBlur = 15;
                pCtx.shadowColor = s.color;
                pCtx.fillStyle = s.color;
                
                pCtx.beginPath();
                pCtx.moveTo(starVertices[0].x * sr, starVertices[0].y * sr);
                for (let j = 1; j < 10; j++) {
                    pCtx.lineTo(starVertices[j].x * sr, starVertices[j].y * sr);
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
    let maxH = 0;
    
    for (let i = 0; i < dataIndices.length; i++) {
        const value = isAudioInitialized ? dataArray[dataIndices[i]] : 0;
        const h = Math.pow(value / 255, 1.8) * 160; 
        if (h > maxH) maxH = h;
        hVals[i] = h;
    }

    for (let i = 0; i < hVals.length; i++) {
        nodeHVals[i] = (hVals[i] + hVals[(i + 1) % hVals.length]) / 2;
    }

    ctx.strokeStyle = strokeGradient;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const gridLevels = 4;

    if (maxH >= 2) {
        ctx.beginPath();
        let startX = canvasCenterX + cosAngles[0] * (baseRadius + hVals[0]);
        let startY = canvasCenterY + sinAngles[0] * (baseRadius + hVals[0]);
        ctx.moveTo(startX, startY);
        
        for (let i = 0; i < hVals.length; i++) {
            let nextIndex = (i + 1) % hVals.length;
            let cX = canvasCenterX + cosAngles[nextIndex] * (baseRadius + hVals[nextIndex]);
            let cY = canvasCenterY + sinAngles[nextIndex] * (baseRadius + hVals[nextIndex]);
            let nX = canvasCenterX + nodeCosAngles[nextIndex] * (baseRadius + nodeHVals[nextIndex]);
            let nY = canvasCenterY + nodeSinAngles[nextIndex] * (baseRadius + nodeHVals[nextIndex]);
            ctx.quadraticCurveTo(cX, cY, nX, nY);
        }
        
        ctx.arc(canvasCenterX, canvasCenterY, baseRadius, nodeAngles[0], nodeAngles[0] - Math.PI * 2, true);
        ctx.closePath();
        
        ctx.shadowBlur = 0;
        ctx.fillStyle = fillGradient;
        ctx.fill();
    }

    for (let level = 0; level <= gridLevels; level++) {
        if (level > 0 && maxH < 2) continue;
        
        ctx.beginPath();
        let fraction = level / gridLevels;
        
        let startX = canvasCenterX + cosAngles[0] * (baseRadius + hVals[0] * fraction);
        let startY = canvasCenterY + sinAngles[0] * (baseRadius + hVals[0] * fraction);
        ctx.moveTo(startX, startY);
        
        for (let i = 0; i < hVals.length; i++) {
            let nextIndex = (i + 1) % hVals.length;
            let cX = canvasCenterX + cosAngles[nextIndex] * (baseRadius + hVals[nextIndex] * fraction);
            let cY = canvasCenterY + sinAngles[nextIndex] * (baseRadius + hVals[nextIndex] * fraction);
            let nX = canvasCenterX + nodeCosAngles[nextIndex] * (baseRadius + nodeHVals[nextIndex] * fraction);
            let nY = canvasCenterY + nodeSinAngles[nextIndex] * (baseRadius + nodeHVals[nextIndex] * fraction);
            
            ctx.quadraticCurveTo(cX, cY, nX, nY);
        }
        
        ctx.lineWidth = level === 0 ? 5 : 2.5;
        
        ctx.shadowColor = '#00ffff';
        ctx.shadowBlur = 30;
        ctx.stroke();

        ctx.shadowColor = '#ffffff';
        ctx.shadowBlur = 10;
        ctx.stroke();
    }

    if (maxH >= 2) {
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        for (let i = 0; i < nodeHVals.length; i++) {
            let innerX = canvasCenterX + nodeCosAngles[i] * baseRadius;
            let innerY = canvasCenterY + nodeSinAngles[i] * baseRadius;
            let outerX = canvasCenterX + nodeCosAngles[i] * (baseRadius + nodeHVals[i]);
            let outerY = canvasCenterY + nodeSinAngles[i] * (baseRadius + nodeHVals[i]);
            
            ctx.moveTo(innerX, innerY);
            ctx.lineTo(outerX, outerY);
        }
        
        ctx.shadowColor = '#00ffff';
        ctx.shadowBlur = 30;
        ctx.stroke();

        ctx.shadowColor = '#ffffff';
        ctx.shadowBlur = 10;
        ctx.stroke();
    }

    ctx.fillStyle = strokeGradient;
    for (let i = 0; i < nodeHVals.length; i++) {
        let outerX = canvasCenterX + nodeCosAngles[i] * (baseRadius + nodeHVals[i]);
        let outerY = canvasCenterY + nodeSinAngles[i] * (baseRadius + nodeHVals[i]);
        
        ctx.beginPath();
        ctx.arc(outerX, outerY, 4, 0, Math.PI * 2);
        ctx.fill();
    }
}

animate();

startBtn.addEventListener('click', () => {
    if (audioContext && audioContext.state === 'suspended') {
        audioContext.resume();
    }
    initAudio();
});

stopBtn.addEventListener('click', () => {
    if (activeStream) {
        activeStream.getTracks().forEach(track => track.stop());
    }
    if (audioContext) {
        audioContext.suspend();
    }
    isAudioInitialized = false;
    startBtn.style.display = 'flex';
    stopBtn.style.display = 'none';
    
    if (intensityFill) {
        intensityFill.style.width = '0%';
    }
    
    // Reset scale when mic is stopped
    targetScale = 1;
});

let cursorTimeout;
document.addEventListener('mousemove', () => {
    if (document.fullscreenElement) {
        document.body.style.cursor = 'default';
        clearTimeout(cursorTimeout);
        cursorTimeout = setTimeout(() => {
            if (document.fullscreenElement) {
                document.body.style.cursor = 'none';
            }
        }, 2000);
    } else {
        document.body.style.cursor = 'default';
        clearTimeout(cursorTimeout);
    }
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
