/**
 * The "How to do it" guide's strings, in English and Vietnamese: a few short
 * steps and the common mistakes to avoid for every exercise, plus the guide
 * screen's own labels.
 *
 * Kept apart from ./strings for the same reason as ./exerciseStrings: there
 * are a lot of them and they follow one shape. Each entry below becomes flat
 * keys:
 *
 *   guide.<id>.steps     the steps, one per line ('\n'-joined)
 *   guide.<id>.mistakes  what to avoid, one per line ('\n'-joined)
 *
 * Steps go: starting position, the movement down/in, the movement back up (or,
 * for holds, how to hold), and sometimes tempo or how many sides.
 */

/** id -> { en, vi }, each { steps: [...], mistakes: [...] }. */
const GUIDE = {
  pushup: {
    en: {
      steps: [
        'Hands under your shoulders, body in one straight line from head to heels.',
        'Bend your elbows and lower your chest to a fist from the floor.',
        'Push the floor away until your arms are fully straight.',
      ],
      mistakes: ['Hips sagging toward the floor', 'Elbows flaring straight out to the sides'],
    },
    vi: {
      steps: [
        'Tay đặt dưới vai, thân thẳng một đường từ đầu tới gót.',
        'Gập khuỷu, hạ ngực xuống cách sàn một nắm tay.',
        'Đẩy sàn lên cho tới khi duỗi thẳng tay.',
      ],
      mistakes: ['Hông võng xuống sàn', 'Khuỷu tay bẻ ngang sang hai bên'],
    },
  },
  squat: {
    en: {
      steps: [
        'Stand with feet shoulder-width apart, toes slightly out, chest up.',
        'Push your hips back and down until your thighs reach knee height.',
        'Drive through your heels to stand back up tall.',
      ],
      mistakes: ['Knees caving inward', 'Heels lifting off the floor'],
    },
    vi: {
      steps: [
        'Đứng chân rộng bằng vai, mũi chân hơi mở, ngực mở.',
        'Đẩy hông ra sau và hạ xuống tới khi đùi ngang gối.',
        'Dồn lực vào gót chân, đứng thẳng lên.',
      ],
      mistakes: ['Gối chụm vào trong', 'Nhấc gót khỏi sàn'],
    },
  },
  situp: {
    en: {
      steps: [
        'Lie on your back, knees bent, feet flat, hands across your chest.',
        'Tighten your stomach and curl your body all the way up.',
        'Lower back down slowly, one vertebra at a time.',
      ],
      mistakes: ['Yanking your head up with your hands', 'Dropping back down without control'],
    },
    vi: {
      steps: [
        'Nằm ngửa, co gối, bàn chân áp sàn, tay bắt chéo trước ngực.',
        'Siết bụng, gập người lên hết cỡ.',
        'Hạ lưng xuống chậm rãi, từng đốt sống một.',
      ],
      mistakes: ['Dùng tay kéo đầu lên', 'Thả người rơi xuống không kiểm soát'],
    },
  },
  jumpingjack: {
    en: {
      steps: [
        'Stand tall, feet together, arms by your sides.',
        'Jump your feet wide as your hands swing up overhead.',
        'Jump back to feet together and lower your arms.',
        'Land softly on the balls of your feet and keep a steady rhythm.',
      ],
      mistakes: ['Landing hard on straight knees', 'Stopping the arms halfway up'],
    },
    vi: {
      steps: [
        'Đứng thẳng, khép chân, tay xuôi theo người.',
        'Bật chân rộng đồng thời vung tay lên qua đầu.',
        'Bật về khép chân và hạ tay xuống.',
        'Tiếp đất nhẹ bằng mũi chân, giữ nhịp đều.',
      ],
      mistakes: ['Tiếp đất mạnh với gối thẳng cứng', 'Chỉ đưa tay lên nửa chừng'],
    },
  },

  // --- chest and triceps --------------------------------------------------
  kneepushup: {
    en: {
      steps: [
        'Knees on the floor, hands under your shoulders, straight line from knees to head.',
        'Bend your elbows and lower your chest to a fist from the floor.',
        'Push back up until your arms are straight.',
      ],
      mistakes: ['Hips piked up in the air', 'Only bending at the waist instead of the elbows'],
    },
    vi: {
      steps: [
        'Gối chạm sàn, tay dưới vai, thân thẳng từ gối tới đầu.',
        'Gập khuỷu, hạ ngực xuống cách sàn một nắm tay.',
        'Đẩy lên tới khi duỗi thẳng tay.',
      ],
      mistakes: ['Chổng mông lên cao', 'Chỉ gập eo thay vì gập khuỷu'],
    },
  },
  widepushup: {
    en: {
      steps: [
        'Hands about twice shoulder-width, body straight from head to heels.',
        'Lower your chest toward the floor, elbows bending out a little.',
        'Push back up until your arms are straight.',
      ],
      mistakes: ['Hips sagging toward the floor', 'Hands so wide your shoulders hurt'],
    },
    vi: {
      steps: [
        'Hai tay rộng gấp đôi vai, thân thẳng từ đầu tới gót.',
        'Hạ ngực xuống sàn, khuỷu hơi mở ra hai bên.',
        'Đẩy lên tới khi duỗi thẳng tay.',
      ],
      mistakes: ['Hông võng xuống sàn', 'Tay đặt quá rộng gây đau vai'],
    },
  },
  diamondpushup: {
    en: {
      steps: [
        'Hands together under your chest, thumbs and index fingers forming a diamond.',
        'Lower your chest to your hands, elbows close to your body.',
        'Push back up until your arms are straight.',
      ],
      mistakes: ['Elbows flaring out to the sides', 'Hips sagging toward the floor'],
    },
    vi: {
      steps: [
        'Hai tay chụm dưới ngực, ngón cái và ngón trỏ tạo hình kim cương.',
        'Hạ ngực xuống sát tay, khuỷu ép sát thân.',
        'Đẩy lên tới khi duỗi thẳng tay.',
      ],
      mistakes: ['Khuỷu bẻ ngang sang hai bên', 'Hông võng xuống sàn'],
    },
  },
  inclinepushup: {
    en: {
      steps: [
        'Hands on the edge of a sturdy bench or table, body straight from head to heels.',
        'Bend your elbows and lower your chest to the edge.',
        'Push back up until your arms are straight.',
      ],
      mistakes: ['Using a table or chair that can slide', 'Hips sagging or piking up'],
    },
    vi: {
      steps: [
        'Chống tay lên mép ghế băng hoặc bàn chắc chắn, thân thẳng từ đầu tới gót.',
        'Gập khuỷu, hạ ngực xuống sát mép.',
        'Đẩy lên tới khi duỗi thẳng tay.',
      ],
      mistakes: ['Dùng bàn ghế dễ trượt', 'Hông võng xuống hoặc chổng lên'],
    },
  },
  declinepushup: {
    en: {
      steps: [
        'Feet on a sturdy bench or chair, hands on the floor under your shoulders.',
        'Bend your elbows and lower your chest toward the floor.',
        'Push back up until your arms are straight.',
      ],
      mistakes: ['Hips sagging toward the floor', 'Dropping your head toward the floor first'],
    },
    vi: {
      steps: [
        'Gác chân lên ghế băng hoặc ghế chắc chắn, tay chống sàn dưới vai.',
        'Gập khuỷu, hạ ngực xuống sàn.',
        'Đẩy lên tới khi duỗi thẳng tay.',
      ],
      mistakes: ['Hông võng xuống sàn', 'Cúi đầu chúi xuống trước'],
    },
  },
  dip: {
    en: {
      steps: [
        'Hands on the edge of a sturdy chair or bench behind you, fingers forward.',
        'Bend your elbows straight back and lower until they reach 90°.',
        'Press through your palms to straighten your arms again.',
      ],
      mistakes: ['Going lower than 90° at the elbows', 'Shoulders shrugging up to your ears'],
    },
    vi: {
      steps: [
        'Chống tay lên mép ghế hoặc ghế băng chắc chắn phía sau, ngón tay hướng ra trước.',
        'Gập khuỷu thẳng ra sau, hạ người tới khi khuỷu vuông góc 90°.',
        'Ấn lòng bàn tay, duỗi thẳng tay đẩy người lên.',
      ],
      mistakes: ['Hạ thấp quá 90° ở khuỷu', 'Nhún vai lên sát tai'],
    },
  },

  // --- shoulders and arms -------------------------------------------------
  pikepushup: {
    en: {
      steps: [
        'Hands and feet on the floor, hips high so your body makes an upside-down V.',
        'Bend your elbows and lower the top of your head toward the floor.',
        'Push back up until your arms are straight.',
      ],
      mistakes: ['Letting the hips drop into a normal push-up', 'Elbows flaring out to the sides'],
    },
    vi: {
      steps: [
        'Tay và chân chống sàn, đẩy hông lên cao thành hình chữ V ngược.',
        'Gập khuỷu, hạ đỉnh đầu xuống gần sàn.',
        'Đẩy lên tới khi duỗi thẳng tay.',
      ],
      mistakes: ['Hạ hông thành hít đất thường', 'Khuỷu bẻ ngang sang hai bên'],
    },
  },
  shoulderpress: {
    en: {
      steps: [
        'Stand tall holding light dumbbells or water bottles at shoulder height.',
        'Press them straight up until your arms are fully extended overhead.',
        'Lower them slowly back to shoulder height.',
      ],
      mistakes: ['Arching your lower back', 'Using weights too heavy to control'],
    },
    vi: {
      steps: [
        'Đứng thẳng, cầm tạ nhẹ hoặc chai nước ngang vai.',
        'Đẩy thẳng lên tới khi duỗi hết tay qua đầu.',
        'Hạ chậm về ngang vai.',
      ],
      mistakes: ['Ưỡn cong lưng dưới', 'Dùng tạ quá nặng không kiểm soát được'],
    },
  },
  lateralraise: {
    en: {
      steps: [
        'Stand tall, light dumbbells or water bottles at your sides, elbows soft.',
        'Raise your arms out to the sides up to shoulder height.',
        'Lower them slowly back to your sides.',
      ],
      mistakes: ['Swinging the weights up with your body', 'Raising the arms above shoulder height'],
    },
    vi: {
      steps: [
        'Đứng thẳng, cầm tạ nhẹ hoặc chai nước hai bên, khuỷu hơi chùng.',
        'Nâng hai tay sang ngang lên tới ngang vai.',
        'Hạ chậm về hai bên người.',
      ],
      mistakes: ['Lắc người lấy đà để nâng', 'Nâng tay cao quá vai'],
    },
  },
  frontraise: {
    en: {
      steps: [
        'Stand tall, light dumbbells or water bottles in front of your thighs.',
        'Raise your arms straight in front of you up to shoulder height.',
        'Lower them slowly back to your thighs.',
      ],
      mistakes: ['Leaning back to swing the weights up', 'Shrugging your shoulders'],
    },
    vi: {
      steps: [
        'Đứng thẳng, cầm tạ nhẹ hoặc chai nước trước đùi.',
        'Nâng thẳng tay ra trước lên tới ngang vai.',
        'Hạ chậm về trước đùi.',
      ],
      mistakes: ['Ngả người ra sau lấy đà', 'Nhún vai lên'],
    },
  },
  bicepcurl: {
    en: {
      steps: [
        'Stand tall, light dumbbells or water bottles at your sides, palms forward.',
        'Bend your elbows and curl the weights up to your shoulders.',
        'Lower them slowly until your arms are straight.',
      ],
      mistakes: ['Elbows drifting forward away from your body', 'Swinging your back to lift'],
    },
    vi: {
      steps: [
        'Đứng thẳng, cầm tạ nhẹ hoặc chai nước hai bên, lòng bàn tay hướng ra trước.',
        'Gập khuỷu, cuốn tạ lên sát vai.',
        'Hạ chậm tới khi duỗi thẳng tay.',
      ],
      mistakes: ['Khuỷu đưa ra trước rời khỏi thân', 'Lắc lưng lấy đà'],
    },
  },
  armcircles: {
    en: {
      steps: [
        'Stand tall, feet hip-width apart.',
        'Raise your arms straight out to the sides at shoulder height.',
        'Hold them there and make small circles until the time is up.',
        'Switch the direction of the circles halfway through.',
      ],
      mistakes: ['Letting the arms drop below shoulder height', 'Shrugging your shoulders to your ears'],
    },
    vi: {
      steps: [
        'Đứng thẳng, chân rộng bằng hông.',
        'Dang thẳng hai tay sang ngang, ngang vai.',
        'Giữ tay ở đó và xoay vòng nhỏ cho tới hết giờ.',
        'Đổi chiều xoay khi được nửa thời gian.',
      ],
      mistakes: ['Để tay rơi thấp hơn vai', 'Nhún vai lên sát tai'],
    },
  },

  // --- legs and glutes ----------------------------------------------------
  sumosquat: {
    en: {
      steps: [
        'Feet wider than shoulders, toes turned out, chest up.',
        'Sit your hips straight down, knees pushing out over your toes.',
        'Drive through your heels to stand back up.',
      ],
      mistakes: ['Knees caving inward', 'Leaning your chest forward'],
    },
    vi: {
      steps: [
        'Chân rộng hơn vai, mũi chân mở ra ngoài, ngực mở.',
        'Hạ hông thẳng xuống, gối mở theo hướng mũi chân.',
        'Dồn lực vào gót chân, đứng thẳng lên.',
      ],
      mistakes: ['Gối chụm vào trong', 'Đổ ngực về trước'],
    },
  },
  lunge: {
    en: {
      steps: [
        'Stand tall, feet hip-width apart, hands on your hips.',
        'Step forward and lower until both knees are bent at about 90°.',
        'Push off the front foot to step back to standing.',
        'Alternate legs each rep.',
      ],
      mistakes: ['Front knee caving inward', 'Leaning your chest far forward'],
    },
    vi: {
      steps: [
        'Đứng thẳng, chân rộng bằng hông, tay chống hông.',
        'Bước một chân lên trước, hạ người tới khi hai gối gập khoảng 90°.',
        'Đạp chân trước để lùi về tư thế đứng.',
        'Đổi chân luân phiên mỗi lần.',
      ],
      mistakes: ['Gối trước đổ vào trong', 'Đổ ngực quá nhiều về trước'],
    },
  },
  sidelunge: {
    en: {
      steps: [
        'Stand tall with your feet together, chest up.',
        'Step wide to one side and sit your hips back over that bent knee.',
        'Push off that foot to come back to the middle.',
        'Alternate sides each rep.',
      ],
      mistakes: ['Bent knee caving inward', 'Lifting the heel of the bent leg'],
    },
    vi: {
      steps: [
        'Đứng thẳng, khép chân, ngực mở.',
        'Bước rộng sang một bên, đẩy hông ra sau trên gối đang gập.',
        'Đạp chân đó để về lại giữa.',
        'Đổi bên luân phiên mỗi lần.',
      ],
      mistakes: ['Gối gập đổ vào trong', 'Nhấc gót chân đang gập'],
    },
  },
  splitsquat: {
    en: {
      steps: [
        'Stand in a long split stance, one foot forward, back heel up.',
        'Lower straight down until the back knee nearly touches the floor.',
        'Push through the front heel to rise back up.',
        'Do all your reps, then switch legs.',
      ],
      mistakes: ['Front knee caving inward', 'Feet too close together for balance'],
    },
    vi: {
      steps: [
        'Đứng tách chân trước sau, gót chân sau nhấc lên.',
        'Hạ thẳng người xuống tới khi gối sau gần chạm sàn.',
        'Dồn lực vào gót chân trước để đứng lên.',
        'Tập hết số lần một bên rồi đổi chân.',
      ],
      mistakes: ['Gối trước đổ vào trong', 'Hai chân đứng quá gần, mất thăng bằng'],
    },
  },
  wallsit: {
    en: {
      steps: [
        'Stand with your back flat against a wall, feet a step out from it.',
        'Slide down until your knees are bent at about 90°.',
        'Hold there, back on the wall and knees over your ankles.',
      ],
      mistakes: ['Hips higher than the knees', 'Resting your hands on your thighs'],
    },
    vi: {
      steps: [
        'Đứng áp lưng vào tường, bàn chân cách tường một bước.',
        'Trượt người xuống tới khi gối gập khoảng 90°.',
        'Giữ nguyên, lưng áp tường, gối thẳng trên cổ chân.',
      ],
      mistakes: ['Hông cao hơn gối', 'Chống tay lên đùi'],
    },
  },
  glutebridge: {
    en: {
      steps: [
        'Lie on your back, knees bent, feet flat near your hips.',
        'Squeeze your glutes and lift your hips into a line from knees to shoulders.',
        'Lower your hips slowly back to the floor.',
      ],
      mistakes: ['Arching your lower back at the top', 'Pushing through your toes instead of your heels'],
    },
    vi: {
      steps: [
        'Nằm ngửa, co gối, bàn chân áp sàn gần mông.',
        'Siết mông, nâng hông lên tới khi thân thẳng từ gối tới vai.',
        'Hạ hông chậm về sàn.',
      ],
      mistakes: ['Ưỡn cong lưng dưới khi lên', 'Dồn lực vào mũi chân thay vì gót'],
    },
  },
  singlelegbridge: {
    en: {
      steps: [
        'Lie on your back, one foot flat on the floor, the other leg straight up or out.',
        'Push through the planted heel and lift your hips in line with your knees.',
        'Lower your hips slowly back to the floor.',
        'Do all your reps, then switch legs.',
      ],
      mistakes: ['Hips tilting to one side', 'Arching your lower back'],
    },
    vi: {
      steps: [
        'Nằm ngửa, một bàn chân áp sàn, chân kia duỗi thẳng.',
        'Dồn lực vào gót chân trụ, nâng hông lên thẳng hàng với gối.',
        'Hạ hông chậm về sàn.',
        'Tập hết số lần một bên rồi đổi chân.',
      ],
      mistakes: ['Hông nghiêng lệch sang một bên', 'Ưỡn cong lưng dưới'],
    },
  },
  donkeykick: {
    en: {
      steps: [
        'On hands and knees, hands under shoulders, knees under hips.',
        'Keeping the knee bent, kick one foot up toward the ceiling.',
        'Lower the knee back down without touching the floor.',
        'Do all your reps, then switch legs.',
      ],
      mistakes: ['Arching your lower back to kick higher', 'Swinging the leg with momentum'],
    },
    vi: {
      steps: [
        'Quỳ bốn điểm, tay dưới vai, gối dưới hông.',
        'Giữ gối gập, đá một bàn chân lên phía trần.',
        'Hạ gối xuống, không chạm sàn.',
        'Tập hết số lần một bên rồi đổi chân.',
      ],
      mistakes: ['Ưỡn lưng để đá cao hơn', 'Vung chân lấy đà'],
    },
  },
  firehydrant: {
    en: {
      steps: [
        'On hands and knees, hands under shoulders, knees under hips.',
        'Keeping the knee bent, lift one leg out to the side to hip height.',
        'Lower it slowly back down.',
        'Do all your reps, then switch legs.',
      ],
      mistakes: ['Leaning your body away from the lifting leg', 'Rushing the movement'],
    },
    vi: {
      steps: [
        'Quỳ bốn điểm, tay dưới vai, gối dưới hông.',
        'Giữ gối gập, mở một chân sang ngang lên ngang hông.',
        'Hạ chân chậm về chỗ cũ.',
        'Tập hết số lần một bên rồi đổi chân.',
      ],
      mistakes: ['Nghiêng người sang phía ngược lại', 'Làm quá nhanh'],
    },
  },
  goodmorning: {
    en: {
      steps: [
        'Stand with feet hip-width apart, hands behind your head, knees soft.',
        'Push your hips back and hinge forward with a flat back until near level.',
        'Squeeze your glutes to bring your body back up tall.',
      ],
      mistakes: ['Rounding your back', 'Bending the knees into a squat'],
    },
    vi: {
      steps: [
        'Đứng chân rộng bằng hông, tay đặt sau đầu, gối hơi chùng.',
        'Đẩy hông ra sau, gập người về trước, lưng thẳng tới gần ngang sàn.',
        'Siết mông, đưa người đứng thẳng lên.',
      ],
      mistakes: ['Cong gù lưng', 'Gập gối thành squat'],
    },
  },

  // --- core ---------------------------------------------------------------
  crunch: {
    en: {
      steps: [
        'Lie on your back, knees bent, feet flat, fingertips by your ears.',
        'Tighten your stomach and lift your shoulder blades off the floor.',
        'Lower your shoulders slowly back down.',
      ],
      mistakes: ['Pulling on your neck with your hands', 'Lifting all the way up like a sit-up'],
    },
    vi: {
      steps: [
        'Nằm ngửa, co gối, bàn chân áp sàn, đầu ngón tay để cạnh tai.',
        'Siết bụng, nâng bả vai lên khỏi sàn.',
        'Hạ vai chậm xuống.',
      ],
      mistakes: ['Dùng tay kéo cổ', 'Gập người lên hết như gập bụng thường'],
    },
  },
  legraise: {
    en: {
      steps: [
        'Lie on your back, legs straight, hands flat under your hips.',
        'Keeping the legs straight, lift them until they point at the ceiling.',
        'Lower them slowly until they hover just above the floor.',
      ],
      mistakes: ['Lower back arching off the floor', 'Dropping the legs fast'],
    },
    vi: {
      steps: [
        'Nằm ngửa, duỗi thẳng chân, hai tay úp dưới hông.',
        'Giữ chân thẳng, nâng lên tới khi hướng lên trần.',
        'Hạ chân chậm tới khi lơ lửng sát sàn.',
      ],
      mistakes: ['Lưng dưới ưỡn khỏi sàn', 'Thả chân rơi nhanh'],
    },
  },
  bicyclecrunch: {
    en: {
      steps: [
        'Lie on your back, hands by your ears, shoulders and feet off the floor.',
        'Bring one knee in as you turn the opposite elbow toward it.',
        'Straighten that leg as you switch to the other side.',
        'Keep a steady pedaling rhythm, one side then the other.',
      ],
      mistakes: ['Pulling on your neck with your hands', 'Only moving the elbows, not the shoulders'],
    },
    vi: {
      steps: [
        'Nằm ngửa, tay để cạnh tai, nhấc vai và chân khỏi sàn.',
        'Co một gối vào đồng thời xoay khuỷu tay bên kia về phía gối.',
        'Duỗi chân đó ra khi đổi sang bên kia.',
        'Giữ nhịp đạp đều, luân phiên hai bên.',
      ],
      mistakes: ['Dùng tay kéo cổ', 'Chỉ đưa khuỷu mà không xoay vai'],
    },
  },
  mountainclimber: {
    en: {
      steps: [
        'Start in a high plank, hands under your shoulders, body straight.',
        'Drive one knee in toward your chest.',
        'Switch legs quickly, bringing the other knee in.',
        'Keep your hips low and a steady, brisk pace.',
      ],
      mistakes: ['Hips bouncing up high', 'Shoulders drifting behind your hands'],
    },
    vi: {
      steps: [
        'Vào tư thế plank tay thẳng, tay dưới vai, thân thẳng.',
        'Kéo một gối lên về phía ngực.',
        'Đổi chân nhanh, kéo gối kia lên.',
        'Giữ hông thấp và nhịp đều, nhanh.',
      ],
      mistakes: ['Hông nhấp nhô lên cao', 'Vai lùi ra sau tay'],
    },
  },
  russiantwist: {
    en: {
      steps: [
        'Sit with knees bent, lean back slightly with a straight back, hands together.',
        'Rotate your upper body to bring your hands beside one hip.',
        'Turn through the middle to the other side.',
        'Each touch counts; lift your feet only if you can keep your back straight.',
      ],
      mistakes: ['Rounding your back', 'Only moving the arms, not the shoulders'],
    },
    vi: {
      steps: [
        'Ngồi co gối, ngả nhẹ ra sau với lưng thẳng, hai tay chắp lại.',
        'Xoay thân trên, đưa tay xuống cạnh một bên hông.',
        'Xoay qua giữa sang bên kia.',
        'Mỗi lần chạm tính một lần; chỉ nhấc chân nếu vẫn giữ được lưng thẳng.',
      ],
      mistakes: ['Cong gù lưng', 'Chỉ đưa tay mà không xoay vai'],
    },
  },
  plank: {
    en: {
      steps: [
        'Forearms on the floor, elbows under your shoulders.',
        'Step your feet back so your body is straight from head to heels.',
        'Hold, squeezing your stomach and glutes, until the time is up.',
      ],
      mistakes: ['Hips sagging toward the floor', 'Hips piked up in the air'],
    },
    vi: {
      steps: [
        'Chống cẳng tay xuống sàn, khuỷu dưới vai.',
        'Duỗi chân ra sau để thân thẳng từ đầu tới gót.',
        'Giữ nguyên, siết bụng và mông cho tới hết giờ.',
      ],
      mistakes: ['Hông võng xuống sàn', 'Chổng mông lên cao'],
    },
  },
  sideplank: {
    en: {
      steps: [
        'Lie on your side, forearm on the floor, elbow under your shoulder.',
        'Lift your hips so your body is straight from head to feet.',
        'Hold there, hips high, until the time is up.',
        'Do both sides.',
      ],
      mistakes: ['Hips sinking toward the floor', 'Rolling your chest forward'],
    },
    vi: {
      steps: [
        'Nằm nghiêng, chống cẳng tay xuống sàn, khuỷu dưới vai.',
        'Nâng hông lên để thân thẳng từ đầu tới chân.',
        'Giữ nguyên, hông cao, cho tới hết giờ.',
        'Tập cả hai bên.',
      ],
      mistakes: ['Hông sụp xuống sàn', 'Xoay ngực úp về trước'],
    },
  },
  hollowhold: {
    en: {
      steps: [
        'Lie on your back, arms overhead, legs straight.',
        'Press your lower back into the floor and lift shoulders and legs off it.',
        'Hold that banana shape until the time is up.',
        'Bend your knees or bring your arms in to make it easier.',
      ],
      mistakes: ['Lower back lifting off the floor', 'Legs held so high it gets too easy'],
    },
    vi: {
      steps: [
        'Nằm ngửa, tay duỗi qua đầu, chân duỗi thẳng.',
        'Ép lưng dưới xuống sàn, nhấc vai và chân lên khỏi sàn.',
        'Giữ dáng hình thuyền đó cho tới hết giờ.',
        'Co gối hoặc thu tay lại cho dễ hơn.',
      ],
      mistakes: ['Lưng dưới bị nhấc khỏi sàn', 'Nâng chân quá cao làm bài tập quá dễ'],
    },
  },
  superman: {
    en: {
      steps: [
        'Lie face down, arms stretched out in front, legs straight.',
        'Lift your arms, chest and legs a few centimetres off the floor.',
        'Hold there, looking at the floor, until the time is up.',
      ],
      mistakes: ['Craning your neck to look forward', 'Bending the knees to lift the legs'],
    },
    vi: {
      steps: [
        'Nằm sấp, tay duỗi thẳng ra trước, chân duỗi thẳng.',
        'Nâng tay, ngực và chân lên khỏi sàn vài cm.',
        'Giữ nguyên, mắt nhìn xuống sàn, cho tới hết giờ.',
      ],
      mistakes: ['Ngửa cổ nhìn ra trước', 'Gập gối để nâng chân'],
    },
  },

  // --- cardio -------------------------------------------------------------
  highknees: {
    en: {
      steps: [
        'Stand tall, feet hip-width apart, arms bent.',
        'Run in place, driving one knee up to hip height.',
        'Switch legs quickly, pumping your arms.',
        'Stay light on the balls of your feet.',
      ],
      mistakes: ['Knees staying low', 'Leaning back as you run'],
    },
    vi: {
      steps: [
        'Đứng thẳng, chân rộng bằng hông, tay co.',
        'Chạy tại chỗ, nâng một gối lên ngang hông.',
        'Đổi chân nhanh, đánh tay theo nhịp.',
        'Giữ người nhẹ nhàng trên mũi chân.',
      ],
      mistakes: ['Gối nâng quá thấp', 'Ngả người ra sau khi chạy'],
    },
  },
  buttkicks: {
    en: {
      steps: [
        'Stand tall, feet hip-width apart, arms bent.',
        'Run in place, kicking one heel up toward your glutes.',
        'Switch legs quickly, pumping your arms.',
        'Stay light on the balls of your feet.',
      ],
      mistakes: ['Heels not coming up high enough', 'Leaning forward from the waist'],
    },
    vi: {
      steps: [
        'Đứng thẳng, chân rộng bằng hông, tay co.',
        'Chạy tại chỗ, đá gót chân lên chạm mông.',
        'Đổi chân nhanh, đánh tay theo nhịp.',
        'Giữ người nhẹ nhàng trên mũi chân.',
      ],
      mistakes: ['Gót chân đá chưa đủ cao', 'Gập người về trước'],
    },
  },
  burpee: {
    en: {
      steps: [
        'Stand tall, then squat down and put your hands on the floor.',
        'Jump your feet back into a plank and lower your chest.',
        'Push up, jump your feet back to your hands, and jump up with arms overhead.',
        'Land softly and go straight into the next rep.',
      ],
      mistakes: ['Hips sagging in the plank', 'Landing hard on straight knees'],
    },
    vi: {
      steps: [
        'Đứng thẳng, rồi ngồi xuống chống hai tay xuống sàn.',
        'Bật chân ra sau thành plank và hạ ngực xuống.',
        'Đẩy lên, bật chân về sát tay, rồi bật nhảy lên giơ tay qua đầu.',
        'Tiếp đất nhẹ nhàng rồi làm ngay lần tiếp theo.',
      ],
      mistakes: ['Hông võng xuống khi plank', 'Tiếp đất mạnh với gối thẳng cứng'],
    },
  },
};

