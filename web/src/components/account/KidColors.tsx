import type { CSSProperties } from "react";
import { ACCENTS, useAccentSetting } from "../../lib/accent";
import { PALETTE } from "../../lib/color";
import { useAuthStatus, useSetMemberColor } from "../../lib/queries";
import type { Member } from "../../lib/types";
import Sheet from "../ui/Sheet";
import sheet from "../ui/Sheet.module.css";
import s from "../settings/Settings.module.css";

/**
 * An older kid's colors, on their own device: the buttons' color here (theirs to pick), and asking for
 * a new color of their own (the account holder OKs it, since it's the whole family's).
 */
export default function KidColors({ kid, onClose }: { kid: Member; onClose: () => void }) {
	const [accent, setAccent] = useAccentSetting();
	const setColor = useSetMemberColor();
	const auth = useAuthStatus().data;
	const holder = auth?.signedIn && auth.holderName ? auth.holderName : "a grown-up";
	const want = kid.colorAsked?.color ?? kid.color;
	return (
		<Sheet label="My colors" onClose={onClose}>
			<header className={sheet.head}>
				<h2 className={sheet.heading}>My colors</h2>
				<button className={sheet.close} onClick={onClose} aria-label="Close">×</button>
			</header>
			<h3 className={s.kidColorsHead}>Buttons</h3>
			<div className={s.accents} role="radiogroup" aria-label="Button color">
				{ACCENTS.map((a) => (
					<button key={a.id} type="button" role="radio" aria-checked={accent === a} className={s.accent} onClick={() => setAccent(a)}>
						<span className={`${s.accentDot} ${accent === a ? s.picked : ""}`} aria-hidden="true"
							style={{ "--light": a.light.accent, "--dark": a.dark.accent } as CSSProperties} />
						{a.name}
					</button>
				))}
			</div>
			<h3 className={s.kidColorsHead}>My color</h3>
			<div className={s.palette} style={{ paddingLeft: 0 }} role="radiogroup" aria-label="My color">
				{PALETTE.map((c) => (
					<button key={c} type="button" role="radio" aria-checked={want === c} aria-label={c}
						className={`${s.dot} ${want === c ? s.picked : ""}`} style={{ "--c": c } as CSSProperties}
						onClick={() => setColor.mutate({ id: kid.id, color: c, holder: false })} />
				))}
			</div>
			<p className={s.themeNote}>
				{kid.colorAsked ? `Asked! ${holder} will OK it.` : `It's the whole family's, so ${holder} OKs a new one.`}
			</p>
		</Sheet>
	);
}
