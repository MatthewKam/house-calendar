import { createContext, useContext, useEffect, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { PALETTE } from '../lib/color';
import { useScreenSaverSettings } from '../lib/useScreenSaverSettings';
import { PHONE, PHONE_SIDEWAYS, useMediaQuery } from '../lib/useMediaQuery';
import { useAddMember, useAuthStatus, useCalendars, useLearn, useRemoveMember, useSetSetting, useSettings, useUpdateMember, useSetMemberColor } from '../lib/queries';
import ColorAsked from './ColorAsked';
import type { Member, MemberPatch, Stage } from '../lib/types';
import { dayKey } from '../lib/dates';
import { STAGE_AGES, STAGE_LIST, STAGE_NAMES } from '../lib/stages';
import CalendarList from './CalendarList';
import ScreenSaverSettings from './ScreenSaverSettings';
import HouseholdAccess from './HouseholdAccess';
import GoogleCalendars from './GoogleCalendars';
import ICloudCalendars from './ICloudCalendars';
import sheet from '../styles/Sheet.module.css';
import s from '../styles/MembersPanel.module.css';
import DateInput from './DateInput';
import AlertsSetting, { ALERTS_NOTE } from './AlertsSetting';
import LearnSettings, { LearnAbout, learnNote } from './LearnSettings';
import { usePush } from '../lib/usePush';
import { useThemeSetting, type Theme } from '../lib/useTheme';
import { ACCENTS, accentOf, useAccentSetting } from '../lib/accent';
import { useUiScale } from '../lib/useUiScale';
import { useTempUnit } from '../lib/units';
import { SignedInAs, SignOut } from './SettingsAccount';
import Sheet from './Sheet';
import ConfirmDialog from './ConfirmDialog';
import Switch from './Switch';

interface Props {
  members: Member[];
  onClose: () => void;
  /** Starts kid mode on this device (when there are kids, and it isn't a kid's own). */
  onKidMode?: () => void;
}

const THEMES: [Theme, string][] = [['auto', 'Same as this device'], ['light', 'Light'], ['dark', 'Dark']];

/** "30 seconds", "2 minutes", "1 hour". */
const idleLabel = (minutes: number) =>
  minutes < 1 ? `${Math.round(minutes * 60)} seconds` : minutes >= 60 ? `${minutes / 60} hour${minutes === 60 ? '' : 's'}` : `${minutes} minute${minutes === 1 ? '' : 's'}`;

/** Adding and removing family members is hidden for now; set to true to bring both back. */
const CAN_ADD_OR_REMOVE = false;

/**
 * Palette shown under a row when its color circle is tapped. Palette taps are final (`done` true);
 * the rainbow dot opens the system picker, which reports every drag step (`done` false).
 */
function ColorSet({ value, label, onPick }: { value: string; label: string; onPick: (color: string, done: boolean) => void }) {
  const isCustom = !PALETTE.includes(value);
  return (
    <div className={s.palette} role="radiogroup" aria-label={label}>
      {PALETTE.map((c) => (
        <button key={c} type="button" role="radio" aria-checked={value === c} aria-label={c}
          className={`${s.dot} ${value === c ? s.picked : ''}`} style={{ '--c': c } as CSSProperties}
          onClick={() => onPick(c, true)} />
      ))}
      <label className={`${s.dot} ${s.custom} ${isCustom ? s.picked : ''}`}
        style={{ '--c': isCustom ? value : undefined } as CSSProperties} title="Other color">
        <input type="color" value={value} aria-label="Other color" onChange={(e) => onPick(e.target.value, false)} />
      </label>
    </div>
  );
}

/** ⓘ beside a title: shows what it is (and hides it again). */
function InfoButton({ about, open, onToggle }: { about: string; open: boolean; onToggle: () => void }) {
  return <button type="button" className={s.info} aria-label={`About ${about}`} aria-expanded={open} onClick={onToggle}>i</button>;
}

/** Which group of Settings is showing (its title), or null for the list of them. */
const SettingsView = createContext<{ view: string | null; open: (title: string) => void }>({ view: null, open: () => {} });

/**
 * A group of Settings (Family, Learning, Appearance, Screen, Notifications, Users): in the list, a row (with a word on
 * how it's set, for one that's a single thing); tapped, the sheet shows just it (a back arrow to the list).
 */
function Group({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  const { view, open } = useContext(SettingsView);
  if (view === null) {
    return (
      <button type="button" className={s.groupRow} onClick={() => open(title)}>
        <span>{title}</span>
        {note && <span className={s.foldNote}>{note}</span>}
      </button>
    );
  }
  return view === title ? <>{children}</> : null;
}

/**
 * One part of a group, folded to its heading (and a word on how it's set) until tapped. Opening one
 * closes the others, so the view stays short.
 */
function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <details className={s.fold} {...{ name: 'settings' }}>
      <summary className={s.foldHead}>
        <span>{title}</span>
        {note && <span className={s.foldNote}>{note}</span>}
      </summary>
      <div className={s.foldBody}>{children}</div>
    </details>
  );
}

