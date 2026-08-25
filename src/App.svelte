<script>
	import { onMount } from 'svelte';
	import { generateSecretKey, getPublicKey, finalizeEvent } from 'nostr-tools';
	import { verifyEvent } from 'nostr-tools/pure';
	import { AbstractRelay } from 'nostr-tools/abstract-relay';
	import { bytesToHex, hexToBytes } from 'nostr-tools/utils';

	const RELAYS = ['wss://nos.lol', 'wss://relay.mostr.pub'];

	let skHex = localStorage.getItem('nostr-sk');
	const isValidHex = (s) => typeof s === 'string' && /^[0-9a-fA-F]{64}$/.test(s);
	if (!isValidHex(skHex)) {
		skHex = bytesToHex(generateSecretKey());
		localStorage.setItem('nostr-sk', skHex);
	}
	const sk = hexToBytes(skHex);
	const pk = getPublicKey(sk);

	let channel = $state(localStorage.getItem('nostr-channel'));
	if (!channel) {
		channel = Math.random().toString(36).slice(2, 10);
		localStorage.setItem('nostr-channel', channel);
	}

	let messages = $state([]);
	let status = $state('connecting');
	let draft = $state('');
	let joinInput = $state(channel);

	let relays = [];
	let subs = [];
	const seen = new Set();

	onMount(() => {
		relays = RELAYS.map((url) => new AbstractRelay(url, { verifyEvent }));
		relays.forEach((r) => r.connect().catch(() => {}));
		subscribe();
		return () => {
			relays.forEach((r) => r.close());
			subs = [];
		};
	});

	function subscribe() {
		subs.forEach((s) => s.close('resub'));
		subs = relays.map((relay) =>
			relay.subscribe(
				[{ kinds: [1], '#t': [channel], limit: 30 }],
				{
					onevent(event) {
						if (seen.has(event.id)) return;
						if (!event.tags.some(([k, v]) => k === 't' && v === channel)) return;
						seen.add(event.id);
						messages = [format(event), ...messages].slice(0, 100);
						status = 'connected';
					},
					oneose() {
						status = 'connected';
					}
				}
			)
		);
	}

	function join() {
		const c = joinInput.trim();
		if (!c) return;
		seen.clear();
		channel = c;
		localStorage.setItem('nostr-channel', c);
		subscribe();
	}

	function format(event) {
		const author = shortId(event.pubkey);
		const time = new Date(event.created_at * 1000).toLocaleTimeString();
		const isYou = event.pubkey === pk;
		return { id: event.id, content: event.content, author, time, you: isYou };
	}

	function shortId(key) {
		return `${key.slice(0, 6)}…${key.slice(-4)}`;
	}

	async function send() {
		const text = draft.trim();
		if (!text) return;
		draft = '';
		const event = finalizeEvent(
			{ kind: 1, created_at: Math.floor(Date.now() / 1000), tags: [['t', channel]], content: text },
			sk
		);
		relays.forEach((r) => r.publish(event).catch(() => {}));
	}
</script>

<main>
	<h1>Nostr Channel</h1>
	<p class="status">Status: {status === 'connected' ? '🟢 connected' : '🟡 connecting…'}</p>
	<p class="identity">You: {shortId(pk)}</p>

	<div class="channel-bar">
		<span>Channel</span>
		<input bind:value={joinInput} placeholder="channel id" />
		<button onclick={join}>Join</button>
	</div>

	<div class="messages">
		{#each messages as m (m.id)}
			<div class="msg {m.you ? 'mine' : ''}">
				<span class="meta">{m.time} · {m.author}</span>
				<p>{m.content}</p>
			</div>
		{:else}
			<p class="empty">No messages in this channel. Share the channel id to chat.</p>
		{/each}
	</div>

	<form onsubmit={(e) => { e.preventDefault(); send(); }}>
		<input bind:value={draft} placeholder="Type a message…" autocomplete="off" />
		<button type="submit">Send</button>
	</form>
</main>

<style>
	main {
		max-width: 640px;
		margin: 0 auto;
		padding: 24px;
		font-family: system-ui, sans-serif;
	}
	h1 {
		margin: 0 0 4px;
	}
	.status, .identity {
		margin: 4px 0;
		color: #666;
		font-size: 14px;
	}
	.channel-bar {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 12px 0;
		font-size: 14px;
		color: #444;
	}
	.channel-bar input {
		flex: 1;
		padding: 6px 8px;
		border: 1px solid #ccc;
		border-radius: 5px;
		font-size: 13px;
	}
	.channel-bar button {
		padding: 6px 12px;
		border: none;
		border-radius: 5px;
		background: #059669;
		color: #fff;
		font-size: 13px;
		cursor: pointer;
	}
	.messages {
		border: 1px solid #ddd;
		border-radius: 8px;
		height: 47vh;
		overflow-y: auto;
		padding: 12px;
		margin: 12px 0;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.msg {
		background: #f2f2f2;
		border-radius: 8px;
		padding: 8px 10px;
		max-width: 80%;
	}
	.msg.mine {
		background: #dbeafe;
		align-self: flex-end;
	}
	.meta {
		font-size: 12px;
		color: #666;
	}
	.msg p {
		margin: 4px 0 0;
		word-break: break-word;
	}
	.empty {
		color: #999;
		text-align: center;
	}
	form {
		display: flex;
		gap: 8px;
	}
	input {
		flex: 1;
		padding: 10px;
		border: 1px solid #ccc;
		border-radius: 6px;
		font-size: 14px;
	}
	button {
		padding: 10px 18px;
		border: none;
		border-radius: 6px;
		background: #2563eb;
		color: #fff;
		font-size: 14px;
		cursor: pointer;
	}
</style>
