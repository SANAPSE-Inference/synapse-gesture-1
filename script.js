/**
 * @file script.js
 * @version 6.0.0 (Entropy Override - Final Production)
 * @description 首席架构师级：高密度流体、动态材质增益、音频物理锁与【爆裂-收束】状态机。
 */

'use strict';

// [1] 矩阵节点池
const TARGET_NODES = ["刘磊", "陈鼎元", "陈子豪", "董奕斐", "顾曼妮", "古苗苗", "郭苏仪", "姬翔", "刘子慕", "李文轩", "李一鸣", "吕润柳", "孙垚博", "徐薇", "燕子楚齐", "郑雅今", "朱付晴晴"];
const SPECIAL_NODE = "祝大家\n前程似锦！！";

// [2] 物理常数与算力锁定 (14,000 为移动端 60FPS 绝对安全线)
const CONFIG = {
    TOTAL_PARTICLES: 14000,
    TEXT_PARTICLES: 9000, 
    BG_PARTICLES: 5000,   
    COLLAPSE_SPEED: 0.12,    // 收束引力
    GRAVITY_STRENGTH: 0.045, // 游走引力
    ROTATION_IDLE: 0.005,
    CAMERA_Z: 650
};

// [3] 多维互斥状态机
const state = {
    currentIndex: 0,
    isPinched: false,
    specialPhase: 0, // 0: 待机, 1: 绝对熵增(爆裂), 2: 绝对熵减(收束)
    explosionTime: 0,
    lastSwitchTime: 0,
    isIgnited: false
};

// [4] 音频硬件接口 (全本地零延迟)
const bgmAudio = document.getElementById('bgm_audio');
const sfxSwitch = document.getElementById('sfx_switch');
const sfxFirework = document.getElementById('sfx_firework');

// 物理点火锁：强行解禁移动端 Audio Context
document.getElementById('ignition_overlay').addEventListener('click', function() {
    state.isIgnited = true;
    
    // 视觉层退场
    this.style.opacity = '0';
    setTimeout(() => this.style.display = 'none', 800);
    
    // 强制接管音频线程
    bgmAudio.volume = 0.65;
    bgmAudio.play().catch(e => console.warn("SYS: BGM调用被系统级拦截", e));
    
    // 初始化文本拓扑
    updateTargetTopology(TARGET_NODES[state.currentIndex]);
    document.getElementById('status_text').innerText = "MATRIX_CORE: 神经连接已就绪 | 听觉链路开启";
});

// [5] WebGL 渲染管线初始化
const canvas = document.getElementById('output_canvas');
const uiText = document.getElementById('status_text');
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x000000, 0.0008);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 4000);
camera.position.z = CONFIG.CAMERA_Z;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

// 材质贴图：极致平滑的高斯光晕，剥离实心白点
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

// [6] 内存预分配：动能与色彩矩阵
const geometry = new THREE.BufferGeometry();
const posArray = new Float32Array(CONFIG.TOTAL_PARTICLES * 3);
const baseArray = new Float32Array(CONFIG.TOTAL_PARTICLES * 3);
const targetArray = new Float32Array(CONFIG.TOTAL_PARTICLES * 3);
const phaseArray = new Float32Array(CONFIG.TOTAL_PARTICLES); 
const velocityArray = new Float32Array(CONFIG.TOTAL_PARTICLES * 3); // 爆炸动能数组
const colorArray = new Float32Array(CONFIG.TOTAL_PARTICLES * 3);    // 独立色彩缓冲

const colorBase = new THREE.Color(0xffd700); // 默认金黄

for (let i = 0; i < CONFIG.TOTAL_PARTICLES; i++) {
    const i3 = i * 3;
    const isBG = i < CONFIG.BG_PARTICLES;
    
    // 背景粒子 Z 轴前推，显著提升流体暗流可见度
    if (isBG) {
        baseArray[i3] = (Math.random() - 0.5) * 4000;
        baseArray[i3 + 1] = (Math.random() - 0.5) * 4000;
        baseArray[i3 + 2] = (Math.random() - 0.5) * 800 - 200; 
    } else {
        const r = 220 * Math.cbrt(Math.random());
        const theta = Math.random() * 2 * Math.PI;
        const phi = Math.acos(2 * Math.random() - 1);
        baseArray[i3] = r * Math.sin(phi) * Math.cos(theta);
        baseArray[i3 + 1] = r * Math.sin(phi) * Math.sin(theta);
        baseArray[i3 + 2] = r * Math.cos(phi);
    }
    
    posArray[i3] = baseArray[i3];
    posArray[i3 + 1] = baseArray[i3 + 1];
    posArray[i3 + 2] = baseArray[i3 + 2];
    
    colorArray[i3] = colorBase.r;
    colorArray[i3+1] = colorBase.g;
    colorArray[i3+2] = colorBase.b;
    
    phaseArray[i] = Math.random() * Math.PI * 2;
    velocityArray[i3] = velocityArray[i3+1] = velocityArray[i3+2] = 0;
}

geometry.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
geometry.setAttribute('color', new THREE.BufferAttribute(colorArray, 3));

