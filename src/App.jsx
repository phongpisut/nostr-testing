import { useEffect, useRef, useState } from 'react';
import { loadKey, connect, publish, subscribe, RELAYS } from './lib/nostr';
import { colorFor, makeFishes, stepFish, tryCatch, GAME_SECONDS } from './lib/game';
import './App.css';

const { sk, pk } = loadKey();

function JoinScreen({ onEnter }) {
	const [joinId, setJoinId] = useState('');
	const [hostId, setHostId] = useState(() => genChannel());

	return (
		<div className="join">
			<h1>🎣 Nostr Fishing</h1>
			<p className="muted">Realtime multiplayer over Nostr. The room creator is the host.</p>

			<div className="row">
				<button className="btn primary" onClick={() => onEnter(hostId, true)}>
					Create room
				</button>
				<span className="muted"> {hostId}</span>
			</div>

			<div className="row">
				<input
					value={joinId}
					onChange={(e) => setJoinId(e.target.value)}
					placeholder="Paste room id to join"
				/>
				<button
					className="btn"
					onClick={() => joinId.trim() && onEnter(joinId.trim(), false)}
				>
					Join
				</button>
			</div>
		</div>
	);
}

function genChannel() {
	return Math.random().toString(36).slice(2, 10);
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

	return channel ? (
		<Game channel={channel} isHost={isHost} />
	) : (
		<JoinScreen onEnter={enterJoin} />
	);
}


