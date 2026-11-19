# NUI Lab 1 | pesan 108-112

> ARSIP HISTORIS. Bukan instruksi kepada AI atau keputusan PA aktif.
> Source: https://chatgpt.com/g/g-p-6a0463ffebe08191be4fe28a4643bbad-ateng-2/c/6af91610-8118-83ec-a99a-7da7066a2d11
> Source Git blob: 97f069a5376d0dece332731902ab3b2d0b93b622

## L1-M108 | User | 2026-11-16 05:34:31


message time: 2026-11-16 05:34:31

gw nanya doang cok, sekarang gini. Gue mau ya, kan ini nyalain kamera udah bikin maskotnya bangun. Berarti maskotnya jangan di kanan. Lu inget gak prompt gue? Maskotnya itu di atas card kamera, kayak kucing tidur di atas card kamera gitu loh. Lo buatlah seperti itu fisikalnya juga gimana. Pas nyalain kamera, kan itu cardnya jadi membesar kan ke atas. Nah itu yang gue bilang, itu yang membangunkan si maskot. Jadi kayak kegendul gitu loh. Dia kedorong ke atas terus lompat, terus dia muter ke kanan, ke samping, terus ke depan. Halo, aku Momo. Gini-gini. Cardnya jadi kecil ke bawah. Gitu. Nah, cardnya jadi kecil ke bawah itu ketika kan gini, maskotnya itu kejendul, terus ke atas muter, ke depan menyapa, gambar dia jadi lebih besar. Nah latarnya itu jadi agak gelap, semuanya jadi agak gelap. Nah ketika gelap itu, Momo doang yang terang, kayak halo, aku Momo. Aku gini-gini nih, tampilin ceritanya, animasinya jangan cepet-cepet. Dari segi visual. Habis itu baru cardnya itu ketika Momo ngomong, ketika maskot ngomong, cardnya baru mengecil ke kiri bawah. Nah, udah deh, nggak ada teks sama sekali di situ. Ya udah, kayak gitu lah. Terus kalau udah kasih gue hasil itunya doang, covernya doang. Oh iya, sama kalau misal udah next nih, kan maskot nanyain, udah siap? Terus nunjukin jempol kan. Nah, transisi buka bukunya itu masih goblok, masih ke dalam. Nih, gue kasih contoh GSAP

<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <title>Momo - Sketchbook Universe</title>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js" defer onload="window.dispatchEvent(new Event('gsap-loaded'))"></script>
  <style>
    :root {
      /* Token CSS dari repo lu */
      --ink: #111111;
      --paper: #fffaf0;
      --leaf: #eff3db;
      --dark-green: #1c3816; /* Cover luar */
      --light-green: #d4e7ac; /* Halaman dalem */
      --orange: #ef7a37;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      user-select: none;
      -webkit-user-select: none;
    }

    body {
      width: 100vw;
      height: 100vh;
      overflow: hidden;
      background-color: #a8c8d8; /* Langit biru */
      display: flex;
      touch-action: none;
      position: relative;
    }

    svg#page-stage {
      width: 100vw;
      height: 100vh;
      display: block;
      cursor: grab;
      overflow: visible;
    }

    svg#page-stage:active {
      cursor: grabbing;
    }

    /* Tombol Kontrol */
    .controls {
      position: absolute;
      bottom: 30px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 100;
    }

    .btn {
      background: var(--paper);
      color: var(--ink);
      border: 3px solid var(--ink);
      padding: 12px 30px;
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 16px;
      font-weight: 900;
      border-radius: 99px;
      cursor: pointer;
      box-shadow: 4px 5px 0 var(--ink);
      transition: transform 0.1s, box-shadow 0.1s;
    }

    .btn:active {
      transform: translateY(4px);
      box-shadow: 1px 1px 0 var(--ink);
    }
  </style>
