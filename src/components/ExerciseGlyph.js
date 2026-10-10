import { memo, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { HEAD_RADIUS, SEGMENTS, framesAt, getDemo, propBoxes, sceneBounds } from '../exercises/demoPoses';
import { colors } from '../theme/theme';

/** A little above the figure, so a floor-level pose still reads as one. */
const ELEVATION = 8 * (Math.PI / 180);

/**
 * An exercise drawn as its own figure: one still frame of the 3D demo
 * (src/exercises/demoPoses.js), its most telling pose, in a single
 * colour on a tinted disc. Every exercise gets a mark that shows the movement
 * itself, where an emoji could only hint at it, and every one shares one style.
 *
 * Plain Views, computed once per exercise, so a list of them costs little.
 */
export const ExerciseGlyph = memo(function ExerciseGlyph({ exerciseId, size = 40, color = colors.accent, style }) {
  const lines = useMemo(() => glyphLines(exerciseId, size), [exerciseId, size]);
  return (
    <View style={[styles.disc, { width: size, height: size, borderRadius: size / 2 }, style]}>
      {lines.props.map((l, i) => (
        <Line key={`p${i}`} {...l} color={colors.textFaint} />
      ))}
      {lines.bones.map((l, i) => (
        <Line key={i} {...l} color={color} />
      ))}
      <View
        style={{
          position: 'absolute',
          left: lines.head.x - lines.head.r,
          top: lines.head.y - lines.head.r,
          width: lines.head.r * 2,
          height: lines.head.r * 2,
          borderRadius: lines.head.r,
          backgroundColor: color,
        }}
      />
    </View>
  );
});

/** The frame's bones as screen-space segments fitted into a size × size disc. */
function glyphLines(exerciseId, size) {
  const demo = getDemo(exerciseId);
  const bounds = sceneBounds(demo);
  const yaw = (demo.yaw * Math.PI) / 180;
  const cosY = Math.cos(yaw);
  const sinY = Math.sin(yaw);
  const cosE = Math.cos(ELEVATION);
  const sinE = Math.sin(ELEVATION);
  const [cx, cz] = bounds.center;

  const raw = (v) => {
    const px = v[0] - cx;
    const pz = v[2] - cz;
    const rx = px * cosY - pz * sinY;
    const rz = px * sinY + pz * cosY;
    return [rx, -(v[1] * cosE - rz * sinE)];
  };
  // Of the poses the loop arrives at, the one that fills a small disc best
  // (the squarest): a squat at depth, a jumping jack open, a push-up at the top.
  let pts = null;
  let best = -1;
  let t = 0;
  for (const [, ms] of demo.loop) {
    t += ms;
    const frame = {};
    for (const [name, v] of Object.entries(framesAt(demo, t - 1))) frame[name] = raw(v);
    const fx = Object.values(frame).map((p) => p[0]);
    const fy = Object.values(frame).map((p) => p[1]);
    const w = Math.max(...fx) - Math.min(...fx);
    const h = Math.max(...fy) - Math.min(...fy);
    const square = Math.min(w, h) / Math.max(w, h, 1e-6);
    if (square > best) {
      best = square;
      pts = frame;
    }
  }
  const boxes = propBoxes(demo).map((box) => boxEdges(box).map(([a, b]) => [raw(a), raw(b)]));

  // Fit what is drawn, with room for the stroke, inside the disc's inner square.
  const all = [...Object.values(pts), ...boxes.flat(2)];
  const xs = all.map((p) => p[0]);
  const ys = all.map((p) => p[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys) - HEAD_RADIUS;
  const maxY = Math.max(...ys);
  const inner = size * 0.68;
  const k = inner / Math.max(maxX - minX, maxY - minY, 1e-6);
  const ox = size / 2 - ((minX + maxX) / 2) * k;
  const oy = size / 2 - ((minY + maxY) / 2) * k;
  const at = (p) => [ox + p[0] * k, oy + p[1] * k];

  const thick = Math.max(1.5, size * 0.065);
  const bones = SEGMENTS.map(([a, b]) => ({ a: at(pts[a]), b: at(pts[b]), thick }));
  const props = boxes.flat().map(([a, b]) => ({ a: at(a), b: at(b), thick: Math.max(1, thick * 0.5) }));
  const [hx, hy] = at(pts.head);
  return { bones, props, head: { x: hx, y: hy, r: Math.max(2, HEAD_RADIUS * k) } };
}

/** The twelve edges of a bench, chair or wall, in world space. */
function boxEdges(box) {
  const c = [];
  for (const y of [0, box.h]) for (const x of [box.x - box.w, box.x + box.w]) for (const z of [box.z - box.d, box.z + box.d]) c.push([x, y, z]);
  const edges = [
    [0, 1], [1, 3], [3, 2], [2, 0],
    [4, 5], [5, 7], [7, 6], [6, 4],
    [0, 4], [1, 5], [2, 6], [3, 7],
  ];
  return edges.map(([i, j]) => [c[i], c[j]]);
}

function Line({ a, b, thick, color }) {
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
        transform: [{ rotate: `${Math.atan2(dy, dx)}rad` }],
      }}
    />
  );
}

const styles = StyleSheet.create({
  disc: { backgroundColor: colors.accentSoft, overflow: 'hidden' },
});
