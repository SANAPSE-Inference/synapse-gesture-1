/**
 * @file script.js
 * @version 9.1.0 (Stable Master)
 * @description 满血复活版：移除崩溃指令、修复烟花打断、比“一”手势引力重构。
 */

'use strict';

// ==========================================
// 1. 全局常量与精简状态机
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
    EXPLOSION_DURATION: 3000 // 烟花绚丽停留 3 秒
};

const state = {
    currentIndex: 0,
    isPinched: false,
    isOneGesture: false, // [修复] 专门记录是否处于“一”的展示状态
    specialPhase: 0, // 0: 待机, 1: 爆裂, 2: 收束
    explosionTime: 0,
    isIgnited: false,
    hasTriggeredOne: false, 
    currentTopology: null   
};

// ==========================================
// 2. 音频并发池 (安全缓存刺客)
// ==========================================
class AudioRingBuffer {
    constructor(elementId, poolSize = 3) {
        this.pool = [];
        this.index = 0;
        const template = document.getElementById(elementId);
        if (template) {
            const sourceElement = template.querySelector('source');
            if (!sourceElement) return;
            let src = sourceElement.src;
            const cacheBuster = `?v=stable_final`;
            src = src.includes('?') ? src.replace(/\?.*$/, cacheBuster) : src + cacheBuster;
            
            for (let i = 0; i < poolSize; i++) {
                const audio = new Audio(src);
                audio.preload = 'auto';
                this.pool.push(audio);
            }
        }
    }

    unlockAll() {
        this.pool.forEach(audio => {
            audio.volume = 0;
            audio.play().then(() => { audio.pause(); audio.currentTime = 0; }).catch(() => {});
        });
    }

    play(volume = 1.0) {
        if (!this.pool.length) return;
        const audio = this.pool[this.index];
        audio.pause();
        audio.currentTime = 0;
        audio.volume = volume;
        audio.play().catch(() => {});
        this.index = (this.index + 1) % this.pool.length;
    }
}

const bgmAudio = document.getElementById('bgm_audio');
const sfxSwitchPool = new AudioRingBuffer('sfx_switch', 4);     
const sfxFireworkPool = new AudioRingBuffer('sfx_firework', 2); 

// 物理点火解锁
document.getElementById('ignition_overlay').addEventListener('click', function() {
    state.isIgnited = true;
    this.style.opacity = '0';
    setTimeout(() => this.style.display = 'none', 800);
    
    bgmAudio.volume = 0.65;
    bgmAudio.play().catch(e => console.warn("BGM Blocked:", e));
    
    sfxSwitchPool.unlockAll();
    sfxFireworkPool.unlockAll();
    
    updateTargetTopology(TARGET_NODES[state.currentIndex]);
    document.getElementById('status_text').innerText = "MATRIX_CORE: 神经连接已就绪 | 听觉链路开启";
});

// ==========================================
// 3. WebGL 核心初始化与内存分配
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

// 粒子矩阵初始化
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
// 4. [稳健版] 拓扑坐标内存缓存池
// ==========================================
const osCanvas = document.createElement('canvas');
osCanvas.width = 512; osCanvas.height = 512;
// [彻底拆除] 删除了导致部分设备抛出 Fatal Error 的 willReadFrequently 指令
const osCtx = osCanvas.getContext('2d'); 
const topologyCache = new Map(); 

function getPointsForText(text) {
    if (topologyCache.has(text)) return topologyCache.get(text);

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
    const points = [];
    
    for (let y = 0; y < 512; y += 2) {
        for (let x = 0; x < 512; x += 2) {
            if (data[(y * 512 + x) * 4] > 128) {
                points.push({ x: (x - 256) * 2.7, y: -(y - 256) * 2.7 });
            }
        }
    }
    
    topologyCache.set(text, points); 
    return points;
}

