/**
 * The page that draws the 3D exercise figure: three.js in a WebView on a
 * phone, in an iframe on the web build. The joints come from the app
 * (src/exercises/demoPoses.js, sampled by demoFrames below), so the page
 * only builds a mannequin, lights it and plays the frames.
 *
 * three.js comes from a CDN, like MediaPipe on the camera page; the WebView
 * caches it after the first time. If it cannot load, the page says so and the
 * app falls back to the flat figure.
 *
 * Messages to the app: {type:'ready'} once drawing, {type:'error'} on failure.
 * The app calls window.setSpeed(x) for slow motion.
 *
 * Pure strings and maths, no React Native imports.
 */

import { framesAt, hasDumbbells, propBoxes, sceneBounds } from '../exercises/demoPoses';

const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.159.0/build/three.min.js';

export const JOINTS = [
  'pelvis', 'neck', 'head',
  'shoulderL', 'elbowL', 'handL', 'hipL', 'kneeL', 'ankleL', 'toeL',
  'shoulderR', 'elbowR', 'handR', 'hipR', 'kneeR', 'ankleR', 'toeR',
];

const FPS = 30;
const round = (v) => Math.round(v * 1000) / 1000;

/** The demo loop sampled at 30 fps, each frame the joints flattened in JOINTS order. */
export function demoFrames(demo) {
  const count = Math.max(2, Math.round((demo.period / 1000) * FPS));
  const frames = [];
  for (let i = 0; i < count; i++) {
    const j = framesAt(demo, (demo.period * i) / count);
    frames.push(JOINTS.flatMap((name) => j[name].map(round)));
  }
  return {
    frames,
    periodMs: demo.period,
    yaw: demo.yaw,
    bounds: sceneBounds(demo),
    boxes: propBoxes(demo),
    dumbbells: hasDumbbells(demo),
  };
}

/**
 * The whole page for one exercise. `colors` are the app's theme tokens.
 * `lite` is for the small figure shown during a set, next to the camera's own
 * page: fewer pixels and a coarser shadow, so pose detection keeps its frames.
 */
