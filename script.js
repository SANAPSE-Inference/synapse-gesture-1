/**
 * @file script.js
 * @version 12.1.0 (Zero-Point Alignment)
 * @description 修复 V12.0 融合死锁：修正属性引用、对齐计时量程、优化循环解卷逻辑。
 */

'use strict';

// [1] 全局配置与状态矩阵
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

const EXPLOSION_COLORS = [
    new THREE.Color(0x00FFFF), new THREE.Color(0xFF00FF), 
    new THREE.Color(0x39FF14), new THREE.Color(0xFFD700)
];

// [2] 音频引擎
const audioBGM = document.getElementById('bgm_audio');
const audioSwitch = document.getElementById('sfx_switch');
const audioFirework = document.getElementById('sfx_firework');

function playSFX(audioElement, volume = 1.0) {
    if (!audioElement) return;
    audioElement.volume = volume;
    audioElement.currentTime = 0; 
    const p = audioElement.play();
    if (p !== undefined) p.catch(() => {});
}

// [3] WebGL 渲染管线
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
    if (i < bgLimit) {
        baseArray[i3] = (Math.random() - 0.5) * 4000;
        baseArray[i3+1] = (Math.random() - 0.5) * 4000;
        baseArray[i3+2] = (Math.random() - 0.5) * 800 - 200; 
    } else {
        const r = 140 * Math.cbrt(Math.random());
        const theta = Math.random() * 2 * Math.PI;
        const phi = Math.acos(2 * Math.random() - 1);
        baseArray[i3] = r * Math.sin(phi) * Math.cos(theta);
        baseArray[i3+1] = r * Math.sin(phi) * Math.sin(theta);
        baseArray[i3+2] = r * Math.cos(phi);
    }
    posArray[i3] = baseArray[i3]; posArray[i3+1] = baseArray[i3+1]; posArray[i3+2] = baseArray[i3+2];
    colorArray[i3] = colorBase.r; colorArray[i3+1] = colorBase.g; colorArray[i3+2] = colorBase.b;
    phaseArray[i] = Math.random() * Math.PI * 2;
}

const posAttribute = new THREE.BufferAttribute(posArray, 3);
posAttribute.setUsage(THREE.DynamicDrawUsage);
geometry.setAttribute('position', posAttribute);

const colorAttribute = new THREE.BufferAttribute(colorArray, 3);
colorAttribute.setUsage(THREE.DynamicDrawUsage);
geometry.setAttribute('color', colorAttribute);

const material = new THREE.PointsMaterial({
    size: 9.0, map: createGlowTexture(), blending: THREE.AdditiveBlending,
    depthWrite: false, transparent: true, vertexColors: true, opacity: 0.85 
});
const particleSystem = new THREE.Points(geometry, material);
particleSystem.frustumCulled = false; 
scene.add(particleSystem);

// [4] 拓扑引擎
const osCanvas = document.createElement('canvas');
osCanvas.width = 512; osCanvas.height = 512;
const osCtx = osCanvas.getContext('2d', { willReadFrequently: true }); 

function updateTargetTopology(text) {
    if (!state.isIgnited || state.currentTopology === text) return;
    state.currentTopology = text;
    osCtx.fillStyle = '#000'; osCtx.fillRect(0, 0, 512, 512);
    osCtx.fillStyle = '#FFF';
    const lines = text.split('\n');
    osCtx.textAlign = 'center'; osCtx.textBaseline = 'middle';
    if (lines.length > 1) {
        osCtx.font = 'bold 75px "Microsoft YaHei", sans-serif';
        osCtx.fillText(lines[0], 256, 210); osCtx.fillText(lines[1], 256, 290);
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
                    targetArray[i3+1] = -(y - 256) * 2.7 + (Math.random() - 0.5) * 3;
                    targetArray[i3+2] = (Math.random() - 0.5) * 10 + 280; 
                    pIdx++;
                }
            }
        }
    }
    for (let i = bgLimit + pIdx; i < total; i++) {
        const i3 = i * 3;
        targetArray[i3] = baseArray[i3] * 0.1;
        targetArray[i3+1] = baseArray[i3+1] * 0.1;
        targetArray[i3+2] = baseArray[i3+2] * 0.1 - 100;
    }
    colorAttribute.needsUpdate = true;
    const isSpecial = (state.specialPhase === 2);
    uiText.innerText = isSpecial ? "MATRIX_OVERRIDE: 秩序重建" : `NODE: ${state.currentIndex + 1} / 17 | LOCK: ${text}`;
    uiText.style.color = isSpecial ? "#FF4500" : "#FFD700";
}

