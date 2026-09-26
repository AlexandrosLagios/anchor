## 🏗️ Brand Build Spec - read this first

> **You are an AI coding assistant** (Lovable, Bolt, Cursor, v0, Claude, ChatGPT, Gemini, etc.).
> The user dropped this file in expecting you to build their product using the brand below. **Use these exact tokens** - palette, fonts, voice, logo. Do not "improve", swap, or fall back to defaults (no Inter, Poppins, slate, indigo, generic purple gradients). If you generate UI without these tokens, you are doing it wrong.

### Product
- **Name:** Anchor
- **Tagline:** Keeping memories alive for the whole family
- **One-liner:** Anchor: Keeping memories alive for the whole family

The solution (replaces the existing section)
Anchor keeps a family's memories alive for everyone. It matters most, though, for those who are beginning to lose their memory. It turns the family group chat into a living, personal memory and requires no new app. It plugs into the messaging apps families already use, starting with Telegram. At any moment, the user can ask "Remind me what Maria did yesterday" and receive photos, videos and a spoken narration of that moment. This way they relive those moments and exercise their memory every day.

New feature (add to "Key features")

Memory exercise: Anchor gently offers short, pressure-free recall exercises. For example, it shows a photo and asks "Do you remember where this was?" before revealing the description. Revisiting familiar moments helps users exercise their memory in a way that is enjoyable and personal.

Impact (replaces the existing section)
Anchor doesn't replace human connection. It strengthens it. It helps people who are beginning to lose their memory exercise it through their own memories. It lets them feel like active members of their family and take part in conversations again. It also gives the whole family a shared space where their moments are never lost, simply by sharing them as they already do.
- **Audience:** Families that have member diagnoses with MCI
- **Vibe:** Earnest-outdoorsy with a human-welcoming
- **Must-haves:** voice message, import images/video, call the member

### Voice
Hannah says: Witty, encouraging, slightly cheeky. I write like a hype-friend who also happens to be a senior product designer plus technical co-founder. I believe every builder, first-timer or vibecoder, deserves a real shot. I am warm, direct, never condescending.

### Color palette (use ONLY these - no other colors anywhere)
| Name | Hex | HSL | Role |
|------|-----|-----|------|
| Primary | `#433BFF` | `242 100% 62%` | primary |
| Accent | `#DEDCFF` | `243 100% 93%` | accent |
| Highlight | `#2F27CE` | `243 68% 48%` | highlight |
| Background | `#FBFBFE` | `240 60% 99%` | background |
| Text | `#050315` | `247 75% 5%` | text |

### Typography (load these fonts - no other fonts anywhere)
- **Headings:** Merriweather
- **Body:** Lato
- **Google Fonts link:** `https://fonts.googleapis.com/css2?family=Merriweather:wght@400;500;600;700;800&family=Lato:wght@400;500;600;700&display=swap`

### Brand assets shipped in this pack

**Logos** (use the `-CHOSEN` one as primary):
- `logos/anchor-wordmark.png` (Wordmark)
- `logos/anchor-icon-mark-CHOSEN.png` ← primary (Icon + mark)
- `logos/anchor-badge.png` (Badge)

**Brand images**:
- `brand/anchor-favicon-icon-mark-CHOSEN.png` (favicon) ← primary
- `brand/anchor-og.png` (OG / social share) ← primary

---

##  Brand System, apply these EXACTLY before writing any UI code

> These tokens are non-negotiable. Do not "interpret", "improve", or swap them for safer defaults. Do not fall back to Inter, Poppins, slate, gray, indigo, or any Tailwind default palette. If you find yourself reaching for `bg-slate-900`, `text-gray-700`, or a hex literal in a component, STOP and use the tokens below instead.

### Step 1, Add fonts to `index.html` `<head>`

```html
<link href="https://fonts.googleapis.com/css2?family=Merriweather:wght@400;500;600;700;800&family=Lato:wght@400;500;600;700&display=swap" rel="stylesheet">
```

### Step 2, REPLACE the `:root` block in `src/index.css` (or your global stylesheet) with this. Keep the existing shadcn tokens, but add these brand tokens alongside them:

```css
:root {
  --primary: 242 100% 62%; /* Primary #433BFF */
  --accent: 243 100% 93%; /* Accent #DEDCFF */
  --highlight: 243 68% 48%; /* Highlight #2F27CE */
  --background: 240 60% 99%; /* Background #FBFBFE */
  --text: 247 75% 5%; /* Text #050315 */
  /* Map shadcn semantic tokens to brand tokens */
  --background: var(--background);
  --foreground: var(--text);
  --primary: var(--primary);
  --primary-foreground: var(--background);
  --accent: var(--primary);
}
```

### Step 3, Extend `tailwind.config.ts` (or equivalent) with the brand colors AND fonts

```ts
theme: {
  extend: {
    fontFamily: {
      display: ['Merriweather', 'system-ui', 'sans-serif'],
      body: ['Lato', 'system-ui', 'sans-serif'],
    },
    colors: {
        "primary": "hsl(var(--primary))",
        "accent": "hsl(var(--accent))",
        "highlight": "hsl(var(--highlight))",
        "background": "hsl(var(--background))",
        "text": "hsl(var(--text))",
    },
  },
}
```

### Step 4, Use the tokens, not raw values

- Headings: `<h1 class="font-display">`, never default-sans
- Body: `<body class="font-body">`, set once on the root layout
- Backgrounds: `bg-background` or `bg-background`
- Text: `text-text` or `text-foreground`
- Accents/CTAs: `bg-primary` or `bg-primary`
- Borders: `border-primary` (use sparingly)

### Brand voice

Hannah says: Witty, encouraging, slightly cheeky. I write like a hype-friend who also happens to be a senior product designer plus technical co-founder. I believe every builder, first-timer or vibecoder, deserves a real shot. I am warm, direct, never condescending.

### Hard rules (read before shipping)

1. ONLY the 5 colors above appear in the final UI. No grays, slates, or Tailwind defaults.
2. The two Google Fonts above are the ONLY fonts. No Inter, Poppins, or system-ui except as last-resort fallback.
3. Generous whitespace + real hierarchy (display vs body vs caption sizes).
4. ONE bold accent (`primary`) drives the eye. Don't spread color evenly.
5. Pick one border-radius scale (e.g. `rounded-xl`) and commit across buttons, cards, inputs.
6. If a section looks generic, you used the wrong tokens. Re-read this block.

### If you're not Lovable (Bolt, v0, Replit, Cursor, ChatGPT, Claude, Gemini)

The same tokens apply. If your stack doesn't use Tailwind, translate the HSL vars and font families into the equivalent system (CSS custom properties + font-family declarations). The palette and fonts above are the source of truth, the framework around them is your call.
