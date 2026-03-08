'use strict';

// [核心变量与神经节点注册]
const TARGET_NODES = [
    "刘磊", "陈鼎元", "陈子豪", "董奕斐", "顾曼妮", 
    "古苗苗", "郭苏仪", "姬翔", "刘子慕", "李文轩", 
    "李一鸣", "吕润柳", "孙垚博", "徐薇", "燕子楚齐", 
    "郑雅今", "朱付晴晴"
];
const SPECIAL_NODE = "祝大家前程似锦！！";

// [物理极限常数设定：非对称算力倾斜]
const CONFIG = {
    TOTAL_PARTICLES: 12000,
    TEXT_PARTICLES: 8500, 
    BG_PARTICLES: 3500,   
    COLLAPSE_SPEED: 0.16, 
    GRAVITY_STRENGTH: 0.04,
    CAMERA_Z: 600
};

// [底层状态机]
const state = {
    currentIndex: 0,
    isPinched: false,
    lastSwitchTime: 0,
    parallaxX: 0, 
    isSpecialState: false 
};

// [WebGL 渲染管线物理初始化]
const canvas = document.getElementById('output_canvas');
const uiText = document.getElementById('status_text');
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x000000, 0.0007);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 4000);
camera.position.z = CONFIG.CAMERA_Z;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

// [高动态范围发光贴图计算]
function createGlowTexture() {
    const pCanvas = document.createElement('canvas');
    pCanvas.width = 64; pCanvas.height = 64;
    const ctx = pCanvas.getContext('2d');
    const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255, 255, 255, 1)');     
    grad.addColorStop(0.15, 'rgba(255, 220, 0, 0.9)');  
    grad.addColorStop(0.45, 'rgba(200, 100, 0, 0.15)'); 
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(pCanvas);
}

// [非对称粒子拓扑矩阵构建]
const geometry = new THREE.BufferGeometry();
const posArray = new Float32Array(CONFIG.TOTAL_PARTICLES * 3);
const baseArray = new Float32Array(CONFIG.TOTAL_PARTICLES * 3);
const targetArray = new Float32Array(CONFIG.TOTAL_PARTICLES * 3);

// 1. 背景阶级部署
for (let i = 0; i < CONFIG.BG_PARTICLES; i++) {
    const i3 = i * 3;
    baseArray[i3] = (Math.random() - 0.5) * 3500;
    baseArray[i3 + 1] = (Math.random() - 0.5) * 3500;
    baseArray[i3 + 2] = (Math.random() - 0.5) * 2000 - 600; 
    
    posArray[i3] = baseArray[i3];
    posArray[i3 + 1] = baseArray[i3 + 1];
    posArray[i3 + 2] = baseArray[i3 + 2];
    
    targetArray[i3] = baseArray[i3];
    targetArray[i3 + 1] = baseArray[i3 + 1];
    targetArray[i3 + 2] = baseArray[i3 + 2];
}

