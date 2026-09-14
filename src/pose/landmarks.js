/**
 * A single normalised skeleton shape, so the rep analyser never learns which
 * model produced a frame.
 *
 * Pose models disagree on both the number of keypoints and their order:
 * MediaPipe BlazePose emits 33, MoveNet emits 17, and the indices do not line
 * up. Everything downstream consumes the named joints below instead, with one
 * adapter per model translating into it.
 *
 * Coordinates are normalised to the image: x and y in 0..1, origin top-left.
 * `score` is 0..1 confidence. A joint the model could not place is `null`.
 */

export const JOINTS = [
  'nose',
  'leftShoulder',
  'rightShoulder',
  'leftElbow',
  'rightElbow',
  'leftWrist',
  'rightWrist',
  'leftHip',
  'rightHip',
  'leftKnee',
  'rightKnee',
  'leftAnkle',
  'rightAnkle',
];

/** MediaPipe Pose Landmarker (BlazePose, 33 points) -> joint name. */
const MEDIAPIPE_INDEX = {
  nose: 0,
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28,
};

/** MoveNet / PoseNet (COCO, 17 points) -> joint name. */
const MOVENET_INDEX = {
  nose: 0,
  leftShoulder: 5,
  rightShoulder: 6,
  leftElbow: 7,
  rightElbow: 8,
  leftWrist: 9,
  rightWrist: 10,
  leftHip: 11,
  rightHip: 12,
  leftKnee: 13,
  rightKnee: 14,
  leftAnkle: 15,
  rightAnkle: 16,
};

function point(raw, scoreKey) {
  if (!raw) return null;
  const x = raw.x;
  const y = raw.y;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const score = raw[scoreKey];
  return { x, y, score: Number.isFinite(score) ? score : 1 };
}

function adapt(indexMap, scoreKey) {
  return (raw) => {
    const pose = {};
    if (!Array.isArray(raw)) {
      for (const joint of JOINTS) pose[joint] = null;
      return pose;
    }
    for (const joint of JOINTS) {
      pose[joint] = point(raw[indexMap[joint]], scoreKey);
    }
    return pose;
  };
}

/**
 * MediaPipe reports `visibility`; MoveNet reports `score`. Both mean "how sure
 * am I this joint is where I say it is", which is what the analyser gates on.
 */
export const fromMediaPipe = adapt(MEDIAPIPE_INDEX, 'visibility');
export const fromMoveNet = adapt(MOVENET_INDEX, 'score');

/** Bones to draw for the skeleton overlay. */
export const SKELETON_BONES = [
  ['leftShoulder', 'rightShoulder'],
  ['leftShoulder', 'leftElbow'],
  ['leftElbow', 'leftWrist'],
  ['rightShoulder', 'rightElbow'],
  ['rightElbow', 'rightWrist'],
  ['leftShoulder', 'leftHip'],
  ['rightShoulder', 'rightHip'],
  ['leftHip', 'rightHip'],
  ['leftHip', 'leftKnee'],
  ['leftKnee', 'leftAnkle'],
  ['rightHip', 'rightKnee'],
  ['rightKnee', 'rightAnkle'],
];
