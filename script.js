'use strict';

/**
 * @constant {Array<string>} TARGET_NODES - 目标渲染节点池
 */
const TARGET_NODES = [
    "刘磊", "陈鼎元", "陈子豪", "董奕斐", "顾曼妮", 
    "古苗苗", "郭苏仪", "姬翔", "刘子慕", "李文轩", 
    "李一鸣", "吕润柳", "孙垚博", "徐薇", "燕子楚齐", 
    "郑雅今", "朱付晴晴"
];

const CONFIG = {
    PARTICLE_COUNT: 15000,
    NEBULA_RADIUS: 600,
    REPULSION_STRENGTH: 50000, // 排斥力常数
    GRAVITY_STRENGTH: 0.05,    // 引力回弹系数
    COLLAPSE_SPEED: 0.1,       // 捏合坍缩速率
    BLOOM_PARAMS: {
        exposure: 1,
        bloomStrength: 1.8,
        bloomThreshold: 0.1,
        bloomRadius: 0.5
    }
};

// --- 全局状态机 ---
let state = {
    currentIndex: 0,
    isPinched: false,
    interactionPoint: new THREE.Vector3(0, 0, 9999), // 初始置于屏幕外
    lastSwitchTime: 0
};

// --- WebGL 渲染管线初始化 ---
const canvas = document.getElementById('output_canvas');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 3000);
camera.position.z = 800;

const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // 限制像素比防内存溢出
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ReinhardToneMapping;

// --- Post-Processing: UnrealBloomPass ---
const renderScene = new THREE.RenderPass(scene, camera);
const bloomPass = new THREE.UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    CONFIG.BLOOM_PARAMS.bloomStrength,
    CONFIG.BLOOM_PARAMS.bloomRadius,
    CONFIG.BLOOM_PARAMS.bloomThreshold
);
const composer = new THREE.EffectComposer(renderer);
composer.addPass(renderScene);
composer.addPass(bloomPass);

// --- 粒子系统内存预分配 ---
const geometry = new THREE.BufferGeometry();
const positions = new Float32Array(CONFIG.PARTICLE_COUNT * 3);
const basePositions = new Float32Array(CONFIG.PARTICLE_COUNT * 3); // 星云基础坐标
const targetPositions = new Float32Array(CONFIG.PARTICLE_COUNT * 3); // 文字目标坐标
const colors = new Float32Array(CONFIG.PARTICLE_COUNT * 3);
const velocities = new Float32Array(CONFIG.PARTICLE_COUNT * 3);

/**
 * 核心：球状星云与白-橙渐变色彩生成算法
 */
for (let i = 0; i < CONFIG.PARTICLE_COUNT; i++) {
    const i3 = i * 3;
    
    // 生成球体内部的随机坐标
    const r = CONFIG.NEBULA_RADIUS * Math.cbrt(Math.random());
    const theta = Math.random() * 2 * Math.PI;
    const phi = Math.acos(2 * Math.random() - 1);
    
    basePositions[i3] = r * Math.sin(phi) * Math.cos(theta);
    basePositions[i3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    basePositions[i3 + 2] = r * Math.cos(phi);
    
    positions[i3] = basePositions[i3];
    positions[i3 + 1] = basePositions[i3 + 1];
    positions[i3 + 2] = basePositions[i3 + 2];
    
    // 径向色彩计算：核心炽白 -> 边缘暗橙
    const normalizedRadius = r / CONFIG.NEBULA_RADIUS;
    const color = new THREE.Color();
    // 采用线性插值混色
    if (normalizedRadius < 0.3) {
        color.setHSL(0.1, 0.8, 1.0); // 炽白/极浅黄
    } else {
        color.setHSL(0.08, 1.0, 0.5 * (1 - normalizedRadius) + 0.1); // 金黄过渡到暗橙
    }
    
    colors[i3] = color.r;
    colors[i3 + 1] = color.g;
    colors[i3 + 2] = color.b;
}

geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

const material = new THREE.PointsMaterial({
    size: 3.5,
    vertexColors: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
    opacity: 0.8
});

const particleSystem = new THREE.Points(geometry, material);
scene.add(particleSystem);

/**
 * 利用 Canvas 2D 离屏渲染进行中文字符采样映射
 * @param {string} text - 目标人名
 * @returns {Array<Object>} 包含有效像素 2D 坐标的数组
 */
function extractTextCoordinates(text) {
    const tempCanvas = document.createElement('canvas');
    const ctx = tempCanvas.getContext('2d');
    tempCanvas.width = 1024;
    tempCanvas.height = 1024;
    
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
    
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 200px "Microsoft YaHei", sans-serif'; // 必须使用中文字体池
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, tempCanvas.width / 2, tempCanvas.height / 2);

    const imgData = ctx.getImageData(0, 0, tempCanvas.width, tempCanvas.height).data;
    const coords = [];

    for (let y = 0; y < tempCanvas.height; y += 6) {
        for (let x = 0; x < tempCanvas.width; x += 6) {
            const index = (y * tempCanvas.width + x) * 4;
            if (imgData[index] > 128) {
                coords.push({ 
                    x: (x - tempCanvas.width / 2) * 1.2, 
                    y: -(y - tempCanvas.height / 2) * 1.2 
                });
            }
        }
    }
    return coords;
}

