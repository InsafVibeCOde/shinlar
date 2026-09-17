/* ============================================================
   3D-колесо в герое: процедурная шина + литой диск на three.js.
   Вся геометрия и все текстуры генерируются в коде — ни моделей,
   ни картинок грузить не нужно.
   ============================================================ */
(function () {
  'use strict';

  var canvas = document.getElementById('tireCanvas');
  var stage  = document.getElementById('tireStage');
  if (!canvas || !stage) return;

  function bail() { document.documentElement.classList.add('no-webgl'); }

  if (typeof THREE === 'undefined') { bail(); return; }
  try {
    var probe = document.createElement('canvas');
    if (!(probe.getContext('webgl') || probe.getContext('experimental-webgl'))) { bail(); return; }
  } catch (e) { bail(); return; }

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── рендерер и сцена ─────────────────────────────────── */
  var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;                  // самозатенение спиц и протектора
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  var scene  = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  camera.position.set(0, 0.1, 7);

  /* ============================================================
     ПРОЦЕДУРНЫЕ ТЕКСТУРЫ
     ============================================================ */

  function makeCanvas(w, h) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }

  // мелкая зернистость — именно она убирает «пластиковый» вид резины
  function grain(ctx, w, h, center, spread) {
    var img = ctx.getImageData(0, 0, w, h), d = img.data;
    for (var i = 0; i < d.length; i += 4) {
      var n = center + (Math.random() - 0.5) * spread;
      d[i] = d[i + 1] = d[i + 2] = n;
    }
    ctx.putImageData(img, 0, 0);
  }

  function texture(c, repeatX, repeatY) {
    var t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeatX || 1, repeatY || 1);
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return t;
  }

  /* ── окружение: студия с софтбоксами, чтобы металл отражал свет ── */
  function buildEnvironment() {
    var c = makeCanvas(1024, 512), ctx = c.getContext('2d');

    var grad = ctx.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0.00, '#4a5158');
    grad.addColorStop(0.38, '#14181b');
    grad.addColorStop(0.62, '#0a0c0d');
    grad.addColorStop(1.00, '#020203');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1024, 512);

    ctx.filter = 'blur(22px)';
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(90, 20, 300, 120);        // большой софтбокс сверху слева
    ctx.fillRect(620, 40, 190, 90);        // второй сверху справа
    ctx.fillStyle = '#cfd8e2';
    ctx.fillRect(420, 150, 120, 60);
    ctx.fillStyle = '#4c9bff';             // холодная подсветка сбоку
    ctx.fillRect(840, 180, 130, 80);
    ctx.filter = 'none';

    var tex = new THREE.CanvasTexture(c);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.colorSpace = THREE.SRGBColorSpace;

    var pmrem = new THREE.PMREMGenerator(renderer);
    var env = pmrem.fromEquirectangular(tex).texture;
    pmrem.dispose();
    tex.dispose();
    return env;
  }
  scene.environment = buildEnvironment();

  /* ── карты для резины ──────────────────────────────────
     Развёртка LatheGeometry: X текстуры — по окружности,
     Y — вдоль профиля сечения (борт → плечо → беговая дорожка → плечо → борт).
     Значит надписи, нарисованные горизонтально, лягут по кругу боковины. */
  function buildTireMaps() {
    var W = 1024, H = 512;
    var bc = makeCanvas(W, H), bx = bc.getContext('2d');

    bx.fillStyle = '#808080';
    bx.fillRect(0, 0, W, H);
    grain(bx, W, H, 128, 30);

    // полоса по координате профиля (0 — один борт, 1 — другой)
    function band(v0, v1, fill) {
      bx.fillStyle = fill;
      bx.fillRect(0, v0 * H, W, (v1 - v0) * H);
    }

    // зоны боковин чуть ниже уровня — плечи и дорожка выше
    band(0.00, 0.18, 'rgba(90,90,90,0.55)');
    band(0.82, 1.00, 'rgba(90,90,90,0.55)');

    // кольцевые рёбра жёсткости на боковинах
    [0.06, 0.09, 0.145, 0.855, 0.91, 0.94].forEach(function (v) {
      bx.fillStyle = 'rgba(190,190,190,0.5)';
      bx.fillRect(0, v * H, W, 3);
      bx.fillStyle = 'rgba(40,40,40,0.5)';
      bx.fillRect(0, v * H + 3, W, 2);
    });

    // маркировка: крупный бренд и размер, повторённые по кругу
    function ring(v, text, size, repeats, alpha) {
      bx.save();
      bx.font = '700 ' + size + 'px Inter, Arial, sans-serif';
      bx.textAlign = 'center';
      bx.textBaseline = 'middle';
      var step = W / repeats;
      for (var i = 0; i < repeats; i++) {
        var x = step * (i + 0.5);
        bx.fillStyle = 'rgba(12,12,12,' + alpha + ')';      // тень углубления
        bx.fillText(text, x, v * H + 3);
        bx.fillStyle = 'rgba(248,248,248,' + alpha + ')';   // выпуклая надпись
        bx.fillText(text, x, v * H);
      }
      bx.restore();
    }

    ring(0.115, 'SHINLAR', 40, 4, 1.0);
    ring(0.055, '205/55 R16   WINTER', 17, 4, 0.85);
    ring(0.885, 'SHINLAR', 40, 4, 1.0);
    ring(0.945, '205/55 R16   WINTER', 17, 4, 0.85);

    // продольные канавки на беговой дорожке
    [0.34, 0.455, 0.545, 0.66].forEach(function (v) {
      bx.fillStyle = 'rgba(25,25,25,0.85)';
      bx.fillRect(0, v * H, W, 10);
    });

    // ламели — тонкие поперечные прорези
    bx.fillStyle = 'rgba(30,30,30,0.6)';
    for (var i = 0; i < 260; i++) {
      var x = (i / 260) * W;
      bx.fillRect(x, 0.30 * H, 2.5, 0.40 * H);
    }

    // карта шероховатости: боковины глаже, дорожка матовее
    var rc = makeCanvas(W, H), rx = rc.getContext('2d');
    var rg = rx.createLinearGradient(0, 0, 0, H);
    rg.addColorStop(0.00, '#9a9a9a');
    rg.addColorStop(0.20, '#c8c8c8');
    rg.addColorStop(0.50, '#efefef');
    rg.addColorStop(0.80, '#c8c8c8');
    rg.addColorStop(1.00, '#9a9a9a');
    rx.fillStyle = rg;
    rx.fillRect(0, 0, W, H);
    rx.globalAlpha = 0.25;
    rx.drawImage(bc, 0, 0);
    rx.globalAlpha = 1;

    return { bump: texture(bc), rough: texture(rc) };
  }

  /* ── карта для блоков протектора: ламели поперёк блока ── */
  function buildTreadBump() {
    var W = 128, H = 128;
    var c = makeCanvas(W, H), ctx = c.getContext('2d');
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, W, H);
    grain(ctx, W, H, 130, 26);
    ctx.fillStyle = 'rgba(35,35,35,0.85)';
    for (var i = 1; i < 5; i++) {
      ctx.fillRect(0, (i / 5) * H - 3, W, 6);
    }
    return texture(c);
  }

  /* ── лёгкая вариация полировки металла ── */
  function buildMetalRough() {
    var W = 256, H = 256;
    var c = makeCanvas(W, H), ctx = c.getContext('2d');
    ctx.fillStyle = '#5a5a5a';
    ctx.fillRect(0, 0, W, H);
    grain(ctx, W, H, 92, 40);
    ctx.globalAlpha = 0.5;
    for (var i = 0; i < 60; i++) {                  // следы полировки
      ctx.strokeStyle = 'rgba(150,150,150,0.25)';
      ctx.lineWidth = Math.random() * 2 + 0.5;
      ctx.beginPath();
      ctx.moveTo(Math.random() * W, 0);
      ctx.lineTo(Math.random() * W, H);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    return texture(c, 2, 2);
  }

  /* ── тормозной диск: насечки и перфорация ── */
  function buildBrakeMap() {
    var S = 512;
    var c = makeCanvas(S, S), ctx = c.getContext('2d');
    ctx.fillStyle = '#6e6e6e';
    ctx.fillRect(0, 0, S, S);
    var cx = S / 2, cy = S / 2;
    ctx.strokeStyle = 'rgba(120,120,120,0.55)';
    for (var r = 40; r < S / 2; r += 4) {           // концентрические риски
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = '#2a2a2a';                       // перфорация
    for (var i = 0; i < 40; i++) {
      var a = (i / 40) * Math.PI * 2;
      var rad = i % 2 ? 150 : 190;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad, 7, 0, Math.PI * 2);
      ctx.fill();
    }
    return texture(c);
  }

  var tireMaps  = buildTireMaps();
  var treadBump = buildTreadBump();
  var metalRough = buildMetalRough();
  var brakeMap  = buildBrakeMap();

  /* ============================================================
     СВЕТ
     ============================================================ */
  scene.add(new THREE.HemisphereLight(0x2b3137, 0x000000, 0.45));

  var key = new THREE.DirectionalLight(0xffffff, 2.5);
  key.position.set(4, 5.5, 5);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -2.4;
  key.shadow.camera.right = 2.4;
  key.shadow.camera.top = 2.4;
  key.shadow.camera.bottom = -2.4;
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 20;
  key.shadow.bias = -0.0006;
  key.shadow.radius = 2;
  scene.add(key);

  var front = new THREE.DirectionalLight(0xffffff, 1.35);
  front.position.set(0.8, 1.4, 6);
  scene.add(front);

  var rim = new THREE.DirectionalLight(0x3b9eff, 2.6);      // фирменный контровой
  rim.position.set(-5, 1.5, -3.5);
  scene.add(rim);

  var rim2 = new THREE.DirectionalLight(0xbcd6ff, 1.1);
  rim2.position.set(5, -1.5, -4);
  scene.add(rim2);

  var fill = new THREE.DirectionalLight(0xffffff, 0.35);
  fill.position.set(-3, -2.5, 4);
  scene.add(fill);

  /* ============================================================
     МАТЕРИАЛЫ
     ============================================================ */
  var tireMat = new THREE.MeshPhysicalMaterial({
    color: 0x0c0c0d,
    roughness: 0.95,
    metalness: 0.0,
    bumpMap: tireMaps.bump,
    bumpScale: 0.022,
    roughnessMap: tireMaps.rough,
    clearcoat: 0.10,
    clearcoatRoughness: 0.85,
    side: THREE.DoubleSide
  });

  var treadMat = new THREE.MeshStandardMaterial({
    color: 0x0e0e0f,
    roughness: 0.98,
    metalness: 0.0,
    bumpMap: treadBump,
    bumpScale: 0.01
  });

  var rimMat = new THREE.MeshStandardMaterial({
    color: 0xa9afb5, roughness: 0.3, metalness: 1.0,
    roughnessMap: metalRough, envMapIntensity: 1.25
  });
  var rimDark = new THREE.MeshStandardMaterial({
    color: 0x70777d, roughness: 0.42, metalness: 0.95, envMapIntensity: 1.2
  });
  var innerMat = new THREE.MeshStandardMaterial({ color: 0x0f1113, roughness: 0.7, metalness: 0.3 });
  var brakeMat = new THREE.MeshStandardMaterial({
    color: 0x34383b, roughness: 0.68, metalness: 0.8,
    map: brakeMap, roughnessMap: brakeMap, envMapIntensity: 0.45
  });
  var caliperMat = new THREE.MeshStandardMaterial({ color: 0x1b1d1f, roughness: 0.5, metalness: 0.6 });

  /* ============================================================
     ГЕОМЕТРИЯ
     ============================================================ */
  var root  = new THREE.Group();                 // наклон за курсором, покачивание
  var wheel = new THREE.Group();                 // разворот колеса к зрителю
  var spin  = new THREE.Group();                 // вращение
  wheel.rotation.x = Math.PI / 2 * 0.93;
  wheel.rotation.y = 0.16;
  wheel.rotation.z = -0.05;
  wheel.add(spin);
  root.add(wheel);
  scene.add(root);

  var R = 1.58;   // внешний радиус шины
  var W = 0.42;   // полуширина

  /* ── резина ── */
  var profile = [
    [1.19, -0.315], [1.23, -0.362], [1.28, -0.392], [1.34, -0.408],
    [1.385, -0.398], [1.425, -0.410],
    [1.47, -0.402], [1.515, -0.360], [1.552, -0.278],
    [1.572, -0.165], [R, 0.0],
    [1.572, 0.165], [1.552, 0.278], [1.515, 0.360],
    [1.47, 0.402], [1.425, 0.410], [1.385, 0.398],
    [1.34, 0.408], [1.28, 0.392], [1.23, 0.362], [1.19, 0.315]
  ].map(function (p) { return new THREE.Vector2(p[0], p[1] * (W / 0.42)); });

  var tire = new THREE.Mesh(new THREE.LatheGeometry(profile, 128), tireMat);
  tire.castShadow = true;
  tire.receiveShadow = true;
  spin.add(tire);

  /* ── блоки протектора: скруглённые, с переменным шагом ──
     Переменный шаг (pitch variation) — так делают на настоящих шинах,
     чтобы убрать гул; заодно рисунок перестаёт выглядеть штампованным. */
  function roundedBlock(w, h, d, r) {
    var s = new THREE.Shape();
    s.moveTo(-w / 2 + r, -h / 2);
    s.lineTo(w / 2 - r, -h / 2);
    s.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
    s.lineTo(w / 2, h / 2 - r);
    s.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
    s.lineTo(-w / 2 + r, h / 2);
    s.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
    s.lineTo(-w / 2, -h / 2 + r);
    s.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
    var g = new THREE.ExtrudeGeometry(s, {
      depth: d, bevelEnabled: true, bevelThickness: 0.012,
      bevelSize: 0.012, bevelSegments: 2, curveSegments: 4
    });
    g.translate(0, 0, -d / 2);
    return g;
  }

  var pitch = [1.0, 0.84, 1.16, 0.92, 1.08];      // цикл длин блоков
  var rows = [
    { y: -0.300, w: 0.150, h: 0.150, tilt: 0.00 },   // плечевой ряд
    { y: -0.103, w: 0.128, h: 0.126, tilt: 0.34 },
    { y:  0.103, w: 0.128, h: 0.126, tilt: -0.34 },
    { y:  0.300, w: 0.150, h: 0.150, tilt: 0.00 }
  ];

  var dummy = new THREE.Object3D();
  dummy.rotation.order = 'YZX';

  rows.forEach(function (row, ri) {
    var geo = roundedBlock(row.w, row.h, 0.075, 0.028);
    var steps = [], total = 0, i;
    for (i = 0; i < 44; i++) {
      var p = pitch[(i + ri) % pitch.length];
      steps.push(p);
      total += p;
    }

    var mesh = new THREE.InstancedMesh(geo, treadMat, steps.length);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    var acc = ri * 0.13;                            // ряды сдвинуты друг относительно друга
    for (i = 0; i < steps.length; i++) {
      var a = (acc / total) * Math.PI * 2;
      acc += steps[i];
      dummy.position.set(
        Math.sin(a) * (R + 0.006),
        row.y * (W / 0.42),
        Math.cos(a) * (R + 0.006)
      );
      dummy.rotation.set(0, a, row.tilt);
      dummy.scale.set(0.92 + steps[i] * 0.08, 1, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    spin.add(mesh);
  });

  /* ── диск ── */
  var rimProfile = [
    [1.212, -0.318], [1.16, -0.262], [1.14, -0.195],
    [1.132, 0.0], [1.14, 0.195], [1.16, 0.262], [1.212, 0.318]
  ].map(function (p) { return new THREE.Vector2(p[0], p[1] * (W / 0.42)); });
  var rimBarrel = new THREE.Mesh(new THREE.LatheGeometry(rimProfile, 128), rimMat);
  rimBarrel.material.side = THREE.DoubleSide;
  rimBarrel.castShadow = true;
  rimBarrel.receiveShadow = true;
  spin.add(rimBarrel);

  var lip = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.05, 20, 128), rimMat);
  lip.rotation.x = Math.PI / 2;
  lip.position.y = 0.255;
  lip.castShadow = true;
  spin.add(lip);

  // тормозной диск и суппорт видны в окнах между спицами
  var brake = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.07, 64), brakeMat);
  brake.position.y = -0.10;
  brake.receiveShadow = true;
  spin.add(brake);

  var hat = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.46, 0.14, 40), innerMat);
  hat.position.y = -0.05;
  spin.add(hat);

  var caliper = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.42), caliperMat);
  caliper.position.set(-0.74, -0.08, 0.32);
  caliper.rotation.y = -0.6;
  caliper.castShadow = true;
  wheel.add(caliper);                              // суппорт не вращается вместе с колесом

  // пять спиц-лопастей
  var shape = new THREE.Shape();
  shape.moveTo(-0.185, 0.22);
  shape.lineTo(0.185, 0.22);
  shape.quadraticCurveTo(0.165, 0.75, 0.125, 1.12);
  shape.lineTo(-0.125, 1.12);
  shape.quadraticCurveTo(-0.165, 0.75, -0.185, 0.22);

  var spokeGeo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.10, bevelEnabled: true, bevelThickness: 0.026,
    bevelSize: 0.026, bevelSegments: 3, curveSegments: 16
  });

  for (var k = 0; k < 5; k++) {
    var ang = (k / 5) * Math.PI * 2;
    var holder = new THREE.Group();
    holder.rotation.y = ang;

    var spoke = new THREE.Mesh(spokeGeo, rimMat);
    spoke.rotation.x = Math.PI / 2;
    spoke.position.y = 0.20;
    spoke.castShadow = true;
    spoke.receiveShadow = true;
    holder.add(spoke);
    spin.add(holder);

    // гайка в утопленной лунке
    var seat = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.062, 0.04, 20), innerMat);
    seat.position.set(Math.sin(ang + 0.628) * 0.205, 0.243, Math.cos(ang + 0.628) * 0.205);
    spin.add(seat);

    var nut = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.04, 0.05, 6), rimDark);
    nut.position.set(Math.sin(ang + 0.628) * 0.205, 0.252, Math.cos(ang + 0.628) * 0.205);
    nut.castShadow = true;
    spin.add(nut);
  }

  var hub = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.34, 0.2, 56), rimMat);
  hub.position.y = 0.16;
  hub.castShadow = true;
  hub.receiveShadow = true;
  spin.add(hub);

  var cap = new THREE.Mesh(new THREE.CylinderGeometry(0.135, 0.145, 0.05, 36), rimDark);
  cap.position.y = 0.275;
  spin.add(cap);

  // вентиль
  var valve = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.03, 0.10, 12), rimDark);
  valve.position.set(Math.sin(1.9) * 0.78, 0.235, Math.cos(1.9) * 0.78);
  valve.castShadow = true;
  spin.add(valve);

  /* ============================================================
     РАЗМЕРЫ, ВЗАИМОДЕЙСТВИЕ, ЦИКЛ
     ============================================================ */
  function resize() {
    var w = stage.clientWidth || 1;
    var h = stage.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;

    var need = 1.82;
    var vFov = THREE.MathUtils.degToRad(camera.fov);
    var distV = need / Math.tan(vFov / 2);
    var hFov  = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
    var distH = need / Math.tan(hFov / 2);
    camera.position.z = Math.max(distV, distH);
    camera.updateProjectionMatrix();
  }
  resize();

  if (window.ResizeObserver) new ResizeObserver(resize).observe(stage);
  else window.addEventListener('resize', resize);

  var pointer = { x: 0, y: 0 }, tilt = { x: 0, y: 0 };
  if (!reduceMotion) {
    window.addEventListener('pointermove', function (e) {
      pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
    }, { passive: true });
  }

  var boost = 0, lastScroll = window.scrollY;
  window.addEventListener('scroll', function () {
    var d = window.scrollY - lastScroll;
    lastScroll = window.scrollY;
    boost = Math.max(-4, Math.min(4, boost + d * 0.012));
  }, { passive: true });

  var visible = true;
  if (window.IntersectionObserver) {
    new IntersectionObserver(function (entries) { visible = entries[0].isIntersecting; },
      { threshold: 0 }).observe(stage);
  }

  var clock = new THREE.Clock();

  function frame() {
    var dt = Math.min(clock.getDelta(), 0.05);

    if (visible) {
      if (!reduceMotion) {
        spin.rotation.y += (0.3 + boost) * dt;
        boost *= 0.94;

        tilt.x += (pointer.y * 0.10 - tilt.x) * 0.05;
        tilt.y += (pointer.x * 0.20 - tilt.y) * 0.05;
        root.rotation.x = tilt.x;
        root.rotation.y = tilt.y;
        root.position.y = Math.sin(clock.elapsedTime * 0.7) * 0.045;
      }
      renderer.render(scene, camera);
    }
    requestAnimationFrame(frame);
  }

  if (reduceMotion) renderer.render(scene, camera);
  requestAnimationFrame(frame);
})();
