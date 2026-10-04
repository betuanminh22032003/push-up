import { useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, StyleSheet, View } from 'react-native';

import {
  HEAD_RADIUS,
  SEGMENTS,
  framesAt,
  getDemo,
  hasDumbbells,
  propBoxes,
  sceneBounds,
} from '../exercises/demoPoses';
import { colors } from '../theme/theme';

/** The camera looks down a little, so the floor reads as a floor. */
const ELEVATION = 14 * (Math.PI / 180);
/** Left limbs, right limbs and the trunk, so the two sides tell apart when turned. */
const SIDE_COLORS = { L: colors.accent, R: '#60A5FA', C: '#E5E7EB' };
/** Degrees the camera sways either side of the exercise's best angle, and how fast. */
const SWAY_DEG = 35;
const SWAY_MS = 9000;

/**
 * An exercise done by a 3D stick figure (src/exercises/demoPoses.js), drawn
 * with plain Views so it works the same in Expo Go, a build and the browser.
 * The camera sways slowly around the figure; dragging sideways turns it by
 * hand instead.
 *
 * @param {string} exerciseId
 * @param {number} width
 * @param {number} height
 * @param {number} [speed]  1 normal, 0.5 slow motion
 */
export function ExerciseDemo({ exerciseId, width, height, speed = 1 }) {
  const demo = useMemo(() => getDemo(exerciseId), [exerciseId]);
  const bounds = useMemo(() => sceneBounds(demo), [demo]);
  const boxes = useMemo(() => propBoxes(demo), [demo]);
  const [clock, setClock] = useState({ ms: 0, yaw: demo.yaw });
  const yawRef = useRef({ manual: null, start: 0 });
  const speedRef = useRef(speed);
  speedRef.current = speed;

  useEffect(() => {
    yawRef.current.manual = null;
    let frame;
    let last = null;
    let ms = 0;
    let wall = 0;
    const tick = (now) => {
      if (last !== null) {
        const dt = Math.min(64, now - last);
        ms += dt * speedRef.current;
        wall += dt;
      }
      last = now;
      const manual = yawRef.current.manual;
      const yaw = manual ?? demo.yaw + SWAY_DEG * Math.sin((wall / SWAY_MS) * 2 * Math.PI);
      setClock({ ms, yaw });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [demo]);

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 4,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          yawRef.current.start = yawRef.current.manual ?? clockYaw.current;
          yawRef.current.manual = yawRef.current.start;
        },
        onPanResponderMove: (_, g) => {
          yawRef.current.manual = yawRef.current.start - g.dx * 0.6;
        },
      }),
    [],
  );
  const clockYaw = useRef(clock.yaw);
  clockYaw.current = clock.yaw;

  const joints = framesAt(demo, clock.ms);
  const yaw = (clock.yaw * Math.PI) / 180;
  const cosY = Math.cos(yaw);
  const sinY = Math.sin(yaw);
  const cosE = Math.cos(ELEVATION);
  const sinE = Math.sin(ELEVATION);
  const [cx, cz] = bounds.center;

  const pad = 14;
  const k = Math.min(
    (height - 2 * pad) / (bounds.height * cosE + 2 * bounds.radius * sinE),
    (width - 2 * pad) / (2 * bounds.radius),
  );
  const floorY = height - pad - bounds.radius * sinE * k;
  const midX = width / 2;

  /** World point -> [screen x, screen y, depth (bigger is nearer)]. */
  const project = ([x, y, z]) => {
    const px = x - cx;
    const pz = z - cz;
    const rx = px * cosY - pz * sinY;
    const rz = px * sinY + pz * cosY;
    return [midX + rx * k, floorY - (y * cosE - rz * sinE) * k, rz * cosE + y * sinE];
  };

  const p = {};
  for (const [name, v] of Object.entries(joints)) p[name] = project(v);

  const bones = SEGMENTS.map(([a, b, side]) => ({
    a: p[a],
    b: p[b],
    side,
    depth: (p[a][2] + p[b][2]) / 2,
    thick: (side === 'C' ? 0.06 : 0.045) * k,
    key: `${a}-${b}`,
  }));
  const depths = bones.map((b) => b.depth);
  const near = Math.max(...depths);
  const far = Math.min(...depths);
  const shade = (d) => (near - far < 1e-6 ? 1 : 0.45 + (0.55 * (d - far)) / (near - far));
  const head = { ...p.head, depth: p.head[2] };

  // Far to near, the head among the bones by its own depth.
  const items = [...bones.map((b) => ({ type: 'bone', ...b })), { type: 'head', depth: head[2] }];
  items.sort((x, y) => x.depth - y.depth);

  const floorW = bounds.radius * 2 * k;
  const floorH = Math.max(6, floorW * sinE);

  return (
    <View style={[styles.stage, { width, height }]} {...pan.panHandlers}>
      <View
        style={[
          styles.floor,
          { width: floorW, height: floorH, left: midX - floorW / 2, top: floorY - floorH / 2 + (cz ? 0 : 0) },
        ]}
      />
      {boxes.map((box, i) => (
        <Box key={i} box={box} project={project} />
      ))}
      {items.map((item) =>
        item.type === 'head' ? (
          <View
            key="head"
            style={[
              styles.head,
              {
                width: HEAD_RADIUS * 2 * k,
                height: HEAD_RADIUS * 2 * k,
                borderRadius: HEAD_RADIUS * k,
                left: head[0] - HEAD_RADIUS * k,
                top: head[1] - HEAD_RADIUS * k,
                borderWidth: Math.max(2, 0.025 * k),
              },
            ]}
          />
        ) : (
          <Line
            key={item.key}
            a={item.a}
            b={item.b}
            thick={item.thick}
            color={SIDE_COLORS[item.side]}
            opacity={shade(item.depth)}
          />
        ),
      )}
      {hasDumbbells(demo)
        ? ['handL', 'handR'].map((h) => (
            <View
              key={h}
              style={[
                styles.weight,
                {
                  width: 0.09 * k,
                  height: 0.09 * k,
                  borderRadius: 0.045 * k,
                  left: p[h][0] - 0.045 * k,
                  top: p[h][1] - 0.045 * k,
                },
              ]}
            />
          ))
        : null}
    </View>
  );
}