const material = new THREE.PointsMaterial({
    size: 6.5, // 基础暗淡尺寸
    map: createGlowTexture(),
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
    vertexColors: true, // 开启独立色彩渲染
    opacity: 0.6
});
const particleSystem = new THREE.Points(geometry, material);
scene.add(particleSystem);

// [7] 高密度字模采样 (Stride = 4 榨干分辨率)
function updateTargetTopology(text) {
    if (!state.isIgnited) return;

    const tCanvas = document.createElement('canvas');
    const tCtx = tCanvas.getContext('2d');
    tCanvas.width = 1024; tCanvas.height = 1024;
    tCtx.fillStyle = '#000'; tCtx.fillRect(0, 0, 1024, 1024);
    tCtx.fillStyle = '#FFF';
    
    const lines = text.split('\n');
    tCtx.textAlign = 'center'; tCtx.textBaseline = 'middle';
    
    if (lines.length > 1) {
        tCtx.font = 'bold 150px "Microsoft YaHei", sans-serif';
        tCtx.fillText(lines[0], 512, 420);
        tCtx.fillText(lines[1], 512, 580);
    } else {
        tCtx.font = 'bold 250px "Microsoft YaHei", sans-serif';
        tCtx.fillText(text, 512, 512);
    }

    const data = tCtx.getImageData(0, 0, 1024, 1024).data;
    const points = [];
    for (let y = 0; y < 1024; y += 4) {
        for (let x = 0; x < 1024; x += 4) {
            if (data[(y * 1024 + x) * 4] > 128) {
                points.push({ x: (x - 512) * 1.35, y: -(y - 512) * 1.35 });
            }
        }
    }

    const pLen = points.length;
    let pIdx = 0;
    for (let i = CONFIG.BG_PARTICLES; i < CONFIG.TOTAL_PARTICLES; i++) {
        const i3 = i * 3;
        if (pIdx < pLen) {
            targetArray[i3] = points[pIdx].x + (Math.random() - 0.5) * 3;
            targetArray[i3 + 1] = points[pIdx].y + (Math.random() - 0.5) * 3;
            targetArray[i3 + 2] = (Math.random() - 0.5) * 10 + 280; // Z轴强化
            
            // 恢复统一高亮金黄
            colorArray[i3] = colorBase.r; colorArray[i3+1] = colorBase.g; colorArray[i3+2] = colorBase.b;
            pIdx++;
        } else {
            targetArray[i3] = baseArray[i3] * 0.1;
            targetArray[i3 + 1] = baseArray[i3 + 1] * 0.1;
            targetArray[i3 + 2] = baseArray[i3 + 2] * 0.1 - 100;
        }
    }
    geometry.attributes.color.needsUpdate = true;
    
    if (state.specialPhase === 2) {
        uiText.innerText = "MATRIX_OVERRIDE: 绝对熵减 | 秩序重建";
        uiText.style.color = "#FF4500";
    } else {
        uiText.innerText = `NODE: ${state.currentIndex + 1} / 17 | LOCK: ${text}`;
        uiText.style.color = "#FFD700";
    }
}

// [8] 爆炸引擎：触发绝对熵增
function triggerExplosion() {
    state.specialPhase = 1;
    state.explosionTime = Date.now();
    
    // SFX 点火
    sfxFirework.volume = 0.9;
    sfxFirework.currentTime = 0;
    sfxFirework.play().catch(()=>{});

    // 随机赛博色彩池
    const colors = [new THREE.Color(0x00FFFF), new THREE.Color(0xFF00FF), new THREE.Color(0x39FF14), new THREE.Color(0xFFD700)];

    for (let i = CONFIG.BG_PARTICLES; i < CONFIG.TOTAL_PARTICLES; i++) {
        const i3 = i * 3;
        // 赋予爆炸初速度 (球坐标扩散)
        const speed = Math.random() * 45 + 10;
        const theta = Math.random() * 2 * Math.PI;
        const phi = Math.acos(2 * Math.random() - 1);
        
        velocityArray[i3] = speed * Math.sin(phi) * Math.cos(theta);
        velocityArray[i3+1] = speed * Math.sin(phi) * Math.sin(theta);
        velocityArray[i3+2] = speed * Math.cos(phi) + (Math.random() * 20); // 略微向前喷射

        // 随机篡改颜色
        const c = colors[Math.floor(Math.random() * colors.length)];
        colorArray[i3] = c.r; colorArray[i3+1] = c.g; colorArray[i3+2] = c.b;
    }
    geometry.attributes.color.needsUpdate = true;
}

