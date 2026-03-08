// ==========================================
// SYNAPSE GESTURE MATRIX - CORE ENGINE
// ==========================================

// --- 1. 核心变量矩阵 ---
const NAMES = [
    "SATHYA", "BARBARA", "SYNAPSE", "NEURAL", 
    "MATRIX", "CYBER", "QUANTUM", "STELLAR", 
    "VORTEX", "NEBULA", "PLASMA", "ORACLE", 
    "ECLIPSE", "HORIZON", "PULSAR", "NEXUS"
]; // 你的16个专属名字节点

let currentIndex = 0;
let isPinched = false; // 核心状态机：是否捏合/点击
let lastGestureTime = 0; // 用于防抖控制切换频率

// --- 2. THREE.JS 视觉引擎初始化 ---
const canvas = document.getElementById('output_canvas');
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x050505, 0.002); // 添加深空环境雾

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);
camera.position.z = 400;

const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);

// --- 3. 高阶审美：发光粒子材质生成器 ---
function createGlowTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 64; canvas.height = 64;
    const context = canvas.getContext('2d');
    const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
    // 核心调色：赛博蓝紫渐变
    gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
    gradient.addColorStop(0.2, 'rgba(0, 243, 255, 0.8)');
    gradient.addColorStop(0.5, 'rgba(181, 0, 255, 0.2)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(canvas);
}

// --- 4. 粒子系统构建 ---
const PARTICLE_COUNT = 8000; // 提升粒子数量以增加细腻度
const geometry = new THREE.BufferGeometry();
const positions = new Float32Array(PARTICLE_COUNT * 3);
const targetPositions = new Float32Array(PARTICLE_COUNT * 3); // 目标引力点
const randomPositions = new Float32Array(PARTICLE_COUNT * 3); // 混沌散开点

// 初始化混沌状态
for (let i = 0; i < PARTICLE_COUNT * 3; i++) {
    const val = (Math.random() - 0.5) * 2000;
    positions[i] = val;
    randomPositions[i] = val;
    targetPositions[i] = val;
}

geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

// 粒子材质：启用加色混合 (AdditiveBlending) 实现顶级 Bloom 效果
const material = new THREE.PointsMaterial({
    size: 6,
    map: createGlowTexture(),
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false
});

const particleSystem = new THREE.Points(geometry, material);
scene.add(particleSystem);

// --- 5. 文字转粒子坐标引擎 (纯数学映射) ---
function getTextCoordinates(text) {
    const tempCanvas = document.createElement('canvas');
    const ctx = tempCanvas.getContext('2d');
    tempCanvas.width = window.innerWidth;
    tempCanvas.height = window.innerHeight;
    
    // 渲染隐藏文字
    ctx.fillStyle = 'white';
    ctx.font = 'bold 150px "Helvetica Neue"';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, tempCanvas.width / 2, tempCanvas.height / 2);

    const imgData = ctx.getImageData(0, 0, tempCanvas.width, tempCanvas.height).data;
    const coordinates = [];

    // 扫描像素提取坐标
    for (let y = 0; y < tempCanvas.height; y += 4) {
        for (let x = 0; x < tempCanvas.width; x += 4) {
            const index = (y * tempCanvas.width + x) * 4;
            const alpha = imgData[index + 3];
            if (alpha > 128) {
                // 将 2D 屏幕坐标转换为 Three.js 3D 空间坐标
                const pX = x - tempCanvas.width / 2;
                const pY = -(y - tempCanvas.height / 2);
                coordinates.push({ x: pX, y: pY });
            }
        }
    }
    return coordinates;
}

// 更新目标文字形态
function updateTextShape() {
    const name = NAMES[currentIndex];
    document.getElementById('status_text').innerText = `矩阵节点: ${currentIndex + 1} | 当前锁定: ${name}`;
    
    const coords = getTextCoordinates(name);
    
    for (let i = 0; i < PARTICLE_COUNT; i++) {
        if (i < coords.length) {
            // 分配到文字坐标，加一点点随机扰动产生呼吸感
            targetPositions[i * 3] = coords[i].x * 1.5 + (Math.random() - 0.5) * 5;
            targetPositions[i * 3 + 1] = coords[i].y * 1.5 + (Math.random() - 0.5) * 5;
            targetPositions[i * 3 + 2] = (Math.random() - 0.5) * 20; // 文字厚度
        } else {
            // 多余的粒子继续在外围游荡
            targetPositions[i * 3] = randomPositions[i * 3];
            targetPositions[i * 3 + 1] = randomPositions[i * 3 + 1];
            targetPositions[i * 3 + 2] = randomPositions[i * 3 + 2];
        }
    }
}

