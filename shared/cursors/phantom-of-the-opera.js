window.referenceCursorActive = true;

(() => {
  if (window.matchMedia("(pointer: coarse)").matches) return;
  const canvas = document.getElementById("effectCanvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const config = {"motif":"grandChandelier","trail":"crystalGlint","burst":"pressGlow","motion":"still","accent":"#7d1119","size":50,"follow":0.35,"emitDistance":10,"clickOn":"down","burstParticles":6,"hotspot":[0.5,0.5],"primary":"#c7ab67","secondary":"#f1eee7"};
  const particles = [];
  const bursts = [];
  const trailPoints = [];
  const mouse = { x: -100, y: -100, targetX: -100, targetY: -100 };
  const lastEmit = { x: -100, y: -100 };
  let lastEmitTime = 0;
  let pressed = false;
  let windmillRotation = 0;
  let chandelierLight = 0;
  const pointerScale = 1;

  canvas.dataset.cursorMotif = config.motif;
  canvas.dataset.cursorTrail = config.trail;
  canvas.dataset.cursorBurst = config.burst;
  canvas.dataset.cursorTrailEmissions = "0";
  canvas.dataset.cursorClickBursts = "0";

  const cache = document.createElement("canvas");
  const cacheScale = Math.max(2, Math.min(window.devicePixelRatio || 1, 3));
  cache.width = 96 * cacheScale;
  cache.height = 96 * cacheScale;
  const cacheCtx = cache.getContext("2d");
  cacheCtx.setTransform(cacheScale, 0, 0, cacheScale, 0, 0);
  const bladeCache = document.createElement("canvas");
  bladeCache.width = 96 * cacheScale;
  bladeCache.height = 96 * cacheScale;
  const bladeCtx = bladeCache.getContext("2d");
  bladeCtx.setTransform(cacheScale, 0, 0, cacheScale, 0, 0);

  function drawDiamond(target, x, y, radius) {
    target.beginPath();
    target.moveTo(x, y - radius);
    target.lineTo(x + radius * 0.68, y);
    target.lineTo(x, y + radius);
    target.lineTo(x - radius * 0.68, y);
    target.closePath();
  }

  function preRenderGrandChandelier() {
    cacheCtx.clearRect(0, 0, 96, 96);
    cacheCtx.save();
    cacheCtx.translate(48, 48);
    cacheCtx.strokeStyle = config.primary;
    cacheCtx.fillStyle = config.secondary;
    cacheCtx.lineCap = "round";
    cacheCtx.lineJoin = "round";
    cacheCtx.lineWidth = 2.2;

    if (config.motif === "windmill") {
      const millBody = cacheCtx.createLinearGradient(0, 2, 0, 36);
      millBody.addColorStop(0, "#ef2835");
      millBody.addColorStop(0.52, "#b80f20");
      millBody.addColorStop(1, "#650611");
      cacheCtx.fillStyle = millBody;
      cacheCtx.strokeStyle = "#e6b85e";
      cacheCtx.lineWidth = 1.35;
      cacheCtx.shadowColor = "rgba(0,0,0,0.7)";
      cacheCtx.shadowBlur = 2;
      cacheCtx.beginPath();
      cacheCtx.moveTo(-8, 3);
      cacheCtx.quadraticCurveTo(0, -1, 8, 3);
      cacheCtx.lineTo(14, 35);
      cacheCtx.lineTo(-14, 35);
      cacheCtx.closePath();
      cacheCtx.fill();
      cacheCtx.stroke();
      cacheCtx.shadowBlur = 0;
      cacheCtx.strokeStyle = "rgba(255,225,151,0.78)";
      cacheCtx.lineWidth = 0.75;
      cacheCtx.beginPath();
      cacheCtx.moveTo(-11, 19);
      cacheCtx.lineTo(11, 19);
      cacheCtx.moveTo(-13, 30);
      cacheCtx.lineTo(13, 30);
      cacheCtx.stroke();
      [[-8,12],[0,13],[8,12],[-11,24],[11,24],[-12,32],[-6,34],[0,34],[6,34],[12,32]].forEach((bulb) => {
        cacheCtx.beginPath();
        cacheCtx.arc(bulb[0], bulb[1], 1.05, 0, Math.PI * 2);
        cacheCtx.fillStyle = "#fff1a8";
        cacheCtx.fill();
      });
      cacheCtx.fillStyle = "#2a050b";
      cacheCtx.strokeStyle = "#e6b85e";
      cacheCtx.lineWidth = 0.9;
      cacheCtx.fillRect(-4, 22, 8, 13);
      cacheCtx.strokeRect(-4, 22, 8, 13);
      cacheCtx.beginPath();
      cacheCtx.arc(0, 0, 4.2, 0, Math.PI * 2);
      cacheCtx.fillStyle = "#e6b85e";
      cacheCtx.fill();
    } else if (config.motif === "classicTiara") {
      cacheCtx.translate(0, -3);
      cacheCtx.strokeStyle = "rgba(249,247,255,0.96)";
      cacheCtx.fillStyle = "rgba(183,166,211,0.24)";
      cacheCtx.shadowColor = "rgba(230,226,237,0.72)";
      cacheCtx.shadowBlur = 3;
      cacheCtx.lineWidth = 1.15;
      cacheCtx.beginPath();
      cacheCtx.moveTo(-27, 32);
      cacheCtx.quadraticCurveTo(0, 38, 27, 32);
      cacheCtx.lineTo(25, 37);
      cacheCtx.quadraticCurveTo(0, 44, -25, 37);
      cacheCtx.closePath();
      cacheCtx.fill();
      cacheCtx.stroke();
      const tiaraArches = [
        [-25,32,-22,18,-19,14,-14,31],
        [-18,32,-14,10,-10,8,-5,31],
        [-8,32,-4,9,0,0,5,31],
        [8,32,4,9,0,0,-5,31],
        [18,32,14,10,10,8,5,31],
        [25,32,22,18,19,14,14,31],
      ];
      tiaraArches.forEach((arch) => {
        cacheCtx.beginPath();
        cacheCtx.moveTo(arch[0], arch[1]);
        cacheCtx.bezierCurveTo(arch[2], arch[3], arch[4], arch[5], arch[6], arch[7]);
        cacheCtx.stroke();
      });
      cacheCtx.shadowBlur = 0;
      cacheCtx.strokeStyle = "rgba(211,198,231,0.88)";
      cacheCtx.lineWidth = 0.85;
      cacheCtx.beginPath();
      cacheCtx.moveTo(-18, 27);
      cacheCtx.quadraticCurveTo(-9, 17, 0, 29);
      cacheCtx.quadraticCurveTo(9, 17, 18, 27);
      cacheCtx.moveTo(-12, 31);
      cacheCtx.quadraticCurveTo(0, 19, 12, 31);
      cacheCtx.stroke();
      drawDiamond(cacheCtx, 0, 15, 6.5);
      cacheCtx.fillStyle = "rgba(103,84,126,0.9)";
      cacheCtx.fill();
      cacheCtx.strokeStyle = "#ffffff";
      cacheCtx.stroke();
      [[0,0,3.1],[-10,8,2.4],[10,8,2.4],[-19,14,1.9],[19,14,1.9],[0,15,1.7],[-7,23,1.25],[7,23,1.25]].forEach((gem) => {
        cacheCtx.beginPath();
        cacheCtx.arc(gem[0], gem[1], gem[2], 0, Math.PI * 2);
        cacheCtx.fillStyle = gem[0] === 0 && gem[1] === 15 ? "#e6e2ed" : "#ffffff";
        cacheCtx.shadowColor = "#ffffff";
        cacheCtx.shadowBlur = 4;
        cacheCtx.fill();
      });
      cacheCtx.shadowBlur = 1;
      for (let x = -22; x <= 22; x += 4) {
        cacheCtx.beginPath();
        cacheCtx.arc(x, 36 + Math.abs(x) * 0.035, 1.15, 0, Math.PI * 2);
        cacheCtx.fill();
      }
    } else if (config.motif === "blackStar") {
      cacheCtx.translate(0, 16);
      cacheCtx.beginPath();
      cacheCtx.moveTo(0, -16);
      cacheCtx.lineTo(5, -4);
      cacheCtx.lineTo(20, 0);
      cacheCtx.lineTo(5, 5);
      cacheCtx.lineTo(0, 20);
      cacheCtx.lineTo(-5, 5);
      cacheCtx.lineTo(-20, 0);
      cacheCtx.lineTo(-5, -4);
      cacheCtx.closePath();
      cacheCtx.fillStyle = "rgba(5,2,10,0.96)";
      cacheCtx.fill();
      cacheCtx.strokeStyle = "#00f3ff";
      cacheCtx.shadowColor = "#00f3ff";
      cacheCtx.shadowBlur = 10;
      cacheCtx.lineWidth = 1.7;
      cacheCtx.stroke();
      cacheCtx.beginPath();
      cacheCtx.arc(0, 0, 3.2, 0, Math.PI * 2);
      cacheCtx.fillStyle = "#ff00ff";
      cacheCtx.shadowColor = "#ff00ff";
      cacheCtx.shadowBlur = 8;
      cacheCtx.fill();
    } else if (config.motif === "inspirationPoint") {
      const glow = cacheCtx.createRadialGradient(0, 0, 0, 0, 0, 34);
      glow.addColorStop(0, "rgba(255,255,255,1)");
      glow.addColorStop(0.1, "rgba(255,239,181,0.96)");
      glow.addColorStop(0.28, "rgba(255,205,66,0.7)");
      glow.addColorStop(0.58, "rgba(201,29,43,0.22)");
      glow.addColorStop(1, "rgba(255,215,0,0)");
      cacheCtx.fillStyle = glow;
      cacheCtx.beginPath();
      cacheCtx.arc(0, 0, 34, 0, Math.PI * 2);
      cacheCtx.fill();
      cacheCtx.fillStyle = "#ffffff";
      cacheCtx.shadowColor = "#ffffff";
      cacheCtx.shadowBlur = 4;
      cacheCtx.beginPath();
      cacheCtx.arc(0, 0, 2.5, 0, Math.PI * 2);
      cacheCtx.fill();
    } else if (config.motif === "grandChandelier") {
      const brass = cacheCtx.createLinearGradient(-32, 0, 32, 0);
      brass.addColorStop(0, "#684513");
      brass.addColorStop(0.3, "#c99535");
      brass.addColorStop(0.5, "#ffe3a0");
      brass.addColorStop(0.72, "#b77a24");
      brass.addColorStop(1, "#5a370f");
      cacheCtx.strokeStyle = brass;
      cacheCtx.fillStyle = brass;
      cacheCtx.lineWidth = 1.8;
      cacheCtx.shadowColor = "rgba(255,225,155,0.38)";
      cacheCtx.shadowBlur = 2.5;

      const drawFacetedCrystal = (x, y, width, height) => {
        cacheCtx.save();
        const crystal = cacheCtx.createLinearGradient(x - width, y, x + width, y);
        crystal.addColorStop(0, "rgba(123,206,240,0.94)");
        crystal.addColorStop(0.42, "rgba(255,255,255,0.98)");
        crystal.addColorStop(0.66, "rgba(218,243,252,0.96)");
        crystal.addColorStop(1, "rgba(193,160,232,0.88)");
        cacheCtx.shadowColor = "rgba(190,236,255,0.7)";
        cacheCtx.shadowBlur = 3.6;
        cacheCtx.beginPath();
        cacheCtx.moveTo(x, y - height * 0.55);
        cacheCtx.lineTo(x + width * 0.72, y - height * 0.16);
        cacheCtx.lineTo(x + width * 0.5, y + height * 0.34);
        cacheCtx.lineTo(x, y + height * 0.56);
        cacheCtx.lineTo(x - width * 0.5, y + height * 0.34);
        cacheCtx.lineTo(x - width * 0.72, y - height * 0.16);
        cacheCtx.closePath();
        cacheCtx.fillStyle = crystal;
        cacheCtx.strokeStyle = "rgba(245,252,255,0.92)";
        cacheCtx.lineWidth = 0.8;
        cacheCtx.fill();
        cacheCtx.stroke();
        cacheCtx.beginPath();
        cacheCtx.moveTo(x, y - height * 0.48);
        cacheCtx.lineTo(x, y + height * 0.46);
        cacheCtx.moveTo(x - width * 0.56, y - height * 0.12);
        cacheCtx.lineTo(x + width * 0.48, y + height * 0.3);
        cacheCtx.strokeStyle = "rgba(255,255,255,0.58)";
        cacheCtx.lineWidth = 0.55;
        cacheCtx.stroke();
        cacheCtx.restore();
      };

      // Ceiling rose, linked chain and glass baluster make the silhouette read as a chandelier.
      cacheCtx.beginPath();
      cacheCtx.ellipse(0, -35, 8.5, 2.5, 0, 0, Math.PI * 2);
      cacheCtx.fill();
      [-30.5, -25.5, -20.5].forEach((y, index) => {
        cacheCtx.beginPath();
        cacheCtx.ellipse(0, y, 2.2, 3.2, index % 2 ? Math.PI / 2 : 0, 0, Math.PI * 2);
        cacheCtx.stroke();
      });
      cacheCtx.beginPath();
      cacheCtx.moveTo(0, -18);
      cacheCtx.bezierCurveTo(-5.8, -15, -5.5, -10.5, 0, -7.5);
      cacheCtx.bezierCurveTo(5.5, -10.5, 5.8, -15, 0, -18);
      cacheCtx.stroke();
      drawFacetedCrystal(0, -11.5, 3.6, 8.5);
      const glassBowl = cacheCtx.createLinearGradient(-27, 10, 27, 18);
      glassBowl.addColorStop(0, "rgba(119,198,230,0.2)");
      glassBowl.addColorStop(0.48, "rgba(255,255,255,0.4)");
      glassBowl.addColorStop(1, "rgba(179,147,217,0.22)");
      cacheCtx.beginPath();
      cacheCtx.moveTo(-27, 8);
      cacheCtx.quadraticCurveTo(0, 31, 27, 8);
      cacheCtx.quadraticCurveTo(0, 18, -27, 8);
      cacheCtx.closePath();
      cacheCtx.fillStyle = glassBowl;
      cacheCtx.strokeStyle = "rgba(222,244,252,0.72)";
      cacheCtx.lineWidth = 0.8;
      cacheCtx.fill();
      cacheCtx.stroke();
      [[0,-6,11,2.7],[0,8,27,6],[0,14,34,6.5]].forEach((ring) => {
        cacheCtx.beginPath();
        cacheCtx.ellipse(ring[0], ring[1], ring[2], ring[3], 0, 0, Math.PI * 2);
        cacheCtx.strokeStyle = brass;
        cacheCtx.lineWidth = ring[2] > 20 ? 2 : 1.5;
        cacheCtx.stroke();
      });

      // Five candle arms and cups remain readable at the reviewed 50px cursor size.
      const candles = [
        { x: -32, y: -3 },
        { x: -17, y: -8 },
        { x: 0, y: -10 },
        { x: 17, y: -8 },
        { x: 32, y: -3 },
      ];
      candles.forEach(({ x, y }) => {
        const direction = Math.sign(x);
        cacheCtx.beginPath();
        cacheCtx.moveTo(direction * 2, 9);
        cacheCtx.bezierCurveTo(x * 0.35, 18, x * 0.82, 10, x, y + 4);
        cacheCtx.quadraticCurveTo(x + direction * 3.3, y, x, y - 2);
        cacheCtx.strokeStyle = brass;
        cacheCtx.lineWidth = 1.9;
        cacheCtx.stroke();
        cacheCtx.beginPath();
        cacheCtx.ellipse(x, y - 2, 5.2, 1.9, 0, 0, Math.PI * 2);
        cacheCtx.fillStyle = brass;
        cacheCtx.fill();
        cacheCtx.stroke();
        const wax = cacheCtx.createLinearGradient(x - 2.2, 0, x + 2.2, 0);
        wax.addColorStop(0, "#b99e71");
        wax.addColorStop(0.48, "#fff8de");
        wax.addColorStop(1, "#c9ac79");
        cacheCtx.fillStyle = wax;
        cacheCtx.fillRect(x - 2, y - 8, 4, 6);
        cacheCtx.fillStyle = "#f4e5c4";
        cacheCtx.beginPath();
        cacheCtx.moveTo(x, y - 14.5);
        cacheCtx.quadraticCurveTo(x + 3, y - 11, x, y - 8);
        cacheCtx.quadraticCurveTo(x - 3, y - 11, x, y - 14.5);
        cacheCtx.fillStyle = "#fff2a6";
        cacheCtx.shadowColor = "#ffd671";
        cacheCtx.shadowBlur = 4;
        cacheCtx.fill();
        cacheCtx.fillStyle = brass;
        cacheCtx.shadowBlur = 1.5;
      });

      const drawBeadSwag = (startX, endX, startY, sag) => {
        for (let step = 0; step <= 8; step += 1) {
          const t = step / 8;
          const x = startX + (endX - startX) * t;
          const y = startY + Math.sin(t * Math.PI) * sag;
          cacheCtx.beginPath();
          cacheCtx.arc(x, y, step % 4 === 0 ? 1.4 : 0.9, 0, Math.PI * 2);
          cacheCtx.fillStyle = step % 4 === 0 ? "#ffffff" : "#cfe7f1";
          cacheCtx.shadowColor = "rgba(225,246,255,0.72)";
          cacheCtx.shadowBlur = 1.8;
          cacheCtx.fill();
        }
      };
      drawBeadSwag(-32, 0, 0, 13);
      drawBeadSwag(0, 32, 0, 13);
      drawBeadSwag(-17, 17, -4, 12);

      // A dense lower tier of faceted prisms gives the chandelier its crystal identity.
      [-29,-20,-10,0,10,20,29].forEach((x, index) => {
        const depth = 19 + (3 - Math.abs(index - 3)) * 1.4;
        cacheCtx.beginPath();
        cacheCtx.moveTo(x, 14 + Math.abs(index - 3) * 0.5);
        cacheCtx.lineTo(x, depth - 3);
        cacheCtx.strokeStyle = "rgba(219,239,248,0.82)";
        cacheCtx.lineWidth = 0.75;
        cacheCtx.stroke();
        drawFacetedCrystal(x, depth + 2.5, index === 3 ? 5.4 : 3.9, index === 3 ? 12 : 8.5);
      });
      cacheCtx.beginPath();
      cacheCtx.moveTo(0, 16);
      cacheCtx.lineTo(0, 29);
      cacheCtx.strokeStyle = brass;
      cacheCtx.lineWidth = 1;
      cacheCtx.stroke();
      drawFacetedCrystal(0, 35, 6.2, 13.5);
    } else if (config.motif === "windingKey") {
      cacheCtx.translate(-30, -30);
      cacheCtx.strokeStyle = "#e2b15d";
      cacheCtx.shadowColor = "rgba(116,84,174,0.86)";
      cacheCtx.shadowBlur = 5;
      cacheCtx.lineWidth = 3;
      cacheCtx.beginPath();
      cacheCtx.moveTo(0, 0);
      cacheCtx.lineTo(39, 39);
      cacheCtx.stroke();
      cacheCtx.lineWidth = 2.2;
      cacheCtx.beginPath();
      cacheCtx.moveTo(7, 7);
      cacheCtx.lineTo(1, 13);
      cacheCtx.lineTo(8, 20);
      cacheCtx.lineTo(14, 14);
      cacheCtx.moveTo(16, 16);
      cacheCtx.lineTo(13, 20);
      cacheCtx.stroke();
      cacheCtx.strokeStyle = "rgba(250,246,255,0.75)";
      cacheCtx.lineWidth = 0.8;
      cacheCtx.beginPath();
      cacheCtx.moveTo(3, 2);
      cacheCtx.lineTo(38, 37);
      cacheCtx.stroke();
      cacheCtx.lineWidth = 3;
      cacheCtx.strokeStyle = "#e2b15d";
      cacheCtx.beginPath();
      cacheCtx.arc(47, 39, 8, 0, Math.PI * 2);
      cacheCtx.arc(39, 47, 8, 0, Math.PI * 2);
      cacheCtx.stroke();
      cacheCtx.fillStyle = "#9b78d0";
      cacheCtx.shadowColor = "#7454ae";
      cacheCtx.shadowBlur = 6;
      cacheCtx.beginPath();
      cacheCtx.arc(43, 43, 2.5, 0, Math.PI * 2);
      cacheCtx.fill();
      cacheCtx.fillStyle = "#ffffff";
      cacheCtx.shadowColor = "#ffffff";
      cacheCtx.beginPath();
      cacheCtx.arc(0, 0, 1.8, 0, Math.PI * 2);
      cacheCtx.fill();
    } else if (config.motif === "passionCrossHalo") {
      cacheCtx.translate(0, 1);
      const bronze = cacheCtx.createLinearGradient(-24, -28, 24, 28);
      bronze.addColorStop(0, "#fff1a8");
      bronze.addColorStop(0.42, "#d8a33d");
      bronze.addColorStop(0.72, "#8b351f");
      bronze.addColorStop(1, "#f1ce72");
      cacheCtx.strokeStyle = bronze;
      cacheCtx.lineWidth = 3;
      cacheCtx.shadowColor = "rgba(218,168,72,0.65)";
      cacheCtx.shadowBlur = 6;
      cacheCtx.beginPath();
      cacheCtx.arc(0, 3, 24, -Math.PI * 0.84, Math.PI * 0.06);
      cacheCtx.arc(0, 3, 24, Math.PI * 0.16, Math.PI * 1.06);
      cacheCtx.stroke();
      cacheCtx.lineWidth = 4.2;
      cacheCtx.beginPath();
      cacheCtx.moveTo(0, -31);
      cacheCtx.lineTo(0, 31);
      cacheCtx.moveTo(-14, -13);
      cacheCtx.lineTo(14, -13);
      cacheCtx.stroke();
      cacheCtx.shadowBlur = 0;
      cacheCtx.strokeStyle = "#fff0aa";
      cacheCtx.lineWidth = 0.9;
      cacheCtx.beginPath();
      cacheCtx.moveTo(-1, -29);
      cacheCtx.lineTo(-1, 28);
      cacheCtx.moveTo(-12, -14);
      cacheCtx.lineTo(12, -14);
      cacheCtx.stroke();
    } else if (config.motif === "littlePrinceScarf") {
      cacheCtx.translate(0, 3);
      cacheCtx.strokeStyle = "#f4d976";
      cacheCtx.fillStyle = "#f4d976";
      cacheCtx.shadowColor = "rgba(240,215,131,0.55)";
      cacheCtx.shadowBlur = 5;
      cacheCtx.beginPath();
      cacheCtx.arc(-5, -22, 6, 0, Math.PI * 2);
      cacheCtx.fill();
      cacheCtx.beginPath();
      cacheCtx.moveTo(-10, -15);
      cacheCtx.quadraticCurveTo(-16, 2, -12, 22);
      cacheCtx.lineTo(4, 22);
      cacheCtx.quadraticCurveTo(8, 2, 0, -15);
      cacheCtx.closePath();
      cacheCtx.fill();
      cacheCtx.fillStyle = "#df6b3f";
      cacheCtx.beginPath();
      cacheCtx.moveTo(-8, -13);
      cacheCtx.bezierCurveTo(5, -10, 18, -7, 30, -14);
      cacheCtx.bezierCurveTo(19, -1, 8, 1, -7, -7);
      cacheCtx.closePath();
      cacheCtx.fill();
      cacheCtx.strokeStyle = "#f6e49c";
      cacheCtx.lineWidth = 2.1;
      cacheCtx.beginPath();
      cacheCtx.moveTo(-10, 22);
      cacheCtx.lineTo(-18, 33);
      cacheCtx.moveTo(3, 22);
      cacheCtx.lineTo(9, 34);
      cacheCtx.stroke();
      cacheCtx.fillStyle = "#9ecbe8";
      [[23,-28,2.2],[-25,-17,1.6],[24,19,1.4]].forEach((star) => {
        cacheCtx.beginPath();
        cacheCtx.arc(star[0], star[1], star[2], 0, Math.PI * 2);
        cacheCtx.fill();
      });
    } else if (config.motif === "posterMoon") {
      const halo = cacheCtx.createRadialGradient(0, 0, 12, 0, 0, 29);
      halo.addColorStop(0, "rgba(239,236,255,0.16)");
      halo.addColorStop(0.55, "rgba(188,178,229,0.08)");
      halo.addColorStop(1, "rgba(188,178,229,0)");
      cacheCtx.fillStyle = halo;
      cacheCtx.beginPath();
      cacheCtx.arc(0, 0, 29, 0, Math.PI * 2);
      cacheCtx.fill();

      const moon = cacheCtx.createRadialGradient(-6, -7, 2, 0, 0, 18);
      moon.addColorStop(0, "#fffdf6");
      moon.addColorStop(0.42, "#e9e5f4");
      moon.addColorStop(0.78, "#bbb2d6");
      moon.addColorStop(1, "#756b98");
      cacheCtx.fillStyle = moon;
      cacheCtx.shadowColor = "rgba(221,213,255,0.45)";
      cacheCtx.shadowBlur = 4;
      cacheCtx.beginPath();
      cacheCtx.arc(0, 0, 18, 0, Math.PI * 2);
      cacheCtx.fill();

      cacheCtx.shadowBlur = 0;
      cacheCtx.fillStyle = "rgba(91,79,126,0.14)";
      [[-7,-5,3.2],[6,-8,2.2],[5,6,3.8],[-8,9,2.1]].forEach((crater) => {
        cacheCtx.beginPath();
        cacheCtx.arc(crater[0], crater[1], crater[2], 0, Math.PI * 2);
        cacheCtx.fill();
      });
      cacheCtx.strokeStyle = "rgba(255,255,255,0.48)";
      cacheCtx.lineWidth = 0.7;
      cacheCtx.beginPath();
      cacheCtx.arc(-2, -2, 15.5, -2.8, -0.45);
      cacheCtx.stroke();
    } else if (config.motif === "excalibur") {
      cacheCtx.translate(-48, -48);
      const blade = cacheCtx.createLinearGradient(0, 0, 35, 35);
      blade.addColorStop(0, "#ffffff");
      blade.addColorStop(0.34, "#dce8eb");
      blade.addColorStop(0.52, "#7da2ac");
      blade.addColorStop(0.7, "#eef7f5");
      blade.addColorStop(1, "#9ab2b7");
      cacheCtx.beginPath();
      cacheCtx.moveTo(0, 0);
      cacheCtx.lineTo(22, 35);
      cacheCtx.lineTo(35, 22);
      cacheCtx.closePath();
      cacheCtx.fillStyle = blade;
      cacheCtx.fill();
      cacheCtx.strokeStyle = "#d4af37";
      cacheCtx.lineWidth = 1.25;
      cacheCtx.stroke();
      cacheCtx.beginPath();
      cacheCtx.moveTo(1.5, 1.5);
      cacheCtx.lineTo(29, 29);
      cacheCtx.strokeStyle = "rgba(255,255,255,0.95)";
      cacheCtx.lineWidth = 1.1;
      cacheCtx.stroke();
      cacheCtx.strokeStyle = "rgba(84,127,141,0.9)";
      cacheCtx.lineWidth = 1;
      [[10,11,14,13],[15,18,19,17],[20,24,24,22]].forEach((rune) => {
        cacheCtx.beginPath();
        cacheCtx.moveTo(rune[0], rune[1]);
        cacheCtx.lineTo(rune[2], rune[3]);
        cacheCtx.stroke();
      });
      cacheCtx.beginPath();
      cacheCtx.moveTo(17, 41);
      cacheCtx.quadraticCurveTo(25, 33, 41, 17);
      cacheCtx.strokeStyle = "#d4af37";
      cacheCtx.lineWidth = 4.5;
      cacheCtx.stroke();
      cacheCtx.fillStyle = "#d5b85d";
      [[17,41],[41,17]].forEach((cap) => {
        cacheCtx.beginPath();
        cacheCtx.arc(cap[0], cap[1], 2.4, 0, Math.PI * 2);
        cacheCtx.fill();
      });
      cacheCtx.beginPath();
      cacheCtx.moveTo(31, 31);
      cacheCtx.lineTo(42, 42);
      cacheCtx.strokeStyle = "#17343d";
      cacheCtx.lineWidth = 5.2;
      cacheCtx.stroke();
      cacheCtx.strokeStyle = "#d5b85d";
      cacheCtx.lineWidth = 1.1;
      for (let wrap = 0; wrap < 3; wrap += 1) {
        const p = 34 + wrap * 3.5;
        cacheCtx.beginPath();
        cacheCtx.moveTo(p - 2, p + 2);
        cacheCtx.lineTo(p + 2, p - 2);
        cacheCtx.stroke();
      }
      cacheCtx.beginPath();
      cacheCtx.arc(45, 45, 3.8, 0, Math.PI * 2);
      cacheCtx.fillStyle = "#d4af37";
      cacheCtx.fill();
      cacheCtx.beginPath();
      cacheCtx.arc(45, 45, 1.7, 0, Math.PI * 2);
      cacheCtx.fillStyle = "#547f8d";
      cacheCtx.fill();
    } else if (config.motif === "bowlerHat") {
      cacheCtx.translate(0, 5);
      cacheCtx.fillStyle = "#0d0a0b";
      cacheCtx.strokeStyle = "#f3d39a";
      cacheCtx.lineWidth = 1.6;
      cacheCtx.beginPath();
      cacheCtx.moveTo(-18, 8);
      cacheCtx.bezierCurveTo(-17, -14, -9, -24, 0, -24);
      cacheCtx.bezierCurveTo(9, -24, 17, -14, 18, 8);
      cacheCtx.closePath();
      cacheCtx.fill();
      cacheCtx.stroke();
      cacheCtx.fillStyle = "#c51f2b";
      cacheCtx.fillRect(-17, 1, 34, 6);
      cacheCtx.beginPath();
      cacheCtx.ellipse(0, 11, 28, 7, 0, 0, Math.PI * 2);
      cacheCtx.fillStyle = "#0d0a0b";
      cacheCtx.fill();
      cacheCtx.stroke();
    } else if (config.motif === "castNote") {
      cacheCtx.rotate(Number.isFinite(config.rotation) ? config.rotation : -0.13);
      cacheCtx.fillStyle = "#ecf5f6";
      cacheCtx.strokeStyle = "#8fc5d4";
      cacheCtx.lineWidth = 1.3;
      cacheCtx.beginPath();
      cacheCtx.roundRect(-12, -31, 24, 62, 9);
      cacheCtx.fill();
      cacheCtx.stroke();
      cacheCtx.strokeStyle = "rgba(42,122,170,0.72)";
      cacheCtx.lineWidth = 1;
      for (let y = -20; y <= 20; y += 10) {
        cacheCtx.beginPath();
        cacheCtx.moveTo(-7, y + 2);
        cacheCtx.lineTo(7, y - 2);
        cacheCtx.stroke();
      }
      cacheCtx.fillStyle = "#2a7aaa";
      cacheCtx.font = "700 8px sans-serif";
      cacheCtx.textAlign = "center";
      cacheCtx.fillText("DEAR", 0, 3);
    } else if (config.motif === "neonCrown") {
      cacheCtx.translate(0, 5);
      cacheCtx.strokeStyle = "#f2c94c";
      cacheCtx.fillStyle = "rgba(213,43,166,0.24)";
      cacheCtx.shadowColor = "#d52ba6";
      cacheCtx.shadowBlur = 10;
      cacheCtx.lineWidth = 3;
      cacheCtx.beginPath();
      cacheCtx.moveTo(-27, 16);
      cacheCtx.lineTo(-22, -18);
      cacheCtx.lineTo(-8, -4);
      cacheCtx.lineTo(0, -27);
      cacheCtx.lineTo(9, -4);
      cacheCtx.lineTo(23, -18);
      cacheCtx.lineTo(27, 16);
      cacheCtx.closePath();
      cacheCtx.fill();
      cacheCtx.stroke();
      cacheCtx.shadowBlur = 0;
      cacheCtx.fillStyle = "#fff8ff";
      cacheCtx.font = "900 15px sans-serif";
      cacheCtx.textAlign = "center";
      cacheCtx.fillText("6", 0, 11);
    } else if (config.motif === "voteButton") {
      cacheCtx.fillStyle = "#e3ba25";
      cacheCtx.strokeStyle = "#af86c8";
      cacheCtx.lineWidth = 3;
      cacheCtx.shadowColor = "rgba(227,186,37,0.55)";
      cacheCtx.shadowBlur = 7;
      cacheCtx.beginPath();
      cacheCtx.arc(0, 0, 28, 0, Math.PI * 2);
      cacheCtx.fill();
      cacheCtx.stroke();
      cacheCtx.shadowBlur = 0;
      cacheCtx.fillStyle = "#241638";
      cacheCtx.font = "900 10px Rockwell, serif";
      cacheCtx.textAlign = "center";
      cacheCtx.fillText("VOTES", 0, 4);
    } else if (config.motif === "filmReel") {
      cacheCtx.strokeStyle = "#f1d7a2";
      cacheCtx.fillStyle = "#17110b";
      cacheCtx.lineWidth = 2;
      cacheCtx.shadowColor = "rgba(215,128,36,0.58)";
      cacheCtx.shadowBlur = 8;
      cacheCtx.beginPath();
      cacheCtx.arc(0, 0, 28, 0, Math.PI * 2);
      cacheCtx.fill();
      cacheCtx.stroke();
      cacheCtx.shadowBlur = 0;
      for (let index = 0; index < 5; index += 1) {
        const angle = index * Math.PI * 2 / 5 - Math.PI / 2;
        cacheCtx.beginPath();
        cacheCtx.arc(Math.cos(angle) * 14, Math.sin(angle) * 14, 5, 0, Math.PI * 2);
        cacheCtx.fillStyle = "#d78024";
        cacheCtx.fill();
      }
      cacheCtx.beginPath();
      cacheCtx.moveTo(22, 18);
      cacheCtx.quadraticCurveTo(34, 29, 28, 39);
      cacheCtx.strokeStyle = "#f1d7a2";
      cacheCtx.stroke();
    } else if (config.motif === "revolutionFlag") {
      cacheCtx.translate(-8, 7);
      cacheCtx.strokeStyle = "rgba(230,196,114,0.95)";
      cacheCtx.lineWidth = 2.2;
      cacheCtx.beginPath();
      cacheCtx.moveTo(-18, 22);
      cacheCtx.lineTo(-18, -28);
      cacheCtx.stroke();
      cacheCtx.beginPath();
      cacheCtx.arc(-18, -30, 3.2, 0, Math.PI * 2);
      cacheCtx.fillStyle = "#e6c472";
      cacheCtx.fill();
      const flag = cacheCtx.createLinearGradient(-17, -25, 22, 14);
      flag.addColorStop(0, "#29458a");
      flag.addColorStop(0.34, "#f4ecd7");
      flag.addColorStop(0.67, "#c13a3d");
      flag.addColorStop(1, "#772329");
      cacheCtx.fillStyle = flag;
      cacheCtx.beginPath();
      cacheCtx.moveTo(-16, -24);
      cacheCtx.bezierCurveTo(-2, -29, 11, -19, 23, -22);
      cacheCtx.lineTo(20, 11);
      cacheCtx.bezierCurveTo(8, 8, -3, 0, -16, 7);
      cacheCtx.closePath();
      cacheCtx.fill();
      cacheCtx.strokeStyle = "rgba(255,243,216,0.7)";
      cacheCtx.lineWidth = 0.75;
      cacheCtx.stroke();
    } else if (config.motif === "concertFlag") {
      cacheCtx.translate(-8, 8);
      cacheCtx.strokeStyle = "rgba(234,217,170,0.98)";
      cacheCtx.lineWidth = 2.1;
      cacheCtx.beginPath();
      cacheCtx.moveTo(-17, 22);
      cacheCtx.lineTo(-17, -27);
      cacheCtx.stroke();
      cacheCtx.beginPath();
      cacheCtx.arc(-17, -29, 3, 0, Math.PI * 2);
      cacheCtx.fillStyle = "#ead9aa";
      cacheCtx.fill();
      const flag = cacheCtx.createLinearGradient(-15, -23, 24, 10);
      flag.addColorStop(0, "#203f91");
      flag.addColorStop(0.48, "#f7f2dd");
      flag.addColorStop(1, "#b12635");
      cacheCtx.fillStyle = flag;
      cacheCtx.beginPath();
      cacheCtx.moveTo(-15, -23);
      cacheCtx.bezierCurveTo(-2, -28, 12, -18, 24, -21);
      cacheCtx.lineTo(20, 10);
      cacheCtx.bezierCurveTo(8, 7, -3, 0, -15, 7);
      cacheCtx.closePath();
      cacheCtx.fill();
      cacheCtx.strokeStyle = "rgba(255,255,255,0.84)";
      cacheCtx.lineWidth = 0.8;
      cacheCtx.stroke();
      cacheCtx.strokeStyle = "rgba(255,238,184,0.92)";
      cacheCtx.lineWidth = 0.7;
      [-11, -5, 1, 7, 13].forEach((x) => {
        cacheCtx.beginPath();
        cacheCtx.moveTo(x, -17);
        cacheCtx.lineTo(x - 2.5, 4);
        cacheCtx.stroke();
      });
    }
    cacheCtx.restore();
  }
  preRenderGrandChandelier();

  function preRenderWindmillBlades() {
    if (config.motif !== "windmill") return;
    bladeCtx.clearRect(0, 0, 96, 96);
    bladeCtx.save();
    bladeCtx.translate(48, 48);
    bladeCtx.strokeStyle = "#e6b85e";
    bladeCtx.lineWidth = 1.25;
    bladeCtx.lineJoin = "round";
    for (let arm = 0; arm < 4; arm += 1) {
      bladeCtx.save();
      bladeCtx.rotate(Math.PI / 4 + arm * Math.PI / 2);
      bladeCtx.beginPath();
      bladeCtx.moveTo(2, 0);
      bladeCtx.lineTo(8, -4);
      bladeCtx.lineTo(29, -8);
      bladeCtx.lineTo(24, 3);
      bladeCtx.lineTo(7, 4);
      bladeCtx.closePath();
      const sail = bladeCtx.createLinearGradient(2, 0, 29, -5);
      sail.addColorStop(0, "#7a0713");
      sail.addColorStop(0.52, arm % 2 ? "#cf1830" : "#ef3040");
      sail.addColorStop(1, "#8c0918");
      bladeCtx.fillStyle = sail;
      bladeCtx.fill();
      bladeCtx.stroke();
      bladeCtx.strokeStyle = "rgba(255,224,154,0.72)";
      bladeCtx.lineWidth = 0.72;
      bladeCtx.beginPath();
      bladeCtx.moveTo(8, -2.5);
      bladeCtx.lineTo(26, -6.2);
      bladeCtx.moveTo(11, 2.4);
      bladeCtx.lineTo(24, 0.6);
      bladeCtx.moveTo(15, -4.1);
      bladeCtx.lineTo(16, 1.8);
      bladeCtx.moveTo(21, -5.4);
      bladeCtx.lineTo(21.5, 1.1);
      bladeCtx.stroke();
      bladeCtx.strokeStyle = "#e6b85e";
      bladeCtx.lineWidth = 1.25;
      bladeCtx.restore();
    }
    bladeCtx.beginPath();
    bladeCtx.arc(0, 0, 5, 0, Math.PI * 2);
    bladeCtx.fillStyle = "#e6b85e";
    bladeCtx.fill();
    bladeCtx.beginPath();
    bladeCtx.arc(0, 0, 2.2, 0, Math.PI * 2);
    bladeCtx.fillStyle = "#fff0b0";
    bladeCtx.fill();
    bladeCtx.restore();
  }
  preRenderWindmillBlades();

  class TrailParticle {
    constructor(x, y, burst = false, index = 0, movementAngle = 0) {
      const angle = Math.random() * Math.PI * 2;
      const speed = burst ? 0.9 + Math.random() * 1.7 : 0.18 + Math.random() * 0.42;
      this.x = x;
      this.y = y;
      this.vx = Math.cos(angle) * speed;
      this.vy = Math.sin(angle) * speed;
      this.radius = 0.8 + Math.random() * 1.5;
      this.alpha = 0.92;
      this.spin = (Math.random() - 0.5) * 0.18;
      this.angle = movementAngle + (Math.random() - 0.5) * 0.55;
      this.fade = null;
      this.color = index % 3 === 0 ? config.accent : index % 2 ? config.primary : config.secondary;
      this.variant = index % 2;
      if (config.trail === "goldSparkleRosePetal") {
        this.vy -= this.variant ? 0.05 : 0.38;
        this.radius += this.variant ? 1.1 : 0;
      }
      if (config.trail === "diamondDust") this.vy += 0.18;
      if (config.trail === "glitchPixel") {
        this.vx = (Math.random() - 0.5) * (burst ? 3.2 : 1.5);
        this.vy = (Math.random() - 0.5) * (burst ? 3.2 : 1.5);
        this.color = index % 3 === 0 ? "#ffffff" : index % 2 ? "#ff00ff" : "#00f3ff";
      }
      if (config.trail === "neonSpark") {
        this.vx *= 0.7;
        this.vy *= 0.7;
        this.color = index % 2 ? "#e2b15d" : "#9b78d0";
      }
      if (config.trail === "crystalGlint") {
        this.vx = this.vx * (burst ? 0.62 : 0.42) + (Math.random() - 0.5) * (burst ? 0.22 : 0.42);
        this.vy = this.vy * (burst ? 0.62 : 0.42) + (Math.random() - 0.5) * (burst ? 0.18 : 0.3);
        this.radius = burst ? 1.1 + Math.random() * 1.4 : 0.65 + Math.random() * 1.45;
        this.alpha = burst ? 0.9 : 0.52 + Math.random() * 0.3;
        this.fade = burst ? 0.019 + Math.random() * 0.009 : 0.012 + Math.random() * 0.009;
        this.phase = Math.random() * Math.PI * 2;
        this.wobble = 0.08 + Math.random() * 0.18;
        this.twinkle = 0.04 + Math.random() * 0.08;
        this.spin = (Math.random() - 0.5) * 0.3;
        this.variant = Math.random() > 0.42;
        this.color = index % 3 === 0 ? "#ffffff" : index % 2 ? "#bfe8f5" : "#efdca4";
      }
      if (config.trail === "moonMist") {
        this.vx *= 0.24;
        this.vy *= 0.24;
        this.radius = 0.8 + Math.random() * 1.1;
        this.alpha = 0.32;
        this.color = index % 2 ? "#d9d1ef" : "#fffdf7";
      }
      if (config.trail === "magicDust") {
        this.vx = burst ? this.vx * 1.7 : 0.15 + Math.random() * 0.45;
        this.vy = burst ? this.vy * 1.7 : 0.4 + Math.random() * 0.75;
        this.color = index % 3 ? "#d4af37" : "#ffffff";
      }
      if (config.trail === "thornEmbers") {
        this.vx *= burst ? 1.15 : 0.5;
        this.vy = burst ? this.vy * 1.15 : -0.18 - Math.random() * 0.28;
        this.radius = 0.75 + Math.random() * 1.15;
        this.color = index % 3 === 0 ? "#8b351f" : index % 2 ? "#d8a33d" : "#fff0aa";
      }
      if (config.trail === "b612Stars") {
        this.vx *= burst ? 0.9 : 0.35;
        this.vy *= burst ? 0.9 : 0.35;
        this.radius = 0.7 + Math.random() * 1.05;
        this.color = index % 3 === 0 ? "#9ecbe8" : index % 2 ? "#f4d976" : "#ffffff";
      }
    }
    update() {
      this.x += this.vx;
      this.y += this.vy;
      this.vx *= config.trail === "magicDust" ? 0.97 : 0.93;
      this.vy *= config.trail === "magicDust" ? 0.97 : 0.93;
      if (config.trail === "crystalGlint") {
        this.phase += this.wobble;
        this.x += Math.sin(this.phase) * 0.12;
        this.y += Math.cos(this.phase * 0.83) * 0.08;
      }
      this.angle += this.spin;
      this.alpha -= this.fade ?? (config.trail === "glitchPixel" ? 0.055 : config.trail === "magicDust" ? 0.018 : config.trail === "moonMist" ? 0.016 : config.trail === "crystalGlint" ? 0.024 : config.trail === "b612Stars" ? 0.022 : 0.03);
    }
    draw() {
      ctx.save();
      ctx.globalAlpha = Math.max(0, this.alpha);
      ctx.shadowColor = this.color;
      ctx.shadowBlur = 3;
      ctx.strokeStyle = this.color;
      ctx.fillStyle = this.color;
      ctx.lineCap = "round";
      if (config.trail === "goldSparkleRosePetal" && this.variant) {
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);
        ctx.fillStyle = "#b30b23";
        ctx.beginPath();
        ctx.ellipse(0, 0, this.radius * 1.7, this.radius * 0.85, 0, 0, Math.PI * 2);
        ctx.fill();
      } else if (config.trail === "goldSparkleRosePetal" || config.trail === "diamondDust") {
        const length = this.radius * (config.trail === "diamondDust" ? 2.8 : 2.2);
        ctx.beginPath();
        ctx.moveTo(this.x - length, this.y);
        ctx.lineTo(this.x + length, this.y);
        ctx.moveTo(this.x, this.y - length);
        ctx.lineTo(this.x, this.y + length);
        ctx.stroke();
      } else if (config.trail === "glitchPixel") {
        ctx.fillRect(this.x, this.y, this.radius * 3.2, this.radius * 1.25);
      } else if (config.trail === "neonSpark" || config.trail === "magicDust") {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius * (config.trail === "magicDust" ? 0.85 : 0.7), 0, Math.PI * 2);
        ctx.fill();
      } else if (config.trail === "crystalGlint") {
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);
        const twinkle = 0.72 + Math.sin(this.phase) * 0.28;
        const glowRadius = this.radius * (3.8 + twinkle * 2.2);
        ctx.globalCompositeOperation = "screen";
        const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, glowRadius);
        glow.addColorStop(0, this.color);
        glow.addColorStop(0.3, this.color);
        glow.addColorStop(1, "rgba(255,255,255,0)");
        ctx.globalAlpha *= 0.2 + twinkle * 0.12;
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(0, 0, glowRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha *= 0.9 + twinkle * 0.2;
        ctx.shadowBlur = 5 + twinkle * 4;
        drawDiamond(ctx, 0, 0, this.radius * (1.45 + twinkle * 0.42));
        ctx.fill();
        if (this.variant) {
          ctx.globalAlpha *= 0.38 + twinkle * 0.2;
          ctx.lineWidth = 0.55 + twinkle * 0.35;
          const ray = this.radius * (2.2 + twinkle * 1.6);
          ctx.beginPath();
          ctx.moveTo(-ray, 0);
          ctx.lineTo(ray, 0);
          ctx.moveTo(0, -ray * 0.82);
          ctx.lineTo(0, ray * 0.82);
          ctx.stroke();
        }
      } else if (config.trail === "moonMist") {
        ctx.shadowBlur = 2.5;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fill();
      } else if (config.trail === "thornEmbers") {
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);
        ctx.beginPath();
        ctx.moveTo(-this.radius * 2.2, 0);
        ctx.lineTo(this.radius * 2.2, 0);
        ctx.moveTo(0, 0);
        ctx.lineTo(this.radius * 0.9, -this.radius * 1.5);
        ctx.stroke();
      } else if (config.trail === "b612Stars") {
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);
        const outer = this.radius * 2.1;
        const inner = this.radius * 0.8;
        ctx.beginPath();
        for (let point = 0; point < 10; point += 1) {
          const angle = -Math.PI / 2 + point * Math.PI / 5;
          const distance = point % 2 ? inner : outer;
          const x = Math.cos(angle) * distance;
          const y = Math.sin(angle) * distance;
          if (point === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }
  }

  class ClickBurst {
    constructor(x, y) {
      this.x = x;
      this.y = y;
      this.age = 0;
      this.maxAge = 28;
    }
    update() {
      this.age += 1;
    }
    draw() {
      const progress = this.age / this.maxAge;
      const radius = 8 + progress * 40;
      const alpha = Math.max(0, 1 - progress);
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = config.primary;
      ctx.fillStyle = config.secondary;
      ctx.lineWidth = 1.5;
      if (config.burst === "spectacular") {
        ctx.fillStyle = "#ffd700";
        ctx.shadowColor = "#ff2a2a";
        ctx.shadowBlur = 8;
        ctx.font = "700 14px Georgia";
        ctx.textAlign = "center";
        ctx.fillText("SPECTACULAR!", 0, -8 - progress * 12);
      } else if (config.burst === "softDiamondGlow") {
        const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, radius * 0.7);
        glow.addColorStop(0, "rgba(255,255,255,0.8)");
        glow.addColorStop(0.35, "rgba(224,247,250,0.4)");
        glow.addColorStop(1, "rgba(224,247,250,0)");
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(0, 0, radius * 0.7, 0, Math.PI * 2);
        ctx.fill();
      } else if (config.burst === "glitchRipple") {
        ctx.strokeStyle = "#00f3ff";
        ctx.beginPath();
        ctx.ellipse(-2, 0, radius * 0.72, radius * 0.55, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = "#ff00ff";
        ctx.beginPath();
        ctx.ellipse(2, 0, radius * 0.72, radius * 0.55, 0, 0, Math.PI * 2);
        ctx.stroke();
      } else if (config.burst === "goldenRippleNotes") {
        ctx.strokeStyle = "#ffd700";
        ctx.beginPath();
        ctx.arc(0, 0, radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = "#ffd700";
        ctx.font = "20px Georgia";
        ctx.fillText("♪", -12 - progress * 8, -8 - progress * 12);
        ctx.fillText("♫", 10 + progress * 10, 2 - progress * 15);
      } else if (config.burst === "pressGlow") {
        const lightRadius = 11 + progress * 20;
        const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, lightRadius);
        glow.addColorStop(0, "rgba(255,250,218,0.76)");
        glow.addColorStop(0.25, "rgba(255,224,137,0.42)");
        glow.addColorStop(0.62, "rgba(191,232,245,0.15)");
        glow.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(0, 0, lightRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha *= 0.58;
        ctx.strokeStyle = "#fff3b8";
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(-6 - progress * 5, 0);
        ctx.lineTo(6 + progress * 5, 0);
        ctx.moveTo(0, -5 - progress * 4);
        ctx.lineTo(0, 5 + progress * 4);
        ctx.stroke();
      } else if (config.burst === "subtleRipple") {
        ctx.strokeStyle = "#9b78d0";
        ctx.lineWidth = 1.2;
        ctx.shadowColor = "#7454ae";
        ctx.shadowBlur = 4;
        ctx.beginPath();
        ctx.arc(0, 0, radius * 0.7, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha *= 0.62;
        ctx.strokeStyle = "#e2b15d";
        ctx.beginPath();
        ctx.arc(0, 0, radius * 0.52, 0, Math.PI * 2);
        ctx.stroke();
      } else if (config.burst === "lunarBloom") {
        const bloomRadius = 4 + progress * 9;
        const bloom = ctx.createRadialGradient(0, 0, 0, 0, 0, bloomRadius);
        bloom.addColorStop(0, "rgba(255,253,247,0.24)");
        bloom.addColorStop(0.38, "rgba(224,218,243,0.14)");
        bloom.addColorStop(0.72, "rgba(168,155,208,0.07)");
        bloom.addColorStop(1, "rgba(168,155,208,0)");
        ctx.fillStyle = bloom;
        ctx.beginPath();
        ctx.arc(0, 0, bloomRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha *= 0.34;
        ctx.strokeStyle = "#eee9fb";
        ctx.lineWidth = 0.65;
        ctx.beginPath();
        ctx.arc(0, 0, 3.5 + progress * 4.5, 0, Math.PI * 2);
        ctx.stroke();
      } else if (config.burst === "crispShockwave") {
        ctx.beginPath();
        ctx.arc(0, 0, radius * 0.82, 0, Math.PI * 2);
        ctx.strokeStyle = "#d4af37";
        ctx.lineWidth = 2 - progress;
        ctx.shadowColor = "#d4af37";
        ctx.shadowBlur = 8;
        ctx.stroke();
      } else if (config.burst === "cruciformHalo") {
        ctx.strokeStyle = "#d8a33d";
        ctx.shadowColor = "#d8a33d";
        ctx.shadowBlur = 7;
        ctx.beginPath();
        ctx.arc(0, 0, radius * 0.72, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, -radius);
        ctx.lineTo(0, radius);
        ctx.moveTo(-radius * 0.55, -radius * 0.28);
        ctx.lineTo(radius * 0.55, -radius * 0.28);
        ctx.stroke();
      } else if (config.burst === "planetOrbit") {
        ctx.strokeStyle = "#9ecbe8";
        ctx.shadowColor = "#f4d976";
        ctx.shadowBlur = 5;
        ctx.beginPath();
        ctx.ellipse(0, 0, radius, radius * 0.42, -0.35, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = "#f4d976";
        ctx.beginPath();
        ctx.arc(Math.cos(progress * Math.PI * 2) * radius, Math.sin(progress * Math.PI * 2) * radius * 0.42, 2.4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  function drawMotionTrail() {
    if (config.trail === "fiveLineStaff" && trailPoints.length > 1) {
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      ctx.strokeStyle = "#ffd700";
      ctx.lineWidth = 1.2;
      [-14, -7, 0, 7, 14].forEach((offset) => {
        ctx.beginPath();
        trailPoints.forEach((point, index) => {
          const alpha = (index + 1) / trailPoints.length;
          ctx.globalAlpha = alpha * 0.48;
          if (index === 0) ctx.moveTo(point.x, point.y + offset);
          else ctx.lineTo(point.x, point.y + offset);
        });
        ctx.stroke();
      });
      ctx.restore();
      return;
    }
  }

  function drawChandelierLightPulse(size, foreground = false) {
    if (config.motif !== "grandChandelier" || chandelierLight < 0.01) return;
    const intensity = Math.min(1, chandelierLight);
    const candleLights = [
      [-0.333, -0.182],
      [-0.177, -0.234],
      [0, -0.255],
      [0.177, -0.234],
      [0.333, -0.182],
    ];
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    if (!foreground) {
      ctx.globalAlpha = intensity * 0.74;
      const halo = ctx.createRadialGradient(0, -size * 0.05, 0, 0, -size * 0.05, size * 0.72);
      halo.addColorStop(0, "rgba(255,242,184,0.6)");
      halo.addColorStop(0.38, "rgba(255,207,100,0.28)");
      halo.addColorStop(0.7, "rgba(186,226,244,0.12)");
      halo.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(0, -size * 0.05, size * 0.72, 0, Math.PI * 2);
      ctx.fill();
      candleLights.forEach(([x, y]) => {
        const lampGlow = ctx.createRadialGradient(x * size, y * size, 0, x * size, y * size, size * 0.16);
        lampGlow.addColorStop(0, "rgba(255,255,238,0.98)");
        lampGlow.addColorStop(0.25, "rgba(255,228,132,0.76)");
        lampGlow.addColorStop(1, "rgba(255,211,92,0)");
        ctx.fillStyle = lampGlow;
        ctx.beginPath();
        ctx.arc(x * size, y * size, size * 0.16, 0, Math.PI * 2);
        ctx.fill();
      });
    } else {
      ctx.globalAlpha = intensity * 0.88;
      ctx.strokeStyle = "rgba(255,255,244,0.96)";
      ctx.lineWidth = Math.max(0.55, size * 0.013);
      candleLights.forEach(([x, y], index) => {
        const px = x * size;
        const py = y * size;
        const ray = size * (index === 2 ? 0.075 : 0.056);
        ctx.beginPath();
        ctx.moveTo(px - ray, py);
        ctx.lineTo(px + ray, py);
        ctx.moveTo(px, py - ray);
        ctx.lineTo(px, py + ray);
        ctx.stroke();
      });
      [[-0.21, 0.24], [0, 0.35], [0.21, 0.24]].forEach(([x, y]) => {
        ctx.beginPath();
        ctx.arc(x * size, y * size, size * 0.022, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(205,239,255,0.9)";
        ctx.fill();
      });
    }
    ctx.restore();
  }

  function resizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    canvas.style.width = window.innerWidth + "px";
    canvas.style.height = window.innerHeight + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  window.addEventListener("resize", resizeCanvas);
  window.addEventListener("mousemove", (event) => {
    mouse.targetX = event.clientX;
    mouse.targetY = event.clientY;
    const distance = Math.hypot(event.clientX - lastEmit.x, event.clientY - lastEmit.y);
    const now = Date.now();
    const shouldEmit = config.emitInterval
      ? now - lastEmitTime >= config.emitInterval
      : distance >= (config.emitDistance || 12);
    if (shouldEmit) {
      const movementAngle = Math.atan2(event.clientY - lastEmit.y, event.clientX - lastEmit.x);
      if (config.trail !== "fiveLineStaff") {
        particles.push(new TrailParticle(event.clientX, event.clientY, false, particles.length, movementAngle));
      }
      canvas.dataset.cursorTrailEmissions = String(Number(canvas.dataset.cursorTrailEmissions) + 1);
      lastEmit.x = event.clientX;
      lastEmit.y = event.clientY;
      lastEmitTime = now;
    }
  });
  function triggerBurst(event) {
    const hasPointerPosition = Number.isFinite(event?.clientX) && Number.isFinite(event?.clientY);
    const x = hasPointerPosition ? event.clientX : mouse.x > 0 ? mouse.x : mouse.targetX;
    const y = hasPointerPosition ? event.clientY : mouse.y > 0 ? mouse.y : mouse.targetY;
    if (hasPointerPosition) {
      mouse.x = x;
      mouse.y = y;
      mouse.targetX = x;
      mouse.targetY = y;
    }
    bursts.push(new ClickBurst(x, y));
    if (config.motif === "grandChandelier") chandelierLight = 1;
    canvas.dataset.cursorClickBursts = String(Number(canvas.dataset.cursorClickBursts) + 1);
    for (let index = 0; index < config.burstParticles; index += 1) {
      particles.push(new TrailParticle(x, y, true, index, index * Math.PI * 2 / config.burstParticles));
    }
  }
  window.addEventListener("mousedown", (event) => {
    pressed = true;
    if (config.clickOn === "down") triggerBurst(event);
  });
  window.addEventListener("mouseup", (event) => {
    pressed = false;
    if (config.clickOn === "up") triggerBurst(event);
  });

  function animate() {
    if (document.hidden) {
      requestAnimationFrame(animate);
      return;
    }
    if (particles.length > 72) particles.splice(0, particles.length - 72);
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    for (let index = particles.length - 1; index >= 0; index -= 1) {
      const particle = particles[index];
      particle.update();
      if (particle.alpha <= 0) particles.splice(index, 1); else particle.draw();
    }
    for (let index = bursts.length - 1; index >= 0; index -= 1) {
      const burst = bursts[index];
      burst.update();
      if (burst.age >= burst.maxAge) bursts.splice(index, 1); else burst.draw();
    }
    if (bursts.length > 8) bursts.splice(0, bursts.length - 8);
    mouse.x += (mouse.targetX - mouse.x) * config.follow;
    mouse.y += (mouse.targetY - mouse.y) * config.follow;
    if (mouse.targetX > -50) {
      if (config.trail === "fiveLineStaff") {
        trailPoints.push({ x: mouse.x, y: mouse.y });
        if (trailPoints.length > 35) trailPoints.shift();
      }
      drawMotionTrail();
      const size = (pressed ? config.size * 0.9 : config.size) * pointerScale * 1;
      ctx.save();
      ctx.translate(mouse.x, mouse.y);
      if (config.motif === "windmill") {
        ctx.drawImage(cache, -size * 0.5, -size * 0.5, size, size);
        windmillRotation += 0.02;
        ctx.rotate(windmillRotation);
        ctx.drawImage(bladeCache, -size * 0.5, -size * 0.5, size, size);
      } else {
        drawChandelierLightPulse(size, false);
        ctx.drawImage(
          cache,
          -size * config.hotspot[0],
          -size * config.hotspot[1],
          size,
          size,
        );
        drawChandelierLightPulse(size, true);
      }
      ctx.restore();
    }
    chandelierLight *= 0.965;
    if (chandelierLight < 0.006) chandelierLight = 0;
    requestAnimationFrame(animate);
  }

  resizeCanvas();
  animate();
})();
