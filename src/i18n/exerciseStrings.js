/**
 * The exercise library's strings, in English and Vietnamese: every exercise
 * after the original four, plus the form cues of all of them.
 *
 * Kept apart from ./strings, which merges these in, because there are a lot
 * of them and they follow one shape. Each entry below becomes flat keys:
 *
 *   exercise.<id>               name
 *   exercise.<id>.noun          lower-case, for sentences ("I just did 20 ...")
 *   exercise.<id>.cue           form cues, one line
 *   exercise.<id>.hint.<source> how to set up the phone for each of its sources
 *   coach.<id>.<issue>          the exercise's own wording of a coaching issue
 *
 * The Node suite checks that every exercise has all of these, in both
 * languages, for every source it lists.
 */

/**
 * id -> { en, vi }, each { name, noun, cue, hint: { source: text }, coach: { issue: text } }.
 * Only the original four's cues are here; the rest of their strings predate this file.
 */
const LIBRARY = {
  pushup: {
    en: { cue: 'Body in one straight line, chest to a fist from the floor, arms fully straight at the top.' },
    vi: { cue: 'Thân thẳng một đường, ngực xuống cách sàn một nắm tay, lên duỗi thẳng tay.' },
  },
  squat: {
    en: { cue: 'Feet shoulder-width, chest up, hips down to knee height, knees over the toes.' },
    vi: { cue: 'Chân rộng bằng vai, ngực mở, hạ hông ngang gối, gối hướng theo mũi chân.' },
  },
  situp: {
    en: { cue: 'Knees bent, feet flat. Come all the way up, then lower back down with control.' },
    vi: { cue: 'Co gối, bàn chân áp sàn. Gập người lên hết, rồi hạ xuống có kiểm soát.' },
  },
  jumpingjack: {
    en: { cue: 'Jump the feet wide as the hands go all the way overhead, then back together.' },
    vi: { cue: 'Bật chân rộng đồng thời đưa tay qua đầu, rồi bật về khép chân, hạ tay.' },
  },

  // --- chest and triceps --------------------------------------------------
  kneepushup: {
    en: {
      name: 'Knee push-ups',
      noun: 'knee push-ups',
      cue: 'Knees on the floor, a straight line from knees to head, chest down to a fist from the floor.',
      hint: {
        ai: 'Prop the phone up 2 m to your side, whole body in frame side-on. Knees down, then push up.',
        light: 'Phone on the floor under your chest, screen up. Cover the sensor at the top of the phone at the bottom of each rep.',
        tap: 'Phone on the floor, screen up. Touch the screen with your nose at the bottom of each rep, then release.',
      },
      coach: { shallow: 'Chest lower' },
    },
    vi: {
      name: 'Hít đất quỳ gối',
      noun: 'hít đất quỳ gối',
      cue: 'Gối chạm sàn, thân thẳng từ gối tới đầu, hạ ngực cách sàn một nắm tay.',
      hint: {
        ai: 'Dựng điện thoại cách 2 m bên hông, thấy cả người từ bên cạnh. Quỳ gối rồi chống đẩy.',
        light: 'Đặt điện thoại dưới ngực, màn hình ngửa. Che cảm biến ở đầu máy khi xuống thấp nhất.',
        tap: 'Đặt điện thoại dưới sàn, màn hình ngửa. Chạm mũi vào màn hình khi xuống thấp nhất rồi nhả.',
      },
      coach: { shallow: 'Hạ ngực thấp hơn' },
    },
  },
  widepushup: {
    en: {
      name: 'Wide push-ups',
      noun: 'wide push-ups',
      cue: 'Hands well wider than the shoulders, elbows out, body straight, chest to the floor.',
      hint: {
        ai: 'Prop the phone up 2 m to your side, whole body in frame side-on, then push up.',
        light: 'Phone on the floor under your chest, screen up. Cover the sensor at the top of the phone at the bottom of each rep.',
        tap: 'Phone on the floor, screen up. Touch the screen with your nose at the bottom of each rep, then release.',
      },
      coach: { shallow: 'Chest lower' },
    },
    vi: {
      name: 'Hít đất tay rộng',
      noun: 'hít đất tay rộng',
      cue: 'Hai tay rộng hơn vai nhiều, khuỷu mở ra, thân thẳng, ngực xuống sát sàn.',
      hint: {
        ai: 'Dựng điện thoại cách 2 m bên hông, thấy cả người từ bên cạnh, rồi chống đẩy.',
        light: 'Đặt điện thoại dưới ngực, màn hình ngửa. Che cảm biến ở đầu máy khi xuống thấp nhất.',
        tap: 'Đặt điện thoại dưới sàn, màn hình ngửa. Chạm mũi vào màn hình khi xuống thấp nhất rồi nhả.',
      },
      coach: { shallow: 'Hạ ngực thấp hơn' },
    },
  },
  diamondpushup: {
    en: {
      name: 'Diamond push-ups',
      noun: 'diamond push-ups',
      cue: 'Thumbs and index fingers touching under the chest, elbows close to the body.',
      hint: {
        ai: 'Prop the phone up 2 m to your side, whole body in frame side-on, then push up.',
        light: 'Phone on the floor just ahead of your hands, screen up. Cover the sensor with your chest at the bottom.',
        tap: 'Phone on the floor, screen up. Touch the screen with your nose at the bottom of each rep, then release.',
      },
      coach: { shallow: 'Chest down to your hands' },
    },
    vi: {
      name: 'Hít đất kim cương',
      noun: 'hít đất kim cương',
      cue: 'Ngón cái và ngón trỏ chạm nhau dưới ngực, khuỷu tay sát thân.',
      hint: {
        ai: 'Dựng điện thoại cách 2 m bên hông, thấy cả người từ bên cạnh, rồi chống đẩy.',
        light: 'Đặt điện thoại ngay trước hai tay, màn hình ngửa. Che cảm biến bằng ngực khi xuống thấp nhất.',
        tap: 'Đặt điện thoại dưới sàn, màn hình ngửa. Chạm mũi vào màn hình khi xuống thấp nhất rồi nhả.',
      },
      coach: { shallow: 'Hạ ngực sát tay' },
    },
  },
  inclinepushup: {
    en: {
      name: 'Incline push-ups',
      noun: 'incline push-ups',
      cue: 'Hands on a sturdy chair or bench, body straight, chest down to its edge.',
      hint: {
        ai: 'Hands on a chair, phone propped 2 m to your side with the chair and your whole body in frame.',
        tap: 'Phone on the chair between your hands. Touch it with your chest or chin at the bottom, then release.',
      },
      coach: { shallow: 'Chest closer to the chair', notHorizontal: 'Lean onto your hands' },
    },
    vi: {
      name: 'Hít đất tay cao',
      noun: 'hít đất tay cao',
      cue: 'Chống tay lên ghế chắc chắn, thân thẳng, hạ ngực sát mép ghế.',
      hint: {
        ai: 'Chống tay lên ghế, dựng điện thoại cách 2 m bên hông, thấy cả ghế và cả người.',
        tap: 'Đặt điện thoại trên ghế giữa hai tay. Chạm ngực hoặc cằm khi xuống thấp nhất rồi nhả.',
      },
      coach: { shallow: 'Hạ ngực sát ghế hơn', notHorizontal: 'Ngả người lên hai tay' },
    },
  },
  declinepushup: {
    en: {
      name: 'Decline push-ups',
      noun: 'decline push-ups',
      cue: 'Feet up on a chair or step, body straight, chest down to a fist from the floor.',
      hint: {
        ai: 'Feet on a chair, phone propped 2 m to your side with your whole body in frame side-on.',
        light: 'Phone on the floor under your chest, screen up. Cover the sensor at the top of the phone at the bottom of each rep.',
        tap: 'Phone on the floor, screen up. Touch the screen with your nose at the bottom of each rep, then release.',
      },
      coach: { shallow: 'Chest lower' },
    },
    vi: {
      name: 'Hít đất chân cao',
      noun: 'hít đất chân cao',
      cue: 'Gác chân lên ghế hoặc bậc, thân thẳng, hạ ngực cách sàn một nắm tay.',
      hint: {
        ai: 'Gác chân lên ghế, dựng điện thoại cách 2 m bên hông, thấy cả người từ bên cạnh.',
        light: 'Đặt điện thoại dưới ngực, màn hình ngửa. Che cảm biến ở đầu máy khi xuống thấp nhất.',
        tap: 'Đặt điện thoại dưới sàn, màn hình ngửa. Chạm mũi vào màn hình khi xuống thấp nhất rồi nhả.',
      },
      coach: { shallow: 'Hạ ngực thấp hơn' },
    },
  },
  dip: {
    en: {
      name: 'Chair dips',
      noun: 'chair dips',
      cue: 'Hands on the chair edge behind you, legs out front, lower until the elbows reach 90 degrees.',
      hint: {
        ai: 'Sit on the front of a sturdy chair, phone propped 2 m to your side with you and the chair in frame.',
        tap: 'Phone on the floor between your feet. Tap it with a toe at the bottom of each dip.',
      },
      coach: { shallow: 'Bend the elbows to 90°', notInPosition: 'Hands on the chair, legs out front' },
    },
    vi: {
      name: 'Dip ghế',
      noun: 'dip ghế',
      cue: 'Hai tay chống mép ghế sau lưng, chân duỗi phía trước, hạ người tới khi khuỷu vuông góc.',
      hint: {
        ai: 'Ngồi ở mép ghế chắc chắn, dựng điện thoại cách 2 m bên hông, thấy cả người và ghế.',
        tap: 'Đặt điện thoại dưới sàn giữa hai bàn chân. Chạm mũi chân vào màn hình mỗi lần xuống thấp nhất.',
      },
      coach: { shallow: 'Gập khuỷu tới 90°', notInPosition: 'Chống tay lên ghế, duỗi chân ra trước' },
    },
  },

  // --- shoulders and arms ---------------------------------------------------
  pikepushup: {
    en: {
      name: 'Pike push-ups',
      noun: 'pike push-ups',
      cue: 'Hips high in an upside-down V, lower the top of the head toward the floor between the hands.',
      hint: {
        ai: 'Prop the phone up 2 m to your side, whole body in frame side-on, hips raised high.',
        tap: 'Phone on the floor between your hands. Touch it with your forehead at the bottom, then release.',
      },
      coach: { shallow: 'Head closer to the floor', notInPosition: 'Hips up high, like a V', notHorizontal: 'Hands on the floor, hips up' },
    },
    vi: {
      name: 'Hít đất pike',
      noun: 'hít đất pike',
      cue: 'Hông nâng cao thành chữ V ngược, hạ đỉnh đầu về phía sàn giữa hai tay.',
      hint: {
        ai: 'Dựng điện thoại cách 2 m bên hông, thấy cả người từ bên cạnh, hông nâng cao.',
        tap: 'Đặt điện thoại dưới sàn giữa hai tay. Chạm trán vào màn hình khi xuống thấp nhất rồi nhả.',
      },
      coach: { shallow: 'Hạ đầu sát sàn hơn', notInPosition: 'Nâng hông cao thành chữ V', notHorizontal: 'Chống tay xuống sàn, nâng hông' },
    },
  },
  shoulderpress: {
    en: {
      name: 'Overhead press',
      noun: 'overhead presses',
      cue: 'Hands by the shoulders, elbows bent, press straight up until the arms lock out overhead.',
      hint: {
        ai: 'Prop the phone up 2–3 m in front of you, facing you, with your raised hands in frame. Water bottles or dumbbells work.',
        tap: 'Phone on a table in front of you. Tap the screen each time you lower the weights.',
      },
      coach: { shallow: 'Press all the way up', notInPosition: 'Start with hands at your shoulders' },
    },
    vi: {
      name: 'Đẩy vai qua đầu',
      noun: 'đẩy vai',
      cue: 'Tay ngang vai, khuỷu gập, đẩy thẳng lên tới khi duỗi hết tay trên đầu.',
      hint: {
        ai: 'Dựng điện thoại cách 2–3 m trước mặt, thấy cả hai tay khi giơ lên. Dùng chai nước hoặc tạ đơn.',
        tap: 'Đặt điện thoại trên bàn trước mặt. Chạm màn hình mỗi lần hạ tạ xuống.',
      },
      coach: { shallow: 'Đẩy thẳng hết lên', notInPosition: 'Bắt đầu với tay ngang vai' },
    },
  },
  lateralraise: {
    en: {
      name: 'Lateral raises',
      noun: 'lateral raises',
      cue: 'Arms nearly straight, raise them out to the sides up to shoulder height, lower slowly.',
      hint: {
        ai: 'Prop the phone up 2–3 m in front of you, facing you, both arms in frame. Water bottles add weight.',
        tap: 'Phone on a table in front of you. Tap the screen after each raise.',
      },
      coach: { shallow: 'Raise to shoulder height' },
    },
    vi: {
      name: 'Nâng tay ngang',
      noun: 'nâng tay ngang',
      cue: 'Tay gần như thẳng, nâng sang hai bên tới ngang vai, hạ xuống chậm.',
      hint: {
        ai: 'Dựng điện thoại cách 2–3 m trước mặt, thấy cả hai tay. Cầm chai nước để thêm tải.',
        tap: 'Đặt điện thoại trên bàn trước mặt. Chạm màn hình sau mỗi lần nâng.',
      },
      coach: { shallow: 'Nâng tới ngang vai' },
    },
  },
  frontraise: {
    en: {
      name: 'Front raises',
      noun: 'front raises',
      cue: 'Arms straight, raise them in front of you to shoulder height, lower slowly.',
      hint: {
        ai: 'Stand side-on to the phone, 2 m away, with your raised arms in frame. Water bottles add weight.',
        tap: 'Phone on a table beside you. Tap the screen after each raise.',
      },
      coach: { shallow: 'Raise to shoulder height' },
    },
    vi: {
      name: 'Nâng tay trước',
      noun: 'nâng tay trước',
      cue: 'Tay thẳng, nâng ra phía trước tới ngang vai, hạ xuống chậm.',
      hint: {
        ai: 'Đứng nghiêng người so với điện thoại, cách 2 m, thấy tay khi giơ lên. Cầm chai nước để thêm tải.',
        tap: 'Đặt điện thoại trên bàn cạnh bạn. Chạm màn hình sau mỗi lần nâng.',
      },
      coach: { shallow: 'Nâng tới ngang vai' },
    },
  },
  bicepcurl: {
    en: {
      name: 'Bicep curls',
      noun: 'bicep curls',
      cue: 'Elbows pinned to your sides, curl the weight up to the shoulder, lower all the way. Alternate or both.',
      hint: {
        ai: 'Stand side-on to the phone, 2 m away, holding water bottles or dumbbells. Each arm counts.',
        tap: 'Phone on a table beside you. Tap the screen after each curl.',
      },
      coach: { shallow: 'Curl all the way up', notInPosition: 'Keep elbows by your sides' },
    },
    vi: {
      name: 'Cuốn tạ tay',
      noun: 'cuốn tạ',
      cue: 'Khuỷu ép sát thân, cuốn tạ lên tới vai, hạ xuống hết. Luân phiên hoặc hai tay cùng lúc.',
      hint: {
        ai: 'Đứng nghiêng so với điện thoại, cách 2 m, cầm chai nước hoặc tạ đơn. Mỗi tay đều được đếm.',
        tap: 'Đặt điện thoại trên bàn cạnh bạn. Chạm màn hình sau mỗi lần cuốn.',
      },
      coach: { shallow: 'Cuốn lên hết', notInPosition: 'Giữ khuỷu sát thân' },
    },
  },
  armcircles: {
    en: {
      name: 'Arm circles',
      noun: 'seconds of arm circles',
      cue: 'Arms straight out at shoulder height, small circles; switch direction halfway.',
      hint: {
        ai: 'Prop the phone up 2–3 m in front of you, facing you, both arms in frame. Time counts while your arms stay up.',
        timer: 'A stopwatch: it counts the seconds of the set. Arms out at shoulder height, then press Done.',
      },
      coach: { shallow: 'Arms up to shoulder height', notInPosition: 'Arms straight, at shoulder height' },
    },
    vi: {
      name: 'Xoay tay',
      noun: 'giây xoay tay',
      cue: 'Dang thẳng tay ngang vai, xoay vòng nhỏ; đổi chiều giữa chừng.',
      hint: {
        ai: 'Dựng điện thoại cách 2–3 m trước mặt, thấy cả hai tay. Thời gian chỉ tính khi tay ngang vai.',
        timer: 'Đồng hồ bấm giờ: đếm số giây của set. Dang tay ngang vai, xong thì bấm Xong.',
      },
      coach: { shallow: 'Nâng tay ngang vai', notInPosition: 'Tay thẳng, ngang vai' },
    },
  },

  // --- legs and glutes ------------------------------------------------------
  sumosquat: {
    en: {
      name: 'Sumo squats',
      noun: 'sumo squats',
      cue: 'Feet wide, toes turned out, knees pushed out over the toes, hips down to knee height.',
      hint: {
        ai: 'Prop the phone up 2–3 m in front of you, facing you, whole body in frame. Hips down close to knee height.',
        tap: 'Hold the phone in front of you. Touch the screen at the bottom of each squat, then release.',
      },
      coach: { shallow: 'Squat lower' },
    },
    vi: {
      name: 'Squat sumo',
      noun: 'squat sumo',
      cue: 'Chân mở rộng, mũi chân xoay ra ngoài, đẩy gối theo mũi chân, hạ hông ngang gối.',
      hint: {
        ai: 'Dựng điện thoại cách 2–3 m trước mặt, thấy cả người. Hạ hông gần ngang gối.',
        tap: 'Cầm điện thoại trước mặt. Chạm màn hình khi xuống thấp nhất rồi nhả.',
      },
      coach: { shallow: 'Hạ hông thấp hơn' },
    },
  },
  lunge: {
    en: {
      name: 'Lunges',
      noun: 'lunges',
      cue: 'Step forward or back, both knees to 90 degrees, back knee just off the floor. Alternate legs; each one counts.',
      hint: {
        ai: 'Stand side-on to the phone, 2–3 m away, whole body in frame. Forward or reverse lunges both count.',
        tap: 'Hold the phone. Touch the screen at the bottom of each lunge, then release.',
      },
      coach: { shallow: 'Back knee lower' },
    },
    vi: {
      name: 'Chùng chân',
      noun: 'chùng chân',
      cue: 'Bước tới hoặc lùi, hai gối vuông góc, gối sau gần chạm sàn. Đổi chân luân phiên; mỗi chân đều tính.',
      hint: {
        ai: 'Đứng nghiêng so với điện thoại, cách 2–3 m, thấy cả người. Bước tới hay lùi đều được.',
        tap: 'Cầm điện thoại. Chạm màn hình khi xuống thấp nhất rồi nhả.',
      },
      coach: { shallow: 'Hạ gối sau thấp hơn' },
    },
  },
  sidelunge: {
    en: {
      name: 'Side lunges',
      noun: 'side lunges',
      cue: 'Step wide to one side, sit back into that hip with the other leg straight. Alternate sides.',
      hint: {
        ai: 'Prop the phone up 2–3 m in front of you, facing you, whole body in frame with room to step sideways.',
        tap: 'Hold the phone. Touch the screen at the bottom of each lunge, then release.',
      },
      coach: { shallow: 'Sit lower into the hip' },
    },
    vi: {
      name: 'Chùng chân ngang',
      noun: 'chùng chân ngang',
      cue: 'Bước rộng sang một bên, hạ hông về chân đó, chân kia duỗi thẳng. Đổi bên luân phiên.',
      hint: {
        ai: 'Dựng điện thoại cách 2–3 m trước mặt, thấy cả người và đủ chỗ bước ngang.',
        tap: 'Cầm điện thoại. Chạm màn hình khi xuống thấp nhất rồi nhả.',
      },
      coach: { shallow: 'Hạ hông thấp hơn' },
    },
  },
  splitsquat: {
    en: {
      name: 'Split squats',
      noun: 'split squats',
      cue: 'Feet staggered, front and back, drop straight down until the back knee nearly touches. Do one side, then the other.',
      hint: {
        ai: 'Stand side-on to the phone, 2–3 m away, whole body in frame.',
        tap: 'Hold the phone. Touch the screen at the bottom of each rep, then release.',
      },
      coach: { shallow: 'Back knee lower' },
    },
    vi: {
      name: 'Squat tách chân',
      noun: 'squat tách chân',
      cue: 'Một chân trước một chân sau, hạ thẳng xuống tới khi gối sau gần chạm sàn. Làm hết một bên rồi đổi.',
      hint: {
        ai: 'Đứng nghiêng so với điện thoại, cách 2–3 m, thấy cả người.',
        tap: 'Cầm điện thoại. Chạm màn hình khi xuống thấp nhất rồi nhả.',
      },
      coach: { shallow: 'Hạ gối sau thấp hơn' },
    },
  },
  wallsit: {
    en: {
      name: 'Wall sit',
      noun: 'seconds of wall sit',
      cue: 'Back flat against a wall, thighs level, knees at 90 degrees over the ankles. Hold.',
      hint: {
        ai: 'Phone propped 2 m to your side, whole body in frame side-on. Time counts while your thighs stay level.',
        timer: 'A stopwatch: it counts the seconds of the set. Slide down the wall, then press Done when you stand.',
      },
      coach: { shallow: 'Lower, thighs level', notInPosition: 'Not so deep: knees at 90°' },
    },
    vi: {
      name: 'Ngồi dựa tường',
      noun: 'giây ngồi dựa tường',
      cue: 'Lưng áp tường, đùi song song sàn, gối vuông góc trên cổ chân. Giữ nguyên.',
      hint: {
        ai: 'Dựng điện thoại cách 2 m bên hông, thấy cả người từ bên cạnh. Thời gian chỉ tính khi đùi song song sàn.',
        timer: 'Đồng hồ bấm giờ: đếm số giây của set. Trượt lưng xuống tường, đứng dậy thì bấm Xong.',
      },
      coach: { shallow: 'Hạ thấp hơn, đùi song song sàn', notInPosition: 'Đừng xuống quá sâu: gối 90°' },
    },
  },
  glutebridge: {
    en: {
      name: 'Glute bridges',
      noun: 'glute bridges',
      cue: 'Lying on your back, knees bent, drive the hips up into a straight line from shoulders to knees. Squeeze.',
      hint: {
        ai: 'Lie on your back with the phone propped on the floor 2 m to your side, whole body in frame side-on.',
        tap: 'Phone on the floor beside your hip. Tap it each time your hips come down.',
      },
      coach: { shallow: 'Hips higher' },
    },
    vi: {
      name: 'Cầu mông',
      noun: 'cầu mông',
      cue: 'Nằm ngửa, co gối, đẩy hông lên thành đường thẳng từ vai tới gối. Siết mông.',
      hint: {
        ai: 'Nằm ngửa, điện thoại đặt trên sàn cách 2 m bên hông, thấy cả người từ bên cạnh.',
        tap: 'Đặt điện thoại cạnh hông. Chạm màn hình mỗi lần hạ hông xuống.',
      },
      coach: { shallow: 'Nâng hông cao hơn' },
    },
  },
  singlelegbridge: {
    en: {
      name: 'Single-leg bridges',
      noun: 'single-leg bridges',
      cue: 'One foot down, the other leg held out straight; drive the hips up. Do one side, then the other.',
      hint: {
        ai: 'Lie on your back with the phone propped on the floor 2 m to your side, whole body in frame side-on.',
        tap: 'Phone on the floor beside your hip. Tap it each time your hips come down.',
      },
      coach: { shallow: 'Hips higher' },
    },
    vi: {
      name: 'Cầu mông một chân',
      noun: 'cầu mông một chân',
      cue: 'Một bàn chân chống sàn, chân kia duỗi thẳng; đẩy hông lên. Làm hết một bên rồi đổi.',
      hint: {
        ai: 'Nằm ngửa, điện thoại đặt trên sàn cách 2 m bên hông, thấy cả người từ bên cạnh.',
        tap: 'Đặt điện thoại cạnh hông. Chạm màn hình mỗi lần hạ hông xuống.',
      },
      coach: { shallow: 'Nâng hông cao hơn' },
    },
  },
  donkeykick: {
    en: {
      name: 'Donkey kicks',
      noun: 'donkey kicks',
      cue: 'On all fours, knee bent, push one foot up toward the ceiling until the thigh is level. Each leg counts.',
      hint: {
        ai: 'On all fours, side-on to the phone propped on the floor 2 m away, whole body in frame.',
        tap: 'Phone on the floor under your face. Tap it after each kick.',
      },
      coach: { shallow: 'Thigh up to level', notInPosition: 'Get on all fours' },
    },
    vi: {
      name: 'Đá chân sau',
      noun: 'đá chân sau',
      cue: 'Chống bốn điểm, giữ gối gập, đạp bàn chân lên trần tới khi đùi song song sàn. Mỗi chân đều tính.',
      hint: {
        ai: 'Chống bốn điểm, nghiêng người so với điện thoại đặt trên sàn cách 2 m, thấy cả người.',
        tap: 'Đặt điện thoại dưới mặt. Chạm màn hình sau mỗi lần đá.',
      },
      coach: { shallow: 'Đá đùi lên ngang', notInPosition: 'Chống bốn điểm' },
    },
  },
  firehydrant: {
    en: {
      name: 'Fire hydrants',
      noun: 'fire hydrants',
      cue: 'On all fours, knee bent, lift one leg out to the side as high as the hip allows. Each leg counts.',
      hint: {
        ai: 'On all fours facing the phone (or with your back to it), propped on the floor 2 m away, whole body in frame.',
        tap: 'Phone on the floor under your face. Tap it after each lift.',
      },
      coach: { shallow: 'Knee higher, out to the side', notInPosition: 'Get on all fours' },
    },
    vi: {
      name: 'Mở hông',
      noun: 'mở hông',
      cue: 'Chống bốn điểm, giữ gối gập, nâng một chân sang ngang cao hết mức hông cho phép. Mỗi chân đều tính.',
      hint: {
        ai: 'Chống bốn điểm quay mặt (hoặc lưng) về điện thoại đặt trên sàn cách 2 m, thấy cả người.',
        tap: 'Đặt điện thoại dưới mặt. Chạm màn hình sau mỗi lần nâng.',
      },
      coach: { shallow: 'Nâng gối cao hơn sang ngang', notInPosition: 'Chống bốn điểm' },
    },
  },
  goodmorning: {
    en: {
      name: 'Good mornings',
      noun: 'good mornings',
      cue: 'Hands behind the head, knees soft, hinge at the hips with a flat back until the chest is near level.',
      hint: {
        ai: 'Stand side-on to the phone, 2–3 m away, whole body in frame.',
        tap: 'Hold the phone to your chest. Tap the screen at the bottom of each hinge.',
      },
      coach: { shallow: 'Hinge further forward', bentKnees: 'Keep the legs nearly straight' },
    },
    vi: {
      name: 'Gập hông',
      noun: 'gập hông',
      cue: 'Tay sau gáy, gối hơi chùng, gập ở hông với lưng phẳng tới khi ngực gần song song sàn.',
      hint: {
        ai: 'Đứng nghiêng so với điện thoại, cách 2–3 m, thấy cả người.',
        tap: 'Áp điện thoại lên ngực. Chạm màn hình khi gập xuống thấp nhất.',
      },
      coach: { shallow: 'Gập người sâu hơn', bentKnees: 'Giữ chân gần như thẳng' },
    },
  },

  // --- core -----------------------------------------------------------------
  crunch: {
    en: {
      name: 'Crunches',
      noun: 'crunches',
      cue: 'Lying on your back, knees bent, curl the shoulder blades off the floor, then lower.',
      hint: {
        ai: 'Lie on your back with the phone propped on the floor 2 m to your side, whole body in frame side-on.',
        tap: 'Phone on the floor beside you. Tap it each time you come up.',
      },
      coach: { shallow: 'Shoulders off the floor' },
    },
    vi: {
      name: 'Gập bụng ngắn',
      noun: 'gập bụng ngắn',
      cue: 'Nằm ngửa, co gối, cuộn bả vai lên khỏi sàn rồi hạ xuống.',
      hint: {
        ai: 'Nằm ngửa, điện thoại đặt trên sàn cách 2 m bên hông, thấy cả người từ bên cạnh.',
        tap: 'Đặt điện thoại cạnh bạn. Chạm màn hình mỗi lần gập lên.',
      },
      coach: { shallow: 'Nâng bả vai khỏi sàn' },
    },
  },
  legraise: {
    en: {
      name: 'Leg raises',
      noun: 'leg raises',
      cue: 'Lying flat, legs straight, lift them to vertical and lower without touching the floor. Back stays down.',
      hint: {
        ai: 'Lie on your back with the phone propped on the floor 2 m to your side, whole body in frame side-on.',
        tap: 'Phone on the floor beside your hip. Tap it each time your legs come down.',
      },
      coach: { shallow: 'Legs up higher', notLying: 'Keep your back on the floor' },
    },
    vi: {
      name: 'Nâng chân',
      noun: 'nâng chân',
      cue: 'Nằm thẳng, chân duỗi, nâng chân lên thẳng đứng rồi hạ xuống không chạm sàn. Lưng áp sàn.',
      hint: {
        ai: 'Nằm ngửa, điện thoại đặt trên sàn cách 2 m bên hông, thấy cả người từ bên cạnh.',
        tap: 'Đặt điện thoại cạnh hông. Chạm màn hình mỗi lần hạ chân.',
      },
      coach: { shallow: 'Nâng chân cao hơn', notLying: 'Giữ lưng áp sàn' },
    },
  },
  bicyclecrunch: {
    en: {
      name: 'Bicycle crunches',
      noun: 'bicycle crunches',
      cue: 'Shoulders up, bring one knee in as the other leg extends, elbow toward the knee. Each side counts.',
      hint: {
        ai: 'Lie on your back with the phone propped on the floor 2 m to your side, whole body in frame side-on.',
        tap: 'Phone on the floor beside you. Tap it once per knee.',
      },
      coach: { shallow: 'Knee further in, other leg out' },
    },
    vi: {
      name: 'Gập bụng đạp xe',
      noun: 'gập bụng đạp xe',
      cue: 'Nâng vai, kéo một gối vào khi chân kia duỗi ra, khuỷu hướng về gối. Mỗi bên đều tính.',
      hint: {
        ai: 'Nằm ngửa, điện thoại đặt trên sàn cách 2 m bên hông, thấy cả người từ bên cạnh.',
        tap: 'Đặt điện thoại cạnh bạn. Chạm màn hình một lần cho mỗi gối.',
      },
      coach: { shallow: 'Kéo gối vào sâu hơn, duỗi chân kia' },
    },
  },
  mountainclimber: {
    en: {
      name: 'Mountain climbers',
      noun: 'mountain climbers',
      cue: 'In a high plank, drive one knee toward the chest, then switch fast. Hips stay low; each knee counts.',
      hint: {
        ai: 'In a plank side-on to the phone propped on the floor 2 m away, whole body in frame.',
        tap: 'Phone on the floor between your hands. Tap it once per knee.',
      },
      coach: { shallow: 'Knee closer to the chest' },
    },
    vi: {
      name: 'Leo núi',
      noun: 'leo núi',
      cue: 'Ở tư thế plank tay thẳng, kéo một gối về ngực rồi đổi chân thật nhanh. Hông thấp; mỗi gối đều tính.',
      hint: {
        ai: 'Ở tư thế plank, nghiêng so với điện thoại đặt trên sàn cách 2 m, thấy cả người.',
        tap: 'Đặt điện thoại dưới sàn giữa hai tay. Chạm màn hình một lần cho mỗi gối.',
      },
      coach: { shallow: 'Kéo gối sát ngực hơn' },
    },
  },
  russiantwist: {
    en: {
      name: 'Russian twists',
      noun: 'twists',
      cue: 'Seated, knees up, lean back, hands together; turn to touch the floor on each side. Each side counts.',
      hint: {
        ai: 'Sit facing the phone propped on the floor 2 m away, whole body and hands in frame.',
        tap: 'Phone on the floor beside your hip. Tap it every time your hands reach that side.',
      },
      coach: { shallow: 'Turn further to the side', notInPosition: 'Sit down, knees up' },
    },
    vi: {
      name: 'Xoay người kiểu Nga',
      noun: 'xoay người',
      cue: 'Ngồi, co gối, ngả lưng ra sau, chắp tay; xoay chạm sàn hai bên. Mỗi bên đều tính.',
      hint: {
        ai: 'Ngồi quay mặt về điện thoại đặt trên sàn cách 2 m, thấy cả người và hai tay.',
        tap: 'Đặt điện thoại cạnh hông. Chạm màn hình mỗi lần tay sang tới bên đó.',
      },
      coach: { shallow: 'Xoay sang bên nhiều hơn', notInPosition: 'Ngồi xuống, co gối' },
    },
  },
  plank: {
    en: {
      name: 'Plank',
      noun: 'seconds of plank',
      cue: 'On forearms or hands, one straight line from head to heels. Brace the stomach, do not let the hips sag.',
      hint: {
        ai: 'Phone propped on the floor 2 m to your side, whole body in frame side-on. Time counts while your form holds.',
        timer: 'A stopwatch: it counts the seconds of the set. Get into the plank, then press Done when you drop.',
      },
      coach: { notHorizontal: 'Get into a plank', bodySag: 'Hips in line: no sag, no pike' },
    },
    vi: {
      name: 'Plank',
      noun: 'giây plank',
      cue: 'Chống cẳng tay hoặc bàn tay, thân thẳng một đường từ đầu tới gót. Siết bụng, không võng hông.',
      hint: {
        ai: 'Điện thoại đặt trên sàn cách 2 m bên hông, thấy cả người từ bên cạnh. Thời gian chỉ tính khi đúng tư thế.',
        timer: 'Đồng hồ bấm giờ: đếm số giây của set. Vào tư thế plank, hạ người xuống thì bấm Xong.',
      },
      coach: { notHorizontal: 'Vào tư thế plank', bodySag: 'Giữ hông thẳng hàng, không võng, không nhô' },
    },
  },
  sideplank: {
    en: {
      name: 'Side plank',
      noun: 'seconds of side plank',
      cue: 'On one forearm, feet stacked, hips lifted into a straight line. Switch sides between sets.',
      hint: {
        ai: 'Face the phone propped on the floor 2 m away, your chest toward it, whole body in frame.',
        timer: 'A stopwatch: it counts the seconds of the set. Lift into the side plank, then press Done.',
      },
      coach: { notHorizontal: 'Up on one forearm', bodySag: 'Lift the hips into line' },
    },
    vi: {
      name: 'Plank nghiêng',
      noun: 'giây plank nghiêng',
      cue: 'Chống một cẳng tay, hai bàn chân chồng lên nhau, nâng hông thành đường thẳng. Đổi bên giữa các set.',
      hint: {
        ai: 'Quay ngực về điện thoại đặt trên sàn cách 2 m, thấy cả người.',
        timer: 'Đồng hồ bấm giờ: đếm số giây của set. Nâng người vào plank nghiêng, xong thì bấm Xong.',
      },
      coach: { notHorizontal: 'Chống lên một cẳng tay', bodySag: 'Nâng hông thẳng hàng' },
    },
  },
  hollowhold: {
    en: {
      name: 'Hollow hold',
      noun: 'seconds of hollow hold',
      cue: 'On your back, lower back pressed down, shoulders and straight legs both lifted off the floor. Hold.',
      hint: {
        ai: 'Lie on your back with the phone propped on the floor 2 m to your side, whole body in frame side-on.',
        timer: 'A stopwatch: it counts the seconds of the set. Lift into the hold, then press Done.',
      },
      coach: { notInPosition: 'Lift shoulders and legs, a little' },
    },
    vi: {
      name: 'Giữ thuyền',
      noun: 'giây giữ thuyền',
      cue: 'Nằm ngửa, ép thắt lưng xuống sàn, nâng vai và chân thẳng khỏi sàn. Giữ nguyên.',
      hint: {
        ai: 'Nằm ngửa, điện thoại đặt trên sàn cách 2 m bên hông, thấy cả người từ bên cạnh.',
        timer: 'Đồng hồ bấm giờ: đếm số giây của set. Nâng người vào tư thế, xong thì bấm Xong.',
      },
      coach: { notInPosition: 'Nâng nhẹ vai và chân khỏi sàn' },
    },
  },
  superman: {
    en: {
      name: 'Superman',
      noun: 'seconds of superman',
      cue: 'Face down, arms overhead, lift chest, arms and legs off the floor together. Hold.',
      hint: {
        ai: 'Lie face down with the phone propped on the floor 2 m to your side, whole body in frame side-on.',
        timer: 'A stopwatch: it counts the seconds of the set. Lift into the hold, then press Done.',
      },
      coach: { notInPosition: 'Lift chest and legs off the floor' },
    },
    vi: {
      name: 'Siêu nhân',
      noun: 'giây siêu nhân',
      cue: 'Nằm sấp, tay duỗi qua đầu, nâng ngực, tay và chân khỏi sàn cùng lúc. Giữ nguyên.',
      hint: {
        ai: 'Nằm sấp, điện thoại đặt trên sàn cách 2 m bên hông, thấy cả người từ bên cạnh.',
        timer: 'Đồng hồ bấm giờ: đếm số giây của set. Nâng người vào tư thế, xong thì bấm Xong.',
      },
      coach: { notInPosition: 'Nâng ngực và chân khỏi sàn' },
    },
  },

  // --- cardio ---------------------------------------------------------------
  highknees: {
    en: {
      name: 'High knees',
      noun: 'high knees',
      cue: 'Run in place, driving each knee up to hip height. Each knee counts.',
      hint: {
        ai: 'Prop the phone up 2–3 m away, facing you or side-on, whole body in frame.',
        tap: 'Hold the phone. Tap the screen once per knee.',
      },
      coach: { shallow: 'Knees up to hip height' },
    },
    vi: {
      name: 'Chạy nâng cao gối',
      noun: 'nâng gối',
      cue: 'Chạy tại chỗ, nâng mỗi gối lên ngang hông. Mỗi gối đều tính.',
      hint: {
        ai: 'Dựng điện thoại cách 2–3 m, trước mặt hoặc bên hông, thấy cả người.',
        tap: 'Cầm điện thoại. Chạm màn hình một lần cho mỗi gối.',
      },
      coach: { shallow: 'Nâng gối ngang hông' },
    },
  },
  buttkicks: {
    en: {
      name: 'Butt kicks',
      noun: 'butt kicks',
      cue: 'Run in place, kicking each heel up toward the glutes. Each heel counts.',
      hint: {
        ai: 'Prop the phone up 2–3 m away, facing you or side-on, whole body in frame.',
        tap: 'Hold the phone. Tap the screen once per kick.',
      },
      coach: { shallow: 'Heels up to the glutes' },
    },
    vi: {
      name: 'Chạy đá gót',
      noun: 'đá gót',
      cue: 'Chạy tại chỗ, đá gót chân lên chạm mông. Mỗi chân đều tính.',
      hint: {
        ai: 'Dựng điện thoại cách 2–3 m, trước mặt hoặc bên hông, thấy cả người.',
        tap: 'Cầm điện thoại. Chạm màn hình một lần cho mỗi lần đá.',
      },
      coach: { shallow: 'Đá gót sát mông' },
    },
  },
  burpee: {
    en: {
      name: 'Burpees',
      noun: 'burpees',
      cue: 'Squat, hands down, jump the feet back to a plank, jump them in, stand and jump. Counts as you stand.',
      hint: {
        ai: 'Prop the phone up 2–3 m away, side-on, with room for your whole body lying and standing.',
        tap: 'Phone on the floor where your chest lands. Touch it in the plank of each burpee.',
      },
      coach: { shallow: 'All the way down to the floor', notInPosition: 'Kick back to a straight plank' },
    },
    vi: {
      name: 'Burpee',
      noun: 'burpee',
      cue: 'Ngồi xổm, chống tay, bật chân ra sau thành plank, bật chân vào, đứng dậy và bật nhảy. Tính khi đứng lên.',
      hint: {
        ai: 'Dựng điện thoại cách 2–3 m bên hông, đủ chỗ thấy cả người khi nằm lẫn khi đứng.',
        tap: 'Đặt điện thoại dưới sàn chỗ ngực chạm. Chạm vào khi ở tư thế plank.',
      },
      coach: { shallow: 'Xuống hết sát sàn', notInPosition: 'Bật chân ra sau thành plank thẳng' },
    },
  },
};

function flatten(lang) {
  const out = {};
  for (const [id, entry] of Object.entries(LIBRARY)) {
    const e = entry[lang];
    if (e.name) out[`exercise.${id}`] = e.name;
    if (e.noun) out[`exercise.${id}.noun`] = e.noun;
    out[`exercise.${id}.cue`] = e.cue;
    for (const [source, text] of Object.entries(e.hint || {})) out[`exercise.${id}.hint.${source}`] = text;
    for (const [issue, text] of Object.entries(e.coach || {})) out[`coach.${id}.${issue}`] = text;
  }
  return out;
}

export const EXERCISE_STRINGS = { en: flatten('en'), vi: flatten('vi') };
