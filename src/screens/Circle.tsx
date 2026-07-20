// The social layer — subscribe to other people's dreams.
// Backend doesn't exist yet, so this screen is a working PREVIEW with
// example data: the feed, the mention→ping flow, and friend stats.
import { Cloud } from '../components/Cloud'
import type { Mood } from '../lib/types'

interface ExampleDream {
  author: string
  title: string
  time: string
  mood: Mood
  tags: string[]
  mentions?: string
}

const FEED: ExampleDream[] = [
  {
    author: 'sol',
    title: 'We were all on a train that ran underwater…',
    time: '6:02 am',
    mood: 'bright',
    tags: ['water', 'travel'],
    mentions: 'you',
  },
  {
    author: 'maya',
    title: 'The lab printers were printing my thoughts…',
    time: '4:47 am',
    mood: 'dark',
    tags: ['work', 'chase'],
  },
  {
    author: 'theo',
    title: 'A dog taught me to whistle in Portuguese…',
    time: '7:15 am',
    mood: 'neutral',
    tags: ['animals'],
  },
]

const FRIENDS = [
  { name: 'sol', streak: 6, nightmares: '12%', theme: 'water' },
  { name: 'maya', streak: 2, nightmares: '40%', theme: 'work' },
  { name: 'theo', streak: 9, nightmares: '5%', theme: 'animals' },
]

export function Circle() {
  return (
    <div>
      <div className="preview-band">PREVIEW · EXAMPLE DATA · NEEDS ACCOUNTS</div>
      <h1 className="screen-title">Circle</h1>

      <div className="ping-card">
        <div className="ping-glyph">
          <Cloud mood="bright" size={22} />
        </div>
        <div>
          <div className="ping-text">
            <strong>sol</strong> dreamt about you last night
          </div>
          <div className="ping-sub">Request to see it — dreams are private until shared.</div>
        </div>
        <button className="ping-btn" disabled>
          request
        </button>
      </div>

      <section className="night-group">
        <div className="night-label">Last night · your circle</div>
        {FEED.map((d) => (
          <div key={d.author} className="dream-card circle-card">
            <div className="circle-author">
              @{d.author}
              {d.mentions && <span className="mention-chip">mentions {d.mentions}</span>}
            </div>
            <div className="dream-card-title">{d.title}</div>
            <div className="dream-card-meta">
              <Cloud mood={d.mood} size={14} />
              <span>{d.time}</span>
              <span className="tag-row">
                {d.tags.map((t) => (
                  <span key={t} className="tag">
                    {t}
                  </span>
                ))}
              </span>
            </div>
          </div>
        ))}
      </section>

      <section className="stat-section">
        <div className="stat-heading">Their nights</div>
        {FRIENDS.map((f) => (
          <div key={f.name} className="friend-row">
            <span className="friend-name">@{f.name}</span>
            <span className="friend-stat">{f.streak} night streak</span>
            <span className="friend-stat">{f.nightmares} nightmares</span>
            <span className="tag">{f.theme}</span>
          </div>
        ))}
        <p className="stat-note">
          Stats are shareable even when dreams aren't — you see the shape of a
          friend's nights, not the content.
        </p>
      </section>

      <section className="stat-section">
        <div className="stat-heading">How it will work</div>
        <ul className="how-list">
          <li>Everything you record is private by default. Sharing is per-dream.</li>
          <li>
            Mention someone and sól offers to ping them — a text that says you
            dreamt about them. They sign up to request the dream; you approve.
          </li>
          <li>Follow friends to wake up to their shared dreams, night by night.</li>
        </ul>
      </section>
    </div>
  )
}
