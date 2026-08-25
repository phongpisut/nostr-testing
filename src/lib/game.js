export const PLAYER_COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];
export const GAME_SECONDS = 30;
export const POLE_Y = 72;

export function colorFor(pk) {
	let h = 0;
	for (let i = 0; i < pk.length; i++) h = (h * 31 + pk.charCodeAt(i)) >>> 0;
	return PLAYER_COLORS[h % PLAYER_COLORS.length];
}

export function makeFishes(count) {
	const fishes = [];
	for (let i = 0; i < count; i++) {
		fishes.push(makeFish(i));
	}
	return fishes;
}

function makeFish(id) {
	return {
		id,
		x: 5 + Math.random() * 90,
		y: 10 + Math.random() * 55,
		dir: Math.random() > 0.5 ? 1 : -1,
		speed: 2 + Math.random() * 4,
		score: Math.max(1, Math.round(Math.random() * 9))
	};
}

// Move fish left/right, bouncing at edges; called by host each tick.
export function stepFish(f) {
	let x = f.x + f.dir * f.speed;
	if (x > 95) { x = 95; f.dir = -1; }
	if (x < 5) { x = 5; f.dir = 1; }
	return { ...f, x };
}

// Player-space catch check: pole x/y within range of fish.
export function tryCatch(fish, poleX) {
	const dx = Math.abs(fish.x - poleX);
	return dx < 6;
}