/** A rounded line from a to b. */
function Line({ a, b, thick, color, opacity = 1 }) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) + thick;
  return (
    <View
      style={{
        position: 'absolute',
        left: (a[0] + b[0]) / 2 - len / 2,
        top: (a[1] + b[1]) / 2 - thick / 2,
        width: len,
        height: thick,
        borderRadius: thick / 2,
        backgroundColor: color,
        opacity,
        transform: [{ rotate: `${Math.atan2(dy, dx)}rad` }],
      }}
    />
  );
}

/** A bench, chair or wall: the twelve edges of a box. */
function Box({ box, project }) {
  const xs = [box.x - box.w, box.x + box.w];
  const zs = [box.z - box.d, box.z + box.d];
  const ys = [0, box.h];
  const c = [];
  for (const y of ys) for (const x of xs) for (const z of zs) c.push(project([x, y, z]));
  // Corner index: y * 4 + x * 2 + z.
  const edges = [
    [0, 1], [1, 3], [3, 2], [2, 0],
    [4, 5], [5, 7], [7, 6], [6, 4],
    [0, 4], [1, 5], [2, 6], [3, 7],
  ];
  return edges.map(([i, j]) => (
    <Line key={`${i}-${j}`} a={c[i]} b={c[j]} thick={2} color={colors.textFaint} />
  ));
}

const styles = StyleSheet.create({
  stage: { overflow: 'hidden' },
  floor: {
    position: 'absolute',
    borderRadius: 999,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  head: {
    position: 'absolute',
    backgroundColor: colors.surfaceAlt,
    borderColor: SIDE_COLORS.C,
  },
  weight: { position: 'absolute', backgroundColor: colors.warn },
});