// --- 6. 物理渲染循环 (核心动画层) ---
const clock = new THREE.Clock();
function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();
    
    const positionsAttr = geometry.attributes.position;
    
    for (let i = 0; i < PARTICLE_COUNT; i++) {
        const idx = i * 3;
        
        if (isPinched) {
            // 状态：凝聚 (引力坍缩) - 顺滑的 Lerp 逼近目标坐标
            positionsAttr.array[idx] += (targetPositions[idx] - positionsAttr.array[idx]) * 0.08;
            positionsAttr.array[idx+1] += (targetPositions[idx+1] - positionsAttr.array[idx+1]) * 0.08;
            positionsAttr.array[idx+2] += (targetPositions[idx+2] - positionsAttr.array[idx+2]) * 0.08;
        } else {
            // 状态：散开 (失去引力) - 缓慢回归混沌，并加入正弦波动
            const time = Date.now() * 0.001;
            const wanderX = randomPositions[idx] + Math.sin(time + i) * 50;
            const wanderY = randomPositions[idx+1] + Math.cos(time + i) * 50;
            const wanderZ = randomPositions[idx+2] + Math.sin(time + i) * 50;
            
            positionsAttr.array[idx] += (wanderX - positionsAttr.array[idx]) * 0.02;
            positionsAttr.array[idx+1] += (wanderY - positionsAttr.array[idx+1]) * 0.02;
            positionsAttr.array[idx+2] += (wanderZ - positionsAttr.array[idx+2]) * 0.02;
        }
    }
    
    positionsAttr.needsUpdate = true;
    
    // 让整个星空缓慢自转，增加宏大感
    particleSystem.rotation.y += 0.001;
    particleSystem.rotation.z += 0.0005;

    renderer.render(scene, camera);
}

// --- 7. 事件监听：鼠标降级测试模式 (为PC准备) ---
window.addEventListener('mousedown', (e) => { 
    if(e.button === 0) isPinched = true; // 左键按下：凝聚
});
window.addEventListener('mouseup', () => isPinched = false); // 左键松开：散开
window.addEventListener('contextmenu', (e) => {
    e.preventDefault(); // 右键点击：切换下一个名字
    currentIndex = (currentIndex + 1) % NAMES.length;
    updateTextShape();
    // 视觉反馈：瞬间闪烁一下UI
    document.getElementById('status_text').style.color = '#00f3ff';
    setTimeout(() => document.getElementById('status_text').style.color = 'rgba(255,255,255,0.4)', 200);
});

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    updateTextShape(); // 重新计算文字坐标以适应屏幕
});

// --- 8. MEDIAPIPE 手势神经接入 (为手机部署准备) ---
const videoElement = document.getElementById('input_video');
const hands = new window.Hands({locateFile: (file) => {
  return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
}});

hands.setOptions({
  maxNumHands: 1,
  modelComplexity: 1,
  minDetectionConfidence: 0.7,
  minTrackingConfidence: 0.7
});

hands.onResults((results) => {
    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        const landmarks = results.multiHandLandmarks[0];
        
        // 提取指尖坐标
        const thumbTip = landmarks[4];
        const indexTip = landmarks[8];
        const indexMcp = landmarks[5]; // 食指根部
        const middleTip = landmarks[12];
        
        // 动作1：捏合 (计算拇指和食指的距离)
        const dist = Math.hypot(thumbTip.x - indexTip.x, thumbTip.y - indexTip.y);
        isPinched = dist < 0.08; // 阈值，越小需要捏得越紧

        // 动作2：伸出食指 (食指伸直，中指弯曲) - 用于切换名字
        const now = Date.now();
        if (indexTip.y < indexMcp.y && middleTip.y > landmarks[9].y) {
            if (now - lastGestureTime > 1500) { // 1.5秒冷却时间，防止疯狂切换
                currentIndex = (currentIndex + 1) % NAMES.length;
                updateTextShape();
                lastGestureTime = now;
            }
        }
    } else {
        isPinched = false; // 手离开屏幕时，恢复散开状态
    }
});

// 尝试唤醒摄像头 (PC端可能失败报错，但不影响上述鼠标逻辑运行)
const camera_mp = new window.Camera(videoElement, {
  onFrame: async () => { await hands.send({image: videoElement}); },
  width: 640, height: 480
});
camera_mp.start().catch(e => console.log("光学传感器接入失败，已降级为鼠标控制模式。"));

// --- 启动矩阵 ---
updateTextShape();
animate();