function Game({ channel, isHost }) {
	const relaysRef = useRef(null);
	const subsRef = useRef([]);
	const [ready, setReady] = useState(false);

	const [phase, setPhase] = useState('lobby'); // lobby | countdown | playing | ended
	const [count, setCount] = useState(3);
	const [fishes, setFishes] = useState([]);
	const [scores, setScores] = useState({});
	const [timeLeft, setTimeLeft] = useState(GAME_SECONDS);
	const [poleX, setPoleX] = useState(50);
	const [announce, setAnnounce] = useState('');
	const [endedScores, setEndedScores] = useState({});

	// Host-authoritative state lives in refs
	const fishesRef = useRef([]);
	const scoresRef = useRef({});
	const timeRef = useRef(GAME_SECONDS);
	const phaseRef = useRef('lobby');
	const loopRef = useRef(null);

	function applyState({ fishes: f, time, scores: s, myAnnounce }) {
		if (f) { fishesRef.current = f; setFishes(f); }
		if (typeof time === 'number') { timeRef.current = time; setTimeLeft(time); }
		if (s) { scoresRef.current = s; setScores(s); }
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
			if (c === 0) {
				clearInterval(iv);
				startPlaying();
			} else {
				setCount(c);
			}
		}, 1000);
	}

	function startPlaying() {
		if (isHost && fishesRef.current.length === 0) {
			fishesRef.current = makeFishes(6);
			setFishes([...fishesRef.current]);
		}
		phaseRef.current = 'playing';
		setPhase('playing');
		timeRef.current = GAME_SECONDS;
		announceOnce('Go!')
	}

	function announceOnce(m) {
		setAnnounce(m);
		setTimeout(() => setAnnounce(''), 2000);
	}

	useEffect(() => {
		relaysRef.current = connect();
		setReady(true);

		// Rejoin stored room on reload if we were the host
		return () => closeAll();
	}, []);

	function closeAll() {
		subsRef.current.forEach((s) => s.close());
		relaysRef.current?.forEach((r) => r.close());
		if (loopRef.current) clearInterval(loopRef.current);
	}

	useEffect(() => {
		if (!ready) return;
		subsRef.current = subscribe(relaysRef.current, channel, (m) => handleMsg(m));
		return () => subsRef.current.forEach((s) => s.close());
	}, [ready, channel]);

	function handleMsg({ pubkey, type, content }) {
		if (type === 'start' && !isHost) {
			beginCountdown();
		} else if (type === 'state') {
			applyState(content);
		} else if (type === 'hit') {
			onHit(content);
		} else if (type === 'end') {
			setPhase('ended');
			setEndedScores(content.scores || {});
		} else if (type === 'catch' && isHost) {
			resolveCatch(pubkey, content);
		}
	}

	function onHit({ fishId, player, score, scores: s }) {
		fishesRef.current = fishesRef.current.filter((f) => f.id !== fishId);
		setFishes(fishesRef.current);
		setScores(s || scoresRef.current);
		announceOnce(`${colorName(player)} caught a fish +${score}`);
	}

	async function resolveCatch(player, { fishId }) {
		const idx = fishesRef.current.findIndex((f) => f.id === fishId);
		if (idx < 0) return;
		if (phaseRef.current !== 'playing') return;
		const fish = fishesRef.current[idx];
		const score = fish.score;
		fishesRef.current.splice(idx, 1);
		setFishes([...fishesRef.current]);
		const next = { ...scoresRef.current, [player]: (scoresRef.current[player] || 0) + score };
		scoresRef.current = next;
		setScores(next);
		publish(relaysRef.current, sk, channel, 'hit', {
			fishId,
			player,
			score,
			scores: next
		});
		announceOnce(`${colorName(player)} caught a fish +${score}`);
	}

	function catchAttempt(fishId) {
		if (phaseRef.current !== 'playing') return;
		publish(relaysRef.current, sk, channel, 'catch', { fishId });
	}

	// Host game loop
	useEffect(() => {
		if (!ready || !isHost || phase !== 'playing') return;
		loopRef.current = setInterval(() => {
			fishesRef.current = fishesRef.current.map(stepFish);
			timeRef.current -= 0.4;
			const t = Math.max(0, timeRef.current);
			setTimeLeft(t);
			setFishes([...fishesRef.current]);
			publish(relaysRef.current, sk, channel, 'state', {
				fishes: fishesRef.current,
				time: t,
				scores: scoresRef.current
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
	}, [ready, isHost, phase, channel]);

	// Keyboard: left/right move pole, space catch
	useEffect(() => {
		function onKey(e) {
			if (e.key === 'ArrowLeft') setPoleX((x) => Math.max(2, x - 6));
			if (e.key === 'ArrowRight') setPoleX((x) => Math.min(98, x + 6));
			if (e.code === 'Space') {
				e.preventDefault();
				const fish = nearestFish(poleX);
				if (fish) catchAttempt(fish.id);
			}
		}
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, [poleX]);

	function nearestFish(x) {
		let best = null;
		let bestD = Infinity;
		fishesRef.current.forEach((f) => {
			const d = Math.abs(f.x - x);
			if (d < bestD && tryCatch(f, x)) {
				bestD = d;
				best = f;
			}
		});
		// fallback: allow slightly larger range for playability
		if (!best) {
			fishesRef.current.forEach((f) => {
				const d = Math.abs(f.x - x);
				if (d < bestD) {
					bestD = d;
					best = f;
				}
			});
			if (bestD > 8) best = null;
		}
		return best;
	}

	function colorName(p) {
		return shortId(p);
	}

	const fontSize = 18;
	const color = colorFor(pk);

	return (
		<div className="app">
			<header>
				<strong>🎣 Nostr Fishing</strong>
				<span className="badge" style={{ background: color }}>You: {shortId(pk)}</span>
				<span className={`badge role ${isHost ? 'host' : ''}`}>
					{isHost ? 'HOST' : 'PLAYER'}
				</span>
				<span className="badge">⏱ {Math.ceil(timeLeft)}s</span>
			</header>

			<section className="arena">
				<div className="scores">
					{Object.entries(scores).length === 0 && <span className="muted">No fish caught yet</span>}
					{Object.entries(scores).map(([p, s]) => (
						<span key={p} className="score-chip" style={{ background: colorFor(p) }}>
							{shortId(p)}: {s}
						</span>
					))}
				</div>

				<div className="ocean" onClick={(e) => setPoleX((e.clientX / e.currentTarget.getBoundingClientRect().width) * 100)}>
					<div className="bg" />
					{fishes.map((f) => (
						<div key={f.id} className="fish" style={{
							left: `${f.x}%`,
							top: `${f.y}%`,
							transform: `scaleX(${f.dir || 1})`
						}}>
							<span className="fish-score">+{f.score}</span>
						</div>
					))}

					<div className="pole" style={{ left: `${poleX}%` }}>
						<div className="pole-float" style={{ background: color }} />
					</div>

					{phase === 'countdown' && <div className="overlay big">{count || 'GO!'}</div>}
					{phase === 'lobby' && isHost && (
						<div className="overlay">
							<button className="btn primary big" onClick={() => startGame()}>▶ Play</button>
						</div>
					)}
					{phase === 'lobby' && !isHost && <div className="overlay muted">Waiting for host to start…</div>}
					{phase === 'ended' && (
						<div className="overlay">
							<h2>Game over</h2>
							{Object.entries(endedScores).map(([p, s]) => (
								<div key={p} className="score-row" style={{ color: colorFor(p) }}>
									{shortId(p)}: {s}
								</div>
							))}
							{isHost && <button className="btn primary" onClick={() => startGame()}>▶ Play again</button>}
						</div>
					)}
				</div>

				{announce && <div className="toast">{announce}</div>}

				<div className="controls muted">
					← → move pole · SPACE catch · click to aim
				</div>
			</section>
		</div>
	);
}

function shortId(k) {
	return `${k.slice(0, 6)}…${k.slice(-4)}`;
}