function updateTargetTopology(text) {
    if (!state.isIgnited || state.currentTopology === text) return; 
    state.currentTopology = text;

    const points = getPointsForText(text); 
    let pIdx = 0;
    const pLen = points.length;

    for (let i = bgLimit; i < total; i++) {
        const i3 = i * 3;
        if (pIdx < pLen) {
            const pt = points[pIdx];
            targetArray[i3] = pt.x + (Math.random() - 0.5) * 3;
            targetArray[i3 + 1] = pt.y + (Math.random() - 0.5) * 3;
            targetArray[i3 + 2] = (Math.random() - 0.5) * 10 + 280; 
            colorArray[i3] = colorBase.r; colorArray[i3+1] = colorBase.g; colorArray[i3+2] = colorBase.b;
            pIdx++;
        } else {
            targetArray[i3] = baseArray[i3] * 0.1;
            targetArray[i3 + 1] = baseArray[i3 + 1] * 0.1;
            targetArray[i3 + 2] = baseArray[i3 + 2] * 0.1 - 100;
            colorArray[i3] = colorBase.r; colorArray[i3+1] = colorBase.g; colorArray[i3+2] = colorBase.b;
        }
    }
    
    geometry.attributes.color.needsUpdate = true;
    
    const isSpecial = (state.specialPhase === 2);
    uiText.innerText = isSpecial ? "MATRIX_OVERRIDE: 绝对熵减 | 秩序重建" : `NODE: ${state.currentIndex + 1} / 17 | LOCK: ${text}`;
    uiText.style.color = isSpecial ? "#FF4500" : "#FFD700";
}

// ==========================================
// 5. 熵增爆裂引擎
// ==========================================
function triggerExplosion() {
    state.specialPhase = 1;
    state.explosionTime = Date.now();
    state.currentTopology = "EXPLOSION"; 
    sfxFireworkPool.play(0.95);

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
// 6. 主渲染循环 (平滑处理防崩溃)
// ==========================================
function animate() {
    requestAnimationFrame(animate);
    if (!state.isIgnited) { renderer.render(scene, camera); return; }

    const time = Date.now() * 0.001;
    
    // [修复] 赋予“一”手势引力控制权。现在比出“一”，粒子立刻完美成型，让你从容展示
    const isOrdered = state.isPinched || state.isOneGesture || state.specialPhase === 2;
    
    material.size += ((isOrdered ? 12.0 : 9.0) - material.size) * 0.15;
    material.opacity += ((isOrdered ? 1.0 : 0.85) - material.opacity) * 0.15;

    // 烟花自然相变
    if (state.specialPhase === 1 && (Date.now() - state.explosionTime > CONFIG.EXPLOSION_DURATION)) {
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
// 7. 神经视觉推断引擎 (修复判定打断Bug)
// ==========================================
const hands = new window.Hands({locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`});
hands.setOptions({ maxNumHands: 1, modelComplexity: 1, minDetectionConfidence: 0.65, minTrackingConfidence: 0.65 });

hands.onResults((res) => {
    if (!state.isIgnited) return;

    if (res.multiHandLandmarks && res.multiHandLandmarks.length > 0) {
        const lm = res.multiHandLandmarks[0];
        const dx = lm[4].x - lm[8].x, dy = lm[4].y - lm[8].y;
        
        const isPinching = (dx*dx + dy*dy) < 0.0064; 
        const isPeace = (lm[8].y < lm[5].y) && (lm[12].y < lm[9].y) && (lm[16].y > lm[13].y);
        const isOne = (lm[8].y < lm[5].y) && (lm[12].y > lm[9].y) && (lm[16].y > lm[13].y);

        if (isPeace) { 
            state.isPinched = false; state.isOneGesture = false;
            state.hasTriggeredOne = false; 
            if (state.specialPhase === 0) triggerExplosion(); 
        } 
        else if (isPinching) { 
            state.isPinched = true; state.isOneGesture = false;
            state.hasTriggeredOne = false; 
            if (state.specialPhase !== 0) {
                state.specialPhase = 0; 
                updateTargetTopology(TARGET_NODES[state.currentIndex]);
            }
        } 
        else if (isOne) { 
            state.isPinched = false; state.isOneGesture = true; // 开启展示态
            if (state.specialPhase !== 0) state.specialPhase = 0; 
            
            if (!state.hasTriggeredOne) {
                state.currentIndex = (state.currentIndex + 1) % TARGET_NODES.length;
                sfxSwitchPool.play(0.85); 
                state.hasTriggeredOne = true; 
            }
            updateTargetTopology(TARGET_NODES[state.currentIndex]);
        } 
        else {
            // 张开手掌或其它杂乱手势
            state.isPinched = false; state.isOneGesture = false;
            state.hasTriggeredOne = false; 
            // [极其关键的修复]：绝对不再随意中断烟花 (specialPhase = 0)，保证 3 秒完整播放
            if (state.specialPhase === 0) {
                updateTargetTopology(TARGET_NODES[state.currentIndex]); 
            }
        }
    } else {
        // 无手势输入
        state.isPinched = false; state.isOneGesture = false;
        state.hasTriggeredOne = false; 
        if (state.specialPhase === 0) {
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
cam_mp.start().then(() => console.log("SYS_KERNEL: 修复版引擎已成功挂载，死锁解除"));