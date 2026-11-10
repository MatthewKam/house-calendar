import { useState, type FormEvent } from 'react';
import { addDays, dayKey, fromDayKey, hhmm, timeLabel, toInstant } from '../lib/dates';
import { UNASSIGNED } from '../lib/color';
import { useCalendars, useSetPeople, useSetSpecial, useSetVisibility } from '../lib/queries';
import type { CalEvent, EventInput, Member, Scope, Visibility } from '../lib/types';
import { PencilIcon } from './icons';
import TravelInfo from './TravelInfo';
import AddressInput from './AddressInput';
import { PickChip } from './NameChip';
import sheet from '../styles/Sheet.module.css';
import s from '../styles/EventDialog.module.css';
import DateInput from './DateInput';
import { CalendarPick, useNewEventCalendar } from './CalendarPick';

interface Props {
  day: string;
  event?: CalEvent;
  members: Member[];
  onSave: (input: EventInput) => void;
  /** scope "all": every day of a repeating iCloud event. */
  onDelete: (event: CalEvent, scope?: Scope) => void;
  onClose: () => void;
  /** iCloud events can be changed here (and are sent to iCloud). */
  canEditSynced?: boolean;
  /** The parent lock is on: the event is shown, but nothing can be changed. */
  locked?: boolean;
  /** A new special day (from Today's special days): all day, for everyone, marked special. */
  special?: boolean;
}

const QUICK = ['Practice', 'Appointment', 'Dinner out', 'Pick up', 'Work trip'];

/**
 * Who an event is for: tap people to add or remove them (any number), or Everyone to clear the list.
 * Shared by the event form and the iCloud event summary.
 */
function WhoPicker({ members, value, onChange }: { members: Member[]; value: string[]; onChange: (ids: string[]) => void }) {
  const chip = (id: string | null, name: string, color: string, on: boolean) => (
    <PickChip key={id ?? 'everyone'} name={name} color={color} on={on}
      onClick={() => onChange(id === null ? []
        : value.includes(id) ? value.filter((x) => x !== id)
        // Keep family order so the stripe and names read the same everywhere.
        : members.map((m) => m.id).filter((x) => x === id || value.includes(x)))} />
  );
  return (
    <>
      <div className={s.label}>Who <span className={s.labelHint}>· tap everyone it's for</span></div>
      <div className={s.wrap}>
        {members.map((m) => chip(m.id, m.name, m.color, value.includes(m.id)))}
        {chip(null, 'Everyone', UNASSIGNED, value.length === 0)}
      </div>
    </>
  );
}

const SEEN: { id: Visibility; label: string; hint: string }[] = [
  { id: 'everyone', label: '👥 Everyone', hint: 'The whole family sees it.' },
  { id: 'busy', label: '⏳ Busy', hint: "Anyone not on it sees “Busy” at that time, without the details." },
  { id: 'private', label: '🔒 Private', hint: "Only the people on it see it (and guardians, for the kids')." },
];

/** Who sees an event: everyone, busy or private (server/privacy.ts). */
function SeenPicker({ value, onChange }: { value: Visibility; onChange: (v: Visibility) => void }) {
  return (
    <>
      <div className={s.label}>Who sees it</div>
      <div className={s.seen} role="radiogroup" aria-label="Who sees it">
        {SEEN.map((o) => (
          <button key={o.id} type="button" role="radio" aria-checked={value === o.id} className={s.seenOption}
            onClick={() => onChange(o.id)}>{o.label}</button>
        ))}
      </div>
      <div className={s.seenHint}>{SEEN.find((o) => o.id === value)?.hint}</div>
    </>
  );
}

/**
 * iCloud events open as a summary, where you can pick who it's for; Edit event (when iCloud takes
 * edits) opens the full form.
 */
