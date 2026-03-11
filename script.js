/**
 * @file script.js
 * @version 13.0.0 (Native iOS Override + Eleme CDN)
 * @description 剔除官方 camera_utils，手写原生 WebRTC 视频流调度，并直连国内镜像节点。
 */

'use strict';

// ==========================================
// 1. 全局配置与状态矩阵
// ==========================================
const TARGET_NODES = ["刘磊", "陈鼎元", "陈子豪", "董奕斐", "顾曼妮", "古苗苗", "郭苏仪", "姬翔", "刘子慕", "李文轩", "李一鸣", "吕润柳", "孙垚博", "徐薇", "燕子楚齐", "郑雅今", "朱付晴晴"];
const SPECIAL_NODE = "祝大家\n前程似锦！！";

const CONFIG = {
    TOTAL_PARTICLES: 14000,
    BG_PARTICLES: 5000,   
    COLLAPSE_SPEED: 0.12,
    GRAVITY_STRENGTH: 0.045,
    ROTATION_IDLE: 0.005,
    CAMERA_Z: 650,
    EXPLOSION_DURATION: 3000
};

const state = {
    currentIndex: 0,
    isPinched: false,
    specialPhase: 0, 
    explosionTime: 0,
    isIgnited: false,
    hasTriggeredOne: false,
    currentTopology: null 
};

let oneGestureStartTime = 0;
let isOneGestureActive = false;
let systemStartTime = 0;

// ==========================================
// 2. 原生 I/O 音频引擎
// ==========================================
const audioBGM = document.getElementById('bgm_audio');
const audioSwitch = document.getElementById('sfx_switch');
const audioFirework = document.getElementById('sfx_firework');

function playSFX(audioElement, volume = 1.0) {
    if (!audioElement) return;
    audioElement.pause();
    audioElement.currentTime = 0; 
    audioElement.volume = volume;
    audioElement.play().catch(() => {});
}

// ==========================================
// 3. WebGL 渲染管线与星核分配
// ==========================================
const canvas = document.getElementById('output_canvas');
const uiText = document.getElementById('status_text');
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x000000, 0.0008);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 4000);
camera.position.z = CONFIG.CAMERA_Z;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

function createGlowTexture() {
    const pCanvas = document.createElement('canvas');
    pCanvas.width = 64; pCanvas.height = 64;
    const ctx = pCanvas.getContext('2d');
    const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255, 255, 255, 1)');      
    grad.addColorStop(0.15, 'rgba(255, 215, 0, 0.9)');    
    grad.addColorStop(0.5, 'rgba(255, 120, 0, 0.15)');   
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(pCanvas);
}

const total = CONFIG.TOTAL_PARTICLES;
const bgLimit = CONFIG.BG_PARTICLES;
const geometry = new THREE.BufferGeometry();
const posArray = new Float32Array(total * 3);
const baseArray = new Float32Array(total * 3);
const targetArray = new Float32Array(total * 3);
const phaseArray = new Float32Array(total); 
const velocityArray = new Float32Array(total * 3); 
const colorArray = new Float32Array(total * 3);    

const colorBase = new THREE.Color(0xffd700);

for (let i = 0; i < total; i++) {
    const i3 = i * 3;
    const isBG = i < bgLimit;
    
    if (isBG) {
        baseArray[i3] = (Math.random() - 0.5) * 4000;
        baseArray[i3 + 1] = (Math.random() - 0.5) * 4000;
        baseArray[i3 + 2] = (Math.random() - 0.5) * 800 - 200; 
    } else {
        const r = 140 * Math.cbrt(Math.random());
        const theta = Math.random() * 2 * Math.PI;
        const phi = Math.acos(2 * Math.random() - 1);
        baseArray[i3] = r * Math.sin(phi) * Math.cos(theta);
        baseArray[i3 + 1] = r * Math.sin(phi) * Math.sin(theta);
        baseArray[i3 + 2] = r * Math.cos(phi);
    }
    
    posArray[i3] = baseArray[i3]; posArray[i3 + 1] = baseArray[i3 + 1]; posArray[i3 + 2] = baseArray[i3 + 2];
    colorArray[i3] = colorBase.r; colorArray[i3+1] = colorBase.g; colorArray[i3+2] = colorBase.b;
    phaseArray[i] = Math.random() * Math.PI * 2;
}