/**
 * 触发生态转换：更新目标数组坐标
 */
function rebuildTextTopology() {
    const name = TARGET_NODES[state.currentIndex];
    document.getElementById('status_text').innerText = `NODE: ${state.currentIndex + 1} / ${TARGET_NODES.length} | LOCK: ${name}`;
    
    const coords = extractTextCoordinates(name);
    const coordsLength = coords.length;
    
    for (let i = 0; i < CONFIG.PARTICLE_COUNT; i++) {
        const i3 = i * 3;
        if (i < coordsLength) {
            targetPositions[i3] = coords[i].x + (Math.random() - 0.5) * 4;
            targetPositions[i3 + 1] = coords[i].y + (Math.random() - 0.5) * 4;
            targetPositions[i3 + 2] = (Math.random() - 0.5) * 10;
        } else {
            targetPositions[i3] = basePositions[i3];
            targetPositions[i3 + 1] = basePositions[i3 + 1];
            targetPositions[i3 + 2] = basePositions[i3 + 2];
        }
    }
}

// --- 物理引擎与渲染循环 ---
function animate() {
    requestAnimationFrame(animate);
    
    const posAttr = geometry.attributes.position;
    
    for (let i = 0; i < CONFIG.PARTICLE_COUNT; i++) {
        const i3 = i * 3;
        
        if (state.isPinched) {
            // 状态 1: 量子坍缩 (名字显示)
            posAttr.array[i3] += (targetPositions[i3] - posAttr.array[i3]) * CONFIG.COLLAPSE_SPEED;
            posAttr.array[i3 + 1] += (targetPositions[i3 + 1] - posAttr.array[i3 + 1]) * CONFIG.COLLAPSE_SPEED;
            posAttr.array[i3 + 2] += (targetPositions[i3 + 2] - posAttr.array[i3 + 2]) * CONFIG.COLLAPSE_SPEED;
        } else {
            // 状态 2: 星云游走与排斥物理场
            const dx = posAttr.array[i3] - state.interactionPoint.x;
            const dy = posAttr.array[i3 + 1] - state.interactionPoint.y;
            const dz = posAttr.array[i3 + 2] - state.interactionPoint.z;
            const distSq = dx * dx + dy * dy + dz * dz;
            
            // 反平方律斥力计算 (带有防除零约束 epsilon)
            let force = 0;
            if (distSq < 40000) { 
                force = CONFIG.REPULSION_STRENGTH / (distSq + 100);
            }
            
            // 目标为星云的基础坐标
            const targetX = basePositions[i3];
            const targetY = basePositions[i3 + 1];
            const targetZ = basePositions[i3 + 2];
            
            // 施加斥力
            velocities[i3] += (dx / Math.sqrt(distSq)) * force;
            velocities[i3 + 1] += (dy / Math.sqrt(distSq)) * force;
            velocities[i3 + 2] += (dz / Math.sqrt(distSq)) * force;
            
            // 施加引力 (回归基础位置)
            velocities[i3] += (targetX - posAttr.array[i3]) * CONFIG.GRAVITY_STRENGTH;
            velocities[i3 + 1] += (targetY - posAttr.array[i3 + 1]) * CONFIG.GRAVITY_STRENGTH;
            velocities[i3 + 2] += (targetZ - posAttr.array[i3 + 2]) * CONFIG.GRAVITY_STRENGTH;
            
            // 速度阻尼 (Friction)
            velocities[i3] *= 0.8;
            velocities[i3 + 1] *= 0.8;
            velocities[i3 + 2] *= 0.8;
            
            // 最终积分应用
            posAttr.array[i3] += velocities[i3];
            posAttr.array[i3 + 1] += velocities[i3 + 1];
            posAttr.array[i3 + 2] += velocities[i3 + 2];
        }
    }
    
    posAttr.needsUpdate = true;
    
    // 星云全局缓慢自转
    if (!state.isPinched) {
        particleSystem.rotation.y += 0.002;
        particleSystem.rotation.z += 0.001;
    } else {
        // 坍缩态保持水平修正
        particleSystem.rotation.y += (0 - particleSystem.rotation.y) * 0.1;
        particleSystem.rotation.z += (0 - particleSystem.rotation.z) * 0.1;
    }

    composer.render();
}

