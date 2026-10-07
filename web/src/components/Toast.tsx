import { useEffect } from 'react';
import s from '../styles/Toast.module.css';

export interface ToastMessage { text: string; undo?: () => void }

export default function Toast({ message, onDone }: { message: ToastMessage; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 10_000);
    return () => clearTimeout(t);
  }, [message, onDone]);

  return (
    <div className={s.toast} role="status">
      <span>{message.text}</span>
      {message.undo && <button onClick={() => { message.undo!(); onDone(); }}>Undo</button>}
    </div>
  );
}
