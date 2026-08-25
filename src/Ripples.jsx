import { useEffect, useRef } from 'react';

export default function Ripples() {
	const canvasRef = useRef(null);

	useEffect(() => {
		const canvas = canvasRef.current;
		const ctx = canvas.getContext('2d');
		let raf;
		const ripples = [];
		const dpr = Math.min(window.devicePixelRatio || 1, 2);
		let w = 0, h = 0;

		function resize() {
			const r = canvas.getBoundingClientRect();
			w = r.width; h = r.height;
			canvas.width = w * dpr; canvas.height = h * dpr;
			ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		}
		resize();
		window.addEventListener('resize', resize);

		function pointer(e) {
			const r = canvas.getBoundingClientRect();
			const x = e.clientX - r.left;
			const y = e.clientY - r.top;
			ripples.push({ x, y, r: 4, max: 46 + Math.random() * 30, alpha: 0.6 });
		}
		const onMove = (e) => {
			if (e.buttons) pointer(e);
		};
		canvas.addEventListener('pointerdown', (e) => pointer(e));
		canvas.addEventListener('pointermove', onMove);

		function loop() {
			ctx.clearRect(0, 0, w, h);
			for (let i = ripples.length - 1; i >= 0; i--) {
				const rp = ripples[i];
				rp.r += 1.4;
				rp.alpha *= 0.94;
				if (rp.alpha < 0.02) { ripples.splice(i, 1); continue; }
				ctx.beginPath();
				ctx.arc(rp.x, rp.y, rp.r, 0, Math.PI * 2);
				ctx.strokeStyle = `rgba(255,255,255,${rp.alpha})`;
				ctx.lineWidth = 1.5;
				ctx.stroke();
			}
			raf = requestAnimationFrame(loop);
		}
		loop();

		return () => {
			cancelAnimationFrame(raf);
			window.removeEventListener('resize', resize);
			canvas.removeEventListener('pointerdown', pointer);
			canvas.removeEventListener('pointermove', onMove);
		};
	}, []);

	return <canvas ref={canvasRef} className="ripples" />;
}
