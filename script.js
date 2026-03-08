/**
 * @file script.js
 * @version 5.0.0 (Kinetic Resonance - Final Freeze)
 * @description 效能极值版：高密度流体渲染、绝对互斥状态机、物理点火锁与音频链路。
 */

'use strict';

// [1] 数据拓扑矩阵
const TARGET_NODES = ["刘磊", "陈鼎元", "陈子豪", "董奕斐", "顾曼妮", "古苗苗", "郭苏仪", "姬翔", "刘子慕", "李文轩", "李一鸣", "吕润柳", "孙垚博", "徐薇", "燕子楚齐", "郑雅今", "朱付晴晴"];
const SPECIAL_NODE = "祝大家\n前程似锦！！";

// [2] 物理常数与算力分配 (摒弃中心补丁，追求全域致密)
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
    isIgnited: false // 音频与推断引擎点火锁
};

// [3] 音频链路注册
const bgmAudio = document.getElementById('bgm_audio');
const sfxSwitch = document.getElementById('sfx_switch');

// 音频物理点火：破除浏览器自动播放静音惩罚
document.getElementById('ignition_overlay').addEventListener('click', function() {
    state.isIgnited = true;
    
    // 执行视觉退场
    this.style.opacity = '0';
    setTimeout(() => this.style.display = 'none', 800);
    
    // 强制接管音频线程
    bgmAudio.volume = 0.5;
    bgmAudio.play().catch(e => console.warn("音频系统调用异常:", e));
    
    // 触发首次 UI 状态同步
    updateTargetTopology(TARGET_NODES[state.currentIndex]);
    document.getElementById('status_text').innerText = "MATRIX_CORE: 神经连接已就绪 | 听觉链路开启";
});

// [4] WebGL 渲染管线初始化
const canvas = document.getElementById('output_canvas');
const uiText = document.getElementById('status_text');
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x000000, 0.0009); // 加深体积雾，拉伸空间纵深

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 5000);
camera.position.z = CONFIG.CAMERA_Z;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

// [5] 极简自然发光材质 (移除刺眼中心白斑，还原自然光晕)
function createGlowTexture() {
    const pCanvas = document.createElement('canvas');
    pCanvas.width = 64; pCanvas.height = 64;
    const ctx = pCanvas.getContext('2d');
    const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255, 255, 255, 1)');      // 微小锐利核心
    grad.addColorStop(0.2, 'rgba(255, 215, 0, 0.8)');    // 紧凑金黄
    grad.addColorStop(0.5, 'rgba(255, 120, 0, 0.15)');   // 大面积暗橙衰减
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(pCanvas);
}

// [6] 非对称内存矩阵与独立相位
const geometry = new THREE.BufferGeometry();
const posArray = new Float32Array(CONFIG.TOTAL_PARTICLES * 3);
const baseArray = new Float32Array(CONFIG.TOTAL_PARTICLES * 3);
const targetArray = new Float32Array(CONFIG.TOTAL_PARTICLES * 3);
const phaseArray = new Float32Array(CONFIG.TOTAL_PARTICLES); // 独立流体漂移相位

// 6.1 背景深空星海 (0 -> 5999)
for (let i = 0; i < CONFIG.BG_PARTICLES; i++) {
    const i3 = i * 3;
    baseArray[i3] = (Math.random() - 0.5) * 4500;
    baseArray[i3 + 1] = (Math.random() - 0.5) * 4500;
    baseArray[i3 + 2] = (Math.random() - 0.5) * 2000 - 900; 
    posArray[i3] = baseArray[i3];
    posArray[i3 + 1] = baseArray[i3 + 1];
    posArray[i3 + 2] = baseArray[i3 + 2];
    targetArray[i3] = baseArray[i3];
    targetArray[i3 + 1] = baseArray[i3 + 1];
    targetArray[i3 + 2] = baseArray[i3 + 2];
    phaseArray[i] = Math.random() * Math.PI * 2;
}

