// -------------------------------------------------------------
// 1. 설정 및 상태 정의
// -------------------------------------------------------------
const canvas = document.getElementById('polarCanvas');
const ctx = canvas.getContext('2d');

let moleculeType = 'diatomic'; // 'diatomic', 'triatomic', or 'triangular'
let enA1 = 2.5; // 주변 원자 A1의 전기음성도
let enA2 = 2.5; // 주변 원자 A2의 전기음성도
let enA3 = 2.5; // 주변 원자 A3의 전기음성도
let enB = 2.5;  // 중앙 원자 B의 전기음성도
let bondAngle = 120; // 삼원자 굽은형 결합각
let isElectricFieldOn = false;
let isSyncEnabled = true;

// 물리 모델 상태
let angle = 0; // 분자의 전체 회전각 (라디안)
let angularVelocity = 0; // 각속도
let isDragging = false;
let startDragAngle = 0;
let prevMouseAngle = 0;
let lastMouseTime = 0;

// 색상 매핑 상수 (Vibrant Cyan ~ Gray ~ Vibrant Coral)
const COLOR_DELTA_PLUS = { r: 0, g: 229, b: 255 };  // Cyan
const COLOR_DELTA_MINUS = { r: 255, g: 90, b: 95 }; // Coral
const COLOR_NEUTRAL = { r: 180, g: 188, b: 200 };    // Slate Gray

// -------------------------------------------------------------
// 2. 초기화 및 리사이즈
// -------------------------------------------------------------
function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * 2;
    canvas.height = rect.height * 2;
    ctx.scale(2, 2);
}

window.addEventListener('resize', resizeCanvas);
window.addEventListener('load', () => {
    resizeCanvas();
    setMoleculeType('diatomic');
    requestAnimationFrame(animationLoop);
});

// -------------------------------------------------------------
// 3. UI 및 제어 함수
// -------------------------------------------------------------
function setMoleculeType(type) {
    moleculeType = type;
    
    // 버튼 탭 활성화 갱신
    document.getElementById('btnDiatomic').classList.toggle('active', type === 'diatomic');
    document.getElementById('btnTriatomic').classList.toggle('active', type === 'triatomic');
    document.getElementById('btnTriangular').classList.toggle('active', type === 'triangular');
    
    // UI 요소 상태 제어
    const syncContainer = document.getElementById('syncContainer');
    const groupAngle = document.getElementById('groupAngle');
    const lblAtomA = document.getElementById('lblAtomA');
    
    if (type === 'diatomic') {
        syncContainer.style.display = 'none';
        groupAngle.classList.add('hidden');
        lblAtomA.textContent = '원자 A';
    } else if (type === 'triatomic') {
        syncContainer.style.display = 'flex';
        groupAngle.classList.remove('hidden');
        lblAtomA.textContent = isSyncEnabled ? '주변 원자 A (일괄)' : '주변 원자 A1';
    } else if (type === 'triangular') {
        syncContainer.style.display = 'flex';
        groupAngle.classList.add('hidden');
        lblAtomA.textContent = isSyncEnabled ? '주변 원자 A (일괄)' : '주변 원자 A1';
    }
    
    updateSliderVisibility();
    
    // 물리 데이터 리셋
    angle = 0;
    angularVelocity = 0;
    updateElectronegativity();
}

function toggleSyncAtoms() {
    isSyncEnabled = document.getElementById('chkSyncAtoms').checked;
    
    const lblAtomA = document.getElementById('lblAtomA');
    if (moleculeType !== 'diatomic') {
        lblAtomA.textContent = isSyncEnabled ? '주변 원자 A (일괄)' : '주변 원자 A1';
    }
    
    if (isSyncEnabled) {
        // 일괄 조동기화 시 A1의 값을 A2, A3에 복사
        enA2 = enA1;
        enA3 = enA1;
        document.getElementById('slideA2').value = enA1;
        document.getElementById('slideA3').value = enA1;
    }
    
    updateSliderVisibility();
    updateElectronegativity();
}

function updateSliderVisibility() {
    const groupA2 = document.getElementById('groupAtomA2');
    const groupA3 = document.getElementById('groupAtomA3');
    
    if (moleculeType === 'diatomic') {
        groupA2.classList.add('hidden');
        groupA3.classList.add('hidden');
    } else if (moleculeType === 'triatomic') {
        groupA2.classList.toggle('hidden', isSyncEnabled);
        groupA3.classList.add('hidden');
    } else if (moleculeType === 'triangular') {
        groupA2.classList.toggle('hidden', isSyncEnabled);
        groupA3.classList.toggle('hidden', isSyncEnabled);
    }
}