geometry.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
geometry.setAttribute('color', new THREE.BufferAttribute(colorArray, 3));

const material = new THREE.PointsMaterial({
    size: 9.0, 
    map: createGlowTexture(),
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
    vertexColors: true,
    opacity: 0.85 
});
const particleSystem = new THREE.Points(geometry, material);
scene.add(particleSystem);

// ==========================================
// 4. 防抱死拓扑采样矩阵
// ==========================================
const osCanvas = document.createElement('canvas');
osCanvas.width = 512; osCanvas.height = 512;
const osCtx = osCanvas.getContext('2d'); 

function updateTargetTopology(text) {
    if (!state.isIgnited || state.currentTopology === text) return;
    state.currentTopology = text;

    osCtx.fillStyle = '#000'; osCtx.fillRect(0, 0, 512, 512);
    osCtx.fillStyle = '#FFF';
    
    const lines = text.split('\n');
    osCtx.textAlign = 'center'; osCtx.textBaseline = 'middle';
    
    if (lines.length > 1) {
        osCtx.font = 'bold 75px "Microsoft YaHei", sans-serif';
        osCtx.fillText(lines[0], 256, 210);
        osCtx.fillText(lines[1], 256, 290);
    } else {
        osCtx.font = 'bold 125px "Microsoft YaHei", sans-serif';
        osCtx.fillText(text, 256, 256);
    }

    const data = osCtx.getImageData(0, 0, 512, 512).data;
    let pIdx = 0;

    for (let y = 0; y < 512; y += 2) {
        for (let x = 0; x < 512; x += 2) {
            if (data[(y * 512 + x) * 4] > 128) {
                const targetI = bgLimit + pIdx;
                if (targetI < total) {
                    const i3 = targetI * 3;
                    targetArray[i3] = (x - 256) * 2.7 + (Math.random() - 0.5) * 3;
                    targetArray[i3 + 1] = -(y - 256) * 2.7 + (Math.random() - 0.5) * 3;
                    targetArray[i3 + 2] = (Math.random() - 0.5) * 10 + 280; 
                    colorArray[i3] = colorBase.r; colorArray[i3+1] = colorBase.g; colorArray[i3+2] = colorBase.b;
                    pIdx++;
                }
            }
        }
    }

    for (let i = bgLimit + pIdx; i < total; i++) {
        const i3 = i * 3;
        targetArray[i3] = baseArray[i3] * 0.1;
        targetArray[i3 + 1] = baseArray[i3 + 1] * 0.1;
        targetArray[i3 + 2] = baseArray[i3 + 2] * 0.1 - 100;
        colorArray[i3] = colorBase.r; colorArray[i3+1] = colorBase.g; colorArray[i3+2] = colorBase.b;
    }
    
    geometry.attributes.color.needsUpdate = true;
}

// ==========================================
// 5. 绝对熵增爆发
// ==========================================
function triggerExplosion() {
    state.specialPhase = 1;
    state.explosionTime = Date.now();
    state.currentTopology = "EXPLOSION"; 
    playSFX(audioFirework, 0.95);

    const colors = [new THREE.Color(0x00FFFF), new THREE.Color(0xFF00FF), new THREE.Color(0x39FF14), new THREE.Color(0xFFD700)];

    for (let i = bgLimit; i < total; i++) {
        const i3 = i * 3;
        const speed = Math.random() * 60 + 20;
        const theta = Math.random() * 2 * Math.PI;
        const phi = Math.acos(2 * Math.random() - 1);
        
        velocityArray[i3] = speed * Math.sin(phi) * Math.cos(theta);
        velocityArray[i3+1] = speed * Math.sin(phi) * Math.sin(theta);
        velocityArray[i3+2] = speed * Math.cos(phi) + (Math.random() * 30); 

        const c = colors[Math.floor(Math.random() * colors.length)];
        colorArray[i3] = c.r; colorArray[i3+1] = c.g; colorArray[i3+2] = c.b;
    }
    geometry.attributes.color.needsUpdate = true;
}

