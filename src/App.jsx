import { useEffect, useRef, useState } from 'react';
import { loadKey, connect, publish, subscribe } from './lib/nostr';
import { colorFor, makeFishes, stepFish, tryCatch, GAME_SECONDS } from './lib/game';
import Ripples from './Ripples';
import './App.css';

const { sk, pk } = loadKey();

function genChannel() {
	return Math.random().toString(36).slice(2, 10);
}

function JoinScreen({ onEnter }) {
	const [joinId, setJoinId] = useState('');
	const [hostId, setHostId] = useState(() => genChannel());
	return (
		<div className="join">
			<h1>🎣 Nostr Fishing</h1>
			<p className="muted">Realtime multiplayer over Nostr. The room creator is the host.</p>
			<div className="row">
				<button className="btn primary" onClick={() => onEnter(hostId, true)}>Create room</button>
				<span className="muted">{hostId}</span>
			</div>
			<div className="row">
				<input value={joinId} onChange={(e) => setJoinId(e.target.value)} placeholder="Paste room id to join" />
				<button className="btn" onClick={() => joinId.trim() && onEnter(joinId.trim(), false)}>Join</button>
			</div>
			<div className="hint muted">← → · click  aim X &nbsp;&nbsp;HOLD <kbd>SPACE</kbd> to dive · release to cast</div>
		</div>
	);
}

export default function App() {
	const [channel, setChannel] = useState(null);
	const [isHost, setIsHost] = useState(false);
	function enterJoin(ch, host) {
		localStorage.setItem('nostr-fishing-channel', ch);
		if (host) localStorage.setItem('nostr-fishing-host', ch);
		setChannel(ch);
		setIsHost(host);
	}
	return channel ? <Game channel={channel} isHost={isHost} /> : <JoinScreen onEnter={enterJoin} />;
}