// 6.2 文字高密度载体 (6000 -> 15999)
for (let i = CONFIG.BG_PARTICLES; i < CONFIG.TOTAL_PARTICLES; i++) {
    const i3 = i * 3;
    const r = 200 * Math.cbrt(Math.random());
    const theta = Math.random() * 2 * Math.PI;
    const phi = Math.acos(2 * Math.random() - 1);
    baseArray[i3] = r * Math.sin(phi) * Math.cos(theta);
    baseArray[i3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    baseArray[i3 + 2] = r * Math.cos(phi);
    posArray[i3] = baseArray[i3] + (Math.random() - 0.5) * 1000;
    posArray[i3 + 1] = baseArray[i3 + 1] + (Math.random() - 0.5) * 1000;
    posArray[i3 + 2] = baseArray[i3 + 2] + (Math.random() - 0.5) * 1000;
    phaseArray[i] = Math.random() * Math.PI * 2;
}

geometry.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
const material = new THREE.PointsMaterial({
    size: 7.5, // 缩小单粒子物理尺寸，通过高密度堆叠实现极强锐度
    map: createGlowTexture(),
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
    opacity: 0.85
});
const particleSystem = new THREE.Points(geometry, material);
scene.add(particleSystem);

// [7] 高密度字模推演 (彻底解决文字稀疏问题)
function updateTargetTopology(text) {
    if (!state.isIgnited) return; // 拦截未点火时的无效重绘

    const tCanvas = document.createElement('canvas');
    const tCtx = tCanvas.getContext('2d');
    tCanvas.width = 1024; tCanvas.height = 1024;
    tCtx.fillStyle = '#000'; tCtx.fillRect(0, 0, 1024, 1024);
    tCtx.fillStyle = '#FFF';
    
    const lines = text.split('\n');
    tCtx.textAlign = 'center'; tCtx.textBaseline = 'middle';
    
    // 强制极限采样：全域步进均设定为 4，榨干 10000 粒子的分辨率
    const stride = 4; 
    if (lines.length > 1) {
        tCtx.font = 'bold 150px "Microsoft YaHei", sans-serif';
        tCtx.fillText(lines[0], 512, 420);
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
                points.push({ x: (x - 512) * 1.35, y: -(y - 512) * 1.35 });
            }
        }
    }

    const pLen = points.length;
    let pIdx = 0;
    for (let i = CONFIG.BG_PARTICLES; i < CONFIG.TOTAL_PARTICLES; i++) {
        const i3 = i * 3;
        if (pIdx < pLen) {
            targetArray[i3] = points[pIdx].x + (Math.random() - 0.5) * 2;
            targetArray[i3 + 1] = points[pIdx].y + (Math.random() - 0.5) * 2;
            targetArray[i3 + 2] = (Math.random() - 0.5) * 8 + 260; // Z轴前推保障清晰度
            pIdx++;
        } else {
            // 冗余算力推入微弱背景晕染
            targetArray[i3] = baseArray[i3] * 0.15;
            targetArray[i3 + 1] = baseArray[i3 + 1] * 0.15;
            targetArray[i3 + 2] = baseArray[i3 + 2] * 0.15 - 100;
        }
    }
    
    if (state.isSpecial) {
        uiText.innerText = "MATRIX_OVERRIDE: 权限最高授权";
        uiText.style.color = "#FF4500";
    } else {
        uiText.innerText = `NODE: ${state.currentIndex + 1} / 17 | LOCK: ${text}`;
        uiText.style.color = "#FFD700";
    }
}

