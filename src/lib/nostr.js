import { generateSecretKey, getPublicKey, finalizeEvent } from 'nostr-tools';
import { verifyEvent } from 'nostr-tools/pure';
import { AbstractRelay } from 'nostr-tools/abstract-relay';
import { bytesToHex, hexToBytes } from 'nostr-tools/utils';

export const RELAYS = ['wss://nos.lol', 'wss://relay.mostr.pub'];

export function loadKey() {
	let skHex = localStorage.getItem('nostr-fishing-sk');
	const valid = (s) => typeof s === 'string' && /^[0-9a-fA-F]{64}$/.test(s);
	if (!valid(skHex)) {
		skHex = bytesToHex(generateSecretKey());
		localStorage.setItem('nostr-fishing-sk', skHex);
	}
	const sk = hexToBytes(skHex);
	return { sk, pk: getPublicKey(sk) };
}

export function connect(cb) {
	const relays = RELAYS.map((url) => new AbstractRelay(url, { verifyEvent }));
	relays.forEach((r) => r.connect().catch(() => {}));
	return relays;
}

export function publish(relays, sk, channel, type, payload) {
	const event = finalizeEvent(
		{
			kind: 1,
			created_at: Math.floor(Date.now() / 1000),
			tags: [
				['t', channel],
				['g', type]
			],
			content: JSON.stringify(payload)
		},
		sk
	);
	relays.forEach((r) => r.publish(event).catch(() => {}));
	return event;
}

export function subscribe(relays, channel, onMsg) {
	return relays.map((relay) =>
		relay.subscribe(
			[{ kinds: [1], '#t': [channel], limit: 100 }],
			{
				onevent(event) {
					const type = (event.tags.find(([k]) => k === 'g') || [])[1];
					const content = safeParse(event.content);
					if (type && content !== null) onMsg({ pubkey: event.pubkey, type, content });
				}
			}
		)
	);
}

function safeParse(s) {
	try {
		return JSON.parse(s);
	} catch {
		return null;
	}
}
