window.referenceCursorActive = true;

(() => {
  if (window.matchMedia("(pointer: coarse)").matches) return;
        const canvas = document.getElementById('effectCanvas');
        const ctx = canvas.getContext('2d');

        let particles = [];
        let mouse = { x: -100, y: -100, targetX: -100, targetY: -100 };
        
        let isMouseDown = false;
        let pointerScale = 1.0;

        const cacheCanvas = document.createElement('canvas');
        const cCtx = cacheCanvas.getContext('2d');
        const cacheSize = 128; 
        cacheCanvas.width = cacheSize;
        cacheCanvas.height = cacheSize;

        function preRenderPureQuill() {
            const c = cacheSize / 2;
            cCtx.clearRect(0, 0, cacheSize, cacheSize);
            
            cCtx.save();
            cCtx.translate(c, c);
            cCtx.scale(2, 2); 
            
            // 1. 锐利的纯金笔尖 (Nib)
            cCtx.fillStyle = '#d4af37'; 
            cCtx.beginPath();
            cCtx.moveTo(0, 0);
            cCtx.lineTo(2, -7);
            cCtx.lineTo(7, -2);
            cCtx.fill();
            
            // 笔尖墨水槽缝隙
            cCtx.strokeStyle = '#2b0b1a'; 
            cCtx.lineWidth = 0.8;
            cCtx.beginPath(); 
            cCtx.moveTo(0, 0);
            cCtx.lineTo(3, -3);
            cCtx.stroke();

            // 2. 纯净、流畅的修长羽毛主体
            // 左半边羽毛 (迎光面，纯白)
            cCtx.fillStyle = '#ffffff';
            cCtx.beginPath();
            cCtx.moveTo(4, -4);
            cCtx.bezierCurveTo(2, -10, 8, -24, 28, -28);
            cCtx.quadraticCurveTo(15, -15, 4, -4);
            cCtx.fill();

            // 右半边羽毛 (背光面，冷灰白产生立体感)
            cCtx.fillStyle = '#e2e5eb';
            cCtx.beginPath();
            cCtx.moveTo(4, -4);
            cCtx.bezierCurveTo(10, -2, 24, -8, 28, -28);
            cCtx.quadraticCurveTo(15, -15, 4, -4);
            cCtx.fill();

            // 3. 笔杆 (Shaft) - 贯穿羽毛的金箔骨架
            cCtx.strokeStyle = '#f4c553';
            cCtx.lineWidth = 1.2;
            cCtx.lineCap = 'round';
            cCtx.beginPath();
            cCtx.moveTo(3, -3);
            cCtx.quadraticCurveTo(15, -15, 28, -28);
            cCtx.stroke();

            // 【彻底删除了原本的透明镂空黑线代码，让羽毛保持完美无瑕的纯净块面】

            // 4. 笔根处的细碎金箔点缀
            cCtx.fillStyle = '#d4af37';
            cCtx.beginPath(); cCtx.arc(6, -6, 1.2, 0, Math.PI*2); cCtx.fill();
            cCtx.beginPath(); cCtx.arc(9, -4, 0.8, 0, Math.PI*2); cCtx.fill();
            cCtx.beginPath(); cCtx.arc(4, -9, 0.6, 0, Math.PI*2); cCtx.fill();

            cCtx.restore();
        }
        preRenderPureQuill();

        // --- 💎 纯净金箔粒子系统：悬浮的“都市星芒” ---
        class GoldStarParticle {
            constructor(x, y, isBurst = false) {
                this.x = x; 
                this.y = y;
                this.alpha = 1.0;
                this.time = Math.random() * 100;

                if (isBurst) {
                    // 点击时的轻柔星尘散开，不再喷墨，极其缓慢优雅
                    let angle = Math.random() * Math.PI * 2;
                    let speed = Math.random() * 1.5 + 0.3; // 速度变得非常轻柔
                    this.vx = Math.cos(angle) * speed;
                    this.vy = Math.sin(angle) * speed; 
                    this.size = Math.random() * 1.8 + 0.8; 
                    this.decay = Math.random() * 0.02 + 0.01; 
                } else {
                    // 移动时的金箔星芒，微弱上浮
                    this.vx = (Math.random() - 0.5) * 1.0;
                    this.vy = -(Math.random() * 0.8 + 0.2); 
                    this.size = Math.random() * 1.5 + 0.5;
                    this.decay = Math.random() * 0.02 + 0.01;
                }
                
                this.color = Math.random() > 0.4 ? '#d4af37' : '#fcebc7'; // 纯粹的巴洛克金与香槟白
            }
            update() {
                this.time += 0.05;
                
                // 星尘受空气阻力飘动，极其轻盈
                this.vx *= 0.94;
                this.vy *= 0.94;
                this.x += this.vx + Math.sin(this.time) * 0.4;
                this.y += this.vy - 0.02; // 微弱热力上浮
                
                this.alpha -= this.decay;
            }
            draw() {
                if (this.alpha <= 0) return;
                ctx.save();
                ctx.globalAlpha = this.alpha;
                ctx.globalCompositeOperation = 'screen';
                ctx.translate(this.x, this.y);
                ctx.fillStyle = this.color;
                ctx.shadowColor = this.color;
                ctx.shadowBlur = 4;
                
                // 绘制精致的古典四角星芒
                ctx.beginPath();
                ctx.moveTo(0, -this.size);
                ctx.quadraticCurveTo(0, 0, this.size, 0);
                ctx.quadraticCurveTo(0, 0, 0, this.size);
                ctx.quadraticCurveTo(0, 0, -this.size, 0);
                ctx.quadraticCurveTo(0, 0, 0, -this.size);
                ctx.fill();
                
                ctx.restore();
            }
        }

        // --- 💎 舞台震撼：点击时的“剧院聚光灯扩散” ---
        class TheatricalSpotlight {
            constructor(x, y) {
                this.x = x; this.y = y;
                this.r = 5;
                this.maxR = 60; // 聚光灯范围
                this.alpha = 0.5; // 透明度调低，更加轻柔不刺眼
            }
            update() {
                this.r += (this.maxR - this.r) * 0.15; 
                this.alpha -= 0.025; 
            }
            draw() {
                if (this.alpha <= 0) return;
                ctx.save();
                ctx.globalAlpha = this.alpha;
                ctx.globalCompositeOperation = 'screen';
                ctx.filter = 'blur(8px)'; 

                let radialGrad = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.r);
                radialGrad.addColorStop(0, 'rgba(252, 235, 199, 0.5)'); // 中心柔光香槟金
                radialGrad.addColorStop(0.5, 'rgba(212, 175, 55, 0.15)'); 
                radialGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');

                ctx.fillStyle = radialGrad;
                ctx.beginPath(); 
                ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2); 
                ctx.fill();
                ctx.restore();
            }
        }

        function resizeCanvas() {
            const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
            canvas.width = window.innerWidth * dpr; 
            canvas.height = window.innerHeight * dpr;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            canvas.style.width = window.innerWidth + 'px'; 
            canvas.style.height = window.innerHeight + 'px';
        }
        window.addEventListener('resize', resizeCanvas); 
        resizeCanvas();

        window.addEventListener('mousemove', (e) => {
            let vx = e.clientX - mouse.targetX;
            let vy = e.clientY - mouse.targetY;
            mouse.targetX = e.clientX; 
            mouse.targetY = e.clientY;

            let speed = Math.sqrt(vx * vx + vy * vy);
            if (speed > 2.0 && mouse.x > 0) {
                if(Math.random() > 0.7) {
                    particles.push(new GoldStarParticle(mouse.x, mouse.y, false));
                }
            }
        });

        window.addEventListener('mousedown', () => isMouseDown = true);
        window.addEventListener('mouseup', () => {
            isMouseDown = false;
            if(mouse.x > 0) {
                // 点击瞬间：轻柔的舞台聚光灯亮起
                particles.push(new TheatricalSpotlight(mouse.x, mouse.y));
                
                // 优雅轻柔的星芒散开（不再有墨水）
                let count = Math.floor(Math.random() * 4) + 6; 
                for(let i = 0; i < count; i++) {
                    particles.push(new GoldStarParticle(mouse.x, mouse.y, true));
                }
            }
        });

        function animate() {
            if (document.hidden) {
                requestAnimationFrame(animate);
                return;
            }
            if (particles.length > 72) particles.splice(0, particles.length - 72);
            ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

            for (let i = particles.length - 1; i >= 0; i--) {
                let p = particles[i]; 
                p.update();
                if (p.alpha <= 0) particles.splice(i, 1); else p.draw();
            }

            mouse.x += (mouse.targetX - mouse.x) * 0.6;
            mouse.y += (mouse.targetY - mouse.y) * 0.6;

            if (mouse.targetX !== -100) {
                ctx.save();
                ctx.translate(mouse.x, mouse.y); 
                
                let targetScale = isMouseDown ? 0.85 : 1.0; 
                pointerScale += (targetScale - pointerScale) * 0.35;
                ctx.scale(pointerScale * 0.94, pointerScale * 0.94);

                ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
                ctx.shadowBlur = 10;
                ctx.shadowOffsetY = 6;
                ctx.shadowOffsetX = 3;

                ctx.drawImage(cacheCanvas, -32, -32, 64, 64);
                
                ctx.shadowColor = 'transparent';
                ctx.restore();
            }

            requestAnimationFrame(animate);
        }
        animate();
})();
