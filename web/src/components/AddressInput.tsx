import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import s from '../styles/EventDialog.module.css';

type Place = Awaited<ReturnType<typeof api.places>>[number];

/**
 * The event's address, with places suggested as you type (near home first). Tap one to fill it in;
 * or keep typing, it's still just text. With no Google key on the server, there are no suggestions.
 */
export default function AddressInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [places, setPlaces] = useState<Place[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  // Only look things up for what was typed (not the saved address, or a suggestion just picked).
  const [typed, setTyped] = useState(false);
  // Typing then picking counts as one lookup with Google.
  const session = useRef(crypto.randomUUID?.() ?? String(Math.random()));

  useEffect(() => {
    const q = value.trim();
    if (!typed || q.length < 3) return setPlaces([]);
    const stop = new AbortController();
    // Wait for a pause in typing.
    const timer = setTimeout(() => {
      api.places(q, session.current, stop.signal).then((p) => {
        setPlaces(p);
        setActive(-1);
      }, () => setPlaces([]));
    }, 250);
    return () => {
      clearTimeout(timer);
      stop.abort();
    };
  }, [value, typed]);

  const pick = (p: Place) => {
    onChange(p.text);
    setTyped(false);
    setPlaces([]);
    session.current = crypto.randomUUID?.() ?? String(Math.random());
  };
  const showing = open && places.length > 0;

  return (
    <div className={s.addressField}>
      <input className={s.locationInput} placeholder="Address (optional), for travel time" value={value}
        maxLength={300} aria-label="Address" autoComplete="off" role="combobox" aria-expanded={showing}
        aria-controls="address-suggestions"
        onChange={(e) => {
          onChange(e.target.value);
          setTyped(true);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        // Long enough for a tap on a suggestion to land first.
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (!showing) return;
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            const step = e.key === 'ArrowDown' ? 1 : -1;
            setActive((a) => (a + step + places.length) % places.length);
          } else if (e.key === 'Enter' && active >= 0) {
            e.preventDefault();
            pick(places[active]);
          } else if (e.key === 'Escape') {
            e.stopPropagation();
            setOpen(false);
          }
        }} />
      {showing && (
        <ul className={s.suggestions} id="address-suggestions" role="listbox">
          {places.map((p, i) => (
            <li key={p.text} role="option" aria-selected={i === active}>
              <button type="button" className={`${s.suggestion} ${i === active ? s.suggestionActive : ''}`}
                onPointerDown={(e) => e.preventDefault()} onClick={() => pick(p)}>
                <span className={s.suggestionMain}>{p.main}</span>
                {p.secondary && <span className={s.suggestionMore}>{p.secondary}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
