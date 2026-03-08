/**
 * @file script.js
 * @version 4.1.0 (Final Production Grade)
 * @description 严谨版：三维粒子动力学系统与神经视觉互斥逻辑。
 * 包含：动态采样加密、物理旋转锁、非对称粒子云分层渲染。
 */

'use strict';

// [1] 全量节点池定义 (索引对齐)
const TARGET_NODES = [
    "刘磊", "陈鼎元", "陈子豪", "董奕斐", "顾曼妮", 
    "古苗苗", "郭苏仪", "姬翔", "刘子慕", "李文轩", 
    "李一鸣", "吕润柳", "孙垚博", "徐薇", "燕子楚齐", 
    "郑雅今", "朱付晴晴"
];
const SPECIAL_NODE = "祝大家前程似锦！！";

// [2] 物理极限参数配置
const CONFIG = {
    TOTAL_PARTICLES: 12000,   // 物理稳定上限
    TEXT_PARTICLES: 9000,    // 文本密度权重 (75%)
    BG_PARTICLES: 3000,      // 视觉背景权重 (25%)
    COLLAPSE_SPEED: 0.14,    // 坍缩引力系数
    GRAVITY_STRENGTH: 0.04,  // 待机流体系数
    ROTATION_IDLE: 0.006,    // 基础角速度
    CAMERA_Z: 650,           // 观察位深
    GLOW_SIZE: 12            // 粒子物理尺寸
};

// [3] 全局状态机模型 (互斥锁结构)
const state = {
    currentIndex: 0,
    isPinched: false,      // 捏合态
    isSpecialState: false, // 剪刀手彩蛋态
    lastSwitchTime: 0,     // 节流计数器
    lerpRotation: 0        // 旋转阻尼变量
};

// [4] WebGL 渲染管线初始化
const canvas = document.getElementById('output_canvas');
const uiText = document.getElementById('status_text');
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x000000, 0.0008);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 4000);
camera.position.z = CONFIG.CAMERA_Z;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

// [5] 审美强化：高动态范围发光贴图计算
function createGlowTexture() {
    const pCanvas = document.createElement('canvas');
    pCanvas.width = 128; pCanvas.height = 128;
    const ctx = pCanvas.getContext('2d');
    const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255, 255, 255, 1)');     // 核心炽白
    grad.addColorStop(0.12, 'rgba(255, 225, 80, 0.95)'); // 内核金黄
    grad.addColorStop(0.35, 'rgba(230, 90, 0, 0.2)');    // 边缘暗橙
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(pCanvas);
}

// [6] 内存预分配：非对称 Buffer 矩阵
const geometry = new THREE.BufferGeometry();
const posArray = new Float32Array(CONFIG.TOTAL_PARTICLES * 3);
const baseArray = new Float32Array(CONFIG.TOTAL_PARTICLES * 3);
const targetArray = new Float32Array(CONFIG.TOTAL_PARTICLES * 3);

// 6.1 初始化背景粒子云 (0 -> 2999)
for (let i = 0; i < CONFIG.BG_PARTICLES; i++) {
    const i3 = i * 3;
    baseArray[i3] = (Math.random() - 0.5) * 3500;
    baseArray[i3 + 1] = (Math.random() - 0.5) * 3500;
    baseArray[i3 + 2] = (Math.random() - 0.5) * 2000 - 800;
    
    posArray[i3] = baseArray[i3];
    posArray[i3 + 1] = baseArray[i3 + 1];
    posArray[i3 + 2] = baseArray[i3 + 2];
    
    targetArray[i3] = baseArray[i3];
    targetArray[i3 + 1] = baseArray[i3 + 1];
    targetArray[i3 + 2] = baseArray[i3 + 2];
}