/** The guide screen's own labels, and the switch for spoken form mistakes. */
const GUIDE_COMMON = {
  en: {
    'guide.title': 'How to do it',
    'guide.button': 'How to',
    'guide.steps': 'Steps',
    'guide.mistakes': 'Avoid',
    'guide.drag': 'Drag to turn the figure',
    'guide.slow': 'Slow motion',
    'guide.normal': 'Normal speed',
    'guide.breatheReps': 'Breathe out on the effort, in on the way back.',
    'guide.breatheHold': "Breathe steadily, don't hold your breath.",
    'guide.open': 'How to do {name}',
    'guide.offline': 'The 3D figure needs the internet the first time.',
    'guide.details': 'Details',
    'guide.hide': 'Hide the guide',
    'guide.upNext': 'Next',
    'settings.coachVoice': 'Say form mistakes',
    'settings.coachVoiceBody': 'With the camera, says what to fix out loud: "Keep your body straight", "Go lower".',
  },
  vi: {
    'guide.title': 'Cách tập',
    'guide.button': 'Cách tập',
    'guide.steps': 'Các bước',
    'guide.mistakes': 'Tránh',
    'guide.drag': 'Kéo để xoay người mẫu',
    'guide.slow': 'Chậm',
    'guide.normal': 'Bình thường',
    'guide.breatheReps': 'Thở ra khi gắng sức, hít vào khi trở về.',
    'guide.breatheHold': 'Thở đều, đừng nín thở.',
    'guide.open': 'Cách tập {name}',
    'guide.offline': 'Người mẫu 3D cần mạng ở lần mở đầu tiên.',
    'guide.details': 'Chi tiết',
    'guide.hide': 'Ẩn hướng dẫn',
    'guide.upNext': 'Tiếp',
    'settings.coachVoice': 'Đọc lỗi tư thế',
    'settings.coachVoiceBody': 'Khi tập bằng camera, đọc to chỗ cần sửa: "Giữ thẳng người", "Xuống thấp hơn".',
  },
};

function flattenGuide(lang) {
  const out = { ...GUIDE_COMMON[lang] };
  for (const [id, entry] of Object.entries(GUIDE)) {
    const { steps, mistakes } = entry[lang];
    out[`guide.${id}.steps`] = steps.join('\n');
    out[`guide.${id}.mistakes`] = mistakes.join('\n');
  }
  return out;
}

export const GUIDE_STRINGS = { en: flattenGuide('en'), vi: flattenGuide('vi') };
