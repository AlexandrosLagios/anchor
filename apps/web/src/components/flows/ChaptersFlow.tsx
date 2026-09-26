import { useEffect, useId, useState } from 'react';
import './flows.css';

const CHAPTERS = [
  {
    id: 'share',
    title: 'The family shares',
    body: 'Sofia drops a photo from Maria’s first day. The words stay in Sofia’s voice — not a clinical note, just the day as it was.',
  },
  {
    id: 'keep',
    title: 'Anchor keeps it',
    body: 'The moment is saved quietly in the group record. Nothing leaves the chat the family already uses.',
  },
  {
    id: 'return',
    title: 'It returns later',
    body: 'Days later, Anchor brings the moment back with a gentle question. Free recall first. A cue only if she wants it.',
  },
  {
    id: 'place',
    title: 'She keeps her place',
    body: 'Athina answers in the same conversation. She is still grandmother in the group — not a patient of a new app.',
  },
] as const;

type ChapterId = (typeof CHAPTERS)[number]['id'];

export function ChaptersFlow() {
  const [active, setActive] = useState<ChapterId>(CHAPTERS[0].id);
  const labelId = useId();

  useEffect(() => {
    const nodes = CHAPTERS.map((chapter) => document.getElementById(`chapter-${chapter.id}`)).filter(
      (node): node is HTMLElement => Boolean(node),
    );
    if (!nodes.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        const id = visible?.target.id.replace('chapter-', '') as ChapterId | undefined;
        if (id && CHAPTERS.some((chapter) => chapter.id === id)) setActive(id);
      },
      { rootMargin: '-35% 0px -45% 0px', threshold: [0.2, 0.5, 0.8] },
    );
    for (const node of nodes) observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="chapters">
      <nav className="chapters-rail" aria-labelledby={labelId}>
        <p id={labelId} className="sr-only">
          Chapter progress
        </p>
        {CHAPTERS.map((chapter) => (
          <a
            key={chapter.id}
            href={`#chapter-${chapter.id}`}
            aria-current={active === chapter.id ? 'true' : undefined}
          >
            {chapter.title}
          </a>
        ))}
      </nav>
      <div>
        {CHAPTERS.map((chapter, index) => (
          <section
            key={chapter.id}
            id={`chapter-${chapter.id}`}
            className="chapter"
            aria-labelledby={`chapter-title-${chapter.id}`}
          >
            <p className="chapter-num">Chapter {index + 1}</p>
            <h2 id={`chapter-title-${chapter.id}`}>{chapter.title}</h2>
            <p>{chapter.body}</p>
          </section>
        ))}
      </div>
    </div>
  );
}