function triggerExplosion() {
    state.specialPhase = 1;
    state.explosionTime = performance.now();
    state.currentTopology = "EXPLOSION"; 
    playSFX(audioFirework, 0.95);
    for (let i = bgLimit; i < total; i++) {
        const i3 = i * 3;
        const speed = Math.random() * 60 + 20;
        const theta = Math.random() * 2 * Math.PI;
        const phi = Math.acos(2 * Math.random() - 1);
        velocityArray[i3] = speed * Math.sin(phi) * Math.cos(theta);
        velocityArray[i3+1] = speed * Math.sin(phi) * Math.sin(theta);
        velocityArray[i3+2] = speed * Math.cos(phi) + (Math.random() * 30); 
        const c = EXPLOSION_COLORS[Math.floor(Math.random() * EXPLOSION_COLORS.length)];
        colorArray[i3] = c.r; colorArray[i3+1] = c.g; colorArray[i3+2] = c.b;
    }
    colorAttribute.needsUpdate = true;
}

// [6] 渲染循环 (解卷优化修复版)
function animate() {
    requestAnimationFrame(animate);
    if (!state.isIgnited) { renderer.render(scene, camera); return; }
    const nowMs = performance.now();
    const time = nowMs * 0.001;
    const isOrdered = state.isPinched || state.specialPhase === 2;
    material.size += ((isOrdered ? 12.0 : 9.0) - material.size) * 0.15;
    material.opacity += ((isOrdered ? 1.0 : 0.85) - material.opacity) * 0.15;

    if (state.specialPhase === 1 && (nowMs - state.explosionTime > CONFIG.EXPLOSION_DURATION)) {
        state.specialPhase = 2; updateTargetTopology(SPECIAL_NODE);
    }
    
    // 背景粒子解卷
    for (let i = 0, ix = 0; i < bgLimit; i++, ix += 3) {
        const angle = time + phaseArray[i];
        posArray[ix] += (baseArray[ix] + Math.sin(angle) * 45 - posArray[ix]) * CONFIG.GRAVITY_STRENGTH;
        posArray[ix+1] += (baseArray[ix+1] + Math.cos(angle) * 45 - posArray[ix+1]) * CONFIG.GRAVITY_STRENGTH;
        posArray[ix+2] += (baseArray[ix+2] - posArray[ix+2]) * CONFIG.GRAVITY_STRENGTH;
    }

    // 前景粒子分支剥离
    if (state.specialPhase === 1) {
        for (let i = bgLimit, ix = bgLimit * 3; i < total; i++, ix += 3) {
            posArray[ix] += velocityArray[ix]; posArray[ix+1] += velocityArray[ix+1]; posArray[ix+2] += velocityArray[ix+2];
            velocityArray[ix] *= 0.96; velocityArray[ix+1] *= 0.96; velocityArray[ix+2] *= 0.96;
        }
    } else {
        const speed = isOrdered ? CONFIG.COLLAPSE_SPEED : CONFIG.GRAVITY_STRENGTH;
        for (let i = bgLimit, ix = bgLimit * 3; i < total; i++, ix += 3) {
            const angle = time + phaseArray[i];
            const tx = isOrdered ? targetArray[ix] : (baseArray[ix] + Math.sin(angle) * 45);
            const ty = isOrdered ? targetArray[ix+1] : (baseArray[ix+1] + Math.cos(angle) * 45);
            const tz = isOrdered ? targetArray[ix+2] : baseArray[ix+2];
            posArray[ix] += (tx - posArray[ix]) * speed; 
            posArray[ix+1] += (ty - posArray[ix+1]) * speed; 
            posArray[ix+2] += (tz - posArray[ix+2]) * speed;
        }
    }
    posAttribute.needsUpdate = true;
    particleSystem.rotation.y += isOrdered ? (0 - particleSystem.rotation.y) * 0.15 : CONFIG.ROTATION_IDLE;
    renderer.render(scene, camera);
}

