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
 * The figure is a rigged human (MODEL_URL, a skinned mesh with a full
 * skeleton, CC0, from Mesh2Motion / Quaternius), posed every frame by turning
 * its bones toward the demo's joints: each upper arm, forearm, thigh, shin and
 * foot points where the stick figure's does, the pelvis turns with the hips
 * and the spine and neck follow the back. If the model cannot load, the page
 * draws its own porcelain mannequin from the same joints instead.
 *
 * Messages to the app: {type:'ready'} once drawing, {type:'error'} on failure.
 * The app calls window.setSpeed(x) for slow motion.
 *
 * Pure strings and maths, no React Native imports.
 */

import { framesAt, hasDumbbells, propBoxes, sceneBounds } from '../exercises/demoPoses';

const THREE_BASE = 'https://cdn.jsdelivr.net/npm/three@0.159.0';
/** Published from docs/models/ by GitHub Pages, like the pose page. */
export const MODEL_URL = 'https://betuanminh22032003.github.io/push-up/models/human.glb';

export const JOINTS = [
  'pelvis', 'neck', 'head', 'face',
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
<script type="importmap">{"imports":{"three":"${THREE_BASE}/build/three.module.js","three/addons/":"${THREE_BASE}/examples/jsm/"}}</script>
<script>
function start(THREE, GLTFLoader) {
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
  renderer.toneMappingExposure = 1.05;
  document.body.appendChild(renderer.domElement);

  var scene = new THREE.Scene();
  var cx = D.bounds.center[0], cz = D.bounds.center[1];
  var size = Math.max(D.bounds.height, D.bounds.radius * 2);

  function gradient(w, h, paint) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    paint(c.getContext('2d'), w, h);
    var tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }
  // A studio backdrop: lighter behind the figure, darker towards the top.
  scene.background = gradient(4, 256, function (g, w, h) {
    var grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#0d0d10');
    grad.addColorStop(0.55, '#1d1e24');
    grad.addColorStop(1, '${colors.surface}');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
  });

  // Three-point light: a warm key that casts the shadow, a cool fill, a rim.
  scene.add(new THREE.HemisphereLight(0xe8eeff, 0x202026, 0.75));
  var key = new THREE.DirectionalLight(0xfff1e2, 2.6);
  key.position.set(cx + 2.2, 4.8, cz + 2.8);
  key.target.position.set(cx, 0, cz);
  key.castShadow = true;
  key.shadow.mapSize.set(${lite ? 512 : 1024}, ${lite ? 512 : 1024});
  var sc = key.shadow.camera;
  sc.left = sc.bottom = -size; sc.right = sc.top = size; sc.near = 0.5; sc.far = 12;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  key.shadow.radius = 5;
  scene.add(key, key.target);
  var fill = new THREE.DirectionalLight(0xc8dcff, 0.7);
  fill.position.set(cx - 3, 2, cz + 2.5);
  scene.add(fill);
  var rim = new THREE.DirectionalLight(0xa9c8ff, 1.4);
  rim.position.set(cx - 1.5, 3, cz - 3.5);
  scene.add(rim);

  // Floor: a pool of light under the figure fading into the dark, so there is
  // no edge to see; it still takes the shadow.
  var floorTex = gradient(256, 256, function (g, w, h) {
    var grad = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    grad.addColorStop(0, 'rgba(58,60,70,1)');
    grad.addColorStop(0.55, 'rgba(36,37,44,0.9)');
    grad.addColorStop(1, 'rgba(19,19,22,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
  });
  var floor = new THREE.Mesh(
    new THREE.CircleGeometry(size * 1.5, 64),
    new THREE.MeshStandardMaterial({ map: floorTex, transparent: true, roughness: 0.9, depthWrite: false })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(cx, 0, cz);
  floor.receiveShadow = true;
  scene.add(floor);
  var ring = new THREE.Mesh(
    new THREE.RingGeometry(D.bounds.radius * 0.985, D.bounds.radius, 96),
    new THREE.MeshBasicMaterial({ color: '${colors.accent}', transparent: true, opacity: 0.18 })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(cx, 0.002, cz);
  scene.add(ring);

  // Props: benches, chairs, a wall.
  var propMat = new THREE.MeshStandardMaterial({ color: 0x3d3f4a, roughness: 0.6 });
  D.boxes.forEach(function (b) {
    var m = new THREE.Mesh(new THREE.BoxGeometry(b.w * 2, b.h, b.d * 2), propMat);
    m.position.set(b.x, b.h / 2, b.z);
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
  });

  // --- the mannequin -------------------------------------------------------
  // A porcelain finish; the elbow and knee hinges tell left (green) from
  // right (blue) when it turns.
  var skin = new THREE.MeshPhysicalMaterial({ color: 0xe9e2d7, roughness: 0.38, clearcoat: 0.35, clearcoatRoughness: 0.45 });
  var shade = new THREE.MeshPhysicalMaterial({ color: 0xd2c9bb, roughness: 0.42, clearcoat: 0.25 });
  var jointL = new THREE.MeshStandardMaterial({ color: 0x5ee39a, roughness: 0.35 });
  var jointR = new THREE.MeshStandardMaterial({ color: 0x74aef7, roughness: 0.35 });
  var visorMat = new THREE.MeshPhysicalMaterial({ color: 0x15161b, roughness: 0.15, clearcoat: 1, metalness: 0.2 });
  var ironMat = new THREE.MeshStandardMaterial({ color: 0x2b2c33, roughness: 0.35, metalness: 0.7 });

  function mesh(geo, mat) {
    var m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    m.receiveShadow = true;
    m.matrixAutoUpdate = false;
    scene.add(m);
    return m;
  }
  var SPHERE = new THREE.SphereGeometry(1, 32, 20);
  function ball(mat) { return mesh(SPHERE, mat); }

  // Limbs taper from the near joint to the far one: a unit-height cylinder,
  // wide end at the bottom, stretched along the bone every frame.
  function limb(a, b, rNear, rFar) {
    return { a: a, b: b, m: mesh(new THREE.CylinderGeometry(rFar, rNear, 1, 24, 1, true), skin) };
  }
  var limbs = [];
  var joints = [];
  ['L', 'R'].forEach(function (side) {
    var hinge = side === 'L' ? jointL : jointR;
    limbs.push(
      limb('shoulder' + side, 'elbow' + side, 0.054, 0.041),
      limb('elbow' + side, 'hand' + side, 0.04, 0.029),
      limb('hip' + side, 'knee' + side, 0.08, 0.054),
      limb('knee' + side, 'ankle' + side, 0.053, 0.035)
    );
    joints.push(
      { n: 'shoulder' + side, r: 0.064, m: ball(skin) },
      { n: 'elbow' + side, r: 0.045, m: ball(hinge) },
      { n: 'knee' + side, r: 0.059, m: ball(hinge) },
      { n: 'ankle' + side, r: 0.038, m: ball(shade) },
      { n: 'hip' + side, r: 0.078, m: ball(skin) }
    );
  });
  var neckM = mesh(new THREE.CylinderGeometry(0.042, 0.05, 1, 20, 1, true), skin);
  var head = ball(skin), visor = ball(visorMat);
  var chest = ball(skin), waist = ball(shade), hips = ball(skin);
  var hands = ['L', 'R'].map(function (side) { return { s: side, m: ball(skin) }; });
  var feet = ['L', 'R'].map(function (side) { return { s: side, m: ball(skin) }; });
  var bells = D.dumbbells ? ['L', 'R'].map(function (side) {
    return {
      s: side,
      bar: mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.2, 12), ironMat),
      a: mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.045, 24), ironMat),
      b: mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.045, 24), ironMat),
    };
  }) : [];

  var P = {};
  JOINTS.forEach(function (n) { P[n] = new THREE.Vector3(); });
  var bx = new THREE.Vector3(), by = new THREE.Vector3(), bz = new THREE.Vector3();
  var basis = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  function V(x, y, z) { return new THREE.Vector3(x || 0, y || 0, z || 0); }

  // Place a mesh at 'at', local y along 'y' and local x as near 'x' as can be.
  function orient(m, at, y, x, sx, sy, sz) {
    by.copy(y).normalize();
    bx.copy(x).addScaledVector(by, -x.dot(by));
    if (bx.lengthSq() < 1e-6) bx.set(1, 0, 0).addScaledVector(by, -by.x);
    if (bx.lengthSq() < 1e-6) bx.set(0, 0, 1);
    bx.normalize();
    bz.crossVectors(bx, by);
    basis.makeBasis(bx, by, bz);
    q.setFromRotationMatrix(basis);
    m.matrix.compose(at, q, s.set(sx, sy, sz));
  }
  // The same, with local z (the front) towards 'z'.
  function face(m, at, y, z, sx, sy, sz) {
    orient(m, at, y, V().crossVectors(y, z), sx, sy, sz);
  }
  function horizontal(v) { return V(v.x, 0, v.z); }

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
    var spine = V().subVectors(P.neck, P.pelvis);
    var shoulders = V().subVectors(P.shoulderL, P.shoulderR);
    var hipLine = V().subVectors(P.hipL, P.hipR);
    var look = V().subVectors(P.face, P.head);

    limbs.forEach(function (l) {
      var A = P[l.a], B = P[l.b];
      var d = V().subVectors(B, A);
      orient(l.m, V().addVectors(A, B).multiplyScalar(0.5), d, shoulders, 1, d.length(), 1);
    });
    joints.forEach(function (jt) { jt.m.matrix.compose(P[jt.n], q.identity(), s.set(jt.r, jt.r, jt.r)); });

    // Trunk: hips, a narrower waist, a broad chest, each square to the body.
    orient(hips, V().copy(P.pelvis).addScaledVector(spine, 0.05), spine, hipLine, 0.165, 0.12, 0.11);
    orient(waist, V().copy(P.pelvis).addScaledVector(spine, 0.33), spine, V().addVectors(hipLine, shoulders), 0.125, 0.15, 0.092);
    orient(chest, V().copy(P.pelvis).addScaledVector(spine, 0.7), spine, shoulders, 0.175, 0.2, 0.112);
    var headUp = V().subVectors(P.head, P.neck);
    orient(neckM, V().copy(P.neck).addScaledVector(headUp, 0.35), headUp, shoulders, 1, headUp.length() * 0.9, 1);
    face(head, P.head, headUp, look, 0.088, 0.112, 0.1);
    // The visor shows which way the face looks.
    var lookN = look.clone().normalize(), upN = headUp.clone().normalize();
    face(visor, V().copy(P.head).addScaledVector(lookN, 0.072).addScaledVector(upN, 0.018), headUp, look, 0.066, 0.034, 0.036);

    hands.forEach(function (h) {
      var hand = P['hand' + h.s];
      var dir = V().subVectors(hand, P['elbow' + h.s]).normalize();
      var onFloor = hand.y < 0.07;
      // On the floor a hand lies flat, fingers ahead; elsewhere it carries on the forearm.
      if (onFloor) {
        var ahead = horizontal(look);
        if (ahead.lengthSq() < 0.002) ahead = horizontal(spine);
        if (ahead.lengthSq() > 1e-6) dir = ahead.normalize();
      }
      var at = V().copy(hand).addScaledVector(dir, 0.045);
      if (onFloor) at.y = Math.max(at.y, 0.022);
      orient(h.m, at, dir, shoulders, 0.04, 0.072, 0.024);
    });
    feet.forEach(function (ft) {
      var ankle = P['ankle' + ft.s];
      var dir = V().subVectors(P['toe' + ft.s], ankle);
      var len = dir.length();
      dir.normalize();
      var at = V().copy(ankle).addScaledVector(dir, len * 0.42);
      // The sole sits a little below the line from ankle to toe.
      var down = V().crossVectors(dir, V().crossVectors(V(0, 1, 0), dir));
      if (down.y > 0) down.negate();
      if (down.lengthSq() > 1e-6) at.addScaledVector(down.normalize(), 0.018);
      orient(ft.m, at, dir, hipLine, 0.046, len * 0.68, 0.034);
    });
    bells.forEach(function (bl) {
      var hand = P['hand' + bl.s];
      var axis = shoulders.clone().normalize();
      var grip = V().copy(hand).addScaledVector(V().subVectors(hand, P['elbow' + bl.s]).normalize(), 0.03);
      orient(bl.bar, grip, axis, spine, 1, 1, 1);
      orient(bl.a, V().copy(grip).addScaledVector(axis, 0.09), axis, spine, 1, 1, 1);
      orient(bl.b, V().copy(grip).addScaledVector(axis, -0.09), axis, spine, 1, 1, 1);
    });
  }

  // Camera: sways around the exercise's best angle; a drag turns it by hand.
  var camera = new THREE.PerspectiveCamera(32, 1, 0.05, 50);
  var elev = 14 * Math.PI / 180;
  var targetY = D.bounds.height / 2;
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
    // Far enough back that the sphere around the whole loop fits the narrower
    // way of the view: then no turn of the camera can cut the figure off.
    var halfV = (camera.fov * Math.PI / 180) / 2;
    var halfH = Math.atan(Math.tan(halfV) * camera.aspect);
    var r = Math.hypot(D.bounds.radius, D.bounds.height / 2);
    camera.userData.dist = (r * 1.04) / Math.sin(Math.min(halfV, halfH));
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

  // --- the human ---------------------------------------------------------------
  // Bone -> [descendant it is aimed by, from joint, to joint], parents first.
  var AIMS = [
    ['spine_01', 'neck_01', 'pelvis', 'neck'],
    ['neck_01', 'head_leaf', 'neck', 'head'],
    ['upperarm_l', 'lowerarm_l', 'shoulderL', 'elbowL'],
    ['lowerarm_l', 'hand_l', 'elbowL', 'handL'],
    ['upperarm_r', 'lowerarm_r', 'shoulderR', 'elbowR'],
    ['lowerarm_r', 'hand_r', 'elbowR', 'handR'],
    ['thigh_l', 'calf_l', 'hipL', 'kneeL'],
    ['calf_l', 'foot_l', 'kneeL', 'ankleL'],
    ['foot_l', 'ball_l', 'ankleL', 'toeL'],
    ['thigh_r', 'calf_r', 'hipR', 'kneeR'],
    ['calf_r', 'foot_r', 'kneeR', 'ankleR'],
    ['foot_r', 'ball_r', 'ankleR', 'toeR'],
  ];
  // Where the body meets the floor, model bone against demo joint.
  var CONTACTS = [['foot_l', 'ankleL'], ['foot_r', 'ankleR'], ['ball_l', 'toeL'], ['ball_r', 'toeR'], ['hand_l', 'handL'], ['hand_r', 'handR']];
  var human = null, bones = {}, rest = {}, restPelvisWorld = null;
  var tA = new THREE.Vector3(), tB = new THREE.Vector3(), tD = new THREE.Vector3();
  var qA = new THREE.Quaternion(), qB = new THREE.Quaternion(), qC = new THREE.Quaternion();
  var mB = new THREE.Matrix4();

  function setupHuman(gltf) {
    human = gltf.scene;
    human.traverse(function (o) {
      if (o.isBone) bones[o.name] = o;
      if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; }
    });
    for (var i = 0; i < AIMS.length; i++) if (!bones[AIMS[i][0]] || !bones[AIMS[i][1]]) throw new Error('rig');
    Object.keys(bones).forEach(function (n) { rest[n] = bones[n].quaternion.clone(); });
    human.updateMatrixWorld(true);
    // Same leg length as the demo's figure, so the joints line up.
    var w = function (n) { return bones[n].getWorldPosition(new THREE.Vector3()); };
    var modelLeg = w('thigh_l').distanceTo(w('calf_l')) + w('calf_l').distanceTo(w('foot_l'));
    basePose(0);
    var demoLeg = P.hipL.distanceTo(P.kneeL) + P.kneeL.distanceTo(P.ankleL);
    human.scale.setScalar(demoLeg / modelLeg);
    human.updateMatrixWorld(true);
    restPelvisWorld = bones.pelvis.getWorldQuaternion(new THREE.Quaternion());
    scene.add(human);
    // The mannequin made of shapes steps aside; the dumbbells stay.
    limbs.forEach(function (l) { l.m.visible = false; });
    joints.forEach(function (j) { j.m.visible = false; });
    hands.concat(feet).forEach(function (h) { h.m.visible = false; });
    [neckM, head, visor, chest, waist, hips].forEach(function (m) { m.visible = false; });
  }

  // Turn bone 'name' (from its rest pose) so that its descendant lies along from -> to.
  function aim(name, child, from, to) {
    var b = bones[name];
    b.quaternion.copy(rest[name]);
    b.updateMatrixWorld(true);
    var dir = tD.subVectors(to, from);
    if (dir.lengthSq() < 1e-10) return;
    dir.normalize();
    var cur = bones[child].getWorldPosition(tB).sub(b.getWorldPosition(tA)).normalize();
    qA.setFromUnitVectors(cur, dir).multiply(b.getWorldQuaternion(qB));
    b.quaternion.copy(b.parent.getWorldQuaternion(qC).invert().multiply(qA));
    b.updateMatrixWorld(true);
  }

  function poseHuman() {
    human.position.set(0, 0, 0);
    human.updateMatrixWorld(true);
    // Pelvis: at the demo's pelvis, turned so the hips and the back match.
    var pel = bones.pelvis;
    pel.quaternion.copy(rest.pelvis);
    pel.position.copy(pel.parent.worldToLocal(P.pelvis.clone()));
    var up = V().subVectors(P.neck, P.pelvis).normalize();
    var side = V().subVectors(P.hipL, P.hipR);
    side.addScaledVector(up, -side.dot(up));
    if (side.lengthSq() < 1e-8) side.set(1, 0, 0);
    side.normalize();
    mB.makeBasis(side, up, V().crossVectors(side, up));
    qA.setFromRotationMatrix(mB).multiply(restPelvisWorld);
    pel.quaternion.copy(pel.parent.getWorldQuaternion(qC).invert().multiply(qA));
    pel.updateMatrixWorld(true);
    for (var i = 0; i < AIMS.length; i++) aim(AIMS[i][0], AIMS[i][1], P[AIMS[i][2]], P[AIMS[i][3]]);
    // A hand on the floor lies flat, fingers ahead, as the mannequin's did.
    ['l', 'r'].forEach(function (side) {
      var hand = P[side === 'l' ? 'handL' : 'handR'];
      if (hand.y >= 0.07) return;
      var ahead = horizontal(V().subVectors(P.face, P.head));
      if (ahead.lengthSq() < 0.002) ahead = horizontal(V().subVectors(P.neck, P.pelvis));
      if (ahead.lengthSq() < 1e-6) return;
      aim('hand_' + side, 'middle_01_' + side, hand, V().copy(hand).add(ahead.normalize()));
    });
    // Bone lengths differ a little from the demo's: settle the body onto the
    // floor where the demo touches it.
    var low = Infinity, demoLow = Infinity;
    for (var k = 0; k < CONTACTS.length; k++) {
      var y = bones[CONTACTS[k][0]].getWorldPosition(tA).y;
      var dy = P[CONTACTS[k][1]].y;
      if (dy < demoLow) { demoLow = dy; low = y; }
    }
    human.position.y = demoLow - low;
  }

  var basePose = pose;
  pose = function (t) {
    basePose(t);
    if (human) poseHuman();
  };

  // The human is worth a short wait; past it, or on any failure, the mannequin.
  var begun = false;
  function begin() { if (!begun) { begun = true; requestAnimationFrame(frame); } }
  var wait = setTimeout(begin, 12000);
  new GLTFLoader().load('${MODEL_URL}', function (gltf) {
    try { setupHuman(gltf); } catch (e) { human = null; }
    clearTimeout(wait);
    begin();
  }, undefined, function () { clearTimeout(wait); begin(); });
}
</script>
<script type="module">
Promise.all([import('three'), import('three/addons/loaders/GLTFLoader.js')])
  .then(function (m) { start(m[0], m[1].GLTFLoader); })
  .catch(function () { send({ type: 'error' }); });
</script>
</body></html>`;
}
