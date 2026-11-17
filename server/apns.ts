import { createPrivateKey, sign, type KeyObject } from 'node:crypto';
import { connect, type ClientHttp2Session } from 'node:http2';
import type { AppleDevice } from '../shared/push.ts';
import type { Alert } from './push.ts';

// Alerts to the iPhone app, through Apple's push service (APNs). Signed with the team's push key (a .p8
// from Apple Developer → Keys), so no certificate expires each year. One connection to each of Apple's
// two servers is kept open: the real one (TestFlight and the App Store) and the sandbox (a build run from
// Xcode).

export interface AppleKey {
	/** The .p8 file's text (APNS_KEY); `\n` written out in a secret is read as a line break. */
	key: string;
	/** The key's ID beside it in Apple Developer (APNS_KEY_ID). */
	keyId: string;
	/** The developer team (APNS_TEAM_ID). */
	teamId: string;
	/** The app's bundle ID, which alerts are for. */
	topic: string;
}

export interface ApplePusher {
	/** Throws an error with `statusCode` 410 when Apple says the app is gone from that phone. */
	send(device: AppleDevice, alert: Alert): Promise<void>;
}

/** Apple takes a token up to an hour old, and refuses new ones more often than every 20 minutes. */
const TOKEN_AGE = 50 * 60_000;

export function applePusher({ key, keyId, teamId, topic }: AppleKey): ApplePusher {
	const privateKey: KeyObject = createPrivateKey(key.replace(/\\n/g, '\n'));
	let token = { value: '', at: 0 };
	const bearer = () => {
		const now = Date.now();
		if (now - token.at > TOKEN_AGE) {
			const part = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
			const head = `${part({ alg: 'ES256', kid: keyId })}.${part({ iss: teamId, iat: Math.floor(now / 1000) })}`;
			const signature = sign('sha256', Buffer.from(head), { key: privateKey, dsaEncoding: 'ieee-p1363' });
			token = { value: `${head}.${signature.toString('base64url')}`, at: now };
		}
		return token.value;
	};

	const sessions = new Map<string, ClientHttp2Session>();
	// While alerts are on their way, the connection keeps the process running; idle, it doesn't.
	const pending = new Map<ClientHttp2Session, number>();
	const hold = (s: ClientHttp2Session, by: 1 | -1) => {
		const n = (pending.get(s) ?? 0) + by;
		pending.set(s, n);
		if (n > 0) s.ref();
		else s.unref();
	};
	const session = (host: string) => {
		let s = sessions.get(host);
		if (!s || s.closed || s.destroyed) {
			s = connect(`https://${host}`);
			// A dropped connection is made again on the next alert.
			s.on('error', () => sessions.delete(host));
			s.on('close', () => {
				sessions.delete(host);
				pending.delete(s!);
			});
			s.unref();
			sessions.set(host, s);
		}
		return s;
	};

	return {
		send(device, alert) {
			const host = device.sandbox ? 'api.sandbox.push.apple.com' : 'api.push.apple.com';
			const body = JSON.stringify({
				aps: { alert: { title: alert.title, body: alert.body }, sound: 'default' },
				url: alert.url,
			});
			const s = session(host);
			hold(s, 1);
			return new Promise<void>((resolve, reject) => {
				const req = s.request({
					':method': 'POST',
					':path': `/3/device/${device.token}`,
					authorization: `bearer ${bearer()}`,
					'apns-topic': topic,
					'apns-push-type': 'alert',
					'apns-priority': '10',
					// Stale after a day, as for browsers: Apple drops it rather than deliver it late.
					'apns-expiration': String(Math.floor(Date.now() / 1000) + 86_400),
					// One alert per thing on the phone, like the browser's tag (Apple allows 64 bytes).
					'apns-collapse-id': alert.tag.slice(0, 64),
				});
				let status = 0;
				let reply = '';
				req.setEncoding('utf8');
				req.on('response', (headers) => (status = Number(headers[':status'])));
				req.on('data', (chunk: string) => (reply += chunk));
				req.on('error', reject);
				req.on('end', () => {
					if (status === 200) return resolve();
					const reason = (() => {
						try {
							return (JSON.parse(reply) as { reason?: string }).reason ?? '';
						} catch {
							return '';
						}
					})();
					// Deleted from the phone, or a token from the other server (sandbox or not): gone, like a browser's 410.
					const gone = status === 410 || reason === 'BadDeviceToken' || reason === 'DeviceTokenNotForTopic';
					reject(
						Object.assign(new Error(`Apple turned down an alert: ${status} ${reason}`), {
							statusCode: gone ? 410 : status,
						}),
					);
				});
				req.end(body);
			}).finally(() => hold(s, -1));
		},
	};
}
