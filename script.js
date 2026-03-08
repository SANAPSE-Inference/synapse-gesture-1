/**
 * @file script.js
 * @version 7.2.0 (Final Golden Master)
 * @description 终极封板：静默音频解锁(修复失音)、横屏防抖动居中、零GC字模采样。
 */

'use strict';

const TARGET_NODES = ["刘磊", "陈鼎元", "陈子豪", "董奕斐", "顾曼妮", "古苗苗", "郭苏仪", "姬翔", "刘子慕", "李文轩", "李一鸣", "吕润柳", "孙垚博", "徐薇", "燕子楚齐", "郑雅今", "朱付晴晴"];
const SPECIAL_NODE = "祝大家\n前程似锦！！";

const CONFIG = {
    TOTAL_PARTICLES: 14000,
    TEXT_PARTICLES: 9000, 
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
    specialPhase: 0, // 0: 待机, 1: 爆裂, 2: 收束
    explosionTime: 0,
    lastSwitchTime: 0,
    isIgnited: false
};

// --- [修复] 音频静默解锁引擎 (突破移动端静音惩罚) ---
const bgmAudio = document.getElementById('bgm_audio');
const sfxSwitch = document.getElementById('sfx_switch');
const sfxFirework = document.getElementById('sfx_firework');

// 通用安全播放器包装
function playSFX(audioElement, vol) {
    if (!audioElement) return;
    audioElement.pause(); // 强制打断当前播放
    audioElement.currentTime = 0; // 重置进度
    audioElement.volume = vol;
    audioElement.play().catch(e => console.warn("SFX blocked:", e));
}

document.getElementById('ignition_overlay').addEventListener('click', function() {
    state.isIgnited = true;
    this.style.opacity = '0';
    setTimeout(() => this.style.display = 'none', 800);
    
    // 1. 正常播放 BGM
    bgmAudio.volume = 0.65;
    bgmAudio.play().catch(e => console.warn("BGM Error:", e));
    
    // 2. 黑科技：用 0 音量静默播放，骗取 iOS 系统的长期播放许可
    if (sfxSwitch) {
        sfxSwitch.volume = 0;
        sfxSwitch.play().then(() => { sfxSwitch.pause(); sfxSwitch.currentTime = 0; }).catch(()=>{});
    }
    if (sfxFirework) {
        sfxFirework.volume = 0;
        sfxFirework.play().then(() => { sfxFirework.pause(); sfxFirework.currentTime = 0; }).catch(()=>{});
    }
    
    updateTargetTopology(TARGET_NODES[state.currentIndex]);
    document.getElementById('status_text').innerText = "MATRIX_CORE: 神经连接已就绪 | 听觉链路开启";
});

// --- WebGL 渲染管线 ---
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

// --- 内存预分配 ---
const geometry = new THREE.BufferGeometry();
const posArray = new Float32Array(CONFIG.TOTAL_PARTICLES * 3);
const baseArray = new Float32Array(CONFIG.TOTAL_PARTICLES * 3);
const targetArray = new Float32Array(CONFIG.TOTAL_PARTICLES * 3);
const phaseArray = new Float32Array(CONFIG.TOTAL_PARTICLES); 
const velocityArray = new Float32Array(CONFIG.TOTAL_PARTICLES * 3); 
const colorArray = new Float32Array(CONFIG.TOTAL_PARTICLES * 3);    

const colorBase = new THREE.Color(0xffd700);