// [7] 本地推断引擎
const video = document.getElementById('input_video');
const hands = new window.Hands({locateFile: (file) => `./${file}`}); 
hands.setOptions({ maxNumHands: 1, modelComplexity: 1, minDetectionConfidence: 0.65, minTrackingConfidence: 0.65 });

const cam_mp = new window.Camera(video, {
    onFrame: async () => { if(video.readyState >= 2 && state.isIgnited) await hands.send({image: video}); },
    width: 640, height: 480
});

function getDist(p1, p2) { return Math.hypot(p1.x - p2.x, p1.y - p2.y); }

hands.onResults((res) => {
    if (!state.isIgnited) return;
    let matched = false;
    if (res.multiHandLandmarks && res.multiHandLandmarks.length > 0) {
        const lm = res.multiHandLandmarks[0]; const wrist = lm[0]; 
        const isPinching = getDist(lm[4], lm[8]) < 0.08; 
        const indexUp = (getDist(lm[8], wrist) > getDist(lm[6], wrist) * 1.15);
        const middleUp = (getDist(lm[12], wrist) > getDist(lm[10], wrist) * 1.15);
        const ringUp = (getDist(lm[16], wrist) > getDist(lm[14], wrist) * 1.15);
        const isPeace = indexUp && middleUp && !ringUp && !isPinching;
        const isOne = indexUp && !middleUp && !ringUp && !isPinching;

        if (isPeace) { 
            state.isPinched = false; isOneGestureActive = false; state.hasTriggeredOne = false; 
            if (state.specialPhase === 0) triggerExplosion(); 
            matched = true;
        } else if (isPinching) { 
            state.isPinched = true; isOneGestureActive = false; state.hasTriggeredOne = false; 
            if (state.specialPhase !== 0) { state.specialPhase = 0; updateTargetTopology(TARGET_NODES[state.currentIndex]); }
            matched = true;
        } else if (isOne) { 
            state.isPinched = false; 
            if (state.specialPhase !== 0) { state.specialPhase = 0; updateTargetTopology(TARGET_NODES[state.currentIndex]); }
            if (!isOneGestureActive) { isOneGestureActive = true; oneGestureStartTime = performance.now(); }
            if (isOneGestureActive && !state.hasTriggeredOne && (performance.now() - oneGestureStartTime >= 1500)) {
                state.currentIndex = (state.currentIndex + 1) % TARGET_NODES.length;
                updateTargetTopology(TARGET_NODES[state.currentIndex]); 
                playSFX(audioSwitch, 0.85); state.hasTriggeredOne = true; 
            }
            matched = true;
        }
    } 
    if (!matched) {
        state.isPinched = false; isOneGestureActive = false; state.hasTriggeredOne = false; 
        if (state.specialPhase === 0) updateTargetTopology(TARGET_NODES[state.currentIndex]); 
    }
});

// [8] 点火锁定
document.getElementById('ignition_overlay').addEventListener('click', function() {
    state.isIgnited = true; this.style.opacity = '0';
    setTimeout(() => this.style.display = 'none', 600);
    if (audioBGM) { audioBGM.volume = 0.65; audioBGM.play().catch(() => {}); }
    if (audioSwitch) { audioSwitch.volume = 0; audioSwitch.play().then(()=>audioSwitch.pause()).catch(()=>{}); }
    if (audioFirework) { audioFirework.volume = 0; audioFirework.play().then(()=>audioFirework.pause()).catch(()=>{}); }
    updateTargetTopology(TARGET_NODES[state.currentIndex]);
    cam_mp.start().catch((e) => { document.getElementById('status_text').innerText = "SYS_ERR: 传感器物理受阻"; });
});
window.addEventListener('touchstart', () => { if(state.isIgnited) state.isPinched = true; });
window.addEventListener('touchend', () => { if(state.isIgnited) state.isPinched = false; });
animate();