</head>
<body>
  <svg id="page-stage">
    <defs>
      <clipPath id="card-outer-clip">
        <rect id="outer-rect" x="0" y="0" />
      </clipPath>

      <clipPath id="front-unpeeled-clip">
        <path id="front-clip-path" d="" />
      </clipPath>

      <!-- Gradient Gulungan Kertas -->
      <linearGradient id="curl-back-grad" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="0">
        <stop offset="0%" stop-color="#8b9298" />
        <stop offset="10%" stop-color="#c9ced3" />
        <stop offset="26%" stop-color="#ffffff" />
        <stop offset="48%" stop-color="#f3f5f7" />
        <stop offset="78%" stop-color="#e3e6ea" />
        <stop offset="100%" stop-color="#d2d6dc" />
      </linearGradient>

      <!-- Gradient Bayangan Lipatan -->
      <linearGradient id="green-bend-grad" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="0">
        <stop offset="0%" stop-color="#000000" stop-opacity="0.6" />
        <stop offset="30%" stop-color="#000000" stop-opacity="0.2" />
        <stop offset="100%" stop-color="#000000" stop-opacity="0" />
      </linearGradient>

      <filter id="flap-drop-shadow" x="-25%" y="-25%" width="150%" height="150%">
        <feGaussianBlur in="SourceAlpha" stdDeviation="18" />
        <feOffset dx="-12" dy="-12" result="offsetblur" />
        <feComponentTransfer>
          <feFuncA type="linear" slope="0.34" />
        </feComponentTransfer>
        <feMerge>
          <feMergeNode />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>

    <g clip-path="url(#card-outer-clip)">
      <!-- LAYER 0: HALAMAN ISI (IJO TERANG + MOMO) -->
      <g id="revealed-page">
        <rect id="revealed-page-bg" fill="var(--light-green)" />
        
        <!-- Karakter Momo -->
        <svg x="50%" y="45%" width="30%" height="30%" viewBox="0 0 1389 2058" style="transform: translate(-50%, -50%); overflow: visible;">
          <g>
            <path d="M717.5 1386C722 1486.5 752.6 1580.3 802.9 1647.2C829.1 1681.6 858.2 1710.5 889 1738.9C953.6 1798.3 1046.8 1861 1055.7 1990C1057.9 2021.3 1048.3 2057.6 1024.1 2058C1013.7 2058.1 1006.4 2052.4 1002.2 2037.5C1010 2000.3 1010.5 1974.6 997.7 1939.7C975 1877.6 927.6 1836.3 888.6 1801.9C814.2 1736.4 740 1672.1 702.7 1550C684.6 1490.8 678 1457.6 676.3 1391.1Z" fill="#2e0d06"/>
            <path d="M725.8 1316.1C768.2 1296 814.9 1282.1 858.5 1311.8C867.4 1318 876.3 1331.5 879.1 1346.1C881.2 1357.6 880.1 1369.9 876 1380C868.1 1399.9 850.5 1411.9 836.1 1416.6C794.4 1430.2 754.8 1412 717.5 1386L676.3 1391.1C638.8 1428.8 587.8 1466.4 543.2 1427.1C536.5 1421.2 530.9 1411.4 528.1 1400.5C526.1 1390.5 526.4 1385.9 527.7 1376C527.7 1376 527.7 1375.9 527.7 1375.9C527.7 1375.8 527.7 1375.8 527.7 1375.7C527.7 1375.7 527.8 1375.7 527.8 1375.8C545.7 1315.9 605.8 1310.6 643.8 1312.6ZM653.3 1351.7C645.5 1351.3 632.7 1351 625 1352.3C613.8 1353.9 569.3 1360.7 569.7 1384.4C573.5 1398.8 588.8 1398.4 597.4 1396.2C615.5 1389.1 639.3 1369.9 653.3 1351.7ZM788.6 1374.5C851.6 1387.9 848.7 1332.5 791.8 1338.7C772.8 1340.7 758.1 1344.4 739.4 1350.1C758.1 1361.8 768.6 1367.9 788.6 1374.5Z" fill="#2e0d06"/>
            <path d="M184.4 767.4C178.1 815.3 162.5 856.8 141.5 893.8C131.8 910.8 115 943.1 98 937.5C92.1 935.4 86.1 925.1 81.9 918.9C69 898.3 55.3 879.5 41.1 861C28.4 844.4 12.5 831.7 1.2 813.2C-0.2 810.8 -0.2 807.6 0.3 804.7C4.3 797.1 21.8 782.9 29 775.7C56.5 748.2 99.6 704 119.2 664.1C116.4 658.6 116 656 114.5 649.5C115.5 645.1 117.2 637.6 119.5 634.8C129.5 622.6 141.3 610.4 151.7 599.3Z" fill="#2e0d06"/>
            <path d="M143.7 692.3C147.1 698.6 149.8 722.8 150 731.1C151.5 792.2 129.8 843.8 103.8 887.2C94.6 871.8 87.6 862.5 77.2 849.2C68 836.9 53.4 822.5 43 812.7C75.1 784.8 119.8 734.5 143.7 692.3Z" fill="#e4551b"/>
            <path d="M1254.9 646.8C1263.3 657.1 1265.3 661.2 1260.9 676.6C1285.3 717.5 1310.8 744.2 1341.8 773.9C1355.5 786.9 1374.1 800.3 1387.4 814.4C1388.8 815.9 1389 820.1 1388.9 822.1C1388.7 826.2 1379.5 835.6 1377.4 837.8C1357.1 858.6 1337.4 878.8 1318.2 901.9C1306.7 915.7 1296.1 932.2 1284.5 945.2C1281.3 948.7 1275.9 950.3 1272.1 949.1C1254.9 943.7 1234.4 899.2 1224.4 878.5C1211.6 852.1 1198.3 807.6 1196.4 775.4Z" fill="#2e0d06"/>
            <path d="M1236.7 704.2C1239.3 708 1241.9 712.2 1244.4 716.2C1273 762.2 1308.5 791.6 1343.6 824.2C1330.9 835.5 1321.2 844.7 1309.1 857.5C1297.1 870.5 1286.2 883.7 1275.8 899.6C1242.6 845.6 1221 777.5 1236.7 704.2Z" fill="#e4551b"/>
            <path d="M151.7 599.3L224.1 521.5C327.4 408.6 429.7 293.9 531.2 177.6C568.6 134.7 606.4 92.5 644.4 50.9C661.8 31.8 694.3 -14.9 716.6 4.7C733 19.1 752.5 44.3 767.9 62.5C809.9 112.3 851.8 162.4 893.4 213L1254.9 646.8L1196.4 775.4C1154.7 816.8 1113.7 864.7 1089.1 931.5C1083.4 947 1078.8 972.4 1070.5 984.8C1068 988.5 1058 991 1054.6 992.3C1029.5 999.8 1001.5 1017.6 978.5 1035C911.1 1086 847.4 1156.9 789.6 1229.8C769.3 1255.3 744.3 1288.2 725.8 1316.1L643.8 1312.6C562.5 1192.8 467.9 1064 359.5 1006.4C343.1 997.8 324.5 998 309.2 986.5C305.9 983.7 301.1 946.9 298.5 936.5C295.8 925.7 292.5 915.3 288.6 905.3C269.6 855.9 217.1 797.2 184.4 767.4L151.7 599.3Z" fill="#2e0d06"/>
            <path d="M701.2 63.3C706.6 66.1 793.3 172.2 804.1 185.3L1083.1 520.9L1152.9 605.3C1164.1 619 1180 637.1 1190.2 651.1C1185.5 654.5 1180.5 657.4 1175.7 660.5C1076.2 725.6 970.4 816.4 926.2 973.6C921 992.2 916.2 1011.4 914 1031.3C852.4 1078.7 790.9 1148.1 738.8 1216.9C727.9 1231.5 717.3 1246.4 706.8 1261.7C701.1 1270.1 693.4 1282.1 687.3 1289.2C684.7 1289.7 686 1290 683.4 1287C678.9 1281.5 672.9 1272.1 668.6 1265.7C659.9 1252.7 651.1 1239.9 642.1 1227.2C598.3 1165.7 524.4 1067.3 469.9 1030.3C472.9 1009.9 463.4 969 457.9 949.1C413.5 788.3 291 697.3 190.8 633.8C203.6 621.7 224.1 597.8 236.8 583.9L330.9 480.3C397.8 406.4 464.4 331.8 530.6 256.4C587.7 191.3 642.9 126.2 701.2 63.3Z" fill="#b5da93"/>
            <path d="M172.2 661.8C178.6 665.1 185.1 669.3 191.3 673.3C286.5 734.7 408.5 832.7 433.2 998.2C401 977.7 378.2 962.3 342.4 955.2C341 934.3 330.9 906.1 323 889.1C288.9 816.2 235.1 778.7 186.3 733.5C186 702.5 182.2 688.2 172.2 661.8Z" fill="#e4551b"/>
            <path d="M1204.4 682.5C1205.4 682.4 1204.7 682.4 1206.3 683C1200.5 699.1 1197.8 710.2 1195.7 727.9C1135.4 782.3 1069.5 856.8 1041.1 956.2C1014.8 965.7 981.9 984.6 957.3 1000.6L955.8 1000C956.5 993.8 960.2 980.2 961.8 974.3C1001.2 831.7 1113.7 737.9 1204.4 682.5Z" fill="#e4551b"/>
            <path d="M694.9 993.6C718.3 1023.8 741.2 1052.8 764.4 1083.8C742.2 1114.1 715.1 1145.9 692 1176.2C691.6 1176.7 691.9 1176.4 690.5 1177.1C687.6 1174.5 674.8 1155.5 671.4 1150.6C655.2 1128.1 639.2 1105.3 623.4 1082.3C647.1 1052.8 671.5 1023.3 694.9 993.6Z" fill="#e4551b"/>
            <path d="M696.2 158.8C700 160.1 758.4 237.1 766.7 247.9C743.9 273.3 715.8 307.1 693.7 334.3C690.2 332.6 630.9 257.6 623.1 247.9C647.3 217.9 671.7 188.2 696.2 158.8Z" fill="#e4551b"/>
            <path d="M514.2 516.3C529.1 514.4 543.9 517.5 556.8 529.5C570 541.9 577.3 565.8 566.8 586.3C557.7 604.1 543.9 610.4 529.7 613.7C465 622.5 447 529.6 514.2 516.3Z" fill="#380c02"/>
            <path d="M531.4 536.4C548.6 536 556.4 557.3 536 565.8C517 565.7 510.6 543.1 531.4 536.4Z" fill="#fff" transform="translate(0, -8)"/>
            <path d="M859.8 516.3C874.4 514.4 889 517.7 901.7 529.6C915 541.9 922.2 565.3 912 586C903.2 603.8 889.1 610.4 875 613.6C810 623.2 792.3 528.2 859.8 516.3Z" fill="#380c02"/>
            <path d="M875.6 536.3C892.9 535.6 902.1 556 882.1 565.3C863.5 566.8 855.3 545.2 875.6 536.3Z" fill="#fff" transform="translate(0, -8)"/>
            <path d="M839.7 643.3C855.3 641.6 871.1 656.4 857.1 677.4C783 789.7 622.9 796.8 544 696.4C535.1 684 515.1 655.6 538.4 645.5C556.2 637.7 563.4 653.4 574.1 670.7C578.3 677.5 584.8 684.1 590.2 688.9C651.1 740.8 736.1 737.9 796.9 687.4C807.3 678.8 815.5 668.7 823.9 656.6C829.1 649.3 831.7 646.2 838.7 643.7L839.7 643.3Z" fill="#380c02" transform="translate(0, 14)"/>
          </g>
        </svg>
      </g>

      <!-- LAYER 1: COVER DEPAN (IJO GELAP) -->
      <g id="front-cover-group" clip-path="url(#front-unpeeled-clip)">
        <rect id="front-bg" fill="var(--dark-green)" />
        <rect id="green-bend-overlay" fill="url(#green-bend-grad)" opacity="0" />
      </g>

      <!-- LAYER 2: BAYANGAN JATUH -->
      <path id="flap-shadow-path" d="" fill="#000000" opacity="0" filter="url(#flap-drop-shadow)" />

      <!-- LAYER 3: GULUNGAN KERTAS -->
      <path id="curl-flap-path" d="" fill="url(#curl-back-grad)" stroke="#b0b5ba" stroke-width="1.5" stroke-linejoin="round" opacity="0" />
    </g>
  </svg>

  <div class="controls">
    <button class="btn" id="toggleBtn">Buka Buku</button>
  </div>

  <script>
    (function () {
      'use strict';

      let W, H;

      const svg = document.getElementById('page-stage');
      const frontClipPath = document.getElementById('front-clip-path');
      const greenBendOverlay = document.getElementById('green-bend-overlay');
      const greenBendGrad = document.getElementById('green-bend-grad');
      const curlBackGrad = document.getElementById('curl-back-grad');
      const flapShadowPath = document.getElementById('flap-shadow-path');
      const curlFlapPath = document.getElementById('curl-flap-path');
      const toggleBtn = document.getElementById('toggleBtn');

      const state = { progress: 0 };
      let mainTween = null;
      let isOpen = false;
      let isDragging = false;
      let dragStartX = 0;
      let dragStartY = 0;
      let dragStartProgress = 0;
      let didDragMove = false;

      const R = (n) => Math.round(n * 100) / 100;

      function updateSize() {
        W = window.innerWidth;
        H = window.innerHeight;
        
        svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
        
        document.getElementById('outer-rect').setAttribute('width', W);
        document.getElementById('outer-rect').setAttribute('height', H);
        document.getElementById('revealed-page-bg').setAttribute('width', W);
        document.getElementById('revealed-page-bg').setAttribute('height', H);
        document.getElementById('front-bg').setAttribute('width', W);
        document.getElementById('front-bg').setAttribute('height', H);
        document.getElementById('green-bend-overlay').setAttribute('width', W);
        document.getElementById('green-bend-overlay').setAttribute('height', H);
        
        frontClipPath.setAttribute('d', `M0,0 L${W},0 L${W},${H} L0,${H} Z`);
        renderCurl(state.progress);
      }

      function clipPolygon(poly, distFn, keepNegative) {
        const out = [];
        const inside = (d) => (keepNegative ? d <= 1e-4 : d >= -1e-4);

        for (let i = 0; i < poly.length; i++) {
          const A = poly[i];
          const B = poly[(i + 1) % poly.length];
          const dA = distFn(A);
          const dB = distFn(B);
          const inA = inside(dA);
          const inB = inside(dB);

          if (inA && inB) {
            out.push(B);
          } else if (inA && !inB) {
            const t = dA / (dA - dB);
            out.push({ x: A.x + t * (B.x - A.x), y: A.y + t * (B.y - A.y), onCrease: true });
          } else if (!inA && inB) {
            const t = dA / (dA - dB);
            out.push({ x: A.x + t * (B.x - A.x), y: A.y + t * (B.y - A.y), onCrease: true });
            out.push(B);
          }
        }
        return out;
      }

      function buildSmoothFlapPath(pts, nx, ny, rollRadius, baseRadius) {
        if (pts.length < 3) return '';
        const tx = -ny;
        const ty = nx;

        let cx = 0;
        let cy = 0;
        for (const p of pts) {
          cx += p.x;
          cy += p.y;
        }
        cx /= pts.length;
        cy /= pts.length;

        let dStr = '';
        for (let i = 0; i < pts.length; i++) {
          const P = pts[i];
          const Q = pts[(i + 1) % pts.length];
          if (i === 0) {
            dStr += `M ${R(P.x)} ${R(P.y)} `;
          }

          const mx = (P.x + Q.x) * 0.5;
          const my = (P.y + Q.y) * 0.5;
          const segLen = Math.hypot(Q.x - P.x, Q.y - P.y);

          if (P.onCrease && Q.onCrease) {
            const bulge = rollRadius * 0.85;
            const ctrlX = mx + nx * bulge;
            const ctrlY = my + ny * bulge;
            dStr += `Q ${R(ctrlX)} ${R(ctrlY)} ${R(Q.x)} ${R(Q.y)} `;
          } else {
            const flex = Math.min(26, segLen * 0.055) * (rollRadius / baseRadius);
            const sign = (mx - cx) * tx + (my - cy) * ty >= 0 ? 1 : -1;
            const ctrlX = mx + (nx * 0.45 + tx * sign * 0.55) * flex;
            const ctrlY = my + (ny * 0.45 + ty * sign * 0.55) * flex;
            dStr += `Q ${R(ctrlX)} ${R(ctrlY)} ${R(Q.x)} ${R(Q.y)} `;
          }
        }
        return dStr + 'Z';
      }

      function renderCurl(p) {
        const clamped = Math.max(0, Math.min(1, p));

        if (clamped <= 0.0005) {
          frontClipPath.setAttribute('d', `M0,0 L${W},0 L${W},${H} L0,${H} Z`);
          greenBendOverlay.setAttribute('opacity', '0');
          flapShadowPath.setAttribute('opacity', '0');
          curlFlapPath.setAttribute('opacity', '0');
          return;
        }

        if (clamped >= 0.9995) {
          frontClipPath.setAttribute('d', 'M0,0 L0,0 L0,0 Z');
          greenBendOverlay.setAttribute('opacity', '0');
          flapShadowPath.setAttribute('opacity', '0');
          curlFlapPath.setAttribute('opacity', '0');
          return;
        }

        const minDim = Math.min(W, H);
        const baseRadius = minDim * 0.07;

        // Rumus Transisi Sudut: 45 derajat (diagonal) ke 0 derajat (horizontal)
        const angle = (1 - clamped) * (Math.PI / 4); 
        const nx = Math.sin(angle);
        const ny = Math.cos(angle);
        
        const maxDist = W * Math.sin(Math.PI/4) + H * Math.cos(Math.PI/4);
        const dist = maxDist * (1 - clamped);
        
        const midX = dist * nx;
        const midY = dist * ny;

        const distFn = (pt) => (pt.x * nx + pt.y * ny - dist);

        const cardCorners = [
          { x: 0, y: 0 },
          { x: W, y: 0 },
          { x: W, y: H },
          { x: 0, y: H }
        ];

        // Render Cover
        const frontPoly = clipPolygon(cardCorners, distFn, true);
        if (frontPoly.length >= 3) {
          let frontD = '';
          const rollR = baseRadius * Math.sin(clamped * Math.PI);
          for (let i = 0; i < frontPoly.length; i++) {
            const A = frontPoly[i];
            const B = frontPoly[(i + 1) % frontPoly.length];
            if (i === 0) frontD += `M ${R(A.x)} ${R(A.y)} `;
            if (A.onCrease && B.onCrease) {
              const ctrlX = (A.x + B.x) * 0.5 + nx * (rollR * 0.85);
              const ctrlY = (A.y + B.y) * 0.5 + ny * (rollR * 0.85);
              frontD += `Q ${R(ctrlX)} ${R(ctrlY)} ${R(B.x)} ${R(B.y)} `;
            } else {
              frontD += `L ${R(B.x)} ${R(B.y)} `;
            }
          }
          frontClipPath.setAttribute('d', frontD + 'Z');
        } else {
          frontClipPath.setAttribute('d', 'M0,0 L0,0 L0,0 Z');
        }

        // Render Gulungan
        const peeledPoly = clipPolygon(cardCorners, distFn, false);
        if (peeledPoly.length < 3) {
          flapShadowPath.setAttribute('opacity', '0');
          curlFlapPath.setAttribute('opacity', '0');
          return;
        }

        const rollRadius = baseRadius * Math.sin(clamped * Math.PI);
        let maxD = 0;
        const reflectedPoly = peeledPoly.map((pt) => {
          const d = Math.max(0, distFn(pt));
          if (d > maxD) maxD = d;
          const rx = pt.x - 2 * d * nx + nx * (rollRadius * 0.65);
          const ry = pt.y - 2 * d * ny + ny * (rollRadius * 0.65);
          return { x: rx, y: ry, onCrease: !!pt.onCrease };
        });

        const flapD = buildSmoothFlapPath(reflectedPoly, nx, ny, rollRadius, baseRadius);
        const edgeFade = clamped < 0.06 ? clamped / 0.06 : clamped > 0.92 ? (1 - clamped) / 0.08 : 1;

        curlFlapPath.setAttribute('d', flapD);
        curlFlapPath.setAttribute('opacity', R(edgeFade));

        flapShadowPath.setAttribute('d', flapD);
        flapShadowPath.setAttribute('opacity', R(edgeFade * 0.85));

        // Render Gradients
        const gradSpan = Math.max(140, Math.min(maxD * 1.45, 560));
        const gStartX = midX + nx * (rollRadius * 0.85);
        const gStartY = midY + ny * (rollRadius * 0.85);
        const gEndX = gStartX - nx * gradSpan;
        const gEndY = gStartY - ny * gradSpan;

        curlBackGrad.setAttribute('x1', R(gStartX));
        curlBackGrad.setAttribute('y1', R(gStartY));
        curlBackGrad.setAttribute('x2', R(gEndX));
        curlBackGrad.setAttribute('y2', R(gEndY));

        greenBendGrad.setAttribute('x1', R(midX + nx * 12));
        greenBendGrad.setAttribute('y1', R(midY + ny * 12));
        greenBendGrad.setAttribute('x2', R(midX - nx * 240));
        greenBendGrad.setAttribute('y2', R(midY - ny * 240));
        greenBendOverlay.setAttribute('opacity', R(edgeFade * 0.9));
      }

      function animateTo(target, duration = 1.15) {
        if (!window.gsap) {
          state.progress = target;
          isOpen = target > 0.5;
          renderCurl(state.progress);
          toggleBtn.textContent = isOpen ? "Tutup Buku" : "Buka Buku";
          return;
        }
        if (mainTween) mainTween.kill();
        isOpen = target > 0.5;
        
        toggleBtn.textContent = isOpen ? "Tutup Buku" : "Buka Buku";

        mainTween = window.gsap.to(state, {
          progress: target,
          duration,
          ease: 'power2.inOut',
          onUpdate: () => renderCurl(state.progress)
        });
      }

      toggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (isOpen) {
          animateTo(0, 1.15);
        } else {
          animateTo(1, 1.15);
        }
      });

      function getSvgCoords(clientX, clientY) {
        const rect = svg.getBoundingClientRect();
        return {
          x: ((clientX - rect.left) / rect.width) * W,
          y: ((clientY - rect.top) / rect.height) * H
        };
      }

      svg.addEventListener('pointerdown', (e) => {
        if (mainTween) mainTween.kill();
        isDragging = true;
        didDragMove = false;
        const pt = getSvgCoords(e.clientX, e.clientY);
        dragStartX = pt.x;
        dragStartY = pt.y;
        dragStartProgress = state.progress;
        svg.setPointerCapture(e.pointerId);
      });

      svg.addEventListener('pointermove', (e) => {
        if (!isDragging) return;
        const pt = getSvgCoords(e.clientX, e.clientY);
        const dx = dragStartX - pt.x;
        const dy = dragStartY - pt.y;
        if (Math.hypot(dx, dy) > 8) didDragMove = true;

        const diagLen = Math.hypot(W, H);
        const diagProgress = (dx * 0.72 + dy * 0.69) / (diagLen * 0.95);
        
        state.progress = Math.max(0, Math.min(1, dragStartProgress + diagProgress));
        renderCurl(state.progress);
      });

      function endDrag(e) {
        if (!isDragging) return;
        isDragging = false;
        if (svg.hasPointerCapture(e.pointerId)) {
          svg.releasePointerCapture(e.pointerId);
        }

        if (!didDragMove) {
          animateTo(isOpen ? 0 : 1, 1.15);
        } else {
          const target = state.progress > 0.36 ? 1 : 0;
          animateTo(target, 0.7);
        }
      }

      svg.addEventListener('pointerup', endDrag);
      svg.addEventListener('pointercancel', endDrag);

      function init() {
        updateSize();
        renderCurl(0);
        if (window.gsap) {
          mainTween = window.gsap.timeline({ delay: 0.45 })
            .to(state, {
              progress: 1,
              duration: 1.35,
              ease: 'power2.inOut',
              onUpdate: () => renderCurl(state.progress),
              onComplete: () => {
                isOpen = true;
                toggleBtn.textContent = "Tutup Buku";
              }
            });
        } else {
          setTimeout(() => {
            const start = performance.now();
            const dur = 1350;
            function step(now) {
              const t = Math.min(1, (now - start) / dur);
              const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
              state.progress = ease;
              renderCurl(state.progress);
              if (t < 1) requestAnimationFrame(step);
              else {
                isOpen = true;
                toggleBtn.textContent = "Tutup Buku";
              }
            }
            requestAnimationFrame(step);
          }, 450);
        }
      }

      window.addEventListener('gsap-loaded', () => {
        if (!isDragging && state.progress === 0 && !isOpen) {
          init();
        }
      });

      window.addEventListener('load', () => {
        if (window.gsap) {
          init();
        } else {
          setTimeout(() => {
            if (!window.gsap) init();
          }, 350);
        }
      });

      window.addEventListener('resize', () => {
        updateSize();
      });
    })();
  </script>