// [9] 主物理渲染循环
function animate() {
    requestAnimationFrame(animate);
    if (!state.isIgnited) { renderer.render(scene, camera); return; }

    const pos = geometry.attributes.position.array;
    const time = Date.now() * 0.001;
    const nowMs = Date.now();
    
    const isOrdered = state.isPinched || state.specialPhase === 2;
    
    // 【材质动态增益】：不加粒子，提升亮度
    const targetSize = isOrdered ? 12.0 : 6.5; 
    const targetOpacity = isOrdered ? 1.0 : 0.6;
    material.size += (targetSize - material.size) * 0.15;
    material.opacity += (targetOpacity - material.opacity) * 0.15;

    // 状态机流转：爆裂 -> 收束
    if (state.specialPhase === 1 && (nowMs - state.explosionTime > 850)) {
        state.specialPhase = 2; // 进入收束态
        updateTargetTopology(SPECIAL_NODE);
    }

    for (let i = 0; i < CONFIG.TOTAL_PARTICLES; i++) {
        const i3 = i * 3;
        const isBG = i < CONFIG.BG_PARTICLES;
        const phase = phaseArray[i];

        if (!isBG && state.specialPhase === 1) {
            // [熵增态]：惯性飞行与空气阻力
            pos[i3] += velocityArray[i3];
            pos[i3+1] += velocityArray[i3+1];
            pos[i3+2] += velocityArray[i3+2];
            velocityArray[i3] *= 0.92; 
            velocityArray[i3+1] *= 0.92;
            velocityArray[i3+2] *= 0.92;
        } else {
            // [流体/收束态]：引力积分
            const speed = isBG ? CONFIG.GRAVITY_STRENGTH : (isOrdered ? CONFIG.COLLAPSE_SPEED : CONFIG.GRAVITY_STRENGTH);
            const tx = (isOrdered && !isBG) ? targetArray[i3] : (baseArray[i3] + Math.sin(time + phase) * 45);
            const ty = (isOrdered && !isBG) ? targetArray[i3+1] : (baseArray[i3+1] + Math.cos(time + phase) * 45);
            const tz = (isOrdered && !isBG) ? targetArray[i3+2] : baseArray[i3+2];

            pos[i3] += (tx - pos[i3]) * speed;
            pos[i3+1] += (ty - pos[i3+1]) * speed;
            pos[i3+2] += (tz - pos[i3+2]) * speed;
        }
    }
    geometry.attributes.position.needsUpdate = true;

    // 相位锁：收束时绝对平稳，游走时深空自转
    if (isOrdered) {
        particleSystem.rotation.y += (0 - particleSystem.rotation.y) * 0.15;
        particleSystem.rotation.z += (0 - particleSystem.rotation.z) * 0.15;
    } else {
        particleSystem.rotation.y += CONFIG.ROTATION_IDLE;
        particleSystem.rotation.z += CONFIG.ROTATION_IDLE * 0.3;
    }
    
    renderer.render(scene, camera);
}

// [10] 端侧手势神经网络
const hands = new window.Hands({locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`});
hands.setOptions({ maxNumHands: 1, modelComplexity: 1, minDetectionConfidence: 0.7, minTrackingConfidence: 0.7 });

hands.onResults((res) => {
    if (!state.isIgnited) return;

    if (res.multiHandLandmarks && res.multiHandLandmarks.length > 0) {
        const lm = res.multiHandLandmarks[0];
        const now = Date.now();
        
        const distPinch = Math.hypot(lm[4].x - lm[8].x, lm[4].y - lm[8].y);
        const isPinching = distPinch < 0.075;
        
        const isPeace = (lm[8].y < lm[5].y) && (lm[12].y < lm[9].y) && (lm[16].y > lm[13].y);
        const isOne = (lm[8].y < lm[5].y) && (lm[12].y > lm[9].y) && (lm[16].y > lm[13].y);

        if (isPeace) { // 优先级 1: 触发烟花爆裂
            state.isPinched = false;
            if (state.specialPhase === 0) { triggerExplosion(); }
        } else if (isPinching) { // 优先级 2: 名字坍缩
            state.isPinched = true;
            if (state.specialPhase !== 0) { 
                state.specialPhase = 0; 
                updateTargetTopology(TARGET_NODES[state.currentIndex]); 
            }
        } else { // 优先级 3: 节点切换
            state.isPinched = false;
            if (state.specialPhase !== 0) { 
                state.specialPhase = 0; 
                updateTargetTopology(TARGET_NODES[state.currentIndex]); 
            }
            
            if (isOne && (now - state.lastSwitchTime > 1500)) {
                state.currentIndex = (state.currentIndex + 1) % TARGET_NODES.length;
                updateTargetTopology(TARGET_NODES[state.currentIndex]);
                state.lastSwitchTime = now;
                
                // [SFX] 节点短促切换音
                sfxSwitch.volume = 0.8;
                sfxSwitch.currentTime = 0;
                sfxSwitch.play().catch(()=>{});
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

// [11] 硬件启动序列
const video = document.getElementById('input_video');
const cam_mp = new window.Camera(video, {
    onFrame: async () => { if(video.readyState >= 2 && state.isIgnited) await hands.send({image: video}); },
    width: 640, height: 480
});

window.addEventListener('touchstart', () => { if(state.isIgnited) state.isPinched = true; });
window.addEventListener('touchend', () => { if(state.isIgnited) state.isPinched = false; });
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

animate();
cam_mp.start().then(() => console.log("SYS_KERNEL: 光学与推断引擎常驻后台"));