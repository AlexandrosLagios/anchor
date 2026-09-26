import { useEffect, useState } from 'react';
import './flows.css';

const BEATS = [
  {
    id: 'share',
    family: 'Sofia posts Maria’s first day — photo, caption, the usual chat noise.',
    athina: 'Athina is offline for now. The moment waits in the record.',
    title: 'Shared in the group',
  },
  {
    id: 'cue',
    family: 'Anchor reacts quietly. The family keeps talking about school bags and lunch.',
    athina: 'Later, Athina gets a gentle question in private: whose first day was this?',
    title: 'Returned with care',
  },
  {
    id: 'answer',
    family: 'If she wants, a short update can return to the group — in her words.',
    athina: 'She answers by voice. There is no wrong answer, and no public score.',
    title: 'She stays in the story',
  },
] as const;

type Beat = (typeof BEATS)[number];

export function SplitFlow() {
  const [active, setActive] = useState<Beat>(BEATS[0]);

  useEffect(() => {
    const nodes = BEATS.map((beat) => document.getElementById(`split-${beat.id}`)).filter(
      (node): node is HTMLElement => Boolean(node),
    );
    if (!nodes.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        const id = visible?.target.id.replace('split-', '');
        const next = BEATS.find((beat) => beat.id === id);
        if (next) setActive(next);
      },
      { rootMargin: '-30% 0px -45% 0px', threshold: [0.25, 0.6] },
    );
    for (const node of nodes) observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="split">
      <div className="split-pane" aria-live="polite">
        <h2>Family group</h2>
        <p>{active.family}</p>
        <h2 style={{ marginTop: '1.25rem' }}>With Athina</h2>
        <p>{active.athina}</p>
      </div>
      <div className="split-beats">
        {BEATS.map((beat) => (
          <section key={beat.id} id={`split-${beat.id}`} className="split-beat" aria-labelledby={`split-title-${beat.id}`}>
            <h3 id={`split-title-${beat.id}`}>{beat.title}</h3>
            <p>Scroll to sync both sides of the same moment.</p>
          </section>
        ))}
      </div>
    </div>
  );
}
