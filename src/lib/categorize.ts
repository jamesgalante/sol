// Keyword-based dream tagging — the local stand-in for LLM categorization.
// Replace with a model call later; keep the same signature.

const LEXICON: Record<string, string[]> = {
  flying: ['fly', 'flying', 'flew', 'float', 'floating', 'soar', 'hover'],
  falling: ['fall', 'falling', 'fell', 'plummet', 'drop', 'cliff'],
  water: ['water', 'ocean', 'sea', 'swim', 'drown', 'wave', 'river', 'lake', 'flood', 'rain'],
  chase: ['chase', 'chased', 'chasing', 'running from', 'ran from', 'follow', 'escape', 'hide', 'hiding'],
  teeth: ['teeth', 'tooth'],
  school: ['school', 'exam', 'test', 'class', 'homework', 'late for', 'unprepared', 'lecture'],
  work: ['work', 'office', 'boss', 'job', 'meeting', 'lab', 'deadline'],
  family: ['mom', 'mother', 'dad', 'father', 'brother', 'sister', 'grandma', 'grandpa', 'family', 'parents'],
  animals: ['dog', 'cat', 'snake', 'bird', 'wolf', 'spider', 'horse', 'bear', 'animal', 'fish'],
  death: ['die', 'died', 'dying', 'death', 'dead', 'funeral', 'ghost'],
  love: ['kiss', 'love', 'crush', 'wedding', 'date', 'ex ', 'girlfriend', 'boyfriend'],
  home: ['house', 'home', 'childhood', 'room', 'apartment', 'door', 'hallway'],
  travel: ['airport', 'plane', 'train', 'car', 'driving', 'road', 'trip', 'lost', 'city'],
  lucid: ['lucid', 'knew i was dreaming', 'realized i was dreaming', 'woke up inside'],
  night: ['dark', 'night', 'moon', 'stars', 'shadow'],
}

export function categorize(transcript: string): string[] {
  const text = ' ' + transcript.toLowerCase() + ' '
  const scores: Array<[string, number]> = []
  for (const [tag, words] of Object.entries(LEXICON)) {
    let score = 0
    for (const w of words) {
      let i = text.indexOf(w)
      while (i !== -1) {
        score += 1
        i = text.indexOf(w, i + w.length)
      }
    }
    if (score > 0) scores.push([tag, score])
  }
  return scores
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([tag]) => tag)
}

export function titleFrom(transcript: string): string {
  const words = transcript.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return 'Untitled dream'
  const head = words.slice(0, 7).join(' ')
  return words.length > 7 ? head + '…' : head
}
