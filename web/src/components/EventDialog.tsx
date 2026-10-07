import { useState, type CSSProperties, type FormEvent } from 'react';
import { addDays, dayKey, fromDayKey, hhmm, timeLabel, toInstant } from '../lib/dates';
import { textOn, UNASSIGNED } from '../lib/color';
import { useSetPeople } from '../lib/queries';
import type { CalEvent, EventInput, Member } from '../lib/types';
import { PencilIcon } from './icons';
import TravelInfo from './TravelInfo';
import sheet from '../styles/Sheet.module.css';
import s from '../styles/EventDialog.module.css';

interface Props {
  day: string;
  event?: CalEvent;
  members: Member[];
  onSave: (input: EventInput) => void;
  onDelete: (event: CalEvent) => void;
  onClose: () => void;
}

const QUICK = ['Practice', 'Appointment', 'Dinner out', 'Pick up', 'Work trip'];

/**
 * Who an event is for: tap people to add or remove them (any number), or Everyone to clear the list.
 * Shared by the event form and the iCloud event summary.
 */
function WhoPicker({ members, value, onChange }: { members: Member[]; value: string[]; onChange: (ids: string[]) => void }) {
  const chip = (id: string | null, name: string, color: string, on: boolean) => (
    <button key={id ?? 'everyone'} type="button" className={`${s.person} ${on ? s.on : ''}`} aria-pressed={on}
      style={{ '--c': color, color: on ? textOn(color) : undefined } as CSSProperties}
      onClick={() => onChange(id === null ? []
        : value.includes(id) ? value.filter((x) => x !== id)
        // Keep family order so the stripe and names read the same everywhere.
        : members.map((m) => m.id).filter((x) => x === id || value.includes(x)))}>
      {name}
    </button>
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

/** Synced events can't be edited here yet, so they open as a summary where you can pick who it's for. */
function SyncedEvent({ event, members, onClose }: { event: CalEvent; members: Member[]; onClose: () => void }) {
  const setPeople = useSetPeople();
  // Who it's for is locked until Edit; Save applies it to every repeat of this event.
  const [memberIds, setMemberIds] = useState(event.memberIds);
  const [draft, setDraft] = useState<string[] | null>(null);
  function save() {
    if (!draft) return;
    setPeople.mutate({ id: event.id, memberIds: draft }, {
      onSuccess: () => {
        setMemberIds(draft);
        setDraft(null);
      },
    });
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
        <h2 className={sheet.heading}>{event.title}</h2>
        <div>{when}</div>
        <TravelInfo event={event} />
        {draft ? (
          <WhoPicker members={members} value={draft} onChange={setDraft} />
        ) : (
          <>
            <div className={s.label}>Who</div>
            <div className={s.whoRow}>
              <div className={s.wrap}>
                {(people.length ? people : [{ id: 'everyone', name: 'Everyone', color: UNASSIGNED }]).map((m) => (
                  <span key={m.id} className={`${s.person} ${s.on} ${s.static}`}
                    style={{ '--c': m.color, color: textOn(m.color) } as CSSProperties}>{m.name}</span>
                ))}
              </div>
              <button type="button" className={s.editWho} onClick={() => setDraft(memberIds)}>
                <PencilIcon /> Edit
              </button>
            </div>
          </>
        )}
        {setPeople.isError && <div className={s.problem}>Couldn't save: {setPeople.error.message}</div>}
        <p className={s.note}>From iCloud. Who it's for is kept on this display and applies every time it repeats.
          To change the event itself, use Calendar on your iPhone or Mac.</p>
        <div className={sheet.actions}>
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

export default function EventDialog(props: Props) {
  if (props.event && props.event.calendarId !== 'local') {
    return <SyncedEvent event={props.event} members={props.members} onClose={props.onClose} />;
  }
  return <EventForm {...props} />;
}

function EventForm({ day, event, members, onSave, onDelete, onClose }: Props) {
  // Form starts from the event being edited, or a one-hour slot on the tapped day.
  // The parent remounts this dialog (via key) for each open, so initial state is enough.
  const firstDate = event ? (event.allDay ? event.start : dayKey(new Date(event.start))) : day;
  const [title, setTitle] = useState(event?.title ?? '');
  const [memberIds, setMemberIds] = useState<string[]>(event ? event.memberIds : members.slice(0, 1).map((m) => m.id));
  const [allDay, setAllDay] = useState(event?.allDay ?? false);
  const [date, setDate] = useState(firstDate);
  // All-day end is stored exclusive; the form shows the inclusive last day.
  const [lastDate, setLastDate] = useState(event?.allDay ? dayKey(addDays(fromDayKey(event.end), -1)) : firstDate);
  const [startTime, setStartTime] = useState(event && !event.allDay ? hhmm(event.start) : '09:00');
  const [endTime, setEndTime] = useState(event && !event.allDay ? hhmm(event.end) : '10:00');
  const [location, setLocation] = useState(event?.location ?? '');
  const [confirmDelete, setConfirmDelete] = useState(false);

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
    onSave(allDay
      ? { title: t, memberIds, allDay, start: date, end: dayKey(addDays(fromDayKey(lastDate), 1)), location: place }
      : { title: t, memberIds, allDay, start: toInstant(date, startTime), end: toInstant(date, endTime), location: place });
  }

  return (
    <>
      <div className={sheet.scrim} onClick={onClose} role="presentation" />
      <form className={sheet.sheet} onSubmit={submit}>
        <h2 className={sheet.heading}>{event ? 'Edit event' : 'New event'}</h2>

        <input className={s.title} placeholder="What's happening?" value={title} maxLength={200}
          autoFocus={!event} onChange={(e) => setTitle(e.target.value)} />
        {!event && (
          <div className={s.wrap}>
            {QUICK.map((q) => <button key={q} type="button" className={s.chip} onClick={() => setTitle(q)}>{q}</button>)}
          </div>
        )}

        <WhoPicker members={members} value={memberIds} onChange={setMemberIds} />

        <input className={s.locationInput} placeholder="Address (optional), for travel time" value={location}
          maxLength={300} onChange={(e) => setLocation(e.target.value)} aria-label="Address" />
        {/* Travel time for the saved address (the field above already shows it). */}
        {event?.location && event.location === location.trim() && <TravelInfo event={event} showAddress={false} />}

        <label className={s.toggle}>
          <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} /> All day
        </label>
        <div className={s.row}>
          <label>{allDay ? 'From' : 'Date'} <input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
          {allDay ? (
            <label>To <input type="date" value={lastDate} min={date} onChange={(e) => setLastDate(e.target.value)} /></label>
          ) : (
            <>
              <label>Start <input type="time" step={300} value={startTime} onChange={(e) => setStartTime(e.target.value)} /></label>
              <label>End <input type="time" step={300} value={endTime} onChange={(e) => setEndTime(e.target.value)} /></label>
            </>
          )}
        </div>

        {problem && title && <div className={s.problem}>{problem}</div>}

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
      </form>
    </>
  );
}