export function demoPageHtml(demo, colors, { lite = false } = {}) {
  const data = JSON.stringify(demoFrames(demo));
  return `<!doctype html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>
  html,body{margin:0;height:100%;overflow:hidden;background:${colors.surface};touch-action:none;
    -webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent}
  canvas{display:block;width:100%;height:100%}
</style>
</head><body>
<script>
  function send(msg) {
    var s = JSON.stringify(msg);
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(s);
    else if (window.parent !== window) window.parent.postMessage(s, '*');
  }
  window.onerror = function () { send({ type: 'error' }); };
</script>
<script src="${THREE_URL}" onerror="send({type:'error'})"></script>
<script>
(function () {
  if (!window.THREE) { send({ type: 'error' }); return; }
  var D = ${data};
  var JOINTS = ${JSON.stringify(JOINTS)};
  var speed = 1;
  window.setSpeed = function (x) { speed = x; };

  var renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, ${lite ? 1.25 : 2}));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  document.body.appendChild(renderer.domElement);

  var scene = new THREE.Scene();
  scene.background = new THREE.Color('${colors.surface}');
  var cx = D.bounds.center[0], cz = D.bounds.center[1];
  var size = Math.max(D.bounds.height, D.bounds.radius * 2);
  scene.fog = new THREE.Fog('${colors.surface}', size * 2.5, size * 6);

  // Light: a soft sky, a key light that casts the shadow, a cool rim from behind.
  scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x1a1a20, 1.1));
  var key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(cx + 2.5, 4.5, cz + 3);
  key.target.position.set(cx, 0, cz);
  key.castShadow = true;
  key.shadow.mapSize.set(${lite ? 512 : 1024}, ${lite ? 512 : 1024});
  var sc = key.shadow.camera;
  sc.left = sc.bottom = -size; sc.right = sc.top = size; sc.near = 0.5; sc.far = 12;
  key.shadow.bias = -0.0005;
  key.shadow.normalBias = 0.02;
  key.shadow.radius = 4;
  scene.add(key, key.target);
  var rim = new THREE.DirectionalLight(0x9fc4ff, 0.9);
  rim.position.set(cx - 3, 2.5, cz - 3);
  scene.add(rim);

  // Floor: a disc that fades into the background, with a faint ring.
  var floor = new THREE.Mesh(
    new THREE.CircleGeometry(size * 6, 64),
    new THREE.MeshStandardMaterial({ color: '${colors.surfaceAlt}', roughness: 0.95 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(cx, 0, cz);
  floor.receiveShadow = true;
  scene.add(floor);
  var ring = new THREE.Mesh(
    new THREE.RingGeometry(D.bounds.radius * 0.98, D.bounds.radius, 64),
    new THREE.MeshBasicMaterial({ color: '${colors.border}' })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(cx, 0.002, cz);
  scene.add(ring);

  // Props: benches, chairs, a wall.
  var propMat = new THREE.MeshStandardMaterial({ color: 0x4a4a55, roughness: 0.7 });
  D.boxes.forEach(function (b) {
    var m = new THREE.Mesh(new THREE.BoxGeometry(b.w * 2, b.h, b.d * 2), propMat);
    m.position.set(b.x, b.h / 2, b.z);
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
  });

  // The mannequin: smooth capsules for the limbs, darker spheres at the joints.
  var skin = new THREE.MeshStandardMaterial({ color: 0xe9e4dc, roughness: 0.45, metalness: 0.05 });
  // Limbs a shade apart, so left and right still tell apart when turned; the
  // hinge balls carry the colour.
  var left = new THREE.MeshStandardMaterial({ color: 0xe3e6df, roughness: 0.45, metalness: 0.05 });
  var right = new THREE.MeshStandardMaterial({ color: 0xd9dde6, roughness: 0.45, metalness: 0.05 });
  var jointL = new THREE.MeshStandardMaterial({ color: '${colors.accent}', roughness: 0.4 });
  var jointR = new THREE.MeshStandardMaterial({ color: 0x60a5fa, roughness: 0.4 });
  var joint = new THREE.MeshStandardMaterial({ color: 0x6b6b76, roughness: 0.5 });
  var weight = new THREE.MeshStandardMaterial({ color: 0x30303a, roughness: 0.35, metalness: 0.6 });

  function mesh(geo, mat) {
    var m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    m.receiveShadow = true;
    m.matrixAutoUpdate = false;
    scene.add(m);
    return m;
  }
  // Bone lengths never change (the poses are angles), so each capsule is built
  // to its bone's length once and only moved after that.
  var F0 = D.frames[0];
  function at0(n) { var o = JOINTS.indexOf(n) * 3; return new THREE.Vector3(F0[o], F0[o + 1], F0[o + 2]); }
  function bone(a, b, r, mat) {
    var len = Math.max(0.01, at0(a).distanceTo(at0(b)));
    return { a: a, b: b, m: mesh(new THREE.CapsuleGeometry(r, len, 8, 16), mat) };
  }
  var bones = [
    bone('hipL', 'kneeL', 0.072, left), bone('kneeL', 'ankleL', 0.055, left), bone('ankleL', 'toeL', 0.04, left),
    bone('hipR', 'kneeR', 0.072, right), bone('kneeR', 'ankleR', 0.055, right), bone('ankleR', 'toeR', 0.04, right),
    bone('shoulderL', 'elbowL', 0.05, left), bone('elbowL', 'handL', 0.042, left),
    bone('shoulderR', 'elbowR', 0.05, right), bone('elbowR', 'handR', 0.042, right),
    bone('neck', 'head', 0.045, skin),
  ];
  var balls = ['elbowL', 'elbowR', 'kneeL', 'kneeR', 'shoulderL', 'shoulderR', 'hipL', 'hipR'].map(function (n) {
    var mat = n.indexOf('shoulder') === 0 || n.indexOf('hip') === 0 ? joint : n.slice(-1) === 'L' ? jointL : jointR;
    // A little fatter than the bones they join, or the two surfaces flicker.
    var r = { elb: 0.06, kne: 0.082, sho: 0.068, hip: 0.09 }[n.slice(0, 3)];
    return { n: n, r: r, m: mesh(new THREE.SphereGeometry(1, 16, 12), mat) };
  });
  var hands = ['handL', 'handR'].map(function (n) {
    return { n: n, m: mesh(new THREE.SphereGeometry(0.048, 16, 12), skin) };
  });
  var head = mesh(new THREE.SphereGeometry(1, 32, 24), skin);
  var chest = mesh(new THREE.SphereGeometry(1, 32, 24), skin);
  var belly = mesh(new THREE.SphereGeometry(1, 32, 24), skin);
  var bells = D.dumbbells ? ['handL', 'handR'].map(function (n) {
    return { n: n, m: mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.26, 16), weight) };
  }) : [];

  var P = {};
  JOINTS.forEach(function (n) { P[n] = new THREE.Vector3(); });
  var up = new THREE.Vector3(), side = new THREE.Vector3(), fwd = new THREE.Vector3();
  var basis = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3();

  // Place a mesh at 'at' with local y along 'y', local x near 'x', scaled by (sx, sy, sz).
  function orient(m, at, y, x, sx, sy, sz) {
    up.copy(y).normalize();
    side.copy(x).addScaledVector(up, -x.dot(up));
    if (side.lengthSq() < 1e-6) side.set(1, 0, 0).addScaledVector(up, -up.x);
    side.normalize();
    fwd.crossVectors(side, up);
    basis.makeBasis(side, up, fwd);
    q.setFromRotationMatrix(basis);
    s.set(sx, sy, sz);
    m.matrix.compose(at, q, s);
  }

  function pose(t) {
    var n = D.frames.length;
    var f = t * n, i = Math.floor(f) % n, k = f - Math.floor(f);
    var a = D.frames[i], b = D.frames[(i + 1) % n];
    for (var j = 0; j < JOINTS.length; j++) {
      var o = j * 3;
      P[JOINTS[j]].set(
        a[o] + (b[o] - a[o]) * k,
        a[o + 1] + (b[o + 1] - a[o + 1]) * k,
        a[o + 2] + (b[o + 2] - a[o + 2]) * k
      );
    }
    var shoulderLine = P.shoulderL.clone().sub(P.shoulderR);
    bones.forEach(function (bn) {
      var A = P[bn.a], B = P[bn.b];
      orient(bn.m, A.clone().add(B).multiplyScalar(0.5), B.clone().sub(A), shoulderLine, 1, 1, 1);
    });
    balls.forEach(function (bl) {
      bl.m.matrix.compose(P[bl.n], q.identity(), s.set(bl.r, bl.r, bl.r));
    });
    hands.forEach(function (h) { h.m.matrix.compose(P[h.n], q.identity(), s.set(1, 1, 1)); });

    var spine = P.neck.clone().sub(P.pelvis);
    var hipLine = P.hipL.clone().sub(P.hipR);
    // Chest: an ellipsoid between the shoulders, a little below the neck.
    var chestAt = P.pelvis.clone().addScaledVector(spine, 0.68);
    orient(chest, chestAt, spine, shoulderLine, 0.17, 0.21, 0.11);
    // Belly and hips: a narrower ellipsoid above the pelvis.
    var bellyAt = P.pelvis.clone().addScaledVector(spine, 0.2);
    orient(belly, bellyAt, spine, hipLine, 0.14, 0.17, 0.1);
    orient(head, P.head, spine, shoulderLine, 0.095, 0.115, 0.1);
    bells.forEach(function (bl) {
      orient(bl.m, P[bl.n], shoulderLine, spine, 1, 1, 1);
    });
  }

  // Camera: sways around the exercise's best angle; a drag turns it by hand.
  var camera = new THREE.PerspectiveCamera(32, 1, 0.05, 50);
  var elev = 14 * Math.PI / 180;
  var targetY = D.bounds.height * 0.42;
  var manualYaw = null, dragX = 0, dragYaw = 0, currentYaw = D.yaw;
  var el = renderer.domElement;
  var dragging = false;
  el.addEventListener('pointerdown', function (e) {
    dragging = true; dragX = e.clientX; dragYaw = currentYaw; manualYaw = currentYaw;
    if (el.setPointerCapture) el.setPointerCapture(e.pointerId);
  });
  el.addEventListener('pointermove', function (e) {
    if (dragging) manualYaw = dragYaw - (e.clientX - dragX) * 0.6;
  });
  ['pointerup', 'pointercancel'].forEach(function (t) {
    el.addEventListener(t, function () { dragging = false; });
  });

  function resize() {
    var w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Far enough back that the whole loop fits whichever way it is turned.
    var halfFov = (camera.fov * Math.PI / 180) / 2;
    var needV = (D.bounds.height * 0.62 + 0.15) / Math.tan(halfFov);
    var needH = (D.bounds.radius + 0.15) / (Math.tan(halfFov) * camera.aspect);
    camera.userData.dist = Math.max(needV, needH) + D.bounds.radius * 0.7;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  var loopMs = 0, wall = 0, last = null, sent = false;
  function frame(now) {
    if (last !== null) {
      var dt = Math.min(64, now - last);
      loopMs += dt * speed;
      wall += dt;
    }
    last = now;
    currentYaw = manualYaw !== null ? manualYaw : D.yaw + 35 * Math.sin(wall / 9000 * 2 * Math.PI);
    var yaw = currentYaw * Math.PI / 180, d = camera.userData.dist;
    camera.position.set(cx + Math.sin(yaw) * Math.cos(elev) * d, targetY + Math.sin(elev) * d, cz + Math.cos(yaw) * Math.cos(elev) * d);
    camera.lookAt(cx, targetY, cz);
    pose((loopMs % D.periodMs) / D.periodMs);
    renderer.render(scene, camera);
    if (!sent) { sent = true; send({ type: 'ready' }); }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
</script>
</body></html>`;
}
