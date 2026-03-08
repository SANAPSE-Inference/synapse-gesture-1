/**
 * @file script.js
 * @version 8.1.0 (Flawless Master)
 * @description 严苛审计版：修复单帧双重重绘、色彩泄漏、小拇指判定盲区、静态缓存刺客。
 */

'use strict';

// ==========================================
// 1. 全局配置与状态机
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
    hasTriggeredOne: false 
};

// ==========================================
// 2. 音频并发池与温和缓存刺客
// ==========================================
class AudioRingBuffer {
    constructor(elementId, poolSize = 3) {
        this.pool = [];
        this.index = 0;
        const template = document.getElementById(elementId);
        if (template) {
            let src = template.querySelector('source').src;
            // [修复] 使用固定版本号击穿陈旧缓存，同时保留合理的后续网络缓存能力
            const cacheBuster = `?v=final_1.0`;
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
// 3. WebGL 管线与高能星核初始化
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
// 4. 降维拓扑采样引擎 (512x512)
// ==========================================
const osCanvas = document.createElement('canvas');
osCanvas.width = 512; osCanvas.height = 512;
const osCtx = osCanvas.getContext('2d', { willReadFrequently: true }); 

function updateTargetTopology(text) {
    if (!state.isIgnited) return;

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
    const bgLimit = CONFIG.BG_PARTICLES;

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

    // [修复] 强制清除背景冗余粒子的残留色彩，根绝色彩泄漏污染
    for (let i = bgLimit + pIdx; i < total; i++) {
        const i3 = i * 3;
        targetArray[i3] = baseArray[i3] * 0.1;
        targetArray[i3 + 1] = baseArray[i3 + 1] * 0.1;
        targetArray[i3 + 2] = baseArray[i3 + 2] * 0.1 - 100;
        
        // 核心修复行：让退到背景的粒子恢复金黄纯色
        colorArray[i3] = colorBase.r; colorArray[i3+1] = colorBase.g; colorArray[i3+2] = colorBase.b;
    }
    
    geometry.attributes.color.needsUpdate = true;
    
    uiText.innerText = state.specialPhase === 2 
        ? "MATRIX_OVERRIDE: 绝对熵减 | 秩序重建" 
        : `NODE: ${state.currentIndex + 1} / 17 | LOCK: ${text}`;
    uiText.style.color = state.specialPhase === 2 ? "#FF4500" : "#FFD700";
}

// ==========================================
// 5. 熵增爆裂引擎
// ==========================================
function triggerExplosion() {
    state.specialPhase = 1;
    state.explosionTime = Date.now();
    sfxFireworkPool.play(0.95);

    const colors = [new THREE.Color(0x00FFFF), new THREE.Color(0xFF00FF), new THREE.Color(0x39FF14), new THREE.Color(0xFFD700)];

    for (let i = CONFIG.BG_PARTICLES; i < total; i++) {
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

    const bgLimit = CONFIG.BG_PARTICLES;
    const orderedSpeed = CONFIG.COLLAPSE_SPEED;
    const gravSpeed = CONFIG.GRAVITY_STRENGTH;
    const pos = posArray, target = targetArray, base = baseArray, phase = phaseArray, vel = velocityArray;

    for (let i = 0; i < total; i++) {
        const i3 = i * 3, ix = i3, iy = i3 + 1, iz = i3 + 2; 
        const isBG = i < bgLimit;

        if (!isBG && state.specialPhase === 1) {
            pos[ix] += vel[ix]; pos[iy] += vel[iy]; pos[iz] += vel[iz];
            vel[ix] *= 0.96; vel[iy] *= 0.96; vel[iz] *= 0.96;
        } else {
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
// 7. 神经推断引擎与防卡顿互斥逻辑
// ==========================================
const hands = new window.Hands({locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`});
hands.setOptions({ maxNumHands: 1, modelComplexity: 1, minDetectionConfidence: 0.65, minTrackingConfidence: 0.65 });

hands.onResults((res) => {
    if (!state.isIgnited) return;

    if (res.multiHandLandmarks && res.multiHandLandmarks.length > 0) {
        const lm = res.multiHandLandmarks[0];
        
        const dx = lm[4].x - lm[8].x, dy = lm[4].y - lm[8].y;
        const isPinching = (dx*dx + dy*dy) < 0.0064; 
        
        // [修复] 补齐小拇指(lm[20])的检测闭环，彻底根绝“蜘蛛侠手势”导致的串台误触
        const isPeace = (lm[8].y < lm[5].y) && (lm[12].y < lm[9].y) && (lm[16].y > lm[13].y) && (lm[20].y > lm[17].y);
        const isOne = (lm[8].y < lm[5].y) && (lm[12].y > lm[9].y) && (lm[16].y > lm[13].y) && (lm[20].y > lm[17].y);

        let needsTopologyUpdate = false; // [修复] 单帧绘制聚合锁，杜绝双重重绘引发的卡顿

        if (isPeace) { 
            state.isPinched = false;
            state.hasTriggeredOne = false; 
            if (state.specialPhase === 0) triggerExplosion(); 
        } else if (isPinching) { 
            state.isPinched = true;
            state.hasTriggeredOne = false; 
            if (state.specialPhase !== 0) { 
                state.specialPhase = 0; 
                needsTopologyUpdate = true;
            }
        } else if (isOne) { 
            state.isPinched = false;
            if (state.specialPhase !== 0) { 
                state.specialPhase = 0; 
                needsTopologyUpdate = true;
            }
            if (!state.hasTriggeredOne) {
                state.currentIndex = (state.currentIndex + 1) % TARGET_NODES.length;
                sfxSwitchPool.play(0.85); 
                state.hasTriggeredOne = true; 
                needsTopologyUpdate = true;
            }
        } else {
            state.isPinched = false;
            state.hasTriggeredOne = false; 
            if (state.specialPhase !== 0) { 
                state.specialPhase = 0; 
                needsTopologyUpdate = true;
            }
        }

        // 统一合并重绘指令
        if (needsTopologyUpdate) {
            updateTargetTopology(TARGET_NODES[state.currentIndex]); 
        }

    } else {
        state.isPinched = false;
        state.hasTriggeredOne = false; 
        if (state.specialPhase !== 0) { 
            state.specialPhase = 0; 
            updateTargetTopology(TARGET_NODES[state.currentIndex]); 
        }
    }
});

let isProcessingFrame = false;
const video = document.getElementById('input_video');
const cam_mp = new window.Camera(video, {
    onFrame: async () => { 
        if(video.readyState >= 2 && state.isIgnited && !isProcessingFrame) { 
            isProcessingFrame = true;
            await hands.send({image: video}); 
            isProcessingFrame = false;
        }
    },
    width: 640, height: 480
});

window.addEventListener('touchstart', () => { if(state.isIgnited) state.isPinched = true; });
window.addEventListener('touchend', () => { if(state.isIgnited) state.isPinched = false; });

let resizeTimeout;
function handleResize() {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    }, 150);
}
window.addEventListener('resize', handleResize);
window.addEventListener('orientationchange', handleResize);

animate();
cam_mp.start().then(() => console.log("SYS_KERNEL: 极致安全校验版部署完毕"));