// ==========================================
// 6. 主渲染循环
// ==========================================
function animate() {
    requestAnimationFrame(animate);
    if (!state.isIgnited) { renderer.render(scene, camera); return; }

    const time = Date.now() * 0.001;
    const nowMs = Date.now();
    
    const isOrdered = state.isPinched || state.specialPhase === 2;
    
    material.size += ((isOrdered ? 12.0 : 9.0) - material.size) * 0.15;
    material.opacity += ((isOrdered ? 1.0 : 0.85) - material.opacity) * 0.15;

    if (state.specialPhase === 1 && (nowMs - state.explosionTime > CONFIG.EXPLOSION_DURATION)) {
        state.specialPhase = 2; 
        updateTargetTopology(SPECIAL_NODE);
    }

    const orderedSpeed = CONFIG.COLLAPSE_SPEED;
    const gravSpeed = CONFIG.GRAVITY_STRENGTH;
    const pos = posArray, target = targetArray, base = baseArray, phase = phaseArray, vel = velocityArray;

    for (let i = 0; i < total; i++) {
        const ix = i * 3, iy = ix + 1, iz = ix + 2; 
        
        if (i >= bgLimit && state.specialPhase === 1) {
            pos[ix] += vel[ix]; pos[iy] += vel[iy]; pos[iz] += vel[iz];
            vel[ix] *= 0.96; vel[iy] *= 0.96; vel[iz] *= 0.96;
        } else {
            const isBG = i < bgLimit;
            const speed = isBG ? gravSpeed : (isOrdered ? orderedSpeed : gravSpeed);
            const angle = time + phase[i];
            
            const tx = (isOrdered && !isBG) ? target[ix] : (base[ix] + Math.sin(angle) * 45);
            const ty = (isOrdered && !isBG) ? target[iy] : (base[iy] + Math.cos(angle) * 45);
            const tz = (isOrdered && !isBG) ? target[iz] : base[iz];

            pos[ix] += (tx - pos[ix]) * speed;
            pos[iy] += (ty - pos[iy]) * speed;
            pos[iz] += (tz - pos[iz]) * speed;
        }
    }
    geometry.attributes.position.needsUpdate = true;

    if (isOrdered) {
        particleSystem.rotation.y += (0 - particleSystem.rotation.y) * 0.15;
        particleSystem.rotation.z += (0 - particleSystem.rotation.z) * 0.15;
    } else {
        particleSystem.rotation.y += CONFIG.ROTATION_IDLE;
        particleSystem.rotation.z += CONFIG.ROTATION_IDLE * 0.3;
    }
    
    renderer.render(scene, camera);
}

// ==========================================
// 7. 终极突围：原生 WebRTC 调度与 AI 引擎
// ==========================================
const video = document.getElementById('input_video');
let lastVideoTime = -1;

// 核心替换：绑定国内饿了么极速 CDN 节点拉取模型
const hands = new window.Hands({locateFile: (file) => `https://npm.elemecdn.com/@mediapipe/hands/${file}`});
hands.setOptions({ maxNumHands: 1, modelComplexity: 1, minDetectionConfidence: 0.65, minTrackingConfidence: 0.65 });

// 几何推断器
function getDist(p1, p2) { return Math.hypot(p1.x - p2.x, p1.y - p2.y); }
function isExtended(tipIdx, pipIdx, wrist, lm) {
    return getDist(lm[tipIdx], wrist) > getDist(lm[pipIdx], wrist) * 1.15; 
}