/**
 * One part of a group that's on or off: its title (with an ⓘ that shows what it does) and a switch,
 * and (on) its settings under it.
 */
function SwitchRow({ title, on, onChange, hint, children }: { title: string; on: boolean; onChange: (on: boolean) => void; hint: string; children?: ReactNode }) {
  const [info, setInfo] = useState(false);
  return (
    <div className={s.fold}>
      <div className={s.switchHead}>
        <span className={s.switchTitle}>
          {title}
          <InfoButton about={title} open={info} onToggle={() => setInfo(!info)} />
        </span>
        <Switch on={on} onChange={onChange} label={title} />
      </div>
      {info && <p className={s.switchHint}>{hint}</p>}
      {on && children && <div className={s.foldBody}>{children}</div>}
    </div>
  );
}

/** Where travel times start from. Saved with Save, so a half-typed address isn't used. */
function HomeAddress() {
  const saved = (useSettings().data?.homeAddress as string | undefined) ?? '';
  const setSetting = useSetSetting();
  // The address being typed; null shows the saved one behind the pencil. With nothing saved yet,
  // the field is open straight away.
  const [draft, setDraft] = useState<string | null>(null);
  const editing = draft !== null || !saved;
  const value = draft ?? saved;
  function save(e: FormEvent) {
    e.preventDefault();
    if (value.trim() !== saved) setSetting.mutate({ key: 'homeAddress', value: value.trim() });
    setDraft(null);
  }
  return (
    <section className={s.bare}>
      <p className={s.hint}>Travel times to events start here.</p>
      {editing ? (
        <form className={s.row} onSubmit={save}>
          <input className={s.name} placeholder="e.g. 1 Main St, Irvine, CA" value={value} maxLength={300}
            autoFocus={!!saved} onChange={(e) => setDraft(e.target.value)} aria-label="Home address"
            onKeyDown={(e) => {
              if (e.key === 'Escape' && saved) { e.stopPropagation(); setDraft(null); }
            }} />
          <button type="submit" className={sheet.primary} disabled={!value.trim() || value.trim() === saved}>Save</button>
          {saved && <button type="button" className={sheet.secondary} onClick={() => setDraft(null)}>Cancel</button>}
        </form>
      ) : (
        <div className={s.row}>
          <span className={s.nameText}>{saved}</span>
          <button type="button" className={s.editButton} aria-label="Edit home address" onClick={() => setDraft(saved)}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3z" />
              <path d="M13.5 8.5l3 3" />
            </svg>
          </button>
        </div>
      )}
    </section>
  );
}