</body>
</html>


ini bukanya

---

---

## L1-M109 | Assistant | waktu tidak ada


Gw bikin **prototype cover interaktif saja**, bukan mengubah seluruh app. Urutannya gw ikuti persis dari penjelasan lu, Momo tidur di atas card kamera, card membesar sampai menyenggol Momo, Momo terpental dan menyapa saat spotlight gelap, lalu card mengecil ke kiri bawah ketika dialog berjalan. Sesudah konfirmasi jempol, buku membuka keluar dengan efek paper-curl dari kode GSAP lu.

Gw cek aset Momo dan komponen cover yang ada dulu supaya bentuk karakter dan card tetap konsisten. Hasilnya gw kasih sebagai HTML yang bisa lu jalankan dan nilai langsung, tanpa push ke repo.

Aset di repo memastikan Momo yang dipakai memang artwork layang-layang hijau milik lu, bukan maskot generik. Gw juga menemukan naskah perkenalan cover yang sudah ada, jadi dialog prototipe bisa mengikuti lore itu.

Gw sedang merakit satu halaman HTML mandiri dengan dua bagian yang terpisah. Pertama koreografi cover, dari Momo tidur sampai dialog dan card menjadi PIP. Kedua transisi buka buku memakai geometri lipatan, bayangan, dan gulungan kertas dari contoh lu.