for (let i = 0; i < CONFIG.TOTAL_PARTICLES; i++) {
    const i3 = i * 3;
    const isBG = i < CONFIG.BG_PARTICLES;
    
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
    velocityArray[i3] = velocityArray[i3+1] = velocityArray[i3+2] = 0;
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

// --- 离屏 Canvas 单例 (零GC性能优化) ---
const osCanvas = document.createElement('canvas');
osCanvas.width = 1024; osCanvas.height = 1024;
const osCtx = osCanvas.getContext('2d', { willReadFrequently: true }); 

function updateTargetTopology(text) {
    if (!state.isIgnited) return;

    osCtx.fillStyle = '#000'; osCtx.fillRect(0, 0, 1024, 1024);
    osCtx.fillStyle = '#FFF';
    
    const lines = text.split('\n');
    osCtx.textAlign = 'center'; osCtx.textBaseline = 'middle';
    
    if (lines.length > 1) {
        osCtx.font = 'bold 150px "Microsoft YaHei", sans-serif';
        osCtx.fillText(lines[0], 512, 420);
        osCtx.fillText(lines[1], 512, 580);
    } else {
        osCtx.font = 'bold 250px "Microsoft YaHei", sans-serif';
        osCtx.fillText(text, 512, 512);
    }

    const data = osCtx.getImageData(0, 0, 1024, 1024).data;
    
    let pIdx = 0;
    const bgLimit = CONFIG.BG_PARTICLES;
    const total = CONFIG.TOTAL_PARTICLES;

    for (let y = 0; y < 1024; y += 4) {
        for (let x = 0; x < 1024; x += 4) {
            if (data[(y * 1024 + x) * 4] > 128) {
                const targetI = bgLimit + pIdx;
                if (targetI < total) {
                    const i3 = targetI * 3;
                    targetArray[i3] = (x - 512) * 1.35 + (Math.random() - 0.5) * 3;
                    targetArray[i3 + 1] = -(y - 512) * 1.35 + (Math.random() - 0.5) * 3;
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
    }
    
    geometry.attributes.color.needsUpdate = true;
    
    uiText.innerText = state.specialPhase === 2 
        ? "MATRIX_OVERRIDE: 绝对熵减 | 秩序重建" 
        : `NODE: ${state.currentIndex + 1} / 17 | LOCK: ${text}`;
    uiText.style.color = state.specialPhase === 2 ? "#FF4500" : "#FFD700";
}

// --- 爆炸引擎 ---
function triggerExplosion() {
    state.specialPhase = 1;
    state.explosionTime = Date.now();
    
    // 触发烟花音效
    playSFX(sfxFirework, 0.95);

    const colors = [new THREE.Color(0x00FFFF), new THREE.Color(0xFF00FF), new THREE.Color(0x39FF14), new THREE.Color(0xFFD700)];

    for (let i = CONFIG.BG_PARTICLES; i < CONFIG.TOTAL_PARTICLES; i++) {
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

// --- 主渲染循环 ---
function animate() {
    requestAnimationFrame(animate);
    if (!state.isIgnited) { renderer.render(scene, camera); return; }

    const pos = geometry.attributes.position.array;
    const time = Date.now() * 0.001;
    const nowMs = Date.now();
    
    const isOrdered = state.isPinched || state.specialPhase === 2;
    
    const targetSize = isOrdered ? 12.0 : 9.0; 
    const targetOpacity = isOrdered ? 1.0 : 0.85;
    material.size += (targetSize - material.size) * 0.15;
    material.opacity += (targetOpacity - material.opacity) * 0.15;

    if (state.specialPhase === 1 && (nowMs - state.explosionTime > CONFIG.EXPLOSION_DURATION)) {
        state.specialPhase = 2; 
        updateTargetTopology(SPECIAL_NODE);
    }

    const total = CONFIG.TOTAL_PARTICLES;
    const bgLimit = CONFIG.BG_PARTICLES;
    const orderedColSpeed = CONFIG.COLLAPSE_SPEED;
    const gravSpeed = CONFIG.GRAVITY_STRENGTH;

    for (let i = 0; i < total; i++) {
        const i3 = i * 3;
        const isBG = i < bgLimit;

        if (!isBG && state.specialPhase === 1) {
            pos[i3] += velocityArray[i3];
            pos[i3+1] += velocityArray[i3+1];
            pos[i3+2] += velocityArray[i3+2];
            velocityArray[i3] *= 0.96; 
            velocityArray[i3+1] *= 0.96;
            velocityArray[i3+2] *= 0.96;
        } else {
            const speed = isBG ? gravSpeed : (isOrdered ? orderedColSpeed : gravSpeed);
            const angle = time + phaseArray[i];
            const tx = (isOrdered && !isBG) ? targetArray[i3] : (baseArray[i3] + Math.sin(angle) * 45);
            const ty = (isOrdered && !isBG) ? targetArray[i3+1] : (baseArray[i3+1] + Math.cos(angle) * 45);
            const tz = (isOrdered && !isBG) ? targetArray[i3+2] : baseArray[i3+2];

            pos[i3] += (tx - pos[i3]) * speed;
            pos[i3+1] += (ty - pos[i3+1]) * speed;
            pos[i3+2] += (tz - pos[i3+2]) * speed;
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

// --- 手势识别逻辑 ---
const hands = new window.Hands({locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`});
hands.setOptions({ maxNumHands: 1, modelComplexity: 1, minDetectionConfidence: 0.65, minTrackingConfidence: 0.65 });

hands.onResults((res) => {
    if (!state.isIgnited) return;

    if (res.multiHandLandmarks && res.multiHandLandmarks.length > 0) {
        const lm = res.multiHandLandmarks[0];
        const now = Date.now();
        
        const distPinch = Math.hypot(lm[4].x - lm[8].x, lm[4].y - lm[8].y);
        const isPinching = distPinch < 0.08; 
        
        const isPeace = (lm[8].y < lm[5].y) && (lm[12].y < lm[9].y) && (lm[16].y > lm[13].y);
        const isOne = (lm[8].y < lm[5].y) && (lm[12].y > lm[9].y) && (lm[16].y > lm[13].y);

        if (isPeace) { 
            state.isPinched = false;
            if (state.specialPhase === 0) { triggerExplosion(); }
        } else if (isPinching) { 
            state.isPinched = true;
            if (state.specialPhase !== 0) { 
                state.specialPhase = 0; 
                updateTargetTopology(TARGET_NODES[state.currentIndex]); 
            }
        } else { 
            state.isPinched = false;
            if (state.specialPhase !== 0) { 
                state.specialPhase = 0; 
                updateTargetTopology(TARGET_NODES[state.currentIndex]); 
            }
            
            if (isOne && (now - state.lastSwitchTime > 1500)) {
                state.currentIndex = (state.currentIndex + 1) % TARGET_NODES.length;
                updateTargetTopology(TARGET_NODES[state.currentIndex]);
                state.lastSwitchTime = now;
                // 触发清脆节点音效
                playSFX(sfxSwitch, 0.85); 
            }
        }
    } else {
        state.isPinched = false;
        if (state.specialPhase !== 0) { 
            state.specialPhase = 0; 
            updateTargetTopology(TARGET_NODES[state.currentIndex]); 
        }
    }
});

const video = document.getElementById('input_video');
const cam_mp = new window.Camera(video, {
    onFrame: async () => { if(video.readyState >= 2 && state.isIgnited) await hands.send({image: video}); },
    width: 640, height: 480
});

window.addEventListener('touchstart', () => { if(state.isIgnited) state.isPinched = true; });
window.addEventListener('touchend', () => { if(state.isIgnited) state.isPinched = false; });

// --- [修复] 横屏防抖动居中逻辑 ---
let resizeTimeout;
function handleResize() {
    clearTimeout(resizeTimeout);
    // 强制延迟 150ms，等待移动端横屏旋转动画及地址栏收缩彻底完成
    resizeTimeout = setTimeout(() => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    }, 150);
}
// 同时监听 resize 和 orientationchange，双重保险
window.addEventListener('resize', handleResize);
window.addEventListener('orientationchange', handleResize);

animate();
cam_mp.start().then(() => console.log("SYS_KERNEL: 光学与推断引擎就绪"));