// --- 降维交互: 鼠标事件映射 (开发与 PC 环境兼容) ---
window.addEventListener('mousemove', (e) => {
    // 映射屏幕坐标至 3D 世界坐标系
    const vec = new THREE.Vector3(
        (e.clientX / window.innerWidth) * 2 - 1,
        -(e.clientY / window.innerHeight) * 2 + 1,
        0.5
    );
    vec.unproject(camera);
    vec.sub(camera.position).normalize();
    const distance = -camera.position.z / vec.z;
    state.interactionPoint.copy(camera.position).add(vec.multiplyScalar(distance));
});
window.addEventListener('mousedown', (e) => {
    if (e.button === 0) state.isPinched = true;
});
window.addEventListener('mouseup', () => state.isPinched = false);
window.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    state.currentIndex = (state.currentIndex + 1) % TARGET_NODES.length;
    rebuildTextTopology();
});
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
});

// --- 高维交互: MediaPipe Neural Engine 挂载 ---
const videoElement = document.getElementById('input_video');
const hands = new window.Hands({locateFile: (file) => {
  return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
}});

hands.setOptions({
  maxNumHands: 1,
  modelComplexity: 1,
  minDetectionConfidence: 0.65,
  minTrackingConfidence: 0.65
});

hands.onResults((results) => {
    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        const landmarks = results.multiHandLandmarks[0];
        
        // 提取骨骼节点特征变量
        const thumbTip = landmarks[4];
        const indexTip = landmarks[8];
        const indexMcp = landmarks[5];
        const middleTip = landmarks[12];
        const middleMcp = landmarks[9];
        
        // 映射手掌重心作为 3D 排斥交互点
        const palmCenter = landmarks[9];
        const vec = new THREE.Vector3(
            (palmCenter.x * -2) + 1, // 镜像反转修正
            -(palmCenter.y * 2) + 1,
            0.5
        );
        vec.unproject(camera);
        vec.sub(camera.position).normalize();
        const distance = -camera.position.z / vec.z;
        state.interactionPoint.copy(camera.position).add(vec.multiplyScalar(distance));

        // 状态判定：欧几里得距离验证捏合状态
        const pinchDist = Math.hypot(thumbTip.x - indexTip.x, thumbTip.y - indexTip.y);
        state.isPinched = pinchDist < 0.08;

        // 状态判定：索引切换信号触发
        const now = Date.now();
        if (indexTip.y < indexMcp.y && middleTip.y > middleMcp.y) {
            if (now - state.lastSwitchTime > 1200) { // 节流控制 (1.2秒)
                state.currentIndex = (state.currentIndex + 1) % TARGET_NODES.length;
                rebuildTextTopology();
                state.lastSwitchTime = now;
            }
        }
    } else {
        state.isPinched = false;
        state.interactionPoint.set(0, 0, 9999); // 脱离感知区域
    }
});

const camera_mp = new window.Camera(videoElement, {
  onFrame: async () => {
      try { await hands.send({image: videoElement}); } 
      catch(err) { /* 捕捉并丢弃降级模式下的视频流帧异常 */ }
  },
  width: 640, height: 480
});

// 初始化启动流程
rebuildTextTopology();
animate();
camera_mp.start().catch(() => console.warn('光电耦合器注入失败，已执行降级防护协议。'));