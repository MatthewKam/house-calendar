import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import sheet from '../styles/Sheet.module.css';
import s from '../styles/MembersPanel.module.css';

const ago = (iso: string) => {
  const min = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (min < 2) return 'now';
  if (min < 60) return `${min} min ago`;
  if (min < 48 * 60) return `${Math.round(min / 60)} h ago`;
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });
};

/** Settings: set or change the family PIN, and see (and sign out) the devices signed in with it. */
export default function FamilyPin() {
  const qc = useQueryClient();
  const status = useQuery({ queryKey: ['auth'], queryFn: api.authStatus }).data;
  const devices = useQuery({ queryKey: ['auth', 'devices'], queryFn: api.devices, enabled: !!status?.pinSet }).data ?? [];
  const [editing, setEditing] = useState(false);
  const [current, setCurrent] = useState('');
  const [pin, setPin] = useState('');
  const [again, setAgain] = useState('');
  const [signOutOthers, setSignOutOthers] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: ['auth'] });
  const save = useMutation({
    // With a master PIN, it's the one that allows a change; otherwise the current family PIN.
    mutationFn: () => api.setPin({ pin, signOutOthers, ...(status?.pinSet ? (status.masterSet ? { masterPin: current } : { currentPin: current }) : {}) }),
    onSuccess: () => {
      setEditing(false);
      setCurrent('');
      setPin('');
      setAgain('');
      void refresh();
    },
  });
  const signOut = useMutation({ mutationFn: api.signOutDevice, onSettled: refresh });
  const problem = pin.length < 4 ? 'At least 4 digits' : !/^\d+$/.test(pin) ? 'Digits only' : pin !== again ? "The two don't match" : null;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!problem) save.mutate();
  }

  return (
    <section className={s.home}>
      <h3 className={s.section}>Family PIN</h3>
      {!status?.pinSet && !editing && (
        <>
          <p className={s.hint}>
            Anyone who can reach this app can use it. Set a PIN, and each phone (and the wall) signs in with it once.
          </p>
          <button type="button" className={sheet.primary} style={{ alignSelf: 'flex-start' }} onClick={() => setEditing(true)}>
            Set a family PIN
          </button>
        </>
      )}
      {status?.pinSet && !editing && (
        <>
          <p className={s.hint}>Devices signed in with the PIN:</p>
          <ul className={s.devices}>
            {devices.map((d) => (
              <li key={d.id}>
                <span>
                  {d.label}
                  {d.thisDevice && <strong> (this one)</strong>}
                </span>
                <span className={s.deviceSeen}>{ago(d.lastSeen)}</span>
                {!d.thisDevice && (
                  <button type="button" className={s.textLink} onClick={() => signOut.mutate(d.id)}>
                    Sign out
                  </button>
                )}
              </li>
            ))}
          </ul>
          <button type="button" className={s.textLink} style={{ alignSelf: 'flex-start' }} onClick={() => setEditing(true)}>
            Change the PIN
          </button>
        </>
      )}
      {editing && (
        <form className={s.pinForm} onSubmit={submit}>
          {status?.pinSet && (
            <input type="password" inputMode="numeric" autoComplete="current-password"
              placeholder={status.masterSet ? 'Master PIN' : 'Current PIN'} value={current}
              onChange={(e) => setCurrent(e.target.value)} aria-label="Current PIN" />
          )}
          <input type="password" inputMode="numeric" autoComplete="new-password"
            placeholder="New family PIN (4 or more digits)" value={pin}
            onChange={(e) => setPin(e.target.value)} aria-label="New PIN" autoFocus />
          <input type="password" inputMode="numeric" autoComplete="new-password" placeholder="Same again" value={again}
            onChange={(e) => setAgain(e.target.value)} aria-label="New PIN again" />
          {status?.pinSet && (
            <label className={s.saverRow}>
              <input type="checkbox" checked={signOutOthers} onChange={(e) => setSignOutOthers(e.target.checked)} />
              Sign out every other device
            </label>
          )}
          {pin && problem && <p className={s.hint}>{problem}</p>}
          {save.isError && <p className={s.pinError}>{save.error.message}</p>}
          <div className={s.row}>
            <button type="button" className={sheet.secondary} onClick={() => setEditing(false)}>Cancel</button>
            <button type="submit" className={sheet.primary} disabled={!!problem || save.isPending}>Save PIN</button>
          </div>
        </form>
      )}
    </section>
  );
}