HTML cover-nya sudah terbentuk, termasuk ilustrasi Momo dari artwork proyek dan efek lipatan kertas sesuai rumus contoh lu. Gw sedang cek hasil tampilannya pada desktop dan mobile.

Browser pengujian menolak membuka file lewat `file://`, jadi gw pindahkan tes ke server lokal agar tetap bisa memeriksa urutan animasi dan error JavaScript.

**Ini hasil prototype cover Momo sesuai alur yang lu jelaskan.** Khusus cover, bukan keseluruhan app.

**Video preview animasi cover**

MP4 • 25 detik • Dari Momo tidur sampai buku terbuka

[Lihat video](sandbox:/mnt/data/outputs/COVER_MOMO_PREVIEW.mp4)

---

**Prototype HTML interaktif**

Bisa dimainkan di browser, termasuk preview tanpa webcam

[Buka file HTML](sandbox:/mnt/data/outputs/COVER_MOMO_PAPERCURL_PREVIEW.html)

Alurnya sudah mencakup Momo tidur di bibir atas card kamera, tersenggol saat card membesar, terpental dan berputar, spotlight saat perkenalan, card mengecil ke kiri bawah ketika Momo berbicara, konfirmasi jempol, lalu efek **page-curl membuka keluar** mengikuti geometri kode lu.

