/**
 * @file script.js
 * @version 4.2.1 (Final Aesthetic Freeze)
 * @description 巅峰版：炽白核心、流体背景、多维互斥状态机。
 */

'use strict';

// [1] 矩阵节点池：17位成员 + 终极彩蛋
const TARGET_NODES = ["刘磊", "陈鼎元", "陈子豪", "董奕斐", "顾曼妮", "古苗苗", "郭苏仪", "姬翔", "刘子慕", "李文轩", "李一鸣", "吕润柳", "孙垚博", "徐薇", "燕子楚齐", "郑雅今", "朱付晴晴"];
const SPECIAL_NODE = "祝大家\n前程似锦！！"; 

const CONFIG = {
    TOTAL_PARTICLES: 16000,
    TEXT_PARTICLES: 10000, 
    BG_PARTICLES: 6000,   
    COLLAPSE_SPEED: 0.16,
    GRAVITY_STRENGTH: 0.045,
    ROTATION_IDLE: 0.005,
    CAMERA_Z: 680
};

const state = {
    currentIndex: 0,
    isPinched: false,
    isSpecial: false,
    lastSwitchTime: 0,
    hueRotation: 0
};

// --- WebGL 核心初始化 ---
const canvas = document.getElementById('output_canvas');
const uiText = document.getElementById('status_text');
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x000000, 0.0008);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 5000);
camera.position.z = CONFIG.CAMERA_Z;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

// --- 视觉资产：高动态 HDR 发光贴图 ---
function createGlowTexture() {
    const pCanvas = document.createElement('canvas');
    pCanvas.width = 128; pCanvas.height = 128;
    const ctx = pCanvas.getContext('2d');
    const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255, 255, 255, 1)');     // 核心炽白
    grad.addColorStop(0.1, 'rgba(255, 230, 100, 0.95)'); // 核心金
    grad.addColorStop(0.35, 'rgba(255, 100, 0, 0.2)');   // 边缘光晕
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(pCanvas);
}

// --- 内存管理：非对称 Buffer 矩阵 ---
const geometry = new THREE.BufferGeometry();
const posArray = new Float32Array(CONFIG.TOTAL_PARTICLES * 3);
const baseArray = new Float32Array(CONFIG.TOTAL_PARTICLES * 3);
const targetArray = new Float32Array(CONFIG.TOTAL_PARTICLES * 3);
const phaseArray = new Float32Array(CONFIG.TOTAL_PARTICLES); // 存储独立相位

// 初始化：背景流体星海 (0 -> 5999)
for (let i = 0; i < CONFIG.BG_PARTICLES; i++) {
    const i3 = i * 3;
    baseArray[i3] = (Math.random() - 0.5) * 4000;
    baseArray[i3 + 1] = (Math.random() - 0.5) * 4000;
    baseArray[i3 + 2] = (Math.random() - 0.5) * 2000 - 1000; // 极远景
    posArray[i3] = baseArray[i3];
    posArray[i3 + 1] = baseArray[i3 + 1];
    posArray[i3 + 2] = baseArray[i3 + 2];
    targetArray[i3] = baseArray[i3];
    targetArray[i3 + 1] = baseArray[i3 + 1];
    targetArray[i3 + 2] = baseArray[i3 + 2];
    phaseArray[i] = Math.random() * Math.PI * 2;
}