// AI 神经回调
hands.onResults((res) => {
    if (!state.isIgnited) return;

    // [心跳探针]
    if (res.multiHandLandmarks && res.multiHandLandmarks.length > 0) {
        uiText.innerText = `[AI 脉搏]：已锁定 ${res.multiHandLandmarks.length} 只手`;
        uiText.style.color = "#39FF14"; // 识别成功呈绿色
    } else {
        uiText.innerText = "[AI 脉搏]：画面扫描中，未发现骨骼点...";
        uiText.style.color = "#FFD700"; // 寻猎状态呈黄色
    }

    if (res.multiHandLandmarks && res.multiHandLandmarks.length > 0) {
        const lm = res.multiHandLandmarks[0];
        const wrist = lm[0]; 
        
        const isPinching = getDist(lm[4], lm[8]) < 0.08; 
        
        const indexUp = isExtended(8, 6, wrist, lm);
        const middleUp = isExtended(12, 10, wrist, lm);
        const ringUp = isExtended(16, 14, wrist, lm);
        const pinkyUp = isExtended(20, 18, wrist, lm);

        const isPeace = indexUp && middleUp && !ringUp && !pinkyUp && !isPinching;
        const isOne = indexUp && !middleUp && !ringUp && !pinkyUp && !isPinching;

        if (isPeace) { 
            state.isPinched = false; isOneGestureActive = false; state.hasTriggeredOne = false; 
            if (state.specialPhase === 0) triggerExplosion(); 
        } 
        else if (isPinching) { 
            state.isPinched = true; isOneGestureActive = false; state.hasTriggeredOne = false; 
            if (state.specialPhase !== 0) { state.specialPhase = 0; updateTargetTopology(TARGET_NODES[state.currentIndex]); }
        } 
        else if (isOne) { 
            state.isPinched = false; 
            if (state.specialPhase !== 0) { state.specialPhase = 0; updateTargetTopology(TARGET_NODES[state.currentIndex]); }
            
            if (!isOneGestureActive) {
                isOneGestureActive = true;
                oneGestureStartTime = Date.now(); 
            }
            
            if (isOneGestureActive && !state.hasTriggeredOne && (Date.now() - oneGestureStartTime >= 1500)) {
                state.currentIndex = (state.currentIndex + 1) % TARGET_NODES.length;
                updateTargetTopology(TARGET_NODES[state.currentIndex]); 
                playSFX(audioSwitch, 0.85); 
                state.hasTriggeredOne = true; 
            }
        } 
        else {
            state.isPinched = false; isOneGestureActive = false; state.hasTriggeredOne = false; 
            if (state.specialPhase === 0) updateTargetTopology(TARGET_NODES[state.currentIndex]); 
        }
    } else {
        state.isPinched = false; isOneGestureActive = false; state.hasTriggeredOne = false; 
        if (state.specialPhase === 0) updateTargetTopology(TARGET_NODES[state.currentIndex]); 
    }
});

// [手写核心] 原生 WebRTC 帧泵 (Frame Pump)
async function processVideoFrame() {
    if (!state.isIgnited) return;
    
    // 仅在视频流有新画面时，才将画面喂给 AI
    if (video.readyState >= 2 && video.currentTime !== lastVideoTime) {
        lastVideoTime = video.currentTime;
        try {
            await hands.send({image: video});
        } catch (err) {
            uiText.innerText = "AI 引擎挂起: " + err.message;
            uiText.style.color = "#FF4500";
        }
    }
    // 递归调用，形成永动循环
    requestAnimationFrame(processVideoFrame);
}

// 启动底层相机硬件
async function startNativeCamera() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
            audio: false
        });
        video.srcObject = stream;
        video.play();
        
        // 当视频流开始播放时，启动帧泵
        video.onloadeddata = () => {
            console.log("SYS_KERNEL: 原生相机流已捕获");
            processVideoFrame(); 
        };
    } catch (e) {
        uiText.innerText = "错误：系统已拒绝摄像头权限";
        uiText.style.color = "#FF4500";
    }
}

// ==========================================
// 8. 物理越权提权点火
// ==========================================
document.getElementById('ignition_overlay').addEventListener('click', function() {
    state.isIgnited = true;
    this.style.opacity = '0';
    setTimeout(() => this.style.display = 'none', 600);
    systemStartTime = Date.now();
    
    if (audioBGM) {
        audioBGM.volume = 0.65;
        audioBGM.play().catch(() => {});
    }
    
    if (audioSwitch) { audioSwitch.volume = 0; audioSwitch.play().then(()=>audioSwitch.pause()).catch(()=>{}); }
    if (audioFirework) { audioFirework.volume = 0; audioFirework.play().then(()=>audioFirework.pause()).catch(()=>{}); }
    
    updateTargetTopology(TARGET_NODES[state.currentIndex]);
    uiText.innerText = "MATRIX_CORE: 正在唤醒底层硬件...";

    // 执行原生硬件挂载
    startNativeCamera();
});

window.addEventListener('touchstart', () => { if(state.isIgnited) state.isPinched = true; });
window.addEventListener('touchend', () => { if(state.isIgnited) state.isPinched = false; });

let resizeTimeout;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    }, 150);
});
window.addEventListener('orientationchange', () => window.dispatchEvent(new Event('resize')));

animate();