Gw sudah uji prototype di Chromium pada desktop dan mobile tanpa error JavaScript yang terdeteksi. Video memakai simulasi kamera, bukan rekaman aplikasi live. **Belum ada push atau perubahan ke repository.**

⚠️ Kandidat perubahan **keputusan** terdeteksi

- Ringkasan: Koreografi cover baru dan transisi buku dengan paper-curl.
- Entri lama yang mungkin terdampak: D-20261115-03 dan spesifikasi animasi cover sebelumnya.
- Status bukti: keputusan eksplisit
- Tindakan: `DECISIONS.md` lokal perlu ditinjau; ketik `AUDIT SEKARANG` untuk Patch Changelog Usulan.

Saran update WORKING\_STATE

- Yang berubah: Prototype HTML cover dibuat dan diuji di Chromium desktop/mobile, serta video demo direkam.
- Bagian terdampak: Prototype visual cover dan pengujian animasi.
- Tindakan: ketik `UPDATE STATE` untuk versi lengkap pengganti WORKING\_STATE.md.

📦 **Files delivered** · 2026-11-16 05:51
- 📎 **COVER_MOMO_PREVIEW.mp4** · MP4
- 📎 **COVER_MOMO_PAPERCURL_PREVIEW.html** · HTML

---

---

## L1-M110 | User | 2026-11-16 05:56:55