function SyncedEvent({ event, members, onClose, onEdit, locked }: {
  event: CalEvent; members: Member[]; onClose: () => void; onEdit?: () => void; locked?: boolean;
}) {
  const setPeople = useSetPeople();
  const setVisibility = useSetVisibility();
  // Who it's for and who sees it are locked until Edit; Save applies them to every repeat of this event.
  const [memberIds, setMemberIds] = useState(event.memberIds);
  const [draft, setDraft] = useState<string[] | null>(null);
  const [seen, setSeen] = useState(event.visibility);
  const [seenDraft, setSeenDraft] = useState(event.visibility);
  function save() {
    if (!draft) return;
    if (draft.join() !== memberIds.join()) setPeople.mutate({ id: event.id, memberIds: draft });
    if (seenDraft !== seen) setVisibility.mutate({ id: event.id, visibility: seenDraft });
    // Shown straight away; it's put back (with a message) if the save fails.
    setMemberIds(draft);
    setSeen(seenDraft);
    setDraft(null);
  }
  const people = members.filter((m) => memberIds.includes(m.id));
  const date = (d: Date) => d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
  const when = event.allDay
    ? fromDayKey(event.end) > addDays(fromDayKey(event.start), 1)
      ? `${date(fromDayKey(event.start))} – ${date(addDays(fromDayKey(event.end), -1))}`
      : `${date(fromDayKey(event.start))}, all day`
    : `${date(new Date(event.start))}, ${timeLabel(event.start)} – ${timeLabel(event.end)}`;
  return (
    <>
      <div className={sheet.scrim} onClick={onClose} role="presentation" />
      <div className={sheet.sheet} role="dialog" aria-label={event.title}>
        <header className={sheet.head}>
          <h2 className={sheet.heading}>{event.title}</h2>
          <button type="button" className={sheet.close} onClick={onClose} aria-label="Close">×</button>
        </header>
        <div>{when}</div>
        <TravelInfo event={event} locked={locked} />
        {draft ? (
          <>
            <WhoPicker members={members} value={draft} onChange={setDraft} />
            <SeenPicker value={seenDraft} onChange={setSeenDraft} />
          </>
        ) : (
          <>
            <div className={s.label}>Who</div>
            <div className={s.whoRow}>
              <div className={s.wrap}>
                {(people.length ? people : [{ id: 'everyone', name: 'Everyone', color: UNASSIGNED }]).map((m) => (
                  <PickChip key={m.id} name={m.name} color={m.color} on />
                ))}
              </div>
              {!locked && (
                <button type="button" className={s.editWho} onClick={() => { setDraft(memberIds); setSeenDraft(seen); }}>
                  <PencilIcon /> Edit
                </button>
              )}
            </div>
            <div className={s.label}>Who sees it</div>
            <div>{SEEN.find((o) => o.id === seen)?.label}</div>
          </>
        )}
        {setPeople.isError && <div className={s.problem}>Couldn't save: {setPeople.error.message}</div>}
        {setVisibility.isError && <div className={s.problem}>Couldn't save: {setVisibility.error.message}</div>}
        {event.syncState !== 'synced' && <p className={s.pendingNote}>↻ Your change is waiting to be sent to iCloud.</p>}
        {locked ? (
          <p className={s.note}>Locked: a parent can unlock (the lock in the left bar) to change it.</p>
        ) : (
          <p className={s.note}>From {event.calendarId.startsWith('google') ? 'Google' : 'iCloud'}. Who it's for and who sees it are kept here and apply every time it repeats.
            {onEdit ? ' Changes to the event itself are sent to iCloud.' : ' To change the event itself, use Calendar on your iPhone or Mac.'}</p>
        )}
        <div className={sheet.actions}>
          {onEdit && !draft && <button type="button" className={sheet.secondary} onClick={onEdit}>Edit event</button>}
          <span className={sheet.spacer} />
          {draft ? (
            <>
              <button type="button" className={sheet.secondary} onClick={() => setDraft(null)}>Cancel</button>
              <button type="button" className={sheet.primary} onClick={save} disabled={setPeople.isPending}>Save</button>
            </>
          ) : (
            <button type="button" className={sheet.primary} onClick={onClose} autoFocus>Close</button>
          )}
        </div>
      </div>
    </>
  );
}

/** Whose Today a special day counts down on: the kids it's for, or with none picked (or only grown-ups), every kid's. */
function specialFor(members: Member[], memberIds: string[]) {
  const kids = members.filter((m) => m.stage !== null && m.stage !== 'adult');
  const picked = kids.filter((k) => memberIds.includes(k.id)).map((k) => `${k.name.split(' ')[0]}'s`);
  if (picked.length === 0 || picked.length === kids.length) return kids.length > 1 ? "the kids'" : `${kids[0]?.name.split(' ')[0] ?? 'the kids'}'s`;
  return picked.join(' and ');
}

export default function EventDialog(props: Props) {
  const [editing, setEditing] = useState(false);
  // Synced events are changed here only in calendars that take changes (iCloud's; Google's are changed in Google).
  const calendar = useCalendars().data?.find((c) => c.id === props.event?.calendarId);
  // Locked: any event is just shown. Otherwise an iCloud event is shown first, with Edit.
  if (props.event && (props.locked || (props.event.calendarId !== 'local' && !editing))) {
    return <SyncedEvent event={props.event} members={props.members} onClose={props.onClose} locked={props.locked}
      onEdit={props.canEditSynced && calendar?.writable && !props.locked ? () => setEditing(true) : undefined} />;
  }
  return <EventForm {...props} />;
}

function EventForm({ day, event, members, onSave, onDelete, onClose, canEditSynced, special: newSpecial }: Props) {
  const setVisibility = useSetVisibility();
  const setSpecial = useSetSpecial();
  const calendars = useCalendars().data ?? [];
  // Form starts from the event being edited, or a one-hour slot on the tapped day.
  // The parent remounts this dialog (via key) for each open, so initial state is enough.
  const firstDate = event ? (event.allDay ? event.start : dayKey(new Date(event.start))) : day;
  const [title, setTitle] = useState(event?.title ?? '');
  const [memberIds, setMemberIds] = useState<string[]>(event ? event.memberIds : newSpecial ? [] : members.slice(0, 1).map((m) => m.id));
  const [allDay, setAllDay] = useState(event?.allDay ?? !!newSpecial);
  const [date, setDate] = useState(firstDate);
  // All-day end is stored exclusive; the form shows the inclusive last day.
  const [lastDate, setLastDate] = useState(event?.allDay ? dayKey(addDays(fromDayKey(event.end), -1)) : firstDate);
  const [startTime, setStartTime] = useState(event && !event.allDay ? hhmm(event.start) : '09:00');
  const [endTime, setEndTime] = useState(event && !event.allDay ? hhmm(event.end) : '10:00');
  const [location, setLocation] = useState(event?.location ?? '');
  const [notes, setNotes] = useState(event?.notes ?? '');
  const [keepPhoto, setKeepPhoto] = useState(true);
  // A special day: a countdown on the kids' Today (the ones it's for, or all of them).
  const [special, setSpecialDay] = useState(event?.special ?? !!newSpecial);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // A repeating iCloud event asks "this day or every day?" before saving.
  const [askScope, setAskScope] = useState<EventInput | null>(null);
  const repeating = !!event?.repeats && event.calendarId !== 'local';
  const target = useNewEventCalendar(!event && !!canEditSynced);
  const chosenCalendar = target.chosen;
  // Who sees it: as picked, else the event's own, else (new) the chosen calendar's default.
  const [seenPick, setSeenPick] = useState<Visibility | null>(null);
  const seen = seenPick ?? event?.visibility ?? calendars.find((c) => c.id === chosenCalendar)?.visibility ?? 'everyone';

  const problem =
    !title.trim() ? 'Add a title'
    : allDay && lastDate < date ? 'Last day is before the first day'
    : !allDay && endTime <= startTime ? 'End time is before the start'
    : null;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (problem) return;
    const t = title.trim();
    const place = location.trim() || null;
    // Only new events choose a calendar.
    const where: Pick<EventInput, 'calendarId' | 'visibility' | 'special' | 'notes' | 'photoId'> = event ? {} : target.forSave();
    // A new event says who sees it when it's picked; an existing one changes it on its own.
    if (!event && seenPick) where.visibility = seenPick;
    if (event && seenPick && seenPick !== event.visibility) setVisibility.mutate({ id: event.id, visibility: seenPick });
    // A new event says it's special when it's made; an existing one changes it on its own.
    if (!event && special) where.special = true;
    if (event && special !== event.special) setSpecial.mutate({ id: event.id, special });
    // Notes (an iCloud event's go to iCloud too), only when changed; the flyer, when taken off.
    const nextNotes = notes.trim() || null;
    if (!event || nextNotes !== (event.notes ?? null)) where.notes = nextNotes;
    if (!keepPhoto) where.photoId = null;
    const input: EventInput = allDay
      ? { title: t, memberIds, allDay, start: date, end: dayKey(addDays(fromDayKey(lastDate), 1)), location: place, ...where }
      : { title: t, memberIds, allDay, start: toInstant(date, startTime), end: toInstant(date, endTime), location: place, ...where };
    if (repeating) setAskScope(input);
    else onSave(input);
  }

  return (
    <>
      <div className={sheet.scrim} onClick={onClose} role="presentation" />
      <form className={sheet.sheet} onSubmit={submit}>
        <header className={sheet.head}>
          <h2 className={sheet.heading}>{event ? 'Edit event' : 'New event'}</h2>
          <button type="button" className={sheet.close} onClick={onClose} aria-label="Close">×</button>
        </header>

        <input className={s.title} placeholder="What's happening?" value={title} maxLength={200}
          autoFocus={!event} onChange={(e) => setTitle(e.target.value)} />
        {!event && (
          <div className={s.wrap}>
            {QUICK.map((q) => <button key={q} type="button" className={s.chip} onClick={() => setTitle(q)}>{q}</button>)}
          </div>
        )}

        <WhoPicker members={members} value={memberIds} onChange={setMemberIds} />
        <label className={s.toggle}>
          <input type="checkbox" checked={special} onChange={(e) => setSpecialDay(e.target.checked)} />
          <span>
            ⭐ Special day
            <span className={s.toggleNote}>
              {' '}Counts down on {specialFor(members, memberIds)} Today
            </span>
          </span>
        </label>
        <SeenPicker value={seen} onChange={setSeenPick} />

        <CalendarPick target={target} className={s.calendarPick} />

        <AddressInput value={location} onChange={setLocation} />
        {/* Travel time for the saved address (the field above already shows it). */}
        {event?.location && event.location === location.trim() && <TravelInfo event={event} showAddress={false} />}

        <textarea className={s.notes} placeholder="Notes" aria-label="Notes" value={notes} maxLength={4000}
          rows={Math.min(8, Math.max(2, notes.split('\n').length))} onChange={(e) => setNotes(e.target.value)} />
        {event?.photoUrl && keepPhoto && (
          // The flyer it was read from (Snap a flyer): tap for the full photo.
          <div className={s.flyer}>
            <a href={event.photoUrl} target="_blank" rel="noreferrer"><img src={event.photoUrl} alt="The flyer" /></a>
            <button type="button" className={sheet.secondary} onClick={() => setKeepPhoto(false)}>Remove photo</button>
          </div>
        )}

        <label className={s.toggle}>
          <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} /> All day
        </label>
        <div className={s.row}>
          <label>{allDay ? 'From' : 'Date'} <DateInput value={date} onChange={(e) => setDate(e.target.value)} /></label>
          {allDay ? (
            <label>To <DateInput value={lastDate} min={date} onChange={(e) => setLastDate(e.target.value)} /></label>
          ) : (
            <>
              <label>Start <input type="time" step={300} value={startTime} onChange={(e) => setStartTime(e.target.value)} /></label>
              <label>End <input type="time" step={300} value={endTime} onChange={(e) => setEndTime(e.target.value)} /></label>
            </>
          )}
        </div>

        {problem && title && <div className={s.problem}>{problem}</div>}
        {event && event.calendarId !== 'local' && (
          <p className={s.note}>
            {event.repeats && <strong>This event repeats: you'll choose this day or every day when you save. </strong>}
            Saved here now and sent to iCloud shortly. Who it's for applies every time it repeats.
          </p>
        )}

        {askScope ? (
          // Like the iPhone: this day only, or every day it repeats.
          <div className={s.scopeAsk}>
            <span className={s.scopeQuestion}>This event repeats. Save the change for:</span>
            <div className={sheet.actions}>
              <button type="button" className={sheet.secondary} onClick={() => setAskScope(null)}>Back</button>
              <span className={sheet.spacer} />
              <button type="button" className={sheet.secondary} onClick={() => onSave({ ...askScope, scope: 'one' })}>This day only</button>
              <button type="button" className={sheet.primary} disabled={askScope.allDay !== event!.allDay}
                title={askScope.allDay !== event!.allDay ? 'Change all day for every repeat on your phone' : undefined}
                onClick={() => onSave({ ...askScope, scope: 'all' })}>Every day</button>
            </div>
          </div>
        ) : confirmDelete && repeating ? (
          <div className={s.scopeAsk}>
            <span className={s.scopeQuestion}>Delete this event:</span>
            <div className={sheet.actions}>
              <button type="button" className={sheet.secondary} onClick={() => setConfirmDelete(false)}>Back</button>
              <span className={sheet.spacer} />
              <button type="button" className={sheet.danger} onClick={() => onDelete(event!, 'one')}>This day only</button>
              <button type="button" className={sheet.danger} onClick={() => onDelete(event!, 'all')}>Every day</button>
            </div>
          </div>
        ) : (
          <div className={sheet.actions}>
            {event && (
              <button type="button" className={sheet.danger}
                onClick={() => (confirmDelete ? onDelete(event) : setConfirmDelete(true))}>
                {confirmDelete ? 'Tap again to delete' : 'Delete'}
              </button>
            )}
            <span className={sheet.spacer} />
            <button type="button" className={sheet.secondary} onClick={onClose}>Cancel</button>
            <button type="submit" className={sheet.primary} disabled={!!problem}>Save</button>
          </div>
        )}
      </form>
    </>
  );
}
