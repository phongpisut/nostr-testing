export const GAME_SECONDS = 30;
export const FISH_COUNT = 6;
export const FISH_EMOJIS = ['🐟', '🐠', '🐡'];
// catch tolerances (percent of arena)
export const CATCH_X = 7;
export const CATCH_Y = 9;

export const PLAYER_COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];

export function colorFor(pk) {
	let h = 0;
	for (let i = 0; i < pk.length; i++) h = (h * 31 + pk.charCodeAt(i)) >>> 0;
	return PLAYER_COLORS[h % PLAYER_COLORS.length];
}

export function makeFishes(count = FISH_COUNT) {
	const fishes = [];
	for (let i = 0; i < count; i++) fishes.push(makeFish(i));
	return fishes;
}

function makeFish(id) {
	return {
		id,
		x: 8 + Math.random() * 84,
		y: 8 + Math.random() * 55,
		dir: Math.random() > 0.5 ? 1 : -1,
		speed: 2 + Math.random() * 4,
		score: 1 + Math.floor(Math.random() * 9),
		emoji: FISH_EMOJIS[id % FISH_EMOJIS.length]
	};
}

export function stepFish(f) {
	let x = f.x + f.dir * f.speed;
	let dir = f.dir;
	if (x > 92) { x = 92; dir = -1; }
	if (x < 8) { x = 8; dir = 1; }
	return { ...f, x, dir };
}

export function tryCatch(fish, poleX, depth) {
	const dx = Math.abs(fish.x - poleX);
	const dy = Math.abs(fish.y - depth);
	return dx < CATCH_X && dy < CATCH_Y;
}
