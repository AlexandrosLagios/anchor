import { useId, useState } from 'react';
import './flows.css';

const BEATS = [
  {
    title: 'Sofia shares the day',
    body: 'A photo and a short line in the family group: Maria’s first day, the gate, the blue bag.',
  },
  {
    title: 'Nikos agrees himself',
    body: 'He chooses what Anchor may bring back. Consent stays personal, not assumed.',
  },
  {
    title: 'The question returns',
    body: 'Later, Anchor asks without giving the answer away. Remembering freely stretches the wait.',
  },
  {
    title: 'A private cue',
    body: 'If she wants help, a gentle cue stays private — never a scoreboard for the family.',
  },
  {
    title: 'He can just ask',
    body: 'Nikos asks Anchor for a memory. The record answers in the family’s own words.',
  },
] as const;

export function CascadeFlow() {
  const [index, setIndex] = useState(0);
  const statusId = useId();

  function stateFor(i: number): 'done' | 'active' | 'next' | 'queued' {
    if (i < index) return 'done';
    if (i === index) return 'active';
    if (i === index + 1) return 'next';
    return 'queued';
  }

  return (
    <div className="cascade">
      <p id={statusId} className="cascade-status" aria-live="polite">
        Beat {index + 1} of {BEATS.length}
      </p>
      <div className="cascade-stack" aria-labelledby={statusId}>
        {BEATS.map((beat, i) => (
          <article key={beat.title} className="cascade-card" data-state={stateFor(i)} aria-hidden={i !== index}>
            <h2>{beat.title}</h2>
            <p>{beat.body}</p>
          </article>
        ))}
      </div>
      <div className="cascade-controls">
        <button
          type="button"
          className="btn btn-secondary"
          disabled={index === 0}
          onClick={() => setIndex((value) => Math.max(0, value - 1))}
        >
          Previous beat
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={index >= BEATS.length - 1}
          onClick={() => setIndex((value) => Math.min(BEATS.length - 1, value + 1))}
        >
          Next beat
        </button>
      </div>
    </div>
  );
}
