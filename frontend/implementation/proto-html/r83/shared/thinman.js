(() => {
  var __defProp = Object.defineProperty;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

  // wt-lead/frontend/implementation/src/game/character/character-rig-constants.ts
  var DEG_TO_RAD = Math.PI / 180;
  var TAU = Math.PI * 2;
  var CHARACTER_B_K = {
    KX: 253.1,
    KY: 905,
    AX: 261.7,
    AY: 1026,
    JR: 6.6,
    SPX: 257,
    SPY: 418,
    ALPHA: 17,
    LPX: 251,
    LPY: 783
  };
  var CHARACTER_A_CONFIG = {
    Lt: 44,
    Ls: 48,
    H: 391,
    cx: 104,
    S: 0.95,
    W: 208,
    vb: "-6 0 212 402",
    gl: [10, 198, 392],
    gw: 3
  };
  var CHARACTER_B_CONFIG = {
    Lt: CHARACTER_B_K.KY - CHARACTER_B_K.LPY,
    // 122
    Ls: CHARACTER_B_K.AY - CHARACTER_B_K.KY,
    // 121
    H: 1048,
    cx: 195,
    S: 0.36,
    W: 390,
    vb: "-8 -8 410 1069",
    gl: [10, 384, 1052],
    gw: 5
  };
  var POSES = {
    STAND: [-7, 2, 8, 3, 6.8, -6, 0],
    CROUCH: [-46, 90, -40, 84, 38, 34, 5],
    RISE: [-60, 95, -14, 58, -125, -98, -4],
    APEX: [-72, 102, -38, 78, -105, -75, 0],
    FALL: [-18, 20, 8, 24, -62, 24, 3],
    LAND: [-50, 96, -42, 88, -26, -14, 7]
  };

  // wt-lead/frontend/implementation/src/game/character/pose-math.ts
  function legAngles(p) {
    const normP = (p % 1 + 1) % 1;
    const thigh = -3 - 24 * Math.cos(TAU * normP);
    const shin = 4 + (normP < 0.5 ? 7 * Math.sin(TAU * normP) : 52 * Math.sin(TAU * (normP - 0.5)));
    return [thigh, shin];
  }
  function walkT(p) {
    const a = legAngles(p);
    const b = legAngles(p + 0.5);
    return [
      a[0],
      a[1],
      b[0],
      b[1],
      0.85 * b[0],
      0.85 * a[0],
      1.4 * Math.sin(TAU * 2 * p)
    ];
  }
  function mixPose(a, b, t) {
    return [
      a[0] + (b[0] - a[0]) * t,
      a[1] + (b[1] - a[1]) * t,
      a[2] + (b[2] - a[2]) * t,
      a[3] + (b[3] - a[3]) * t,
      a[4] + (b[4] - a[4]) * t,
      a[5] + (b[5] - a[5]) * t,
      a[6] + (b[6] - a[6]) * t
    ];
  }
  function fx(geom, legAngle) {
    return -(geom.Lt * Math.sin(legAngle[0] * DEG_TO_RAD) + geom.Ls * Math.sin((legAngle[0] + legAngle[1]) * DEG_TO_RAD));
  }
  function computeCharacterAStride() {
    const geom = CHARACTER_A_CONFIG;
    const fx0 = fx(geom, legAngles(0));
    const fx05 = fx(geom, legAngles(0.5));
    return 2 * (fx0 - fx05) * geom.S;
  }
  function computeFootDy(geom, pose, airRatio = 0) {
    const yContact = (thigh, shin) => geom.Lt * Math.cos(thigh * DEG_TO_RAD) + geom.Ls * Math.cos((thigh + shin) * DEG_TO_RAD);
    const yA = yContact(pose[0], pose[1]);
    const yB = yContact(pose[2], pose[3]);
    const maxY = Math.max(yA, yB);
    return (1 - airRatio) * (geom.Lt + geom.Ls - maxY);
  }

  // wt-lead/frontend/implementation/src/game/character/character-a-svg.ts
  function handPath(x, y, r) {
    return `<path class="hnd" transform="translate(${x} ${y}) rotate(${r})" d="M-5 -1Q-8 6-3 11M0 0Q0 6 1 12M5 -1Q9 6 5 11"/>`;
  }
  function armGroup(upperAngle, foreAngle) {
    return `<g class="upper" transform="rotate(${upperAngle})"><path d="M0 0V54"/><g transform="translate(0 54)"><g class="fore" transform="rotate(${foreAngle})"><path d="M0 0V54"/>${handPath(0, 55, 0)}</g></g></g>`;
  }
  function legGroup(thighAngle, shinAngle, footAngle) {
    return `<g class="thigh" transform="rotate(${thighAngle})"><path d="M0 0V44"/><g transform="translate(0 44)"><g class="shin" transform="rotate(${shinAngle})"><path d="M0 0V48"/><g transform="translate(0 48)"><g class="foot" transform="rotate(${footAngle})"><path d="M-7 -1C2 -4 15 -3 20 0C15 4 2 4-7 2"/></g></g></g></g></g>`;
  }
  function renderCharacterAFrontSvg(back = false) {
    const cfg = CHARACTER_A_CONFIG;
    const eyes = back ? "" : '<ellipse class="eye dot" cx="83" cy="77" rx="3.4" ry="6.2"/><ellipse class="eye dot" cx="117" cy="77" rx="3.4" ry="6.2"/>';
    const feet = back ? "M79 386C70 383 62 383 55 387C62 391 70 391 79 389M125 386C134 383 142 383 149 386C142 390 134 390 125 389" : "M79 386C62 382 44 383 36 387C44 392 64 391 79 389M125 386C140 383 156 383 162 386C156 391 140 390 125 389";
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${cfg.vb}" width="${cfg.W}" height="${cfg.H}" role="img" aria-label="Character A Front"><style>.ch{fill:none;stroke:#000;stroke-width:5;stroke-linecap:round;stroke-linejoin:round}.ch .fill{fill:#fff}.ch .dot{fill:#000;stroke:none}.ch .hnd{stroke-width:3.6}</style><g class="ch"><path d="M84 297C83 330 81 360 79 386M118 297C119 330 122 360 125 386"/><path d="${feet}"/><path d="M97 150C82 182 62 224 50 266M119 148C134 180 150 224 160 266"/>${handPath(50, 268, 14)}${handPath(160, 268, -10)}<path class="fill" d="M105 118C99 168 77 232 72 272C71 291 84 298 100 298C118 298 132 297 132 280C132 238 120 176 111 118Z"/><ellipse class="fill" cx="100" cy="66" rx="72" ry="56"/>${eyes}</g></svg>`;
  }
  function renderCharacterASideSvg(pose = POSES.STAND, airRatio = 0) {
    const cfg = CHARACTER_A_CONFIG;
    const dy = computeFootDy(cfg, pose, airRatio);
    const tN = pose[0];
    const sN = pose[1];
    const fN = -(tN + sN) * 0.88;
    const tF = pose[2];
    const sF = pose[3];
    const fF = -(tF + sF) * 0.88;
    const aN = pose[4];
    const foreN = -Math.min(70, 14 + 0.4 * Math.max(0, -aN));
    const aF = pose[5];
    const foreF = -Math.min(70, 14 + 0.4 * Math.max(0, -aF));
    const tilt = pose[6];
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${cfg.vb}" width="${cfg.W}" height="${cfg.H}" role="img" aria-label="Character A Side"><style>.ch{fill:none;stroke:#000;stroke-width:5;stroke-linecap:round;stroke-linejoin:round}.ch .fill{fill:#fff}.ch .dot{fill:#000;stroke:none}.ch .hnd{stroke-width:3.6}</style><g class="ch rig"><g class="body-all" transform="translate(0 ${dy.toFixed(2)})"><g class="armF" transform="translate(104 152)">${armGroup(aF, foreF)}</g><g class="legF" transform="translate(102 296)">${legGroup(tF, sF, fF)}</g><g class="legN" transform="translate(102 296)">${legGroup(tN, sN, fN)}</g><path class="fill" d="M106 118C102 168 86 232 82 272C81 291 91 298 104 298C118 298 124 292 123 276C122 236 116 176 112 118Z"/><g class="armN" transform="translate(104 152)">${armGroup(aN, foreN)}</g><g class="head" transform="translate(104 128) rotate(${tilt}) translate(-104 -128)"><ellipse class="fill" cx="104" cy="66" rx="64" ry="56"/><ellipse class="eye dot" cx="130" cy="77" rx="3" ry="5.8"/><ellipse class="eye dot" cx="148" cy="77" rx="3.4" ry="6.2"/></g></g></g></svg>`;
  }

  // wt-lead/frontend/implementation/src/game/character/character-b-svg.ts
  var CHARACTER_B_PATHS = {
    head: "M202 324.4C188.6 324.5 176 324.3 162.7 323C-10.4 306.3 -53.6 124.4 94.1 32.6C125.9 12.8 153 4.9 190.4 0.7C211.4 -1.7 240.2 2.3 260.3 7.2C321.7 22.3 379 67.1 391.5 131.6C398.3 168.3 390.4 206.3 369.5 237.3C335.3 287.8 288.2 310.6 229.7 321.5Z",
    headFill: "M200.3 11.7C252.1 11.5 298 25.4 337.3 59.9C394.8 110.3 397.4 192.5 346.6 248.8C307.2 292.6 255.7 310.1 198.1 312.9C152.6 318.1 91.4 298.8 57.4 267.8C-2.1 213.6 5.6 132.7 57.9 76.5C95.1 37.2 146.2 13.9 200.3 11.7Z",
    eyeA: "M145.4 162.3C165.2 161.1 161.4 185.2 158.8 198.1C157.6 203.7 155 207.2 151 211.1C129.5 210.6 134.7 173 145.4 162.3Z",
    eyeB: "M233.3 162.9C254.1 166.7 250.4 201.5 237.8 213.2C223.4 213.1 222.5 198.4 222.9 186.9C223.3 177.6 225.6 168.7 233.3 162.9Z",
    torso: "M229.7 321.5C239.6 345.4 245.2 361.8 252.2 386.3L259.8 426.3C263.7 457.3 269.7 489.2 274.3 520.2C281.8 570.9 287.4 622.2 288.1 673.5C288.5 700.3 288.9 729.4 278.9 754.7C274.2 766.7 266 773 255.6 779.6L244.6 784C214.4 791.7 196.3 791.4 166.2 786.9C157.3 784.6 151.1 783 142.6 779.8L131.8 774.8C103.5 758.3 105.2 732.3 107 703.5C112.2 617.2 138.6 534.1 163.3 451.8C159.5 458 155.4 464.6 151.9 471.1L149.8 451.1C155.9 439.9 170.9 408.7 179.4 401.5C185.1 375.7 194 349.6 202 324.4Z",
    torsoFill: "M214.4 324.7L217.6 325.8C224.5 334 237.8 374.2 239.9 386.1C259.2 494.3 281 604.5 275.7 714.9C275 728.6 270.1 756.2 258.5 764.6C239 778.6 206 780.1 183 777.9C130.5 769.6 114.4 761.1 118.5 704.8C126.1 599.1 161.5 499.8 191.3 398.9C198.2 375.4 205.3 346.8 214.4 324.7Z",
    armR: "M252.2 386.3C266.8 398.5 309.6 525.1 318 551.9C332.6 599 349.8 658.7 359.7 707.5C366.9 713 371.3 716.7 374.9 725.6C377.9 732.9 378.4 749.5 369.3 752.8C366.1 750.6 365.2 731.2 362.4 723.7C362.1 735.5 363.7 757.5 347.7 758.8C346.5 757.8 345.4 757.2 346 755.3C351.7 738.2 352 731.8 349.4 714.1C345.5 718.8 337.5 730.9 330.5 728.9C327.4 718.5 340 709.2 348.9 706.3C345.8 696.4 343.2 683.2 340.6 672.9C336.4 656.4 332 639.8 327.4 623.3C307.5 551.8 289 494.1 259.8 426.3Z",
    armL: "M151.9 471.1C117.5 536 85.5 602.8 60.2 671.9C56.6 681.7 54 691.7 49.9 701.3L49.4 702.5C58.8 706.4 71.6 722.2 63.4 730C58.6 729.4 53.2 720.4 50.3 716.4L49.1 716.4C42.1 725.5 54.7 745.5 51.2 752.2C47.8 753.6 49.6 753.3 45.7 752.5C39.7 748 38.2 739.9 35.9 732.6C35.2 738.3 37.2 745.5 32.3 748L29.9 747C19.1 733 26.3 713.1 39.6 703.1C40.5 692.3 48.9 668.9 53 658.2C80.1 587.1 113.6 518 149.8 451.1Z",
    legR: "M255.6 779.6C257.5 862.2 257.9 941.1 267.3 1023.8C278.7 1023.7 290 1023.8 301.4 1024C308.8 1024.2 361.8 1025.5 358.7 1042.3C352 1058.5 323.1 1050.8 309.6 1047.9C300.3 1045.9 298.7 1035.9 297.5 1035.6C291.3 1034.5 267.4 1037.3 258.5 1033.8C253.8 1026.8 247.9 914.8 247 897.4C245.2 863.1 245 818.8 244.6 784Z",
    legL: "M142.6 779.8C139.5 795 137.4 815.1 135.7 830.6C130.7 880 128.5 929.7 129.2 979.4C129.2 986.9 131.5 1032.6 129 1035.6C123.7 1041.8 76.3 1047.6 65 1049.7C51.3 1052.2 15 1055.1 2.7 1045.9C0.8 1044.5 -0 1042.1 0 1039.8C0 1037.7 1.7 1034.1 3.5 1032.9C32.8 1014.1 88.6 1020.6 118.8 1023.8C116.1 944.4 118.9 852.6 131.8 774.8Z",
    footR: "M320.2 1037.7C326.6 1036.7 338.5 1038.9 344.8 1040.9C336.5 1042 327.7 1041.5 320.2 1037.7Z",
    footL: "M50 1031.8C65.8 1031.1 80.2 1031.8 96 1033.1C84.2 1035.9 67 1038.1 54.7 1040C39.2 1041 27.7 1041.7 12.1 1039.9C24.2 1035.7 37.3 1033.2 50 1031.8Z"
  };
  function renderCharacterBFrontSvg(back = false) {
    const P = CHARACTER_B_PATHS;
    const cfg = CHARACTER_B_CONFIG;
    const eyes = back ? "" : `<g stroke="none"><g class="eye"><path d="${P.eyeA}"/></g><g class="eye"><path d="${P.eyeB}"/></g></g>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${cfg.vb}" width="${cfg.W}" height="${cfg.H}" role="img" aria-label="Character B Front (Dev Preview)"><g fill="#020202" stroke="#020202" stroke-width=".6" stroke-linejoin="round"><path d="${P.armL}"/><path d="${P.armR}"/><path d="${P.legL}"/><path d="${P.legR}"/><path d="${P.torso}"/><path d="${P.head}"/><g fill="#F4F4F4" stroke="none"><path d="${P.torsoFill}"/><path d="${P.headFill}"/><path d="${P.footL}"/><path d="${P.footR}"/></g>${eyes}</g></svg>`;
  }
  function renderCharacterBSideSvg(pose = POSES.STAND, airRatio = 0, uid = "b_prev") {
    const P = CHARACTER_B_PATHS;
    const K = CHARACTER_B_K;
    const cfg = CHARACTER_B_CONFIG;
    const dy = computeFootDy(cfg, pose, airRatio);
    const T = `translate(${-K.LPX} ${-K.LPY})`;
    const Z = `translate(${-K.SPX} ${-K.SPY})`;
    const clipU = `<clipPath id="${uid}u"><rect x="-20" y="0" width="440" height="${K.KY}"/></clipPath>`;
    const clipS = `<clipPath id="${uid}s"><rect x="-20" y="${K.KY}" width="440" height="${K.AY - 4 - K.KY}"/></clipPath>`;
    const clipF = `<clipPath id="${uid}f"><rect x="-20" y="${K.AY - 4}" width="440" height="${1100 - (K.AY - 4)}"/></clipPath>`;
    const clipA = `<clipPath id="${uid}a"><rect x="-20" y="410" width="440" height="690"/></clipPath>`;
    const makeLeg = (cls, tDeg, sDeg, fDeg) => {
      return `<g transform="translate(195 ${K.LPY})"><g class="${cls}"><g class="thigh" transform="rotate(${tDeg})"><path transform="${T}" clip-path="url(#${uid}u)" d="${P.legR}"/><circle cx="${K.KX - K.LPX}" cy="${K.KY - K.LPY}" r="${K.JR}"/><g class="shin" transform="translate(${K.KX - K.LPX} ${K.KY - K.LPY}) rotate(${sDeg}) translate(${-(K.KX - K.LPX)} ${-(K.KY - K.LPY)})"><path transform="${T}" clip-path="url(#${uid}s)" d="${P.legR}"/><circle cx="${K.AX - K.LPX}" cy="${K.AY - K.LPY}" r="${K.JR}"/><g class="foot" transform="translate(${K.AX - K.LPX} ${K.AY - K.LPY}) rotate(${fDeg}) translate(${-(K.AX - K.LPX)} ${-(K.AY - K.LPY)})"><path transform="${T}" clip-path="url(#${uid}f)" d="${P.legR}"/><path transform="${T}" fill="#F4F4F4" d="${P.footR}"/></g></g></g></g></g>`;
    };
    const makeArm = (cls, rotDeg) => {
      return `<g transform="translate(195 ${K.SPY})"><g class="${cls}" transform="rotate(${rotDeg})"><path transform="${Z}" clip-path="url(#${uid}a)" d="${P.armR}"/><circle r="5.5"/></g></g>`;
    };
    const tN = pose[0];
    const sN = pose[1];
    const fN = -(tN + sN) * 0.88;
    const tF = pose[2];
    const sF = pose[3];
    const fF = -(tF + sF) * 0.88;
    const armNRot = K.ALPHA + pose[4];
    const armFRot = K.ALPHA + pose[5];
    const tilt = pose[6];
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${cfg.vb}" width="${cfg.W}" height="${cfg.H}" role="img" aria-label="Character B Side (Dev Preview)"><g class="rig"><defs>${clipU}${clipS}${clipF}${clipA}</defs><g class="body-all" fill="#020202" transform="translate(0 ${dy.toFixed(2)})">${makeArm("armF", armFRot)}${makeLeg("legF", tF, sF, fF)}${makeLeg("legN", tN, sN, fN)}<g transform="translate(195 0) scale(.7 1) translate(-195 0)"><path stroke="#020202" stroke-width="5" stroke-linejoin="round" d="${P.torso}"/><path fill="#F4F4F4" d="${P.torsoFill}"/></g>${makeArm("armN", armNRot)}<g class="head" transform="translate(200 323) rotate(${tilt}) translate(-200 -323)"><path d="${P.head}"/><path fill="#F4F4F4" d="${P.headFill}"/><g class="eye"><path transform="translate(113.5 0)" d="${P.eyeA}"/></g><g class="eye"><path transform="translate(86.5 0)" d="${P.eyeB}"/></g></g></g></g></svg>`;
  }

  // wt-lead/frontend/implementation/src/game/character/character-animation-adapter.ts
  var CharacterAnimationAdapter = class {
    constructor(options = {}) {
      __publicField(this, "variant");
      __publicField(this, "reducedMotion");
      __publicField(this, "geom");
      __publicField(this, "stride");
      __publicField(this, "currentPoseName", "STAND");
      __publicField(this, "curPose", [...POSES.STAND]);
      __publicField(this, "walkPhase", 0);
      __publicField(this, "wasGrounded", true);
      __publicField(this, "landTimer", 0);
      __publicField(this, "landIntensity", 0);
      __publicField(this, "airBlend", 0);
      __publicField(this, "disposed", false);
      var _a, _b;
      this.variant = (_a = options.variant) != null ? _a : "A";
      this.reducedMotion = (_b = options.reducedMotion) != null ? _b : false;
      this.geom = this.variant === "B" ? CHARACTER_B_CONFIG : CHARACTER_A_CONFIG;
      this.stride = computeCharacterAStride();
    }
    getVariant() {
      return this.variant;
    }
    getCurrentPoseName() {
      return this.currentPoseName;
    }
    getWalkPhase() {
      return this.walkPhase;
    }
    getCurrentPoseAngles() {
      return this.curPose;
    }
    getAirBlend() {
      return this.airBlend;
    }
    update(state, dt) {
      if (this.disposed) return;
      if (state.terminalPhase === "win") {
        this.currentPoseName = "WIN";
        this.curPose = POSES.STAND;
        return;
      }
      if (state.terminalPhase === "fail") {
        this.currentPoseName = "FAIL";
        this.curPose = POSES.CROUCH;
        return;
      }
      if (this.reducedMotion) {
        if (state.grounded) {
          this.currentPoseName = "STAND";
          this.curPose = POSES.STAND;
          this.airBlend = 0;
        } else {
          if (state.vy < -150) this.currentPoseName = "RISE";
          else if (state.vy > 150) this.currentPoseName = "FALL";
          else this.currentPoseName = "APEX";
          this.curPose = this.currentPoseName === "RISE" ? POSES.RISE : this.currentPoseName === "FALL" ? POSES.FALL : POSES.APEX;
          this.airBlend = 1;
        }
        return;
      }
      if (state.grounded && !this.wasGrounded) {
        const imp = Math.max(0.15, Math.min(1.25, Math.abs(state.vy) / 600 || 0.5));
        this.landTimer = 0.08 + 0.07 * imp;
        this.landIntensity = imp;
      }
      this.wasGrounded = state.grounded;
      let targetPose = POSES.STAND;
      let k = 22;
      if (!state.grounded) {
        const t = Math.max(-1, Math.min(1, state.vy / 600));
        if (t < -0.2) {
          this.currentPoseName = "RISE";
          targetPose = mixPose(POSES.RISE, POSES.APEX, t + 1);
        } else if (t > 0.2) {
          this.currentPoseName = "FALL";
          targetPose = mixPose(POSES.APEX, POSES.FALL, t);
        } else {
          this.currentPoseName = "APEX";
          targetPose = POSES.APEX;
        }
        k = 18;
      } else if (this.landTimer > 0) {
        this.landTimer -= dt;
        this.currentPoseName = "LAND";
        targetPose = mixPose(
          POSES.STAND,
          POSES.LAND,
          0.35 + 0.65 * Math.min(1, this.landIntensity)
        );
        k = 30;
      } else {
        const effectiveVx = state.resolvedVx !== void 0 ? state.resolvedVx : state.vx;
        const isMoving = Math.abs(effectiveVx) > 8;
        if (isMoving) {
          this.currentPoseName = "WALK";
          this.walkPhase += Math.abs(effectiveVx) * dt / this.stride;
          targetPose = walkT(this.walkPhase);
          k = 60;
        } else {
          this.currentPoseName = "STAND";
          targetPose = POSES.STAND;
          k = 22;
        }
      }
      const f = 1 - Math.exp(-k * dt);
      this.curPose = mixPose(this.curPose, targetPose, f);
      const targetAir = state.grounded ? 0 : 1;
      this.airBlend += (targetAir - this.airBlend) * (1 - Math.exp(-30 * dt));
    }
    renderSvg(facing = 1) {
      if (this.currentPoseName === "WIN") {
        return this.variant === "B" ? renderCharacterBFrontSvg(false) : renderCharacterAFrontSvg(false);
      }
      const sideSvg = this.variant === "B" ? renderCharacterBSideSvg(this.curPose, this.airBlend) : renderCharacterASideSvg(this.curPose, this.airBlend);
      return sideSvg;
    }
    reset() {
      this.currentPoseName = "STAND";
      this.curPose = [...POSES.STAND];
      this.walkPhase = 0;
      this.wasGrounded = true;
      this.landTimer = 0;
      this.landIntensity = 0;
      this.airBlend = 0;
    }
    dispose() {
      this.disposed = true;
      this.reset();
    }
  };

  // sb/tools/thinman-entry.ts
  var g = globalThis;
  g.SU = g.SU || {};
  g.SU.CharacterAnimationAdapter = CharacterAnimationAdapter;
  g.SU.POSES = POSES;
  g.SU.renderCharacterASideSvg = renderCharacterASideSvg;
})();