function Game({ channel, isHost }) {
	const relaysRef = useRef(null);
	const subsRef = useRef([]);

	const [phase, setPhase] = useState('lobby');
	const [count, setCount] = useState(3);
	const [fishes, setFishes] = useState([]);
	const [scores, setScores] = useState({});
	const [timeLeft, setTimeLeft] = useState(GAME_SECONDS);
	const [glow, setGlow] = useState(''); // grid flash color on catch
	const [announce, setAnnounce] = useState('');
	const [endedScores, setEndedScores] = useState({});
	const [others, setOthers] = useState({});

	const fishesRef = useRef([]);
	const scoresRef = useRef({});
	const timeRef = useRef(GAME_SECONDS);
	const phaseRef = useRef('lobby');
	const loopRef = useRef(null);
	const lastPosPub = useRef(0);

	// rod state
	const [poleX, setPoleX] = useState(50);
	const [charge, setCharge] = useState(0);
	const [casting, setCasting] = useState(false);
	const poleXRef = useRef(50);
	const chargeRef = useRef(0);
	const chargeTimer = useRef(null);
	const holdingRef = useRef(false);

	function applyState({ fishes: f, time, scores: s }) {
		if (f) { fishesRef.current = f; setFishes(f); }
		if (typeof time === 'number') { timeRef.current = time; setTimeLeft(time); }
		if (s) { scoresRef.current = s; setScores(s); }
	}

	function announceOnce(m, color) {
		setAnnounce({ text: m, color });
		setTimeout(() => setAnnounce(''), 2200);
	}

	function startGame() {
		publish(relaysRef.current, sk, channel, 'start', { countdown: 3 });
		beginCountdown();
	}

	function beginCountdown() {
		phaseRef.current = 'countdown';
		setPhase('countdown');
		let c = 3;
		setCount(c);
		const iv = setInterval(() => {
			c -= 1;
			if (c === 0) { clearInterval(iv); startPlaying(); }
			else setCount(c);
		}, 1000);
	}

	function startPlaying() {
		if (isHost && fishesRef.current.length === 0) {
			fishesRef.current = makeFishes();
			setFishes([...fishesRef.current]);
		}
		phaseRef.current = 'playing';
		setPhase('playing');
		timeRef.current = GAME_SECONDS;
		announceOnce('GO!');
	}

useEffect(() => {
		const relays = connect();
		relaysRef.current = relays;
		subsRef.current = subscribe(relays, channel, (m) => handleMsg(m));
		return () => {
			subsRef.current.forEach((s) => s.close());
			relays.forEach((r) => r.close());
			if (loopRef.current) clearInterval(loopRef.current);
		};
	}, [channel]);

	function handleMsg({ pubkey, type, content }) {
		if (type === 'start' && !isHost) beginCountdown();
		else if (type === 'state') applyState(content);
		else if (type === 'hit') onHit(content);
		else if (type === 'pos') setOthers((o) => ({ ...o, [pubkey]: content }));
		else if (type === 'end') { setPhase('ended'); setEndedScores(content.scores || {}); }
		else if (type === 'catch' && isHost) resolveCatch(pubkey, content);
	}

	function onHit({ fishId, player, score, scores: s }) {
		fishesRef.current = fishesRef.current.filter((f) => f.id !== fishId);
		setFishes(fishesRef.current);
		setScores(s || scoresRef.current);
		flash(player);
		announceOnce(`${colorName(player)} caught +${score} 🎣`, colorFor(player));
	}

	function flash(color) {
		setGlow(color);
		setTimeout(() => setGlow(''), 350);
	}

	function resolveCatch(player, { fishId }) {
		const idx = fishesRef.current.findIndex((f) => f.id === fishId);
		if (idx < 0 || phaseRef.current !== 'playing') return;
		const score = fishesRef.current[idx].score;
		fishesRef.current.splice(idx, 1);
		setFishes([...fishesRef.current]);
		const next = { ...scoresRef.current, [player]: (scoresRef.current[player] || 0) + score };
		scoresRef.current = next;
		setScores(next);
		publish(relaysRef.current, sk, channel, 'hit', { fishId, player, score, scores: next });
		flash(colorFor(player));
		announceOnce(`${colorName(player)} caught +${score} 🎣`, colorFor(player));
	}

	// host game loop
	useEffect(() => {
		if (!isHost || phase !== 'playing') return;
		loopRef.current = setInterval(() => {
			fishesRef.current = fishesRef.current.map(stepFish);
			timeRef.current -= 0.4;
			const t = Math.max(0, timeRef.current);
			setTimeLeft(t);
			setFishes([...fishesRef.current]);
			publish(relaysRef.current, sk, channel, 'state', {
				fishes: fishesRef.current, time: t, scores: scoresRef.current
			});
			if (t <= 0) {
				clearInterval(loopRef.current);
				phaseRef.current = 'ended';
				setPhase('ended');
				setEndedScores(scoresRef.current);
				publish(relaysRef.current, sk, channel, 'end', { scores: scoresRef.current });
			}
		}, 400);
		return () => clearInterval(loopRef.current);
	}, [isHost, phase, channel]);

	// keyboard: arrows move X, hold space charges depth
	useEffect(() => {
		function onKeyDown(e) {
			if (e.key === 'ArrowLeft') move('left');
			if (e.key === 'ArrowRight') move('right');
			if (e.code === 'Space') {
				e.preventDefault();
				if (!holdingRef.current) startCharge();
			}
		}
		function onKeyUp(e) {
			if (e.code === 'Space') releaseCast();
		}
		window.addEventListener('keydown', onKeyDown);
		window.addEventListener('keyup', onKeyUp);
		window.addEventListener('blur', releaseCast);
		return () => {
			window.removeEventListener('keydown', onKeyDown);
			window.removeEventListener('keyup', onKeyUp);
			window.removeEventListener('blur', releaseCast);
		};
	}, []);

	function move(dir) {
		setPoleX((x) => { const nx = Math.max(2, Math.min(98, x + (dir === 'left' ? -5 : 5))); poleXRef.current = nx; publishPos(); return nx; });
	}

	function publishPos(force) {
		const now = Date.now();
		if (!force && now - lastPosPub.current < 180) return;
		lastPosPub.current = now;
		publish(relaysRef.current, sk, channel, 'pos', { x: poleXRef.current, depth: chargeRef.current });
	}

	function startCharge() {
		holdingRef.current = true;
		setCasting(true);
		chargeRef.current = 0;
		setCharge(0);
		chargeTimer.current = setInterval(() => {
			chargeRef.current = Math.min(100, chargeRef.current + 2.5);
			setCharge(chargeRef.current);
			if (chargeRef.current >= 100) { clearInterval(chargeTimer.current); releaseCast(); }
		}, 22);
	}

	function releaseCast() {
		if (!holdingRef.current) return;
		holdingRef.current = false;
		setCasting(false);
		clearInterval(chargeTimer.current);
		const depth = chargeRef.current;
		publishPos(true);
		const fish = nearestFish(poleXRef.current, depth);
		if (fish) {
			publish(relaysRef.current, sk, channel, 'catch', { fishId: fish.id });
			flash('rgba(255,255,255,0.25)');
		}
		setCharge(0);
		chargeRef.current = 0;
	}

	function nearestFish(x, depth) {
		let best = null;
		let bestD = Infinity;
		fishesRef.current.forEach((f) => {
			const d = Math.abs(f.x - x) + Math.abs(f.y - depth);
			if (tryCatch(f, x, depth) && d < bestD) { bestD = d; best = f; }
		});
		return best;
	}

	function colorName(p) { return shortId(p); }

	const color = colorFor(pk);
	const gaugePct = Math.round(charge);
	const myScore = scores[pk] || 0;

	return (
		<div className="app">
			<header>
				<strong>🎣 Nostr Fishing</strong>
				<span className="badge" style={{ background: color }}>You: {shortId(pk)} ({myScore})</span>
				<span className={`badge role ${isHost ? 'host' : ''}`}>{isHost ? 'HOST' : 'PLAYER'}</span>
				<span className="badge">⏱ {Math.ceil(timeLeft)}s</span>
			</header>

			<div className="scores">
				{Object.entries(scores).map(([p, s]) => (
					<span key={p} className="score-chip" style={{ background: colorFor(p) }}>{shortId(p)}: {s}</span>
				))}
				{Object.keys(scores).length === 0 && <span className="muted">No fish caught yet</span>}
			</div>

			<section className="arena">
				<div
					className="ocean"
					onPointerMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); const nx = ((e.clientX - r.left) / r.width) * 100; poleXRef.current = nx; setPoleX(nx); publishPos(); }}
					style={{ ['--glow']: glow || 'transparent' }}
				>
					<Ripples />
					<div className="waves">
						<span className="wave w1" /><span className="wave w2" /><span className="wave w3" />
					</div>

					{fishes.map((f) => (
						<div
							key={f.id}
							className="fish"
							style={{ left: `${f.x}%`, top: `${f.y}%`, transform: `scaleX(${f.dir})` }}
						>
							<span className="fish-emoji">{f.emoji}</span>
							<span className="fish-score">+{f.score}</span>
						</div>
					))}

					{Object.entries(others)
						.filter(([p]) => p !== pk)
						.map(([p, pos]) => (
							<div key={p} className="rod other" style={{ left: `${pos.x}%`, opacity: 0.3 }}>
								<div className="rod-line" style={{ height: `${pos.depth || 0}%` }} />
								<div className="hook" style={{ top: `${pos.depth || 0}%` }}>🪝</div>
								<div className="rod-label" style={{ background: colorFor(p) }}>{shortId(p)}</div>
							</div>
						))}

					<div className="rod" style={{ left: `${poleX}%` }}>
						<div className="rod-line" style={{ height: `${casting ? gaugePct : 0}%` }} />
						<div
							className="hook"
							style={{ top: `${casting ? gaugePct : 4}%`, opacity: casting ? 1 : 0.35 }}
						>🪝</div>
					</div>

					<div className="gauge">
						<div className="gauge-track">
							<div className="gauge-fill" style={{ height: `${casting ? gaugePct : 0}%` }} />
						</div>
						<div
							className="gauge-arrow"
							style={{ bottom: `calc(${casting ? gaugePct : 0}% - 6px)` }}
						>▶</div>
						<div className="gauge-label muted">DEPTH</div>
					</div>

					{phase === 'countdown' && <div className="overlay big">{count || 'GO!'}</div>}
					{phase === 'lobby' && isHost && (
						<div className="overlay"><button className="btn primary big" onClick={startGame}>▶ Play</button></div>
					)}
					{phase === 'lobby' && !isHost && <div className="overlay muted">Waiting for host to start…</div>}
					{phase === 'ended' && (
						<div className="overlay">
							<h2>Game over</h2>
							{Object.entries(endedScores).map(([p, s]) => (
								<div key={p} className="score-row" style={{ color: colorFor(p) }}>{shortId(p)}: {s}</div>
							))}
							{isHost && <button className="btn primary" onClick={startGame}>▶ Play again</button>}
						</div>
					)}
				</div>

				{announce && (
					<div className="toast" style={{ borderColor: announce.color}}>{announce.text}</div>
				)}

				<div className="controls muted">
					← → · click  aim X &nbsp;&nbsp;HOLD <kbd>SPACE</kbd> to dive (gauge) · release to cast 🎣
				</div>
			</section>
		</div>
	);
}

function shortId(k) {
	return `${k.slice(0, 6)}…${k.slice(-4)}`;
}
