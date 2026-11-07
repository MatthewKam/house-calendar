import type { ReactNode } from "react";

// The games' pictures, drawn flat and friendly (no emoji, so they look the same on every device). Each
// fills a 120 × 120 box.

const EYE = "#3b2a20";
const eyes = (y = 50, gap = 15) => (
	<>
		<circle cx={60 - gap} cy={y} r="5" fill={EYE} />
		<circle cx={60 + gap} cy={y} r="5" fill={EYE} />
	</>
);
const smile = (y = 78, w = 8) => <path d={`M${60 - w} ${y} q${w} ${w * 0.8} ${w * 2} 0`} fill="none" stroke={EYE} strokeWidth="3" strokeLinecap="round" />;

const ART: Record<string, ReactNode> = {
	// Animals.
	cow: (
		<>
			<path d="M38 26 l-8 -14 M82 26 l8 -14" stroke="#e8d4a8" strokeWidth="7" strokeLinecap="round" />
			<ellipse cx="22" cy="44" rx="16" ry="9" fill="#f4f1ec" transform="rotate(-20 22 44)" />
			<ellipse cx="98" cy="44" rx="16" ry="9" fill="#f4f1ec" transform="rotate(20 98 44)" />
			<ellipse cx="60" cy="62" rx="38" ry="42" fill="#f4f1ec" />
			<path d="M30 40 C40 32 50 40 44 54 C36 60 26 52 30 40z" fill="#3b2a20" />
			<ellipse cx="60" cy="90" rx="28" ry="18" fill="#f6b8c0" />
			<circle cx="50" cy="90" r="4" fill="#c7707c" />
			<circle cx="70" cy="90" r="4" fill="#c7707c" />
			{eyes(58, 14)}
		</>
	),
	pig: (
		<>
			<path d="M24 26 L46 36 L28 54z" fill="#f2a2b0" />
			<path d="M96 26 L74 36 L92 54z" fill="#f2a2b0" />
			<circle cx="60" cy="64" r="42" fill="#f6b8c0" />
			<ellipse cx="60" cy="78" rx="18" ry="13" fill="#f2a2b0" />
			<ellipse cx="54" cy="78" rx="3.5" ry="5" fill="#c7707c" />
			<ellipse cx="66" cy="78" rx="3.5" ry="5" fill="#c7707c" />
			{eyes(56)}
		</>
	),
	duck: (
		<>
			<path d="M58 22 C56 12 64 8 66 16" fill="none" stroke="#f6cf3c" strokeWidth="6" strokeLinecap="round" />
			<circle cx="60" cy="62" r="40" fill="#f6cf3c" />
			<path d="M42 74 C52 66 68 66 78 74 C70 88 50 88 42 74z" fill="#f4a020" />
			{eyes(54, 14)}
		</>
	),
	sheep: (
		<>
			<g fill="#f4f1ec">
				<circle cx="30" cy="40" r="18" />
				<circle cx="52" cy="26" r="18" />
				<circle cx="74" cy="26" r="18" />
				<circle cx="92" cy="42" r="18" />
			</g>
			<ellipse cx="18" cy="62" rx="14" ry="8" fill="#3b2a20" transform="rotate(-20 18 62)" />
			<ellipse cx="102" cy="62" rx="14" ry="8" fill="#3b2a20" transform="rotate(20 102 62)" />
			<ellipse cx="60" cy="70" rx="30" ry="38" fill="#3b2a20" />
			<circle cx="49" cy="64" r="6" fill="#fff" />
			<circle cx="49" cy="64" r="3" fill="#1d1f23" />
			<circle cx="71" cy="64" r="6" fill="#fff" />
			<circle cx="71" cy="64" r="3" fill="#1d1f23" />
			<path d="M52 90 q8 6 16 0" fill="none" stroke="#f4f1ec" strokeWidth="3" strokeLinecap="round" />
		</>
	),
	horse: (
		<>
			<path d="M38 20 l6 18 l10 -12z M82 20 l-6 18 l-10 -12z" fill="#9a5e34" />
			<path d="M50 14 C60 6 76 12 74 30 L60 34z" fill="#4a2e1c" />
			<rect x="34" y="22" width="52" height="88" rx="26" fill="#b5733f" />
			<ellipse cx="60" cy="92" rx="24" ry="18" fill="#e3b989" />
			<ellipse cx="51" cy="94" rx="3.5" ry="5" fill="#6b4126" />
			<ellipse cx="69" cy="94" rx="3.5" ry="5" fill="#6b4126" />
			{eyes(50, 14)}
		</>
	),
	chicken: (
		<>
			<path d="M46 24 q4 -14 12 -4 q6 -14 12 0 q8 -8 8 6z" fill="#e03a2f" />
			<circle cx="60" cy="64" r="40" fill="#fbf7ee" />
			<path d="M54 64 L66 64 L60 76z" fill="#f4a020" />
			<path d="M57 76 q3 12 6 0" fill="#e03a2f" />
			{eyes(54, 13)}
		</>
	),
	goat: (
		<>
			<path d="M42 30 C34 14 22 12 18 20 M78 30 C86 14 98 12 102 20" fill="none" stroke="#8a7a66" strokeWidth="7" strokeLinecap="round" />
			<ellipse cx="22" cy="54" rx="15" ry="7" fill="#e8e2d6" transform="rotate(-15 22 54)" />
			<ellipse cx="98" cy="54" rx="15" ry="7" fill="#e8e2d6" transform="rotate(15 98 54)" />
			<rect x="34" y="28" width="52" height="72" rx="26" fill="#e8e2d6" />
			<path d="M50 96 L60 116 L70 96z" fill="#c9bfae" />
			<ellipse cx="54" cy="82" rx="3" ry="4" fill="#6b5a48" />
			<ellipse cx="66" cy="82" rx="3" ry="4" fill="#6b5a48" />
			{eyes(56, 13)}
		</>
	),
	dog: (
		<>
			<circle cx="60" cy="62" r="40" fill="#c98c52" />
			<ellipse cx="22" cy="62" rx="13" ry="28" fill="#6b4126" transform="rotate(12 22 62)" />
			<ellipse cx="98" cy="62" rx="13" ry="28" fill="#6b4126" transform="rotate(-12 98 62)" />
			<ellipse cx="60" cy="80" rx="20" ry="15" fill="#efd3b0" />
			<ellipse cx="60" cy="73" rx="8" ry="6" fill={EYE} />
			<path d="M56 88 q4 10 8 0z" fill="#e8707c" />
			{eyes(54, 15)}
		</>
	),
	cat: (
		<>
			<path d="M24 54 L28 14 L54 32z M96 54 L92 14 L66 32z" fill="#f0a04b" />
			<path d="M32 40 L32 24 L46 34z M88 40 L88 24 L74 34z" fill="#f6c6a0" />
			<circle cx="60" cy="64" r="40" fill="#f0a04b" />
			<path d="M55 72 L65 72 L60 78z" fill="#e8707c" />
			<path d="M60 78 q-6 8 -12 4 M60 78 q6 8 12 4" fill="none" stroke={EYE} strokeWidth="2.5" strokeLinecap="round" />
			<path d="M20 70 H44 M20 80 L44 76 M100 70 H76 M100 80 L76 76" stroke={EYE} strokeWidth="2" strokeLinecap="round" />
			{eyes(56, 15)}
		</>
	),
	mouse: (
		<>
			<circle cx="28" cy="38" r="24" fill="#a9a9b2" />
			<circle cx="28" cy="38" r="14" fill="#f2b6c0" />
			<circle cx="92" cy="38" r="24" fill="#a9a9b2" />
			<circle cx="92" cy="38" r="14" fill="#f2b6c0" />
			<ellipse cx="60" cy="70" rx="34" ry="36" fill="#bdbdc6" />
			<circle cx="60" cy="88" r="6" fill="#e8707c" />
			<path d="M26 84 H48 M26 94 L48 90 M94 84 H72 M94 94 L72 90" stroke={EYE} strokeWidth="2" strokeLinecap="round" />
			{eyes(64, 13)}
		</>
	),
	frog: (
		<>
			<circle cx="36" cy="34" r="18" fill="#5cb85c" />
			<circle cx="84" cy="34" r="18" fill="#5cb85c" />
			<ellipse cx="60" cy="72" rx="48" ry="36" fill="#5cb85c" />
			<circle cx="36" cy="34" r="10" fill="#fff" />
			<circle cx="36" cy="34" r="5" fill={EYE} />
			<circle cx="84" cy="34" r="10" fill="#fff" />
			<circle cx="84" cy="34" r="5" fill={EYE} />
			<path d="M30 76 q30 22 60 0" fill="none" stroke="#2f6b2f" strokeWidth="4" strokeLinecap="round" />
			<circle cx="34" cy="64" r="5" fill="#f2a2b0" opacity=".7" />
			<circle cx="86" cy="64" r="5" fill="#f2a2b0" opacity=".7" />
		</>
	),
	owl: (
		<>
			<path d="M24 34 L36 10 L46 32z M96 34 L84 10 L74 32z" fill="#8a5a3b" />
			<ellipse cx="60" cy="66" rx="42" ry="46" fill="#a8744c" />
			<ellipse cx="60" cy="88" rx="26" ry="20" fill="#e3c39a" />
			<circle cx="42" cy="54" r="16" fill="#fff" />
			<circle cx="78" cy="54" r="16" fill="#fff" />
			<circle cx="42" cy="54" r="8" fill={EYE} />
			<circle cx="78" cy="54" r="8" fill={EYE} />
			<path d="M54 66 L66 66 L60 80z" fill="#f4a020" />
		</>
	),
	bee: (
		<>
			<ellipse cx="40" cy="30" rx="18" ry="24" fill="#d6ecff" transform="rotate(-25 40 30)" />
			<ellipse cx="80" cy="30" rx="18" ry="24" fill="#d6ecff" transform="rotate(25 80 30)" />
			<ellipse cx="60" cy="72" rx="42" ry="36" fill="#f6cf3c" />
			<path d="M34 46 q-4 26 0 52 M86 46 q4 26 0 52" fill="none" stroke="#2b2b2b" strokeWidth="10" />
			{eyes(66, 11)}
			{smile(82, 7)}
		</>
	),
	lion: (
		<>
			<circle cx="60" cy="62" r="54" fill="#c8742c" />
			<circle cx="60" cy="64" r="36" fill="#f2b84b" />
			<circle cx="34" cy="34" r="9" fill="#f2b84b" />
			<circle cx="86" cy="34" r="9" fill="#f2b84b" />
			<ellipse cx="60" cy="80" rx="16" ry="11" fill="#fbe2b0" />
			<path d="M54 72 L66 72 L60 79z" fill="#6b4126" />
			{eyes(58, 13)}
		</>
	),
	elephant: (
		<>
			<ellipse cx="22" cy="56" rx="22" ry="32" fill="#9fb0c2" />
			<ellipse cx="98" cy="56" rx="22" ry="32" fill="#9fb0c2" />
			<circle cx="60" cy="52" r="34" fill="#b4c3d3" />
			<path d="M50 70 C50 96 52 110 66 112 C74 112 74 104 68 104 C62 102 70 90 70 70z" fill="#b4c3d3" />
			{eyes(48, 14)}
		</>
	),
	monkey: (
		<>
			<circle cx="20" cy="60" r="16" fill="#8a5a3b" />
			<circle cx="20" cy="60" r="9" fill="#e9c9a0" />
			<circle cx="100" cy="60" r="16" fill="#8a5a3b" />
			<circle cx="100" cy="60" r="9" fill="#e9c9a0" />
			<circle cx="60" cy="60" r="42" fill="#8a5a3b" />
			<path d="M60 42 C46 26 26 40 36 60 C26 76 40 100 60 98 C80 100 94 76 84 60 C94 40 74 26 60 42z" fill="#e9c9a0" />
			<circle cx="55" cy="76" r="2.5" fill={EYE} />
			<circle cx="65" cy="76" r="2.5" fill={EYE} />
			{eyes(56, 12)}
			{smile(84, 9)}
		</>
	),
	rooster: (
		<>
			<path d="M40 30 q2 -22 14 -10 q6 -18 14 -2 q10 -12 12 6 q8 -2 4 12z" fill="#e03a2f" />
			<path d="M84 66 q28 -10 30 14 q-6 -4 -14 0 q8 6 4 18 q-8 -10 -20 -8z" fill="#2f6b4a" />
			<circle cx="58" cy="64" r="38" fill="#c8742c" />
			<ellipse cx="56" cy="88" rx="26" ry="18" fill="#e3a05a" />
			<path d="M44 66 L58 66 L52 78z" fill="#f4a020" transform="translate(-4 0)" />
			<path d="M46 78 q3 14 8 2" fill="#e03a2f" />
			{eyes(54, 13)}
		</>
	),
	hawk: (
		<>
			<path d="M14 54 Q30 20 60 18 Q90 20 106 54 Q86 46 60 48 Q34 46 14 54z" fill="#6b4126" />
			<ellipse cx="60" cy="68" rx="38" ry="40" fill="#a8744c" />
			<ellipse cx="60" cy="84" rx="24" ry="22" fill="#f4e6cf" />
			<path d="M36 50 Q48 44 56 52 M84 50 Q72 44 64 52" fill="none" stroke="#3b2a20" strokeWidth="4" strokeLinecap="round" />
			<circle cx="46" cy="58" r="7" fill="#f6cf3c" />
			<circle cx="46" cy="58" r="3.5" fill={EYE} />
			<circle cx="74" cy="58" r="7" fill="#f6cf3c" />
			<circle cx="74" cy="58" r="3.5" fill={EYE} />
			<path d="M52 66 H68 Q66 80 60 86 Q54 80 52 66z" fill="#f4a020" />
			<path d="M60 86 q-2 -6 2 -8" fill="none" stroke="#c46d00" strokeWidth="2.5" />
		</>
	),
	leopard: (
		<>
			<circle cx="28" cy="30" r="14" fill="#e3a83c" />
			<circle cx="28" cy="30" r="7" fill="#f4d79a" />
			<circle cx="92" cy="30" r="14" fill="#e3a83c" />
			<circle cx="92" cy="30" r="7" fill="#f4d79a" />
			<circle cx="60" cy="64" r="42" fill="#f0bc4c" />
			<g fill="#6b4126">
				<circle cx="34" cy="48" r="5" /><circle cx="44" cy="34" r="4" /><circle cx="60" cy="28" r="5" />
				<circle cx="76" cy="34" r="4" /><circle cx="86" cy="48" r="5" /><circle cx="28" cy="70" r="4" />
				<circle cx="92" cy="70" r="4" /><circle cx="40" cy="94" r="4" /><circle cx="80" cy="94" r="4" />
			</g>
			<ellipse cx="60" cy="82" rx="18" ry="13" fill="#fbe9c4" />
			<path d="M53 75 L67 75 L60 83z" fill="#c8577a" />
			<path d="M60 83 q-6 7 -12 4 M60 83 q6 7 12 4" fill="none" stroke={EYE} strokeWidth="2.5" strokeLinecap="round" />
			{eyes(60, 14)}
		</>
	),
	seagull: (
		<>
			<path d="M8 66 Q30 50 50 62 L52 76 Q26 70 8 66z" fill="#9aa5b1" />
			<path d="M112 66 Q90 50 70 62 L68 76 Q94 70 112 66z" fill="#9aa5b1" />
			<circle cx="60" cy="58" r="34" fill="#f4f6f8" />
			<path d="M60 64 L96 70 L60 78z" fill="#f6c02a" />
			<circle cx="88" cy="72" r="3" fill="#e03a2f" />
			<circle cx="48" cy="52" r="5" fill={EYE} />
			<circle cx="72" cy="52" r="5" fill={EYE} />
		</>
	),
	wolf: (
		<>
			<path d="M22 54 L30 12 L52 36z M98 54 L90 12 L68 36z" fill="#7d8794" />
			<path d="M32 44 L34 24 L46 38z M88 44 L86 24 L74 38z" fill="#d7dce2" />
			<path d="M60 110 L18 64 Q18 36 60 34 Q102 36 102 64z" fill="#9aa5b1" />
			<path d="M60 110 L36 78 Q48 70 60 78 Q72 70 84 78z" fill="#eef1f4" />
			<ellipse cx="60" cy="98" rx="8" ry="6" fill={EYE} />
			{eyes(62, 15)}
		</>
	),
	bear: (
		<>
			<circle cx="27" cy="30" r="15" fill="#b47a4c" />
			<circle cx="27" cy="30" r="7.5" fill="#ecc9a2" />
			<circle cx="93" cy="30" r="15" fill="#b47a4c" />
			<circle cx="93" cy="30" r="7.5" fill="#ecc9a2" />
			<circle cx="60" cy="64" r="42" fill="#b47a4c" />
			<ellipse cx="60" cy="78" rx="17" ry="13" fill="#ecc9a2" />
			<ellipse cx="60" cy="71" rx="6.5" ry="5" fill={EYE} />
			{eyes(56)}
			{smile(82, 8)}
		</>
	),

	// Toys and things in a room.
	teddy: (
		<>
			<circle cx="40" cy="18" r="10" fill="#b47a4c" />
			<circle cx="80" cy="18" r="10" fill="#b47a4c" />
			<ellipse cx="60" cy="84" rx="30" ry="32" fill="#b47a4c" />
			<ellipse cx="60" cy="88" rx="16" ry="18" fill="#ecc9a2" />
			<circle cx="26" cy="74" r="10" fill="#b47a4c" />
			<circle cx="94" cy="74" r="10" fill="#b47a4c" />
			<circle cx="60" cy="34" r="25" fill="#b47a4c" />
			<ellipse cx="60" cy="42" rx="10" ry="8" fill="#ecc9a2" />
			<circle cx="60" cy="39" r="3.5" fill={EYE} />
			<circle cx="51" cy="29" r="3.5" fill={EYE} />
			<circle cx="69" cy="29" r="3.5" fill={EYE} />
			<path d="M50 58 l10 6 l10 -6 l-2 10 l-8 -4 l-8 4z" fill="#e03a2f" />
		</>
	),
	sock: (
		<>
			<path d="M40 10 H76 V66 C76 84 66 90 52 100 C36 112 18 102 22 88 C24 78 32 74 40 68z" fill="#5aa0e6" />
			<rect x="40" y="10" width="36" height="14" fill="#f4f1ec" />
			<path d="M40 40 H76 M40 54 H76" stroke="#f4f1ec" strokeWidth="6" />
		</>
	),
	ball: (
		<>
			<circle cx="60" cy="60" r="46" fill="#e03a2f" />
			<path d="M14 60 C40 44 80 44 106 60" fill="none" stroke="#fff" strokeWidth="9" />
			<path d="M60 14 C48 40 48 80 60 106" fill="none" stroke="#f6cf3c" strokeWidth="9" />
		</>
	),
	block: (
		<>
			<rect x="18" y="18" width="84" height="84" rx="10" fill="#f4a020" />
			<rect x="30" y="30" width="60" height="60" rx="6" fill="#ffd36e" />
			<path d="M50 78 L60 44 L70 78 M54 66 H66" fill="none" stroke="#c46d00" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
		</>
	),
	book: (
		<>
			<path d="M10 30 Q36 20 60 32 Q84 20 110 30 V96 Q84 86 60 98 Q36 86 10 96z" fill="#7a5cc8" />
			<path d="M18 34 Q38 28 58 38 V90 Q38 80 18 88z M62 38 Q82 28 102 34 V88 Q82 80 62 90z" fill="#fbf7ee" />
			<path d="M26 48 H50 M26 58 H50 M70 48 H94 M70 58 H94" stroke="#c9bfe8" strokeWidth="4" strokeLinecap="round" />
		</>
	),
	car: (
		<>
			<path d="M10 80 V64 Q12 56 22 54 L36 32 Q40 28 48 28 H76 Q84 28 88 34 L100 54 Q110 56 110 66 V80z" fill="#2f8fd8" />
			<path d="M44 36 H58 V54 H34z M64 36 H78 L90 54 H64z" fill="#d6ecff" />
			<circle cx="34" cy="82" r="13" fill="#2b2b2b" />
			<circle cx="34" cy="82" r="5" fill="#bdbdc6" />
			<circle cx="86" cy="82" r="13" fill="#2b2b2b" />
			<circle cx="86" cy="82" r="5" fill="#bdbdc6" />
		</>
	),
	cup: (
		<>
			<path d="M84 44 C110 44 110 82 84 80" fill="none" stroke="#e8707c" strokeWidth="9" />
			<path d="M20 30 H90 L84 96 Q82 104 74 104 H36 Q28 104 26 96z" fill="#e8707c" />
			<ellipse cx="55" cy="30" rx="35" ry="8" fill="#c9505c" />
			<circle cx="44" cy="64" r="7" fill="#fbf7ee" />
			<circle cx="64" cy="76" r="5" fill="#fbf7ee" />
		</>
	),
	shoe: (
		<>
			<path d="M14 82 V46 Q14 36 26 36 H44 Q50 50 66 56 L94 64 Q108 68 108 82z" fill="#e03a2f" />
			<rect x="10" y="80" width="100" height="14" rx="7" fill="#f4f1ec" />
			<path d="M46 50 L56 42 M54 56 L64 48" stroke="#fbf7ee" strokeWidth="4" strokeLinecap="round" />
		</>
	),
	hat: (
		<>
			<ellipse cx="60" cy="86" rx="52" ry="14" fill="#3d7bd9" />
			<path d="M30 86 V50 Q30 28 60 28 Q90 28 90 50 V86z" fill="#3d7bd9" />
			<rect x="30" y="66" width="60" height="12" fill="#f6cf3c" />
		</>
	),

	// Fruit.
	apple: (
		<>
			<path d="M60 30 Q58 16 66 8" fill="none" stroke="#6b4126" strokeWidth="5" strokeLinecap="round" />
			<path d="M64 22 Q80 8 92 18 Q80 30 64 22z" fill="#5cb85c" />
			<path d="M60 34 C40 20 12 32 14 62 C16 92 40 112 60 102 C80 112 104 92 106 62 C108 32 80 20 60 34z" fill="#e03a2f" />
			<ellipse cx="38" cy="54" rx="7" ry="12" fill="#fff" opacity=".35" />
		</>
	),
	pear: (
		<>
			<path d="M60 22 Q60 12 66 6" fill="none" stroke="#6b4126" strokeWidth="5" strokeLinecap="round" />
			<path d="M60 22 C46 22 44 40 42 52 C24 62 22 100 60 108 C98 100 96 62 78 52 C76 40 74 22 60 22z" fill="#b5d34a" />
		</>
	),
	orange: (
		<>
			<circle cx="60" cy="64" r="44" fill="#f4a020" />
			<path d="M56 22 Q68 8 82 16 Q72 28 56 22z" fill="#5cb85c" />
			<circle cx="44" cy="52" r="3" fill="#fbd08a" />
			<circle cx="74" cy="76" r="3" fill="#fbd08a" />
			<circle cx="56" cy="86" r="3" fill="#fbd08a" />
		</>
	),
	strawberry: (
		<>
			<path d="M60 108 C30 90 14 60 22 40 Q60 26 98 40 C106 60 90 90 60 108z" fill="#e8313e" />
			<path d="M28 38 L44 26 L52 34 L60 20 L68 34 L76 26 L92 38 Q60 48 28 38z" fill="#5cb85c" />
			<g fill="#ffe08a">
				<circle cx="44" cy="56" r="3" />
				<circle cx="66" cy="54" r="3" />
				<circle cx="82" cy="60" r="3" />
				<circle cx="52" cy="74" r="3" />
				<circle cx="72" cy="78" r="3" />
				<circle cx="60" cy="94" r="3" />
			</g>
		</>
	),
	banana: (
		<>
			<path d="M20 30 C14 70 50 104 100 92 C106 90 106 84 100 82 C62 84 40 64 34 30z" fill="#f6cf3c" />
			<path d="M18 32 L22 22 L32 24 L34 32z" fill="#6b4126" />
		</>
	),
	grapes: (
		<>
			<path d="M60 18 Q60 8 70 4" fill="none" stroke="#6b4126" strokeWidth="5" strokeLinecap="round" />
			<g fill="#8a4fc8">
				<circle cx="40" cy="34" r="14" />
				<circle cx="64" cy="32" r="14" />
				<circle cx="86" cy="36" r="13" />
				<circle cx="50" cy="56" r="14" />
				<circle cx="76" cy="56" r="14" />
				<circle cx="40" cy="78" r="13" />
				<circle cx="64" cy="78" r="14" />
				<circle cx="54" cy="100" r="13" />
			</g>
		</>
	),
	lemon: (
		<>
			<ellipse cx="60" cy="62" rx="44" ry="34" fill="#f6e03c" transform="rotate(-20 60 62)" />
			<circle cx="22" cy="80" r="6" fill="#f6e03c" />
			<circle cx="98" cy="44" r="6" fill="#f6e03c" />
		</>
	),
	cherry: (
		<>
			<path d="M40 74 Q50 30 76 12 Q74 40 82 72" fill="none" stroke="#5c8a2c" strokeWidth="5" strokeLinecap="round" />
			<circle cx="38" cy="84" r="22" fill="#c8102e" />
			<circle cx="84" cy="80" r="22" fill="#c8102e" />
			<circle cx="32" cy="78" r="5" fill="#fff" opacity=".4" />
			<circle cx="78" cy="74" r="5" fill="#fff" opacity=".4" />
		</>
	),

	// Mazes: who's looking, and what for.
	rabbit: (
		<>
			<ellipse cx="44" cy="30" rx="11" ry="28" fill="#e8e2d6" transform="rotate(-12 44 30)" />
			<ellipse cx="44" cy="30" rx="5" ry="20" fill="#f2b6c0" transform="rotate(-12 44 30)" />
			<ellipse cx="76" cy="30" rx="11" ry="28" fill="#e8e2d6" transform="rotate(12 76 30)" />
			<ellipse cx="76" cy="30" rx="5" ry="20" fill="#f2b6c0" transform="rotate(12 76 30)" />
			<circle cx="60" cy="76" r="36" fill="#f4f1ec" />
			<ellipse cx="60" cy="86" rx="7" ry="5" fill="#e8707c" />
			<path d="M60 91 v6 M60 97 q-6 5 -10 2 M60 97 q6 5 10 2" fill="none" stroke={EYE} strokeWidth="2.5" strokeLinecap="round" />
			{eyes(72, 14)}
		</>
	),
	butterfly: (
		<>
			<ellipse cx="34" cy="42" rx="26" ry="30" fill="#f08bb4" transform="rotate(-20 34 42)" />
			<ellipse cx="86" cy="42" rx="26" ry="30" fill="#f08bb4" transform="rotate(20 86 42)" />
			<ellipse cx="38" cy="86" rx="18" ry="20" fill="#f6c34a" transform="rotate(20 38 86)" />
			<ellipse cx="82" cy="86" rx="18" ry="20" fill="#f6c34a" transform="rotate(-20 82 86)" />
			<circle cx="34" cy="42" r="9" fill="#fff" opacity=".7" />
			<circle cx="86" cy="42" r="9" fill="#fff" opacity=".7" />
			<rect x="54" y="30" width="12" height="68" rx="6" fill="#3b2a20" />
			<path d="M58 32 Q50 14 42 12 M62 32 Q70 14 78 12" fill="none" stroke="#3b2a20" strokeWidth="3" strokeLinecap="round" />
		</>
	),
	honey: (
		<>
			<path d="M28 44 Q28 30 44 30 H76 Q92 30 92 44 V92 Q92 110 74 110 H46 Q28 110 28 92z" fill="#e3a21a" />
			<rect x="24" y="22" width="72" height="16" rx="8" fill="#b97a10" />
			<path d="M34 38 Q40 58 46 40 Q52 62 60 40 Q68 56 74 40 Q80 60 86 38z" fill="#f6cf3c" />
			<rect x="40" y="62" width="40" height="26" rx="6" fill="#fbe7a8" />
			<path d="M50 75 h20" stroke="#b97a10" strokeWidth="4" strokeLinecap="round" />
		</>
	),
	flower: (
		<>
			<path d="M60 70 V116" stroke="#4c9a4c" strokeWidth="7" strokeLinecap="round" />
			<path d="M60 100 Q40 86 30 96 Q44 108 60 100z" fill="#5cb85c" />
			<g fill="#f08bb4">
				<circle cx="60" cy="28" r="18" />
				<circle cx="84" cy="44" r="18" />
				<circle cx="76" cy="70" r="18" />
				<circle cx="44" cy="70" r="18" />
				<circle cx="36" cy="44" r="18" />
			</g>
			<circle cx="60" cy="50" r="15" fill="#f6cf3c" />
		</>
	),
	bone: (
		<>
			{/* An outline under it, so it shows on white. */}
			<g fill="#c9bba4">
				<rect x="28" y="46" width="64" height="28" />
				<circle cx="28" cy="48" r="17" />
				<circle cx="28" cy="72" r="17" />
				<circle cx="92" cy="48" r="17" />
				<circle cx="92" cy="72" r="17" />
			</g>
			<g fill="#f7f1e6">
				<rect x="30" y="50" width="60" height="20" />
				<circle cx="28" cy="48" r="14" />
				<circle cx="28" cy="72" r="14" />
				<circle cx="92" cy="48" r="14" />
				<circle cx="92" cy="72" r="14" />
			</g>
			<path d="M40 56 H80" stroke="#e3dccf" strokeWidth="4" strokeLinecap="round" />
		</>
	),
	cheese: (
		<>
			<path d="M10 84 L104 40 L110 92 Q60 108 10 98z" fill="#f6cf3c" />
			<path d="M10 84 L104 40 L110 50 L14 92z" fill="#fbe07a" />
			<circle cx="44" cy="90" r="6" fill="#e0a800" />
			<circle cx="74" cy="80" r="8" fill="#e0a800" />
			<circle cx="94" cy="92" r="5" fill="#e0a800" />
		</>
	),
	carrot: (
		<>
			<path d="M54 26 Q44 6 36 10 Q46 18 50 30z M62 26 Q62 4 72 6 Q66 18 66 30z M58 28 Q80 10 88 18 Q74 24 64 32z" fill="#5cb85c" />
			<path d="M42 34 Q60 22 78 34 L62 112 Q60 116 58 112z" fill="#f4892a" />
			<path d="M50 52 h10 M56 70 h10 M54 88 h8" stroke="#c96a12" strokeWidth="3" strokeLinecap="round" />
		</>
	),

	// More things, for words.
	bus: (
		<>
			<rect x="8" y="28" width="104" height="66" rx="12" fill="#f6c02a" />
			<rect x="16" y="38" width="22" height="22" rx="4" fill="#d6ecff" />
			<rect x="44" y="38" width="22" height="22" rx="4" fill="#d6ecff" />
			<rect x="72" y="38" width="22" height="22" rx="4" fill="#d6ecff" />
			<rect x="98" y="38" width="10" height="34" rx="3" fill="#d6ecff" />
			<rect x="8" y="70" width="104" height="6" fill="#e0a800" />
			<circle cx="32" cy="96" r="12" fill="#2b2b2b" />
			<circle cx="32" cy="96" r="5" fill="#bdbdc6" />
			<circle cx="88" cy="96" r="12" fill="#2b2b2b" />
			<circle cx="88" cy="96" r="5" fill="#bdbdc6" />
		</>
	),
	fox: (
		<>
			<path d="M20 20 L44 44 L26 58z M100 20 L76 44 L94 58z" fill="#e8742c" />
			<path d="M60 108 L16 52 Q20 36 40 36 H80 Q100 36 104 52z" fill="#f08a3c" />
			<path d="M60 108 L34 74 Q46 70 60 80 Q74 70 86 74z" fill="#fbf2e6" />
			<circle cx="60" cy="104" r="6" fill={EYE} />
			{eyes(58, 16)}
		</>
	),
	bed: (
		<>
			<rect x="10" y="30" width="14" height="74" rx="4" fill="#8a5a3b" />
			<rect x="96" y="54" width="14" height="50" rx="4" fill="#8a5a3b" />
			<rect x="18" y="62" width="86" height="26" rx="6" fill="#5aa0e6" />
			<rect x="24" y="48" width="30" height="16" rx="8" fill="#fbf7ee" />
			<path d="M56 62 H104 V88 H56z" fill="#7cc0f0" />
		</>
	),
	boat: (
		<>
			<path d="M58 12 V76" stroke="#8a5a3b" strokeWidth="5" />
			<path d="M62 16 L98 70 H62z" fill="#e03a2f" />
			<path d="M54 26 L24 70 H54z" fill="#fbf7ee" />
			<path d="M12 78 H108 L94 102 H26z" fill="#3d7bd9" />
			<path d="M4 108 q10 -6 20 0 t20 0 t20 0 t20 0 t20 0 t20 0" fill="none" stroke="#7cc0f0" strokeWidth="5" strokeLinecap="round" />
		</>
	),
	kite: (
		<>
			<path d="M60 8 L96 48 L60 92 L24 48z" fill="#e8707c" />
			<path d="M60 8 L60 92 M24 48 L96 48" stroke="#fbf7ee" strokeWidth="4" />
			<path d="M60 92 Q50 100 60 106 Q70 112 60 118" fill="none" stroke="#3b2a20" strokeWidth="3" />
			<path d="M52 102 l8 4 l-8 4z M68 110 l-8 4 l8 4z" fill="#f6cf3c" />
		</>
	),
	train: (
		<>
			<rect x="14" y="40" width="58" height="50" rx="6" fill="#e03a2f" />
			<rect x="22" y="48" width="20" height="18" rx="3" fill="#d6ecff" />
			<rect x="66" y="58" width="44" height="32" rx="6" fill="#3d7bd9" />
			<rect x="78" y="40" width="12" height="20" fill="#2b2b2b" />
			<rect x="10" y="30" width="66" height="12" rx="4" fill="#b02a22" />
			<circle cx="30" cy="96" r="12" fill="#2b2b2b" />
			<circle cx="58" cy="96" r="12" fill="#2b2b2b" />
			<circle cx="92" cy="96" r="10" fill="#2b2b2b" />
		</>
	),
	sun: (
		<>
			<g stroke="#f4a020" strokeWidth="8" strokeLinecap="round">
				<path d="M60 6 V20 M60 100 V114 M6 60 H20 M100 60 H114 M22 22 L32 32 M88 88 L98 98 M98 22 L88 32 M32 88 L22 98" />
			</g>
			<circle cx="60" cy="60" r="32" fill="#f6cf3c" />
			{eyes(54, 11)}
			{smile(68, 9)}
		</>
	),
	moon: <path d="M78 12 C40 14 18 44 22 74 C26 100 54 114 82 106 C56 98 42 76 46 54 C50 32 62 18 78 12z" fill="#f6d86a" />,
	star: <path d="M60 8 L74 42 L110 44 L82 68 L92 104 L60 84 L28 104 L38 68 L10 44 L46 42z" fill="#f6cf3c" stroke="#f4a020" strokeWidth="4" strokeLinejoin="round" />,
	tree: (
		<>
			<rect x="52" y="74" width="16" height="40" rx="4" fill="#8a5a3b" />
			<g fill="#4c9a4c">
				<circle cx="60" cy="36" r="28" />
				<circle cx="36" cy="60" r="24" />
				<circle cx="84" cy="60" r="24" />
				<circle cx="60" cy="68" r="22" />
			</g>
		</>
	),
	key: (
		<>
			<circle cx="34" cy="60" r="22" fill="none" stroke="#e0a800" strokeWidth="12" />
			<path d="M56 60 H108 M90 60 V80 M104 60 V76" stroke="#e0a800" strokeWidth="12" strokeLinecap="round" />
		</>
	),
	egg: (
		<>
			<path d="M60 10 C32 10 18 58 22 80 C26 104 44 112 60 112 C76 112 94 104 98 80 C102 58 88 10 60 10z" fill="#fbf2dc" stroke="#e6d6b0" strokeWidth="3" />
			<ellipse cx="44" cy="50" rx="6" ry="12" fill="#fff" />
		</>
	),
	fish: (
		<>
			<path d="M86 60 L114 36 V84z" fill="#f4a020" />
			<ellipse cx="54" cy="60" rx="44" ry="30" fill="#f6b23c" />
			<path d="M44 34 Q54 48 44 86" fill="none" stroke="#f4a020" strokeWidth="4" />
			<circle cx="28" cy="54" r="5" fill={EYE} />
			<path d="M14 68 q6 4 10 0" fill="none" stroke={EYE} strokeWidth="3" strokeLinecap="round" />
		</>
	),
	umbrella: (
		<>
			<path d="M60 56 V100 Q60 112 48 112 Q40 112 40 104" fill="none" stroke="#6b4126" strokeWidth="6" strokeLinecap="round" />
			<path d="M8 60 C10 26 34 10 60 10 C86 10 110 26 112 60 Q99 50 86 60 Q73 50 60 60 Q47 50 34 60 Q21 50 8 60z" fill="#e03a2f" />
			<path d="M60 10 C48 26 46 44 47 56 M60 10 C72 26 74 44 73 56" fill="none" stroke="#b02a22" strokeWidth="3" />
		</>
	),
	house: (
		<>
			<path d="M8 54 L60 12 L112 54z" fill="#d0473b" />
			<rect x="18" y="52" width="84" height="60" fill="#f6e3c0" />
			<rect x="50" y="74" width="20" height="38" rx="3" fill="#8a5a3b" />
			<rect x="26" y="64" width="16" height="16" fill="#7cc0f0" />
			<rect x="78" y="64" width="16" height="16" fill="#7cc0f0" />
		</>
	),
	gate: (
		<>
			<path d="M16 24 V108 M104 24 V108 M16 40 H104 M16 88 H104 M38 40 V88 M60 40 V88 M82 40 V88" stroke="#8a5a3b" strokeWidth="10" strokeLinecap="round" />
			<rect x="48" y="54" width="24" height="22" rx="5" fill="#e0a800" />
		</>
	),
	// The games' own pictures, for their tiles.
	math: (
		<>
			<rect x="8" y="8" width="50" height="50" rx="12" fill="#3d7bd9" />
			<rect x="62" y="8" width="50" height="50" rx="12" fill="#e8707c" />
			<rect x="8" y="62" width="50" height="50" rx="12" fill="#f4a020" />
			<rect x="62" y="62" width="50" height="50" rx="12" fill="#5cb85c" />
			<g stroke="#fff" strokeWidth="7" strokeLinecap="round">
				<path d="M33 21 V45 M21 33 H45" />
				<path d="M75 33 H99" />
				<path d="M24 78 L42 96 M42 78 L24 96" />
				<path d="M75 87 H99" />
			</g>
			<circle cx="87" cy="76" r="4.5" fill="#fff" />
			<circle cx="87" cy="98" r="4.5" fill="#fff" />
		</>
	),
	maze: (
		<>
			<rect x="8" y="8" width="104" height="104" rx="16" fill="#4a90c8" />
			<path d="M24 24 H96 V44 H44 V64 H96 V96 H24 V76 H76" fill="none" stroke="#cfc6b4" strokeWidth="13" strokeLinecap="round" strokeLinejoin="round" />
			<circle cx="24" cy="24" r="9" fill="#b47a4c" />
			<path d="M64 76 L76 66 L88 76 V88 H64z" fill="#d0473b" />
		</>
	),
	letters: (
		<>
			<rect x="6" y="40" width="40" height="40" rx="8" fill="#e03a2f" />
			<rect x="40" y="16" width="40" height="40" rx="8" fill="#3d7bd9" />
			<rect x="74" y="44" width="40" height="40" rx="8" fill="#5cb85c" />
			<g fill="#fff" fontFamily="Georgia, serif" fontWeight="800" fontSize="30" textAnchor="middle">
				<text x="26" y="71">A</text>
				<text x="60" y="47">B</text>
				<text x="94" y="75">C</text>
			</g>
		</>
	),
	pairs: (
		<>
			<g transform="rotate(-10 38 62)">
				<rect x="10" y="22" width="56" height="78" rx="10" fill="#fff" stroke="#7a5cc8" strokeWidth="5" />
				<path d="M38 44 C30 34 16 42 22 54 L38 72 L54 54 C60 42 46 34 38 44z" fill="#e8313e" />
			</g>
			<g transform="rotate(10 82 62)">
				<rect x="54" y="22" width="56" height="78" rx="10" fill="#fff" stroke="#7a5cc8" strokeWidth="5" />
				<path d="M82 44 C74 34 60 42 66 54 L82 72 L98 54 C104 42 90 34 82 44z" fill="#e8313e" />
			</g>
		</>
	),
	// Peekaboo's hiding places (besides the bush).
	haystack: (
		<>
			<path d="M8 112 Q10 52 60 40 Q110 52 112 112z" fill="#e8b84a" />
			<path d="M22 112 Q26 70 60 58 Q94 70 98 112" fill="none" stroke="#c9952c" strokeWidth="4" />
			<path d="M36 112 Q40 84 60 76 Q80 84 84 112" fill="none" stroke="#c9952c" strokeWidth="4" />
			<g stroke="#f6d77a" strokeWidth="3" strokeLinecap="round">
				<path d="M30 60 l-6 -10 M60 40 v-12 M90 60 l6 -10 M46 46 l-4 -11 M74 46 l4 -11" />
			</g>
		</>
	),
	tractor: (
		<>
			<rect x="48" y="30" width="36" height="34" rx="4" fill="#3d9a4c" />
			<rect x="54" y="36" width="24" height="20" rx="3" fill="#d6ecff" />
			<rect x="14" y="56" width="82" height="30" rx="6" fill="#4cb35c" />
			<rect x="20" y="40" width="8" height="18" fill="#2b2b2b" />
			<circle cx="82" cy="88" r="26" fill="#2b2b2b" />
			<circle cx="82" cy="88" r="11" fill="#f6c02a" />
			<circle cx="28" cy="96" r="16" fill="#2b2b2b" />
			<circle cx="28" cy="96" r="7" fill="#f6c02a" />
		</>
	),
	window: (
		<>
			{/* The frame and shutters; the panes are left open (the room or an animal shows through). */}
			<path d="M20 20 H100 V108 H20z M30 30 V98 H90 V30z" fill="#fbf7ee" fillRule="evenodd" />
			<path d="M59 30 h2 v68 h-2z M30 63 h60 v2 h-60z" fill="#fbf7ee" />
			<rect x="2" y="20" width="18" height="88" rx="3" fill="#3d7bd9" />
			<rect x="100" y="20" width="18" height="88" rx="3" fill="#3d7bd9" />
			<path d="M6 34 h10 M6 50 h10 M6 66 h10 M6 82 h10 M6 98 h10 M104 34 h10 M104 50 h10 M104 66 h10 M104 82 h10 M104 98 h10" stroke="#2f62b0" strokeWidth="3" />
			<rect x="14" y="106" width="92" height="10" rx="3" fill="#e9dfcc" />
		</>
	),
	bush: (
		<>
			<g fill="#4c9a4c">
				<circle cx="30" cy="74" r="30" />
				<circle cx="60" cy="58" r="36" />
				<circle cx="92" cy="74" r="28" />
				<rect x="2" y="74" width="116" height="40" rx="16" />
			</g>
			<circle cx="48" cy="40" r="10" fill="#6cbc5f" />
			<circle cx="86" cy="62" r="8" fill="#6cbc5f" />
		</>
	),
};

/** A picture by name (see ART), filling its box; `label` names it for screen readers, or it's hidden. */
export function Pic({ id, label, className }: { id: string; label?: string; className?: string }) {
	return (
		<svg viewBox="0 0 120 120" className={className} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
			{ART[id]}
		</svg>
	);
}
