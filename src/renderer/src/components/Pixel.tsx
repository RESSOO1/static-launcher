// Hand-placed pixel art for the launcher's menu and logo. Drawn as SVG so it stays crisp at any window scale.

const PAL: Record<string, string> = { a: '#f1e8ff', b: '#b98fff', c: '#7a45e6', d: '#3a1c7a', g: '#ffd277', e: '#6fe8a6' }

const ICONS = {
  server: ['................', '.bbbbbbbbbbbbbb.', '.bccccccccccccb.', '.bceeccccaaaacb.', '.bccccccccccccb.', '.bbbbbbbbbbbbbb.', '................', '.bbbbbbbbbbbbbb.', '.bccccccccccccb.', '.bceeccccaaaacb.', '.bccccccccccccb.', '.bbbbbbbbbbbbbb.', '................', '.......bb.......', '...bbbbbbbbbb...', '................'],
  chest: ['................', '................', '..aaaaaaaaaaaa..', '.abbbbbbbbbbbba.', '.abccccccccccba.', '.abccccccccccba.', '.aaaaaaggaaaaaa.', '.bcccccggcccccb.', '.bccccccccccccb.', '.bccccccccccccb.', '.bddddddddddddb.', '.bbbbbbbbbbbbbb.', '................', '................', '................', '................'],
  layers: ['................', '.......aa.......', '.....aabbaa.....', '...aabbbbbbaa...', '.aabbbbbbbbbbaa.', '...aabbbbbbaa...', '.b...aabbaa...b.', '.ccb...aa...bcc.', '...ccb....bcc...', '.b...ccbbcc...b.', '.ccb...cc...bcc.', '...ccb....bcc...', '.....ccbbcc.....', '.......cc.......', '................', '................'],
  shirt: ['................', '...aaa....aaa...', '..abbaa..aabba..', '.abbbbaaaabbbba.', 'abbbbbbbbbbbbbba', 'abbaabbbbbbaabba', '.aa.abbbbbba.aa.', '...abbbbbbbba...', '...abbbggbbba...', '...abbbggbbba...', '...abbbbbbbba...', '...abbbbbbbba...', '...acccccccca...', '...aaaaaaaaaa...', '................', '................'],
  frame: ['................', '................', '................', '.aaaaaaaaaaaaaa.', '.acccccccccccca.', '.accccccccggcca.', '.accccccccggcca.', '.acccccccccccca.', '.accbccccccccca.', '.acbbbcccbcccca.', '.abbbbbcbbbccca.', '.abbbbbbbbbbbba.', '.aaaaaaaaaaaaaa.', '................', '................', '................'],
  gear: ['................', '.......aa.......', '..aa...aa...aa..', '..aaaaabbaaaaa..', '...aabbbbbbaa...', '...abbccccbba...', '...abc....cba...', '.aaabc....cbaaa.', '.aaabc....cbaaa.', '...abc....cba...', '...abbccccbba...', '...aabbbbbbaa...', '..aaaaabbaaaaa..', '..aa...aa...aa..', '.......aa.......', '................']
}

export type PixelIconName = keyof typeof ICONS

export function PixelIcon({ name }: { name: PixelIconName }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" shapeRendering="crispEdges">
      {ICONS[name].flatMap((row, y) => [...row].map((ch, x) => (PAL[ch] ? <rect key={`${x}-${y}`} x={x} y={y} width="1.02" height="1.02" fill={PAL[ch]} /> : null)))}
    </svg>
  )
}

const LETTERS: Record<string, string[]> = {
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  I: ['###', '.#.', '.#.', '.#.', '.#.', '.#.', '###'],
  C: ['.####', '#....', '#....', '#....', '#....', '#....', '.####']
}
const ROW = ['#ffffff', '#fbf8ff', '#efe5ff', '#dfcbff', '#c8a8ff', '#ae85ff', '#9460f7']

/** Our own pixel letters, so the brand name cannot be misread (a font's C looked like an O). */
export function Wordmark() {
  let x = 0
  const back: React.ReactNode[] = []
  const front: React.ReactNode[] = []
  for (const [n, ch] of [...'STATIC'].entries()) {
    const rows = LETTERS[ch]
    const left = x
    rows.forEach((r, y) =>
      [...r].forEach((p, i) => {
        if (p !== '#') return
        back.push(<rect key={`b${n}-${i}-${y}`} x={left + i} y={y + 0.6} width="1.02" height="1" fill="#3a1a80" />)
        front.push(<rect key={`f${n}-${i}-${y}`} x={left + i} y={y} width="1.02" height="1.02" fill={ROW[y]} />)
      })
    )
    x += rows[0].length + 1
  }
  return (
    <svg className="wordmark" viewBox="0 0 33 7.6" role="img" aria-label="STATIC" shapeRendering="crispEdges">
      {back}
      {front}
    </svg>
  )
}