function updateElectronegativity() {
    enA1 = parseFloat(document.getElementById('slideA').value);
    enB = parseFloat(document.getElementById('slideB').value);
    
    if (isSyncEnabled) {
        enA2 = enA1;
        enA3 = enA1;
    } else {
        enA2 = parseFloat(document.getElementById('slideA2').value);
        enA3 = parseFloat(document.getElementById('slideA3').value);
    }
    
    document.getElementById('valA').textContent = enA1.toFixed(1);
    document.getElementById('valB').textContent = enB.toFixed(1);
    document.getElementById('valA2').textContent = enA2.toFixed(1);
    document.getElementById('valA3').textContent = enA3.toFixed(1);
    
    calculatePolarity();
}

function updateAngle() {
    bondAngle = parseInt(document.getElementById('slideAngle').value);
    document.getElementById('valAngle').textContent = bondAngle + '°';
    calculatePolarity();
}

function toggleElectricField() {
    isElectricFieldOn = document.getElementById('switchElectricField').checked;
    
    document.getElementById('plateTop').classList.toggle('active', isElectricFieldOn);
    document.getElementById('plateBottom').classList.toggle('active', isElectricFieldOn);
    
    const topLabel = document.querySelector('.plate-top .plate-label');
    const bottomLabel = document.querySelector('.plate-bottom .plate-label');
    
    if (isElectricFieldOn) {
        topLabel.textContent = 'Electric Field Plate (+) Charged';
        bottomLabel.textContent = 'Electric Field Plate (-) Charged';
    } else {
        topLabel.textContent = 'Electric Field OFF';
        bottomLabel.textContent = 'Electric Field OFF';
    }
}

// -------------------------------------------------------------
// 4. 화학 극성 및 합성 벡터 연산
// -------------------------------------------------------------
let totalDipoleVec = { x: 0, y: 0 };
let maxEnDiff = 0;
let dipoleMagnitude = 0;

function calculatePolarity() {
    if (moleculeType === 'diatomic') {
        maxEnDiff = Math.abs(enA1 - enB);
        dipoleMagnitude = maxEnDiff * 1.5;
        const direction = enA1 >= enB ? -1 : 1; // B가 (0,0), A1이 (-bondLength, 0)
        totalDipoleVec = { x: direction * dipoleMagnitude, y: 0 };
    } 
    else if (moleculeType === 'triatomic') {
        maxEnDiff = Math.max(Math.abs(enB - enA1), Math.abs(enB - enA2));
        
        // 결합 벡터 연산 (B가 원점(0,0))
        const halfAngleRad = (bondAngle / 2) * (Math.PI / 180);
        
        // B에서 A1, A2로 향하는 단위 방향 벡터
        const dir1 = { x: -Math.sin(halfAngleRad), y: Math.cos(halfAngleRad) };
        const dir2 = { x: Math.sin(halfAngleRad), y: Math.cos(halfAngleRad) };
        
        // 전기음성도 차이 세기
        const mag1 = (enA1 - enB) * 1.2;
        const mag2 = (enA2 - enB) * 1.2;
        
        // 개별 결합 쌍극자 모멘트 벡터
        const vec1 = { x: dir1.x * mag1, y: dir1.y * mag1 };
        const vec2 = { x: dir2.x * mag2, y: dir2.y * mag2 };
        
        // 합성 벡터
        totalDipoleVec = {
            x: vec1.x + vec2.x,
            y: vec1.y + vec2.y
        };
        dipoleMagnitude = Math.sqrt(totalDipoleVec.x * totalDipoleVec.x + totalDipoleVec.y * totalDipoleVec.y);
    } 
    else if (moleculeType === 'triangular') {
        maxEnDiff = Math.max(Math.abs(enB - enA1), Math.abs(enB - enA2), Math.abs(enB - enA3));
        
        // 평면삼각형(정삼각형): B를 기준으로 세 개의 대칭축(각도: 90도, 210도, 330도)
        const rad1 = -Math.PI / 2; // 상단 (A1)
        const rad2 = -Math.PI / 2 + (2 * Math.PI) / 3; // 우하단 (A2)
        const rad3 = -Math.PI / 2 + (4 * Math.PI) / 3; // 좌하단 (A3)
        
        const dir1 = { x: Math.cos(rad1), y: Math.sin(rad1) };
        const dir2 = { x: Math.cos(rad2), y: Math.sin(rad2) };
        const dir3 = { x: Math.cos(rad3), y: Math.sin(rad3) };
        
        const mag1 = (enA1 - enB) * 1.2;
        const mag2 = (enA2 - enB) * 1.2;
        const mag3 = (enA3 - enB) * 1.2;
        
        const vec1 = { x: dir1.x * mag1, y: dir1.y * mag1 };
        const vec2 = { x: dir2.x * mag2, y: dir2.y * mag2 };
        const vec3 = { x: dir3.x * mag3, y: dir3.y * mag3 };
        
        totalDipoleVec = {
            x: vec1.x + vec2.x + vec3.x,
            y: vec1.y + vec2.y + vec3.y
        };
        dipoleMagnitude = Math.sqrt(totalDipoleVec.x * totalDipoleVec.x + totalDipoleVec.y * totalDipoleVec.y);
    }
    
    // UI 업데이트
    document.getElementById('infoENDiff').textContent = maxEnDiff.toFixed(1);
    document.getElementById('infoDipole').textContent = dipoleMagnitude.toFixed(2) + ' D';
    
    const polarityBadge = document.getElementById('polarityBadge');
    if (dipoleMagnitude < 0.15) {
        polarityBadge.textContent = '무극성 분자 (Nonpolar)';
        polarityBadge.className = 'polarity-result polar-nonpolar';
    } else {
        polarityBadge.textContent = '극성 분자 (Polar)';
        polarityBadge.className = 'polarity-result polar-polar';
    }
}