// 6.2 初始化文本粒子球 (3000 -> 11999)
for (let i = CONFIG.BG_PARTICLES; i < CONFIG.TOTAL_PARTICLES; i++) {
    const i3 = i * 3;
    const r = 160 * Math.cbrt(Math.random());
    const theta = Math.random() * 2 * Math.PI;
    const phi = Math.acos(2 * Math.random() - 1);
    
    baseArray[i3] = r * Math.sin(phi) * Math.cos(theta);
    baseArray[i3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    baseArray[i3 + 2] = r * Math.cos(phi);
    
    posArray[i3] = baseArray[i3] + (Math.random() - 0.5) * 600;
    posArray[i3 + 1] = baseArray[i3 + 1] + (Math.random() - 0.5) * 600;
    posArray[i3 + 2] = baseArray[i3 + 2] + (Math.random() - 0.5) * 600;
}

geometry.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
const material = new THREE.PointsMaterial({
    size: CONFIG.GLOW_SIZE,
    map: createGlowTexture(),
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
    opacity: 0.9
});
const particleSystem = new THREE.Points(geometry, material);
scene.add(particleSystem);

// [7] 高锐度中文采样引擎 (双行适应)
function updateTargetTopology(text, isSpecial = false) {
    const tCanvas = document.createElement('canvas');
    const tCtx = tCanvas.getContext('2d');
    tCanvas.width = 1024; tCanvas.height = 1024;
    tCtx.fillStyle = '#000'; tCtx.fillRect(0, 0, 1024, 1024);
    tCtx.fillStyle = '#FFF';
    
    // 彩蛋态使用加密采样步进 (Stride=4)
    const stride = isSpecial ? 4 : 6;
    tCtx.font = isSpecial ? 'bold 135px "Microsoft YaHei", sans-serif' : 'bold 240px "Microsoft YaHei", sans-serif';
    tCtx.textAlign = 'center'; tCtx.textBaseline = 'middle';
    
    if (isSpecial) {
        tCtx.fillText("祝大家", 512, 430);
        tCtx.fillText("前程似锦！！", 512, 590);
    } else {
        tCtx.fillText(text, 512, 512);
    }

    const imgData = tCtx.getImageData(0, 0, 1024, 1024).data;
    const points = [];
    for (let y = 0; y < 1024; y += stride) {
        for (let x = 0; x < 1024; x += stride) {
            if (imgData[(y * 1024 + x) * 4] > 128) {
                points.push({ x: (x - 512) * 1.35, y: -(y - 512) * 1.35 });
            }
        }
    }

    const pCount = points.length;
    let pIdx = 0;
    
    // 强制刷新文本粒子索引区
    for (let i = CONFIG.BG_PARTICLES; i < CONFIG.TOTAL_PARTICLES; i++) {
        const i3 = i * 3;
        if (pIdx < pCount) {
            targetArray[i3] = points[pIdx].x;
            targetArray[i3 + 1] = points[pIdx].y;
            targetArray[i3 + 2] = (Math.random() - 0.5) * 15 + 240; // 锁定前排 Z 轴
            pIdx++;
        } else {
            // 冗余粒子深度折叠
            targetArray[i3] = baseArray[i3] * 0.15;
            targetArray[i3 + 1] = baseArray[i3 + 1] * 0.15;
            targetArray[i3 + 2] = baseArray[i3 + 2] * 0.15 - 80;
        }
    }
    
    // UI状态同步
    uiText.innerText = isSpecial ? "SYS: SPECIAL ACCESS GRANTED" : `NODE: ${state.currentIndex + 1} / 17 | LOCK: ${text}`;
    uiText.style.color = isSpecial ? '#FF4500' : '#FFD700';
}

// [8] 物理渲染循环：动静隔离与旋转相位校正
function animate() {
    requestAnimationFrame(animate);
    const pos = geometry.attributes.position.array;
    const time = Date.now() * 0.001;
    
    // 全量粒子物理积分计算
    for (let i = 0; i < CONFIG.TOTAL_PARTICLES; i++) {
        const i3 = i * 3;
        const isBG = i < CONFIG.BG_PARTICLES;
        const activeState = state.isPinched || state.isSpecialState;
        
        // 运动插值算法
        const speed = activeState ? CONFIG.COLLAPSE_SPEED : CONFIG.GRAVITY_STRENGTH;
        const tx = activeState ? targetArray[i3] : (baseArray[i3] + Math.sin(time + i) * 18);
        const ty = activeState ? targetArray[i3+1] : (baseArray[i3+1] + Math.cos(time + i) * 18);
        const tz = activeState ? targetArray[i3+2] : baseArray[i3+2];

        // 背景粒子忽略坍缩，维持恒定布朗运动
        const currentSpeed = isBG ? CONFIG.GRAVITY_STRENGTH : speed;
        pos[i3] += (tx - pos[i3]) * currentSpeed;
        pos[i3+1] += (ty - pos[i3+1]) * currentSpeed;
        pos[i3+2] += (tz - pos[i3+2]) * currentSpeed;
    }
    
    geometry.attributes.position.needsUpdate = true;

    // 旋转相位锁：坍缩态自动回正至正视角 (0,0)
    if (state.isPinched || state.isSpecialState) {
        particleSystem.rotation.y += (0 - particleSystem.rotation.y) * 0.12;
        particleSystem.rotation.z += (0 - particleSystem.rotation.z) * 0.12;
    } else {
        particleSystem.rotation.y += CONFIG.ROTATION_IDLE;
        particleSystem.rotation.z += CONFIG.ROTATION_IDLE * 0.5;
    }
    
    // 视觉呼吸闪烁动效
    material.opacity = 0.82 + Math.sin(time * 2.5) * 0.12;
    renderer.render(scene, camera);
}

// [9] 交互控制枢纽：三级互斥逻辑
function switchNode() {
    if (state.isSpecialState) return;
    state.currentIndex = (state.currentIndex + 1) % TARGET_NODES.length;
    updateTargetTopology(TARGET_NODES[state.currentIndex]);
}

// [10] 神经视觉追踪接入 (MediaPipe)
const video = document.getElementById('input_video');
const hands = new window.Hands({locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`});
hands.setOptions({ maxNumHands: 1, modelComplexity: 1, minDetectionConfidence: 0.7, minTrackingConfidence: 0.7 });

hands.onResults((res) => {
    if (res.multiHandLandmarks && res.multiHandLandmarks.length > 0) {
        const lm = res.multiHandLandmarks[0];
        const now = Date.now();
        
        // 手势特征值量化
        const isPinching = Math.hypot(lm[4].x - lm[8].x, lm[4].y - lm[8].y) < 0.08;
        const isPeace = (lm[8].y < lm[5].y) && (lm[12].y < lm[9].y) && (lm[16].y > lm[13].y);
        const isOne = (lm[8].y < lm[5].y) && (lm[12].y > lm[9].y) && (lm[16].y > lm[13].y);

        // 优先级 1: 剪刀手 (彩蛋覆盖)
        if (isPeace) {
            state.isPinched = false;
            if (!state.isSpecialState) {
                state.isSpecialState = true;
                updateTargetTopology(SPECIAL_NODE, true);
            }
        } 
        // 优先级 2: 捏合 (物理坍缩)
        else if (isPinching) {
            state.isPinched = true;
            if (state.isSpecialState) {
                state.isSpecialState = false;
                updateTargetTopology(TARGET_NODES[state.currentIndex]);
            }
        } 
        // 优先级 3: 食指一 (节点轮询)
        else {
            state.isPinched = false;
            if (state.isSpecialState) {
                state.isSpecialState = false;
                updateTargetTopology(TARGET_NODES[state.currentIndex]);
            }
            if (isOne && (now - state.lastSwitchTime > 1500)) {
                switchNode();
                state.lastSwitchTime = now;
            }
        }
    } else {
        // 脱离视野：强制回归待机
        state.isPinched = false;
        if (state.isSpecialState) {
            state.isSpecialState = false;
            updateTargetTopology(TARGET_NODES[state.currentIndex]);
        }
    }
});

// [11] 事件映射与启动
const camera_mp = new window.Camera(video, {
    onFrame: async () => { if(video.readyState >= 2) await hands.send({image: video}); },
    width: 640, height: 480
});

window.addEventListener('touchstart', () => state.isPinched = true);
window.addEventListener('touchend', () => state.isPinched = false);
window.addEventListener('mousedown', () => state.isPinched = true);
window.addEventListener('mouseup', () => state.isPinched = false);
window.addEventListener('dblclick', switchNode);
window.addEventListener('contextmenu', e => e.preventDefault());
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// [系统激活点火]
updateTargetTopology(TARGET_NODES[0]);
animate();
camera_mp.start().then(() => uiText.innerText = "SYS: OPTICAL SENSOR CONNECTED");