// [8] 动静隔离物理循环 (无损背景流体)
function animate() {
    requestAnimationFrame(animate);
    if (!state.isIgnited) {
        // 未点火态：维持最低限度的缓慢游走，节省 GPU 算力
        renderer.render(scene, camera);
        return;
    }

    const pos = geometry.attributes.position.array;
    const time = Date.now() * 0.001;
    const isActive = state.isPinched || state.isSpecial;

    for (let i = 0; i < CONFIG.TOTAL_PARTICLES; i++) {
        const i3 = i * 3;
        const isBG = i < CONFIG.BG_PARTICLES;
        const phase = phaseArray[i];
        
        // 【核心解耦】：背景星海无论如何都在布朗运动，不受名字坍缩的影响
        const speed = isBG ? CONFIG.GRAVITY_STRENGTH : (isActive ? CONFIG.COLLAPSE_SPEED : CONFIG.GRAVITY_STRENGTH);
        
        const tx = (isActive && !isBG) ? targetArray[i3] : (baseArray[i3] + Math.sin(time + phase) * 35);
        const ty = (isActive && !isBG) ? targetArray[i3+1] : (baseArray[i3+1] + Math.cos(time + phase) * 35);
        const tz = (isActive && !isBG) ? targetArray[i3+2] : baseArray[i3+2];

        pos[i3] += (tx - pos[i3]) * speed;
        pos[i3+1] += (ty - pos[i3+1]) * speed;
        pos[i3+2] += (tz - pos[i3+2]) * speed;
    }
    geometry.attributes.position.needsUpdate = true;

    // 旋转相位锁
    if (isActive) {
        particleSystem.rotation.y += (0 - particleSystem.rotation.y) * 0.15;
        particleSystem.rotation.z += (0 - particleSystem.rotation.z) * 0.15;
    } else {
        particleSystem.rotation.y += CONFIG.ROTATION_IDLE;
        particleSystem.rotation.z += CONFIG.ROTATION_IDLE * 0.3;
    }
    
    // 整体明暗律动
    material.opacity = 0.8 + Math.sin(time * 2) * 0.15;
    renderer.render(scene, camera);
}

// [9] 端侧推断神经反馈 (引入 SFX 扳机)
const hands = new window.Hands({locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`});
hands.setOptions({ maxNumHands: 1, modelComplexity: 1, minDetectionConfidence: 0.7, minTrackingConfidence: 0.7 });

hands.onResults((res) => {
    if (!state.isIgnited) return; // 锁死未授权的手势调用

    if (res.multiHandLandmarks && res.multiHandLandmarks.length > 0) {
        const lm = res.multiHandLandmarks[0];
        const now = Date.now();
        
        // 阈值判定
        const distPinch = Math.hypot(lm[4].x - lm[8].x, lm[4].y - lm[8].y);
        const isPinching = distPinch < 0.075;
        
        const isPeace = (lm[8].y < lm[5].y) && (lm[12].y < lm[9].y) && (lm[16].y > lm[13].y);
        const isOne = (lm[8].y < lm[5].y) && (lm[12].y > lm[9].y) && (lm[16].y > lm[13].y);

        if (isPeace) { // 优先级 1：彩蛋触发
            state.isPinched = false;
            if (!state.isSpecial) { 
                state.isSpecial = true; 
                updateTargetTopology(SPECIAL_NODE); 
                // [SFX] 触发特殊音效
                sfxSwitch.currentTime = 0; sfxSwitch.play().catch(()=>{}); 
            }
        } else if (isPinching) { // 优先级 2：坍缩实体化
            state.isPinched = true;
            if (state.isSpecial) { state.isSpecial = false; updateTargetTopology(TARGET_NODES[state.currentIndex]); }
        } else { // 优先级 3：节点轮询
            state.isPinched = false;
            if (state.isSpecial) { state.isSpecial = false; updateTargetTopology(TARGET_NODES[state.currentIndex]); }
            
            // 互斥节流锁与音频点火
            if (isOne && (now - state.lastSwitchTime > 1600)) {
                state.currentIndex = (state.currentIndex + 1) % TARGET_NODES.length;
                updateTargetTopology(TARGET_NODES[state.currentIndex]);
                state.lastSwitchTime = now;
                
                // [SFX] 触发物理切换音效
                sfxSwitch.volume = 0.8;
                sfxSwitch.currentTime = 0;
                sfxSwitch.play().catch(e => console.warn(e));
            }
        }
    } else {
        // 无信号回归态
        state.isPinched = false;
        if (state.isSpecial) { state.isSpecial = false; updateTargetTopology(TARGET_NODES[state.currentIndex]); }
    }
});

// [10] 硬件推断主循环
const video = document.getElementById('input_video');
const cam_mp = new window.Camera(video, {
    onFrame: async () => { if(video.readyState >= 2 && state.isIgnited) await hands.send({image: video}); },
    width: 640, height: 480
});

// 应对无光学传感器环境的物理触控备用通道
window.addEventListener('touchstart', () => { if(state.isIgnited) state.isPinched = true; });
window.addEventListener('touchend', () => { if(state.isIgnited) state.isPinched = false; });
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// 发动机点火预热
animate();
cam_mp.start().then(() => console.log("SYS: Camera Pipeline Ready."));