export default function MembersPanel({ members, onClose, onKidMode }: Props) {
  // Light or dark, for this device (Same as this device: its own setting).
  const [theme, setTheme] = useThemeSetting();
  const [accent, setAccent] = useAccentSetting();
  const [unit, setUnit] = useTempUnit();
  const [uiScale, setUiScale] = useUiScale(useSettings().data?.uiScale);
  const [newName, setNewName] = useState('');
  const today = dayKey(new Date());
  const learn = useLearn(today).data ?? [];
  // null until someone picks a color; then the next unused palette color is offered.
  const [pickedColor, setPickedColor] = useState<string | null>(null);
  // The person being removed, while that's asked.
  const [removing, setRemoving] = useState<Member | null>(null);
  // Person being edited (opened with the pencil), one at a time. Name, color, birthday and stage are
  // saved together with Save, and Cancel drops them all.
  const [editing, setEditing] = useState<{ id: string; name: string; color: string; birthdate: string; stage: Stage | null } | null>(null);
  function startEdit(m: Member) {
    setEditing({ id: m.id, name: m.name, color: m.color, birthdate: m.birthdate ?? '', stage: m.stageChosen });
    setOpenSet(null);
  }
  function stopEdit() {
    setEditing(null);
    setOpenSet(null);
  }
  function saveEdit(e: FormEvent, m: Member) {
    e.preventDefault();
    if (!editing) return;
    const name = editing.name.trim();
    const patch: MemberPatch = {};
    if (name && name !== m.name) patch.name = name;
    if ((editing.birthdate || null) !== m.birthdate) patch.birthdate = editing.birthdate || null;
    if (editing.stage !== m.stageChosen) patch.stage = editing.stage;
    if (Object.keys(patch).length) updateMember.mutate({ id: m.id, patch });
    if (editing.color !== m.color) setColor.mutate({ id: m.id, color: editing.color, holder });
    stopEdit();
  }
  // Whose color set is showing: a member id, 'new' for the add row, or null.
  const [openSet, setOpenSet] = useState<string | null>(null);
  const toggleSet = (key: string) => setOpenSet((open) => (open === key ? null : key));
  const addMember = useAddMember();
  const updateMember = useUpdateMember();
  const setColor = useSetMemberColor();
  const removeMember = useRemoveMember();
  const setSetting = useSetSetting();
  // For the folded sections' summaries.
  const settings = useSettings().data;
  const homeAddress = ((settings?.homeAddress as string | undefined) ?? '').trim();
  const [saver, saveSaver] = useScreenSaverSettings();
  // Both asked every time (hooks can't be skipped).
  const upright = useMediaQuery(PHONE);
  const sideways = useMediaQuery(PHONE_SIDEWAYS);
  const phone = upright || sideways;
  // Alerts are a grown-up's own phone's (not the wall's or a kid's device).
  const auth = useAuthStatus().data;
  const grownUp = !!auth?.signedIn && auth.role === 'guardian' && auth.kind === 'user';
  // People's colors are the household's: the account holder's changes are made, anyone else's asked for.
  // Signed out there's no holder. A grown-up's color is only theirs to change.
  const holder = !auth?.signedIn || auth.holder;
  const wall = auth?.signedIn && auth.role === 'wall' ? auth : null;
  const wallModeOn = !!auth?.signedIn && auth.wallMode;
  // The part showing (null: the list), back at the top each time it changes.
  const [view, setView] = useState<string | null>(null);
  // How Learning works, shown with the ⓘ by its title.
  const [learnInfo, setLearnInfo] = useState(false);
  const top = useRef<HTMLElement>(null);
  // The sheet itself scrolls (its title stays pinned, so scrolling that into view would do nothing).
  useEffect(() => {
    const sheetBox = top.current?.parentElement;
    if (sheetBox) sheetBox.scrollTop = 0;
  }, [view]);
  // Wall mode: everything on screen was this person's, so it all loads again as the wall's (or back).
  const qc = useQueryClient();
  const [wallModeAsk, setWallModeAsk] = useState(false);
  const switchWallMode = (on: boolean) => void api.setWallMode(on).then((st) => {
    qc.clear();
    qc.setQueryData(['auth'], st);
    onClose();
  });
  const canColor = (m: Member) => !auth?.signedIn || !m.guardian || m.id === auth.memberId;
  const push = usePush();
  const hasCalendars = (useCalendars().data ?? []).length > 0;

  const nextColor = PALETTE.find((c) => !members.some((m) => m.color === c)) ?? PALETTE[0];
  const newColor = pickedColor ?? nextColor;

  function add(e: FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    addMember.mutate({ name: newName.trim(), color: newColor }, {
      onSuccess: () => {
        setNewName('');
        setPickedColor(null);
        setOpenSet(null);
      },
    });
  }


  return (
    <>
      <Sheet label="Settings" onClose={onClose}>
        <header className={sheet.head} ref={top}>
          {view === null ? (
            <h2 className={sheet.heading}>Settings</h2>
          ) : (
            <h2 className={`${sheet.heading} ${s.viewTitle}`}>
              <button type="button" className={s.back} onClick={() => setView(null)} aria-label="Back to Settings">‹</button>
              {view}
              {view === 'Learning' && <InfoButton about="Learning" open={learnInfo} onToggle={() => setLearnInfo(!learnInfo)} />}
            </h2>
          )}
          <button className={sheet.close} onClick={onClose} aria-label="Close Settings">×</button>
        </header>
        <SettingsView.Provider value={{ view, open: setView }}>
        {view === null && auth?.signedIn && <SignedInAs status={auth} onClose={onClose} />}
        <Group title="Family">
        <Section title="Family" note={members.map((m) => m.name).join(", ")}>
        <p className={s.hint}>
          Tap the pencil to change a name, color or birthday. A birthday sets each kid's stage, which decides how they earn stars.
          {!holder && auth?.signedIn && ` A new color waits for ${auth.holderName ?? 'the account holder'} to OK it.`}
        </p>

        <ul className={s.list}>
          {members.map((m) => {
            const isEditing = editing?.id === m.id;
            const color = isEditing ? editing.color : m.color;
            return (
              <li key={m.id} className={s.member}>
                <div className={s.row}>
                  {/* The color can only be changed while editing. */}
                  {isEditing && canColor(m) ? (
                    <button type="button" className={`${s.swatch} ${s.swatchEditable}`} style={{ background: color }}
                      aria-label={`Change color for ${m.name}`} aria-expanded={openSet === m.id}
                      onClick={() => toggleSet(m.id)} />
                  ) : (
                    <span className={s.swatch} style={{ background: color }} aria-hidden="true" />
                  )}
                  {isEditing ? (
                    <form className={s.editName} onSubmit={(e) => saveEdit(e, m)}>
                      <input className={s.name} value={editing.name} maxLength={40} autoFocus aria-label={`Name for ${m.name}`}
                        onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                        onKeyDown={(e) => {
                          // Escape cancels the edit without closing Settings.
                          if (e.key === 'Escape') { e.stopPropagation(); stopEdit(); }
                        }} />
                      <button type="submit" className={sheet.primary} disabled={!editing.name.trim()}>Save</button>
                      <button type="button" className={sheet.secondary} onClick={stopEdit}>Cancel</button>
                    </form>
                  ) : (
                    <>
                      <span className={s.nameText}>
                        {m.name}
                        {m.stage && <span className={s.stageTag}>{STAGE_NAMES[m.stage]}</span>}
                      </span>
                      <button type="button" className={s.editButton} aria-label={`Edit ${m.name}`}
                        onClick={() => startEdit(m)}>
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3z" />
                          <path d="M13.5 8.5l3 3" />
                        </svg>
                      </button>
                    </>
                  )}
                  {CAN_ADD_OR_REMOVE && (
                    <button className={sheet.danger} onClick={() => setRemoving(m)}>
                      Remove
                    </button>
                  )}
                </div>
                {isEditing && (
                  <div className={s.details}>
                    <label className={s.detail}>
                      <span>Birthday</span>
                      <DateInput className={s.dateInput} aria-label="Birthday" value={editing.birthdate} max={dayKey(new Date())}
                        onChange={(e) => setEditing({ ...editing, birthdate: e.target.value })} />
                    </label>
                    <label className={s.detail}>
                      <span>Stage</span>
                      <select className={s.dateInput} value={editing.stage ?? ''}
                        onChange={(e) => setEditing({ ...editing, stage: (e.target.value || null) as Stage | null })}>
                        <option value="">From birthday</option>
                        {STAGE_LIST.map((st) => (
                          <option key={st} value={st}>{STAGE_NAMES[st]} ({STAGE_AGES[st]})</option>
                        ))}
                      </select>
                    </label>
                  </div>
                )}
                {!isEditing && m.colorAsked && <ColorAsked member={m} />}
                {isEditing && openSet === m.id && (
                  <ColorSet value={color} label={`Color for ${m.name}`} onPick={(c, done) => {
                    setEditing({ ...editing, color: c });
                    if (done) setOpenSet(null);
                  }} />
                )}
              </li>
            );
          })}
        </ul>

        {CAN_ADD_OR_REMOVE && (
        <form onSubmit={add} className={s.add}>
          <div className={s.row}>
            <button type="button" className={s.swatch} style={{ background: newColor }}
              aria-label="Choose color for new person" aria-expanded={openSet === 'new'}
              onClick={() => toggleSet('new')} />
            <input className={s.name} placeholder="Add a person" value={newName} maxLength={40}
              onChange={(e) => setNewName(e.target.value)} />
            <button type="submit" className={sheet.primary} disabled={!newName.trim()}>Add</button>
          </div>
          {openSet === 'new' && (
            <ColorSet value={newColor} label="Color for new person" onPick={(c, done) => {
              setPickedColor(c);
              if (done) setOpenSet(null);
            }} />
          )}
        </form>
        )}
        </Section>

        <Section title="Home address" note={homeAddress || 'Not set'}>
          <HomeAddress />
        </Section>

        <Section title="Calendars">
          <ICloudCalendars members={members} />
          <GoogleCalendars members={members} />
          {hasCalendars && <CalendarList members={members} />}
        </Section>

        </Group>

        {/* A big one: its own group, not folded inside Family. */}
        <Group title="Learning" note={learnNote(learn, members)}>
          <div className={s.foldBody}>
            {learnInfo && <LearnAbout />}
            <LearnSettings members={members} today={today} />
          </div>
        </Group>

        <Group title="Appearance">
        {/* Each a circle, half its light shade and half its dark: one pick, a shade for each. The wall
            wears the account holder's, and their pick becomes the household's. */}
        {wall ? (
          <Section title="Accent color" note={accentOf(settings?.accent).name}>
            <p className={s.themeNote}>The wall wears {wall.holderName ?? 'the account holder'}'s accent color.</p>
          </Section>
        ) : (
        <Section title="Accent color" note={accent.name}>
          <div className={s.accents} role="radiogroup" aria-label="Accent color">
            {ACCENTS.map((a) => (
              <button key={a.id} type="button" role="radio" aria-checked={accent === a} className={s.accent} onClick={() => {
                setAccent(a);
                if (auth?.signedIn && auth.holder && auth.role === 'guardian') setSetting.mutate({ key: 'accent', value: a.id });
              }}>
                <span className={`${s.accentDot} ${accent === a ? s.picked : ''}`} aria-hidden="true"
                  style={{ '--light': a.light.accent, '--dark': a.dark.accent } as CSSProperties} />
                {a.name}
              </button>
            ))}
          </div>
          <p className={s.themeNote}>
            Buttons and highlights on this device. Each has a shade for light and one for dark.
            {auth?.signedIn && auth.holder && auth.role === 'guardian' && ' The wall wears yours too.'}
          </p>
        </Section>
        )}

        <Section title="Light or dark" note={THEMES.find(([v]) => v === theme)![1]}>
          <div className={s.theme} role="radiogroup" aria-label="Light or dark">
            {THEMES.map(([v, label]) => (
              <button key={v} role="radio" aria-checked={theme === v} className={theme === v ? s.themeOn : ''} onClick={() => setTheme(v)}>
                {label}
              </button>
            ))}
          </div>
          <p className={s.themeNote}>Kid mode stays light.</p>
        </Section>

        <Section title="Temperature" note={unit === 'C' ? '°C · km/h' : '°F · mph'}>
          <div className={s.theme} role="radiogroup" aria-label="Temperature">
            {(['F', 'C'] as const).map((u) => (
              <button key={u} role="radio" aria-checked={unit === u} className={unit === u ? s.themeOn : ''} onClick={() => setUnit(u)}>
                °{u}
              </button>
            ))}
          </div>
          <p className={s.themeNote}>The weather on this device. Wind goes with it: mph with °F, km/h with °C.</p>
        </Section>

        <Section title="Text size" note={`${Math.round(uiScale * 100)}%`}>
          <label className={s.scale}>
            <input type="range" min={0.8} max={1.6} step={0.05} value={uiScale} aria-label="Text size"
              onChange={(e) => setUiScale(Number(e.target.value))} />
            <span>{Math.round(uiScale * 100)}%</span>
          </label>
        </Section>

        </Group>

        {/* Empty on a phone that isn't a grown-up's own, with no kids: no group at all then. */}
        {(grownUp || wallModeOn || !phone || !!onKidMode) && (
        <Group title="Screen">
          {(grownUp || wallModeOn) && (
            <SwitchRow title="Wall mode" on={wallModeOn} onChange={(on) => (on ? setWallModeAsk(true) : switchWallMode(false))}
              hint={wallModeOn
                ? 'This device is the family wall. Turning it off puts it back to your own account.'
                : "Make this device the family wall: everyone's shared calendar, your private events hidden, and changes and Settings behind a guardian's PIN. A guardian's PIN turns it off."} />
          )}
          {/* Tablets and computers only: never on a phone. */}
          {!phone && (
            <SwitchRow title="Screen saver" on={saver.enabled} onChange={(on) => saveSaver({ enabled: on })}
              hint={saver.enabled ? `Photos after ${idleLabel(saver.idleMinutes)} without a touch.` : 'Show photos when this screen is idle.'}>
              <ScreenSaverSettings bare switched />
            </SwitchRow>
          )}
          {onKidMode && (
            <SwitchRow title="Kid mode" on={false} onChange={(on) => on && onKidMode()}
              hint="Hand this device to a kid: their day, tasks, stars and games, and nothing else. A guardian's PIN turns it off." />
          )}
        </Group>
        )}

        {/* Its own group: what this phone tells you, and more to come. A grown-up's own phone's only. */}
        {grownUp && (
          <Group title="Notifications" note={ALERTS_NOTE[push.state]}>
            {/* A dropdown each: alerts now, more to come. */}
            <Section title="Alerts" note={ALERTS_NOTE[push.state]}>
              <AlertsSetting push={push} />
            </Section>
          </Group>
        )}

        {/* Who signs in and how (invites, PINs, devices): its own group. */}
        <Group title="Users">
          <div className={s.foldBody}>
            <HouseholdAccess />
          </div>
        </Group>
        </SettingsView.Provider>

        {/* Signing out (or locking the wall) last, away from everything else. */}
        <div className={sheet.actions}>
          {view === null && auth?.signedIn && <SignOut status={auth} onClose={onClose} />}
          <span className={sheet.spacer} />
          <button className={sheet.secondary} onClick={onClose}>Done</button>
        </div>
      </Sheet>
      {wallModeAsk && (
        <ConfirmDialog title="Turn on wall mode?" confirmLabel="Turn on" safe
          onCancel={() => setWallModeAsk(false)} onConfirm={() => { setWallModeAsk(false); switchWallMode(true); }}>
          Your private events go out of sight here. To get back to your account, a guardian types their PIN.
        </ConfirmDialog>
      )}
      {removing && (
        <ConfirmDialog title={`Remove ${removing.name}?`} confirmLabel="Remove"
          onCancel={() => setRemoving(null)}
          onConfirm={() => { removeMember.mutate(removing.id); setRemoving(null); }}>
          Their events stay on the calendar for whoever else they're for.
        </ConfirmDialog>
      )}
    </>
  );
}