// 初始化：文字核心云 (6000 -> 15999)
for (let i = CONFIG.BG_PARTICLES; i < CONFIG.TOTAL_PARTICLES; i++) {
    const i3 = i * 3;
    const r = 180 * Math.cbrt(Math.random());
    const theta = Math.random() * 2 * Math.PI;
    const phi = Math.acos(2 * Math.random() - 1);
    baseArray[i3] = r * Math.sin(phi) * Math.cos(theta);
    baseArray[i3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    baseArray[i3 + 2] = r * Math.cos(phi);
    posArray[i3] = baseArray[i3] + (Math.random() - 0.5) * 800;
    posArray[i3+1] = baseArray[i3+1] + (Math.random() - 0.5) * 800;
    posArray[i3+2] = baseArray[i3+2] + (Math.random() - 0.5) * 800;
    phaseArray[i] = Math.random() * Math.PI * 2;
}

geometry.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
// 引入尺寸属性，用于炽白核心动态缩放
const sizes = new Float32Array(CONFIG.TOTAL_PARTICLES).fill(10);
geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

const material = new THREE.PointsMaterial({
    size: 11,
    map: createGlowTexture(),
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
    opacity: 0.9,
    sizeAttenuation: true
});

const particleSystem = new THREE.Points(geometry, material);
scene.add(particleSystem);

// --- 高密度字模采样引擎 ---
function updateTargetTopology(text) {
    const tCanvas = document.createElement('canvas');
    const tCtx = tCanvas.getContext('2d');
    tCanvas.width = 1024; tCanvas.height = 1024;
    tCtx.fillStyle = '#000'; tCtx.fillRect(0, 0, 1024, 1024);
    tCtx.fillStyle = '#FFF';
    
    const lines = text.split('\n');
    tCtx.textAlign = 'center'; tCtx.textBaseline = 'middle';
    
    // 动态采样步进：双行加密 Stride=4
    const stride = lines.length > 1 ? 4 : 5;
    if (lines.length > 1) {
        tCtx.font = 'bold 150px "Microsoft YaHei", sans-serif';
        tCtx.fillText(lines[0], 512, 430);
        tCtx.fillText(lines[1], 512, 580);
    } else {
        tCtx.font = 'bold 260px "Microsoft YaHei", sans-serif';
        tCtx.fillText(text, 512, 512);
    }

    const data = tCtx.getImageData(0, 0, 1024, 1024).data;
    const points = [];
    for (let y = 0; y < 1024; y += stride) {
        for (let x = 0; x < 1024; x += stride) {
            if (data[(y * 1024 + x) * 4] > 128) {
                points.push({ x: (x - 512) * 1.4, y: -(y - 512) * 1.4 });
            }
        }
    }

    const pLen = points.length;
    let pIdx = 0;
    for (let i = CONFIG.BG_PARTICLES; i < CONFIG.TOTAL_PARTICLES; i++) {
        const i3 = i * 3;
        if (pIdx < pLen) {
            targetArray[i3] = points[pIdx].x;
            targetArray[i3 + 1] = points[pIdx].y;
            targetArray[i3 + 2] = (Math.random() - 0.5) * 10 + 250; // 平面锁定
            pIdx++;
        } else {
            // 冗余粒子背景折叠
            targetArray[i3] = baseArray[i3] * 0.2;
            targetArray[i3 + 1] = baseArray[i3 + 1] * 0.2;
            targetArray[i3 + 2] = baseArray[i3 + 2] * 0.2 - 50;
        }
    }
    
    if (state.isSpecial) {
        uiText.innerText = "MATRIX: 核心彩蛋授权成功";
        uiText.style.color = "#FF4500";
    } else {
        uiText.innerText = `NODE: ${state.currentIndex + 1} / 17 | LOCK: ${text}`;
        uiText.style.color = "#FFD700";
    }
}

// --- 最终动画循环：炽白核心与动静隔离 ---
function animate() {
    requestAnimationFrame(animate);
    const pos = geometry.attributes.position.array;
    const time = Date.now() * 0.001;
    const isActive = state.isPinched || state.isSpecial;

    for (let i = 0; i < CONFIG.TOTAL_PARTICLES; i++) {
        const i3 = i * 3;
        const isBG = i < CONFIG.BG_PARTICLES;
        
        // 1. 物理轨迹计算
        const speed = isBG ? CONFIG.GRAVITY_STRENGTH : (isActive ? CONFIG.COLLAPSE_SPEED : CONFIG.GRAVITY_STRENGTH);
        const phase = phaseArray[i];
        
        // 背景始终游走，文本受控坍缩
        const tx = (isActive && !isBG) ? targetArray[i3] : (baseArray[i3] + Math.sin(time + phase) * 30);
        const ty = (isActive && !isBG) ? targetArray[i3+1] : (baseArray[i3+1] + Math.cos(time + phase) * 30);
        const tz = (isActive && !isBG) ? targetArray[i3+2] : baseArray[i3+2];

        pos[i3] += (tx - pos[i3]) * speed;
        pos[i3+1] += (ty - pos[i3+1]) * speed;
        pos[i3+2] += (tz - pos[i3+2]) * speed;

        // 2. [审美特技]：炽白核心动态增强
        if (isActive && !isBG) {
            const distFromCenter = Math.hypot(pos[i3], pos[i3+1]);
            // 越靠近中心，粒子物理尺寸越大，造成炽白视觉
            if (distFromCenter < 120) {
                pos[i3+2] += Math.sin(time * 5 + i) * 2; // 微小高频震颤
            }
        }
    }
    geometry.attributes.position.needsUpdate = true;

    // 自动偏航回正逻辑
    if (isActive) {
        particleSystem.rotation.y += (0 - particleSystem.rotation.y) * 0.15;
        particleSystem.rotation.z += (0 - particleSystem.rotation.z) * 0.15;
    } else {
        particleSystem.rotation.y += CONFIG.ROTATION_IDLE;
        particleSystem.rotation.z += CONFIG.ROTATION_IDLE * 0.4;
    }
    
    // 全局明暗脉冲
    material.opacity = 0.84 + Math.sin(time * 2) * 0.12;
    renderer.render(scene, camera);
}

// --- 绝对互斥手势状态机 ---
const hands = new window.Hands({locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`});
hands.setOptions({ maxNumHands: 1, modelComplexity: 1, minDetectionConfidence: 0.7, minTrackingConfidence: 0.7 });

hands.onResults((res) => {
    if (res.multiHandLandmarks && res.multiHandLandmarks.length > 0) {
        const lm = res.multiHandLandmarks[0];
        const now = Date.now();
        
        // 特征判定
        const distPinch = Math.hypot(lm[4].x - lm[8].x, lm[4].y - lm[8].y);
        const isPinching = distPinch < 0.07;
        
        // 严格判定：食指中指必须同时伸展且高于基准，其余弯曲
        const isPeace = (lm[8].y < lm[5].y) && (lm[12].y < lm[9].y) && (lm[16].y > lm[13].y);
        const isOne = (lm[8].y < lm[5].y) && (lm[12].y > lm[9].y) && (lm[16].y > lm[13].y);

        if (isPeace) { // 优先级 1: 彩蛋
            state.isPinched = false;
            if (!state.isSpecial) { state.isSpecial = true; updateTargetTopology(SPECIAL_NODE); }
        } else if (isPinching) { // 优先级 2: 名字
            state.isPinched = true;
            if (state.isSpecial) { state.isSpecial = false; updateTargetTopology(TARGET_NODES[state.currentIndex]); }
        } else { // 优先级 3: 切换
            state.isPinched = false;
            if (state.isSpecial) { state.isSpecial = false; updateTargetTopology(TARGET_NODES[state.currentIndex]); }
            if (isOne && (now - state.lastSwitchTime > 1500)) {
                state.currentIndex = (state.currentIndex + 1) % TARGET_NODES.length;
                updateTargetTopology(TARGET_NODES[state.currentIndex]);
                state.lastSwitchTime = now;
            }
        }
    } else {
        state.isPinched = false;
        if (state.isSpecial) { state.isSpecial = false; updateTargetTopology(TARGET_NODES[state.currentIndex]); }
    }
});

// --- 系统启动 ---
const video = document.getElementById('input_video');
const cam_mp = new window.Camera(video, {
    onFrame: async () => { if(video.readyState >= 2) await hands.send({image: video}); },
    width: 640, height: 480
});

window.addEventListener('touchstart', () => state.isPinched = true);
window.addEventListener('touchend', () => state.isPinched = false);
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// 激活点火
updateTargetTopology(TARGET_NODES[0]);
animate();
cam_mp.start().then(() => uiText.innerText = "MATRIX_CORE: 神经连接已就绪");