// -------------------------------------------------------------
// 5. 마우스 드래그 물리 로직
// -------------------------------------------------------------
function getMouseAngle(e) {
    const rect = canvas.getBoundingClientRect();
    const mouseX = (e.clientX - rect.left) - rect.width / 2;
    const mouseY = (e.clientY - rect.top) - rect.height / 2;
    return Math.atan2(mouseY, mouseX);
}

canvas.addEventListener('mousedown', (e) => {
    isDragging = true;
    angularVelocity = 0;
    const mAngle = getMouseAngle(e);
    startDragAngle = mAngle - angle;
    prevMouseAngle = mAngle;
    lastMouseTime = performance.now();
});

window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const mAngle = getMouseAngle(e);
    angle = mAngle - startDragAngle;
    
    const now = performance.now();
    const dt = (now - lastMouseTime) / 1000;
    if (dt > 0) {
        let diff = mAngle - prevMouseAngle;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;
        angularVelocity = diff / dt;
    }
    
    prevMouseAngle = mAngle;
    lastMouseTime = now;
});

window.addEventListener('mouseup', () => { isDragging = false; });

// -------------------------------------------------------------
// 6. 애니메이션 프레임 루프
// -------------------------------------------------------------
let lastTime = 0;

function animationLoop(timestamp) {
    if (!lastTime) lastTime = timestamp;
    let dt = (timestamp - lastTime) / 1000;
    if (dt > 0.1) dt = 0.1;
    lastTime = timestamp;

    updatePhysics(dt);
    draw();

    requestAnimationFrame(animationLoop);
}

function updatePhysics(dt) {
    if (isDragging) return;

    // 감쇠 (Friction)
    angularVelocity *= Math.exp(-1.5 * dt);

    // 전기장 반응 토크 연산
    if (isElectricFieldOn && dipoleMagnitude > 0.15) {
        let internalDipoleAngle = Math.atan2(totalDipoleVec.y, totalDipoleVec.x);
        let globalDipoleAngle = angle + internalDipoleAngle;
        
        let targetAngle = Math.PI / 2; // 전기장 벡터 방향 수직 아래 방향
        let angleDiff = targetAngle - globalDipoleAngle;
        
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        
        const springConstant = 8.0 * dipoleMagnitude;
        const dampingConstant = 2.0;
        
        const torque = springConstant * angleDiff;
        angularVelocity += (torque - dampingConstant * angularVelocity) * dt;
    }

    angle += angularVelocity * dt;
    while (angle < -Math.PI) angle += Math.PI * 2;
    while (angle > Math.PI) angle -= Math.PI * 2;
}