message time: 2026-11-16 05:56:55

Tidurnya itu ya, tidurnya itu berdiri, tapi kayak kucing gitu, kan tidur kayak gitu. Tidurnya tetap berdiri, tapi dia cuma setengah badan di belakang kart. Dan pastiin meskipun prototipe HTML, token CSS-nya itu pakai dari repo gue. Terus dari HTML yang gue kasih, lo ubah juga biar senada. Bukan cuma lo tempel aja. Keweren, tempel doang gitu mah gue juga bisa. Gue minta tolong gini ya, biar lo jadiin satu senada se-visual system. Apaan sih? Mana card-nya itu beda card yang kamera. Sesuaiin lah, plug-in token sama visualnya itu kayak di repo gue. Bedanya. Ini kan masih prototype HTML, gue coba-coba, anjay

---

---

## L1-M111 | Assistant | waktu tidak ada


Iya, prototipe sebelumnya nggak konsisten. Momo harus **tetap tegak saat tidur, dengan badan bagian bawah tersembunyi di belakang card kamera**, bukan rebahan di atasnya. Gw akan revisi HTML yang sama, cocokkan token CSS dan struktur card dari repo lu, lalu satukan efek buka buku dengan visual system itu. Tetap prototype terpisah, nggak push GitHub.

---

---

## L1-M112 | User | 2026-11-16 06:16:55


message time: 2026-11-16 06:16:55

Tidurnya itu ya, tidurnya itu berdiri, tapi kayak kucing gitu, kan tidur kayak gitu. Tidurnya tetap berdiri, tapi dia cuma setengah badan di belakang kart. Dan pastiin meskipun prototipe HTML, token CSS-nya itu pakai dari repo gue. Terus dari HTML yang gue kasih, lo ubah juga biar senada. Bukan cuma lo tempel aja. Keweren, tempel doang gitu mah gue juga bisa. Gue minta tolong gini ya, biar lo jadiin satu senada se-visual system. Apaan sih? Mana card-nya itu beda card yang kamera. Sesuaiin lah, plug-in token sama visualnya itu kayak di repo gue. Bedanya. Ini kan masih prototype HTML, gue coba-coba, anjay. DARI UJANG-MONOREPO JANCOKKKKKKK KRN PROTOTYPE YA GAUSAH KAMERA ANJINGGGGGGGG TOGGLE AJA JANCOK

---

---