// 2. 文字阶级部署
for (let i = CONFIG.BG_PARTICLES; i < CONFIG.TOTAL_PARTICLES; i++) {
    const i3 = i * 3;
    const r = 180 * Math.cbrt(Math.random());
    const theta = Math.random() * 2 * Math.PI;
    const phi = Math.acos(2 * Math.random() - 1);
    
    baseArray[i3] = r * Math.sin(phi) * Math.cos(theta);
    baseArray[i3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    baseArray[i3 + 2] = r * Math.cos(phi) + 150; 
    
    posArray[i3] = baseArray[i3] + (Math.random() - 0.5) * 1000;
    posArray[i3 + 1] = baseArray[i3 + 1] + (Math.random() - 0.5) * 1000;
    posArray[i3 + 2] = baseArray[i3 + 2] + (Math.random() - 0.5) * 500;
}

geometry.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
const material = new THREE.PointsMaterial({
    size: 9.5, 
    map: createGlowTexture(),
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
    opacity: 0.95
});
const particleSystem = new THREE.Points(geometry, material);
scene.add(particleSystem);

// [二维光栅化至三维拓扑映射引擎]
function updateTargetTopology(text, isSpecial = false) {
    const tCanvas = document.createElement('canvas');
    const tCtx = tCanvas.getContext('2d');
    tCanvas.width = 1024; tCanvas.height = 1024;
    tCtx.fillStyle = '#000'; tCtx.fillRect(0, 0, 1024, 1024);
    tCtx.fillStyle = '#FFF';
    
    tCtx.font = isSpecial ? 'bold 130px "Microsoft YaHei", sans-serif' : 'bold 230px "Microsoft YaHei", sans-serif';
    tCtx.textAlign = 'center'; 
    tCtx.textBaseline = 'middle';
    
    if (isSpecial) {
        tCtx.fillText("祝大家", 512, 420);
        tCtx.fillText("前程似锦！！", 512, 580);
    } else {
        tCtx.fillText(text, 512, 512);
    }

    const data = tCtx.getImageData(0, 0, 1024, 1024).data;
    const points = [];
    
    for (let y = 0; y < 1024; y += 6) {
        for (let x = 0; x < 1024; x += 6) {
            if (data[(y * 1024 + x) * 4] > 128) {
                points.push({ x: (x - 512) * 1.3, y: -(y - 512) * 1.3 });
            }
        }
    }

    const validPointsCount = points.length;
    let pointIdx = 0;

    for (let i = CONFIG.BG_PARTICLES; i < CONFIG.TOTAL_PARTICLES; i++) {
        const i3 = i * 3;
        if (pointIdx < validPointsCount) {
            targetArray[i3] = points[pointIdx].x + (Math.random() - 0.5) * 3;
            targetArray[i3 + 1] = points[pointIdx].y + (Math.random() - 0.5) * 3;
            targetArray[i3 + 2] = (Math.random() - 0.5) * 15 + 250; 
            pointIdx++;
        } else {
            targetArray[i3] = baseArray[i3] * 0.4;
            targetArray[i3 + 1] = baseArray[i3 + 1] * 0.4;
            targetArray[i3 + 2] = baseArray[i3 + 2] * 0.4;
        }
    }
    
    if (isSpecial) {
        uiText.innerText = `SYS_OVERRIDE | 核心权限接入成功`;
        uiText.style.color = '#FF4500'; 
    } else {
        uiText.innerText = `NODE: ${state.currentIndex + 1} / ${TARGET_NODES.length} | LOCK: ${text}`;
        uiText.style.color = '#FFD700'; 
    }
    setTimeout(() => uiText.style.color = 'rgba(255,255,255,0.45)', 400);
}

function switchMatrixNode() {
    if (state.isSpecialState) return; 
    state.currentIndex = (state.currentIndex + 1) % TARGET_NODES.length;
    updateTargetTopology(TARGET_NODES[state.currentIndex], false);
}

// [核心动画物理循环]
function animate() {
    requestAnimationFrame(animate);
    const pos = geometry.attributes.position.array;
    const time = Date.now() * 0.001;
    
    for (let i = 0; i < CONFIG.BG_PARTICLES; i++) {
        const i3 = i * 3;
        const targetX = baseArray[i3] + Math.sin(time + i) * 35;
        const targetY = baseArray[i3 + 1] + Math.cos(time + i) * 35;
        const targetZ = baseArray[i3 + 2];
        
        pos[i3] += (targetX - pos[i3]) * CONFIG.GRAVITY_STRENGTH;
        pos[i3 + 1] += (targetY - pos[i3 + 1]) * CONFIG.GRAVITY_STRENGTH;
        pos[i3 + 2] += (targetZ - pos[i3 + 2]) * CONFIG.GRAVITY_STRENGTH;
    }
    
    for (let i = CONFIG.BG_PARTICLES; i < CONFIG.TOTAL_PARTICLES; i++) {
        const i3 = i * 3;
        if (state.isPinched || state.isSpecialState) {
            pos[i3] += (targetArray[i3] - pos[i3]) * CONFIG.COLLAPSE_SPEED;
            pos[i3 + 1] += (targetArray[i3 + 1] - pos[i3 + 1]) * CONFIG.COLLAPSE_SPEED;
            pos[i3 + 2] += (targetArray[i3 + 2] - pos[i3 + 2]) * CONFIG.COLLAPSE_SPEED;
        } else {
            const targetX = baseArray[i3] + Math.sin(time + i) * 15;
            const targetY = baseArray[i3 + 1] + Math.cos(time + i) * 15;
            const targetZ = baseArray[i3 + 2];
            
            pos[i3] += (targetX - pos[i3]) * CONFIG.GRAVITY_STRENGTH;
            pos[i3 + 1] += (targetY - pos[i3 + 1]) * CONFIG.GRAVITY_STRENGTH;
            pos[i3 + 2] += (targetZ - pos[i3 + 2]) * CONFIG.GRAVITY_STRENGTH;
        }
    }
    
    geometry.attributes.position.needsUpdate = true;
    
    const baseRotation = time * 0.08;
    const targetRotationY = baseRotation + (state.parallaxX * 1.2); 
    
    particleSystem.rotation.y += (targetRotationY - particleSystem.rotation.y) * 0.05;
    particleSystem.rotation.z += (time * 0.05 - particleSystem.rotation.z) * 0.05;
    
    renderer.render(scene, camera);
}

window.addEventListener('touchstart', () => state.isPinched = true);
window.addEventListener('touchend', () => state.isPinched = false);
window.addEventListener('mousedown', () => state.isPinched = true);
window.addEventListener('mouseup', () => state.isPinched = false);
window.addEventListener('dblclick', switchMatrixNode);
window.addEventListener('contextmenu', e => { e.preventDefault(); switchMatrixNode(); });
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// [神经视觉引擎判定逻辑]
const videoElement = document.getElementById('input_video');
const hands = new window.Hands({locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`});

hands.setOptions({ 
    maxNumHands: 1, 
    modelComplexity: 1, 
    minDetectionConfidence: 0.65, 
    minTrackingConfidence: 0.65 
});

hands.onResults((results) => {
    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        const lm = results.multiHandLandmarks[0];
        
        state.parallaxX = ((lm[9].x - 0.5) * -2);
        
        const pinchDist = Math.hypot(lm[4].x - lm[8].x, lm[4].y - lm[8].y);
        const isPinching = pinchDist < 0.08;
        
        const isPeace = (lm[8].y < lm[5].y) && (lm[12].y < lm[9].y) && (lm[16].y > lm[13].y) && (lm[20].y > lm[17].y);
        const isOne = (lm[8].y < lm[5].y) && (lm[12].y > lm[9].y) && (lm[16].y > lm[13].y);
        const now = Date.now();

        if (isPeace) {
            state.isPinched = false;
            if (!state.isSpecialState) {
                state.isSpecialState = true;
                updateTargetTopology(SPECIAL_NODE, true);
            }
        } else if (isPinching) {
            state.isPinched = true;
            if (state.isSpecialState) {
                state.isSpecialState = false;
                updateTargetTopology(TARGET_NODES[state.currentIndex], false);
            }
        } else {
            state.isPinched = false;
            if (state.isSpecialState) {
                state.isSpecialState = false;
                updateTargetTopology(TARGET_NODES[state.currentIndex], false);
            }
            if (isOne && (now - state.lastSwitchTime > 1500)) {
                switchMatrixNode();
                state.lastSwitchTime = now;
            }
        }
    } else {
        state.isPinched = false;
        state.isSpecialState = false;
        state.parallaxX = 0;
    }
});

const mpCamera = new window.Camera(videoElement, {
    onFrame: async () => {
        if (videoElement.readyState >= 2) {
            try { await hands.send({image: videoElement}); } catch(e) {}
        }
    },
    width: 640, height: 480
});

updateTargetTopology(TARGET_NODES[0], false);
animate();
mpCamera.start().then(() => {
    uiText.innerText = `SYS_ONLINE | 神经视觉追踪已接管`;
}).catch(() => {
    uiText.innerText = `SYS_WARNING | 传感器受阻，已切换至触控模式`;
    uiText.style.color = '#FF4500';
});