// -------------------------------------------------------------
// 7. 렌더링 (Canvas)
// -------------------------------------------------------------
function getChargeColor(enSelf, enOther) {
    if (enSelf === enOther) return COLOR_NEUTRAL;
    const diff = enSelf - enOther;
    const factor = Math.max(-1, Math.min(1, diff / 2.0));
    
    if (factor > 0) {
        return {
            r: Math.round(COLOR_NEUTRAL.r + (COLOR_DELTA_MINUS.r - COLOR_NEUTRAL.r) * factor),
            g: Math.round(COLOR_NEUTRAL.g + (COLOR_DELTA_MINUS.g - COLOR_NEUTRAL.g) * factor),
            b: Math.round(COLOR_NEUTRAL.b + (COLOR_DELTA_MINUS.b - COLOR_NEUTRAL.b) * factor)
        };
    } else {
        const absFactor = Math.abs(factor);
        return {
            r: Math.round(COLOR_NEUTRAL.r + (COLOR_DELTA_PLUS.r - COLOR_NEUTRAL.r) * absFactor),
            g: Math.round(COLOR_NEUTRAL.g + (COLOR_DELTA_PLUS.g - COLOR_NEUTRAL.g) * absFactor),
            b: Math.round(COLOR_NEUTRAL.b + (COLOR_DELTA_PLUS.b - COLOR_NEUTRAL.b) * absFactor)
        };
    }
}

function colorToString(c, alpha = 1) {
    return `rgba(${c.r}, ${c.g}, ${c.b}, ${alpha})`;
}

function drawAtom(x, y, radius, color, label, chargeLabel) {
    // 1. 외부 전자구름 그라데이션
    const glowGrad = ctx.createRadialGradient(x, y, radius * 0.4, x, y, radius * 2.8);
    glowGrad.addColorStop(0, colorToString(color, 0.4));
    glowGrad.addColorStop(0.35, colorToString(color, 0.18));
    glowGrad.addColorStop(1, 'rgba(0,0,0,0)');
    
    ctx.fillStyle = glowGrad;
    ctx.beginPath();
    ctx.arc(x, y, radius * 2.8, 0, Math.PI * 2);
    ctx.fill();

    // 2. 구체 렌더링
    const sphereGrad = ctx.createRadialGradient(x - radius * 0.3, y - radius * 0.3, radius * 0.1, x, y, radius);
    sphereGrad.addColorStop(0, '#ffffff');
    sphereGrad.addColorStop(0.2, colorToString(color, 1));
    sphereGrad.addColorStop(1, '#080c14');
    
    ctx.fillStyle = sphereGrad;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // 3. 이름 및 부분 전하 기호
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 15px Outfit, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x, y - 2);

    if (chargeLabel) {
        ctx.fillStyle = chargeLabel.includes('-') ? '#ff8589' : '#85f0ff';
        ctx.font = '600 12px Outfit, sans-serif';
        ctx.fillText(chargeLabel, x, y + 21);
    }
}

function drawArrow(fromX, fromY, toX, toY, color, width = 3, arrowSize = 8) {
    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(toX, toY);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();

    const arrowAngle = Math.atan2(toY - fromY, toX - fromX);
    ctx.beginPath();
    ctx.moveTo(toX, toY);
    ctx.lineTo(toX - arrowSize * Math.cos(arrowAngle - Math.PI / 6), toY - arrowSize * Math.sin(arrowAngle - Math.PI / 6));
    ctx.lineTo(toX - arrowSize * Math.cos(arrowAngle + Math.PI / 6), toY - arrowSize * Math.sin(arrowAngle + Math.PI / 6));
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
}

