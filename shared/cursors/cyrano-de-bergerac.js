window.referenceCursorActive = true;

(() => {
  if (window.matchMedia("(pointer: coarse)").matches) return;
        const canvas = document.getElementById('effectCanvas');
        const ctx = canvas.getContext('2d');

        let particles = [];
        let mouse = { x: -100, y: -100, targetX: -100, targetY: -100 };
        
        // --- 修复点：丢失的鼠标点击与缩放变量 ---
        let isMouseDown = false;
        let pointerScale = 1.0;
        
        let distanceSinceLastSpawn = 0; 
        const textSequence = "AMOUR   POÉSIE   ".split('');
        let seqIndex = 0;

        const cacheCanvas = document.createElement('canvas');
        const cCtx = cacheCanvas.getContext('2d');
        const cacheSize = 128; 
        cacheCanvas.width = cacheSize;
        cacheCanvas.height = cacheSize;

        function preRenderPaperAirplane() {
            const c = cacheSize / 2;
            cCtx.clearRect(0, 0, cacheSize, cacheSize);
            
            cCtx.save();
            cCtx.translate(c, c);
            cCtx.rotate(-0.12);
            cCtx.scale(1.55, 1.55);

            // Cyrano 的纸飞机：酒红轮廓和清晰折痕让它与系统箭头保持距离。
            cCtx.fillStyle = '#fff8ef';
            cCtx.strokeStyle = '#8f3542';
            cCtx.lineWidth = 1.7;
            cCtx.lineJoin = 'round';
            cCtx.shadowColor = 'rgba(39, 20, 28, 0.58)';
            cCtx.shadowBlur = 4;
            cCtx.beginPath();
            cCtx.moveTo(0, -31);
            cCtx.lineTo(24, 17);
            cCtx.lineTo(3, 10);
            cCtx.lineTo(-3, 29);
            cCtx.lineTo(-8, 10);
            cCtx.lineTo(-24, 18);
            cCtx.closePath();
            cCtx.fill();
            cCtx.stroke();
            cCtx.shadowBlur = 0;

            // 两条折痕和中央压线强化“折纸”而非箭头的识别。
            cCtx.strokeStyle = '#b86a78';
            cCtx.lineWidth = 1.05;
            cCtx.beginPath();
            cCtx.moveTo(0, -30);
            cCtx.lineTo(3, 10);
            cCtx.lineTo(24, 17);
            cCtx.moveTo(0, -30);
            cCtx.lineTo(-8, 10);
            cCtx.lineTo(-24, 18);
            cCtx.moveTo(3, 10);
            cCtx.lineTo(-3, 29);
            cCtx.stroke();

            // 一枚小玫瑰印记，连接 Cyrano 的诗意与红色主题。
            cCtx.fillStyle = '#8f3542';
            cCtx.beginPath();
            cCtx.arc(2, 6, 3.2, 0, Math.PI * 2);
            cCtx.fill();
            cCtx.strokeStyle = '#f4c7c3';
            cCtx.lineWidth = 0.9;
            cCtx.beginPath();
            cCtx.arc(1, 5, 1.7, 0.2, Math.PI * 1.45);
            cCtx.stroke();
            cCtx.restore();
        }
        preRenderPaperAirplane();

        class WordParticle {
            constructor(x, y) {
                this.x = x; 
                this.y = y;
                
                this.char = textSequence[seqIndex % textSequence.length];
                seqIndex++;
                
                this.vx = (Math.random() - 0.5) * 1.2; 
                this.vy = Math.random() * 0.5 + 0.3;   
                this.rotation = Math.random() * Math.PI * 2;
                this.rotSpeed = (Math.random() - 0.5) * 0.08;
                
                this.alpha = 1.0;
                this.decay = Math.random() * 0.015 + 0.012; 
                this.size = Math.random() * 3 + 14; 
            }
            update() {
                this.x += this.vx;
                this.y += this.vy;
                this.vx *= 0.98;
                this.vy *= 0.98;
                
                this.rotation += this.rotSpeed;
                this.alpha -= this.decay;
            }
            draw() {
                if (this.alpha <= 0 || this.char === ' ') return;
                ctx.save();
                ctx.globalAlpha = this.alpha;
                ctx.translate(this.x, this.y);
                ctx.rotate(this.rotation);
                
                ctx.fillStyle = '#ffffff';
                ctx.font = `italic ${this.size}px "Times New Roman", serif`;
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText(this.char, 0, 0);
                
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
            mouse.targetX = e.clientX; 
            mouse.targetY = e.clientY;

            let vx = e.clientX - mouse.x;
            let vy = e.clientY - mouse.y;
            let speed = Math.sqrt(vx * vx + vy * vy);
            
            distanceSinceLastSpawn += speed;
            if (distanceSinceLastSpawn > 40 && mouse.x > 0) {
                particles.push(new WordParticle(mouse.x, mouse.y));
                distanceSinceLastSpawn = 0; 
            }
        });

        // --- 修复点：确保监听器正常运行 ---
        window.addEventListener('mousedown', () => isMouseDown = true);
        window.addEventListener('mouseup', () => isMouseDown = false);

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
                if (p.alpha <= 0) {
                    particles.splice(i, 1);
                } else {
                    p.draw();
                }
            }

            mouse.x += (mouse.targetX - mouse.x) * 0.4;
            mouse.y += (mouse.targetY - mouse.y) * 0.4;

            if (mouse.targetX !== -100) {
                ctx.save();
                ctx.translate(mouse.x, mouse.y); 
                
                ctx.rotate(-Math.PI / 4); 

                // 之前的崩溃点修复：现在 isMouseDown 存在了
                let targetScale = isMouseDown ? 0.85 : 1.0; 
                pointerScale += (targetScale - pointerScale) * 0.35;
                ctx.scale(pointerScale * 0.94, pointerScale * 0.94);

                ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
                ctx.shadowBlur = 8;
                ctx.shadowOffsetY = 6;
                ctx.shadowOffsetX = 2;

                ctx.drawImage(cacheCanvas, -32, -32, 64, 64);
                
                ctx.shadowColor = 'transparent';
                ctx.restore();
            }

            requestAnimationFrame(animate);
        }
        animate();
})();