function draw() {
    ctx.clearRect(0, 0, canvas.width / 2, canvas.height / 2);
    
    const w = canvas.width / 2;
    const h = canvas.height / 2;
    const centerX = w / 2;
    const centerY = h / 2;

    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.rotate(angle);

    const bondLength = 90;
    const atomRadius = 24;

    if (moleculeType === 'diatomic') {
        const xA = -bondLength;
        const yA = 0;
        const xB = 0;
        const yB = 0;

        // 결합선
        ctx.beginPath();
        ctx.moveTo(xA, yA);
        ctx.lineTo(xB, yB);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
        ctx.lineWidth = 8;
        ctx.lineCap = 'round';
        ctx.stroke();

        const colorA = getChargeColor(enA1, enB);
        const colorB = getChargeColor(enB, enA1);

        let chargeA = '';
        let chargeB = '';
        if (enA1 > enB) { chargeA = 'δ-'; chargeB = 'δ+'; }
        else if (enB > enA1) { chargeA = 'δ+'; chargeB = 'δ-'; }

        drawAtom(xA, yA, atomRadius, colorA, 'A', chargeA);
        drawAtom(xB, yB, atomRadius, colorB, 'B', chargeB);

        // 개별 결합 모멘트
        if (dipoleMagnitude > 0.1) {
            const fromX = enA1 < enB ? xA + 25 : xB - 25;
            const toX = enA1 < enB ? xB - 25 : xA + 25;
            
            ctx.strokeStyle = 'rgba(165, 180, 252, 0.6)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            const crossX = fromX + (enA1 < enB ? 5 : -5);
            ctx.moveTo(crossX, -5);
            ctx.lineTo(crossX, 5);
            ctx.stroke();

            drawArrow(fromX, 0, toX, 0, 'rgba(165, 180, 252, 0.6)', 2.5, 7);
        }
    } 
    else if (moleculeType === 'triatomic') {
        const halfAngleRad = (bondAngle / 2) * (Math.PI / 180);
        
        const xA1 = -bondLength * Math.sin(halfAngleRad);
        const yA1 = bondLength * Math.cos(halfAngleRad);
        const xA2 = bondLength * Math.sin(halfAngleRad);
        const yA2 = bondLength * Math.cos(halfAngleRad);
        const xB = 0;
        const yB = 0;

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
        ctx.lineWidth = 8;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(xA1, yA1);
        ctx.lineTo(xB, yB);
        ctx.lineTo(xA2, yA2);
        ctx.stroke();

        const colorA1 = getChargeColor(enA1, enB);
        const colorA2 = getChargeColor(enA2, enB);
        const colorB = getChargeColor(enB, (enA1 + enA2) / 2);

        let chargeA1 = enA1 > enB ? 'δ-' : (enB > enA1 ? 'δ+' : '');
        let chargeA2 = enA2 > enB ? 'δ-' : (enB > enA2 ? 'δ+' : '');
        let chargeB = enB > (enA1 + enA2)/2 ? 'δ-' : (enB < (enA1 + enA2)/2 ? 'δ+' : '');

        drawAtom(xA1, yA1, atomRadius, colorA1, 'A1', chargeA1);
        drawAtom(xA2, yA2, atomRadius, colorA2, 'A2', chargeA2);
        drawAtom(xB, yB, atomRadius, colorB, 'B', chargeB);

        // 개별 결합 모멘트 화살표
        const d1 = Math.abs(enA1 - enB);
        if (d1 > 0.1) {
            const start = enB < enA1 ? { x: xB - 15 * Math.sin(halfAngleRad), y: yB + 15 * Math.cos(halfAngleRad) } : { x: xA1 + 20 * Math.sin(halfAngleRad), y: yA1 - 20 * Math.cos(halfAngleRad) };
            const end = enB < enA1 ? { x: xA1 + 20 * Math.sin(halfAngleRad), y: yA1 - 20 * Math.cos(halfAngleRad) } : { x: xB - 15 * Math.sin(halfAngleRad), y: yB + 15 * Math.cos(halfAngleRad) };
            drawArrow(start.x, start.y, end.x, end.y, 'rgba(165, 180, 252, 0.6)', 2, 7);
        }
        const d2 = Math.abs(enA2 - enB);
        if (d2 > 0.1) {
            const start = enB < enA2 ? { x: xB + 15 * Math.sin(halfAngleRad), y: yB + 15 * Math.cos(halfAngleRad) } : { x: xA2 - 20 * Math.sin(halfAngleRad), y: yA2 - 20 * Math.cos(halfAngleRad) };
            const end = enB < enA2 ? { x: xA2 - 20 * Math.sin(halfAngleRad), y: yA2 - 20 * Math.cos(halfAngleRad) } : { x: xB + 15 * Math.sin(halfAngleRad), y: yB + 15 * Math.cos(halfAngleRad) };
            drawArrow(start.x, start.y, end.x, end.y, 'rgba(165, 180, 252, 0.6)', 2, 7);
        }
    } 
    else if (moleculeType === 'triangular') {
        // 평면삼각형 기하 구조 정의
        const rad1 = -Math.PI / 2; // A1
        const rad2 = -Math.PI / 2 + (2 * Math.PI) / 3; // A2
        const rad3 = -Math.PI / 2 + (4 * Math.PI) / 3; // A3
        
        const xA1 = bondLength * Math.cos(rad1);
        const yA1 = bondLength * Math.sin(rad1);
        const xA2 = bondLength * Math.cos(rad2);
        const yA2 = bondLength * Math.sin(rad2);
        const xA3 = bondLength * Math.cos(rad3);
        const yA3 = bondLength * Math.sin(rad3);
        const xB = 0;
        const yB = 0;

        // 결합선 3개
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
        ctx.lineWidth = 8;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(xA1, yA1); ctx.lineTo(xB, yB);
        ctx.moveTo(xA2, yA2); ctx.lineTo(xB, yB);
        ctx.moveTo(xA3, yA3); ctx.lineTo(xB, yB);
        ctx.stroke();

        const colorA1 = getChargeColor(enA1, enB);
        const colorA2 = getChargeColor(enA2, enB);
        const colorA3 = getChargeColor(enA3, enB);
        const colorB = getChargeColor(enB, (enA1 + enA2 + enA3) / 3);

        let chargeA1 = enA1 > enB ? 'δ-' : (enB > enA1 ? 'δ+' : '');
        let chargeA2 = enA2 > enB ? 'δ-' : (enB > enA2 ? 'δ+' : '');
        let chargeA3 = enA3 > enB ? 'δ-' : (enB > enA3 ? 'δ+' : '');
        let chargeB = enB > (enA1 + enA2 + enA3)/3 ? 'δ-' : (enB < (enA1 + enA2 + enA3)/3 ? 'δ+' : '');

        drawAtom(xA1, yA1, atomRadius, colorA1, 'A1', chargeA1);
        drawAtom(xA2, yA2, atomRadius, colorA2, 'A2', chargeA2);
        drawAtom(xA3, yA3, atomRadius, colorA3, 'A3', chargeA3);
        drawAtom(xB, yB, atomRadius, colorB, 'B', chargeB);

        // 개별 결합 모멘트
        const angles = [rad1, rad2, rad3];
        const ens = [enA1, enA2, enA3];
        for (let i = 0; i < 3; i++) {
            const diff = Math.abs(ens[i] - enB);
            if (diff > 0.1) {
                const ax = bondLength * Math.cos(angles[i]);
                const ay = bondLength * Math.sin(angles[i]);
                
                const start = enB < ens[i] ? { x: 15 * Math.cos(angles[i]), y: 15 * Math.sin(angles[i]) } : { x: ax - 20 * Math.cos(angles[i]), y: ay - 20 * Math.sin(angles[i]) };
                const end = enB < ens[i] ? { x: ax - 20 * Math.cos(angles[i]), y: ay - 20 * Math.sin(angles[i]) } : { x: 15 * Math.cos(angles[i]), y: 15 * Math.sin(angles[i]) };
                drawArrow(start.x, start.y, end.x, end.y, 'rgba(165, 180, 252, 0.6)', 2, 7);
            }
        }
    }

    ctx.restore();

    // 8. 합성 쌍극자 모멘트 화살표 (글로벌 고정 좌표계 렌더링)
    if (dipoleMagnitude > 0.15) {
        const cosA = Math.cos(angle);
        const sinA = Math.sin(angle);
        
        const dMag = Math.sqrt(totalDipoleVec.x * totalDipoleVec.x + totalDipoleVec.y * totalDipoleVec.y);
        const dirLocalX = totalDipoleVec.x / dMag;
        const dirLocalY = totalDipoleVec.y / dMag;
        
        const dirGlobalX = dirLocalX * cosA - dirLocalY * sinA;
        const dirGlobalY = dirLocalX * sinA + dirLocalY * cosA;
        
        const startX = centerX;
        const startY = centerY;
        const scaledVal = Math.min(130, 25 + dipoleMagnitude * 20);
        const endX = centerX + dirGlobalX * scaledVal;
        const endY = centerY + dirGlobalY * scaledVal;
        
        // 합성 십자가 꼬리(+)
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        const crossLength = 8;
        const perpX = -dirGlobalY * crossLength;
        const perpY = dirGlobalX * crossLength;
        const crossStartX = startX + dirGlobalX * 10;
        const crossStartY = startY + dirGlobalY * 10;
        ctx.moveTo(crossStartX - perpX, crossStartY - perpY);
        ctx.lineTo(crossStartX + perpX, crossStartY + perpY);
        ctx.stroke();
        
        drawArrow(startX + dirGlobalX * 10, startY + dirGlobalY * 10, endX, endY, '#f59e0b', 4.5, 11);
        
        ctx.fillStyle = '#fde047';
        ctx.font = 'italic bold 18px Outfit, sans-serif';
        ctx.fillText('μ', endX + dirGlobalX * 15, endY + dirGlobalY * 15);
    }
}
