export type Locale = 'en' | 'th';
export type Orientation = 'upright' | 'reversed';
export interface Card {
  id: string;
  name: Record<Locale, string>;
  arcana: 'major' | 'minor';
  suit: string | null;
  rank: number;
  keywords: string[];
  upright: string;
  reversed: string;
}

// Original reference text. These are reflection prompts, not predictive facts.
const majors = [
  ['The Fool', 'เดอะฟูล', 'beginnings,curiosity,trust', 'Explore a new direction with curiosity while noticing practical risks.', 'Pause before a leap; distinguish openness from avoidable carelessness.'],
  ['The Magician', 'นักมายากล', 'initiative,resources,skill', 'Bring the skills and resources you already have into deliberate action.', 'Check whether effort is scattered or promises exceed available resources.'],
  ['The High Priestess', 'มหาปุโรหิตหญิง', 'intuition,quiet,observation', 'Make space to observe what has not yet become clear.', 'Notice ignored signals, and balance intuition with direct information.'],
  ['The Empress', 'จักรพรรดินี', 'care,growth,creativity', 'Nurture an idea or relationship through patient, tangible care.', 'Consider whether overgiving or neglected needs are limiting growth.'],
  ['The Emperor', 'จักรพรรดิ', 'structure,boundaries,responsibility', 'Build a dependable structure and take responsibility for your part.', 'Review whether rigid control or weak boundaries are causing friction.'],
  ['The Hierophant', 'มหาปุโรหิต', 'tradition,learning,community', 'Seek useful guidance from a shared practice, teacher, or community.', 'Question inherited rules and choose which traditions still serve you.'],
  ['The Lovers', 'คู่รัก', 'values,connection,choice', 'Make a choice that aligns your commitments with your values.', 'Explore a mismatch in values, expectations, or mutual commitment.'],
  ['The Chariot', 'รถศึก', 'direction,discipline,momentum', 'Choose a direction and coordinate competing demands with discipline.', 'Regain direction before pushing harder; competing priorities may need attention.'],
  ['Strength', 'พละกำลัง', 'patience,courage,compassion', 'Approach a difficult situation with steady courage and patience.', 'Respond to self-doubt or exhaustion with care rather than force.'],
  ['The Hermit', 'ฤๅษี', 'reflection,solitude,discernment', 'Step back long enough to identify your own considered perspective.', 'Check whether useful solitude has become avoidance or isolation.'],
  ['Wheel of Fortune', 'วงล้อแห่งโชคชะตา', 'cycles,change,adaptation', 'Notice changing conditions and adapt the choices within your control.', 'Look for a repeating pattern and loosen resistance to necessary change.'],
  ['Justice', 'ความยุติธรรม', 'fairness,evidence,accountability', 'Examine evidence, responsibilities, and consequences with fairness.', 'Address an imbalance or an assumption that has escaped scrutiny.'],
  ['The Hanged Man', 'คนห้อยหัว', 'pause,perspective,release', 'A deliberate pause may reveal a perspective that effort alone cannot.', 'Ask whether waiting is purposeful or simply postponing a needed choice.'],
  ['Death', 'ความตาย', 'ending,transition,renewal', 'Let an outgrown chapter close so a different pattern can begin.', 'Explore what makes an ending difficult to accept. This card is symbolic, not a literal death prediction.'],
  ['Temperance', 'ความพอดี', 'balance,integration,patience', 'Combine different needs gradually and seek a sustainable rhythm.', 'Notice extremes, friction, or a pace that makes balance hard to maintain.'],
  ['The Devil', 'ปีศาจ', 'attachment,patterns,agency', 'Examine a limiting attachment and the choices that may loosen its hold.', 'Recognize an opening to interrupt a habit or reclaim personal agency.'],
  ['The Tower', 'หอคอย', 'disruption,truth,rebuilding', 'Reconsider a shaky assumption and build on what remains dependable.', 'Consider whether resisting a needed adjustment is prolonging strain.'],
  ['The Star', 'ดวงดาว', 'hope,renewal,openness', 'Support renewal through small actions that restore trust and perspective.', 'Reconnect with realistic sources of hope when confidence feels depleted.'],
  ['The Moon', 'ดวงจันทร์', 'uncertainty,imagination,ambiguity', 'Move carefully through ambiguity and separate fears from available facts.', 'Clarify a confusing impression without assuming every uncertainty is resolved.'],
  ['The Sun', 'ดวงอาทิตย์', 'clarity,vitality,joy', 'Notice what brings clarity and share progress with uncomplicated warmth.', 'Make room for enjoyment without demanding that everything feel perfect.'],
  ['Judgement', 'การตื่นรู้', 'review,awakening,response', 'Review the past honestly and decide how you want to respond now.', 'Release harsh self-judgment and notice a decision you keep deferring.'],
  ['The World', 'โลก', 'completion,integration,wholeness', 'Acknowledge what you have integrated before beginning another cycle.', 'Identify the unfinished detail or missing recognition needed for closure.'],
] as const;

const ranks = [
  ['Ace', 'หนึ่ง', 'potential', 'Notice a fresh opening and choose one practical first step.', 'An opening may need preparation or a clearer intention.'],
  ['Two', 'สอง', 'balance', 'Consider how two priorities can be held or negotiated.', 'Revisit a stalled choice or an uneven exchange.'],
  ['Three', 'สาม', 'development', 'Build through collaboration, practice, and feedback.', 'Address misalignment before expecting shared progress.'],
  ['Four', 'สี่', 'stability', 'Value what is stable while leaving room for movement.', 'Review whether security has become stagnation.'],
  ['Five', 'ห้า', 'friction', 'Name the difficulty and choose a constructive response.', 'Look for a way to repair, recover, or leave unhelpful conflict.'],
  ['Six', 'หก', 'exchange', 'Consider mutual support and the lessons of earlier experience.', 'Check whether reciprocity or your relationship to the past needs adjusting.'],
  ['Seven', 'เจ็ด', 'discernment', 'Pause to evaluate options and protect what matters.', 'Simplify confusion and reconsider a strategy that no longer helps.'],
  ['Eight', 'แปด', 'movement', 'Apply focused effort and notice where momentum is building.', 'Examine delays, repetition, or a sense of being stuck.'],
  ['Nine', 'เก้า', 'maturity', 'Recognize what sustained effort has taught you and protect your capacity.', 'Reassess expectations that make progress difficult to appreciate.'],
  ['Ten', 'สิบ', 'culmination', 'Review the outcome of a cycle and what you want to carry forward.', 'Consider which responsibilities or expectations can be released.'],
  ['Page', 'มหาดเล็ก', 'learning', 'Approach a new lesson with curiosity and modest practical experiments.', 'Ground enthusiasm in preparation and follow-through.'],
  ['Knight', 'อัศวิน', 'pursuit', 'Direct your energy toward a chosen aim with awareness of its pace.', 'Adjust impulsive pursuit or hesitation that prevents useful action.'],
  ['Queen', 'ราชินี', 'stewardship', 'Cultivate a thoughtful, receptive way of caring for this part of life.', 'Attend to neglected boundaries or needs before giving more.'],
  ['King', 'ราชา', 'leadership', 'Take a responsible, experienced approach and consider the wider effects.', 'Reconsider how control, authority, or accountability is being used.'],
] as const;
const suits = [
  ['wands', 'Wands', 'ไม้เท้า', 'initiative, creativity, and motivation'],
  ['cups', 'Cups', 'ถ้วย', 'feelings, relationships, and emotional needs'],
  ['swords', 'Swords', 'ดาบ', 'thought, communication, and conflict'],
  ['pentacles', 'Pentacles', 'เหรียญ', 'practical resources, work, and everyday stability'],
] as const;

export const CARDS: readonly Card[] = [
  ...majors.map(([en, th, keywords, upright, reversed], rank) => ({
    id: `major-${rank}`, name: { en, th }, arcana: 'major' as const,
    suit: null, rank, keywords: keywords.split(','), upright, reversed,
  })),
  ...suits.flatMap(([suit, enSuit, thSuit, theme]) => ranks.map(([en, th, keyword, upright, reversed], index) => ({
    id: `${suit}-${index + 1}`, name: { en: `${en} of ${enSuit}`, th: `${th}${thSuit}` },
    arcana: 'minor' as const, suit, rank: index + 1, keywords: [keyword, suit],
    upright: `${upright} Apply this to ${theme}.`, reversed: `${reversed} Reflect on ${theme}.`,
  }))),
];
export const CARD_BY_ID = new Map(CARDS.map(card => [card.id, card]));

export const SPREADS = {
  'one-card': { name: { en: 'One card', th: 'ไพ่หนึ่งใบ' }, labels: { en: ['Focus'], th: ['จุดโฟกัส'] } },
  'two-card': { name: { en: 'Two cards', th: 'ไพ่สองใบ' }, labels: { en: ['Situation', 'Advice'], th: ['สถานการณ์', 'คำแนะนำ'] } },
  'three-card': { name: { en: 'Three cards', th: 'ไพ่สามใบ' }, labels: { en: ['Situation', 'Challenge', 'Advice'], th: ['สถานการณ์', 'ความท้าทาย', 'คำแนะนำ'] } },
  horseshoe: { name: { en: 'Horseshoe', th: 'เกือกม้าเจ็ดใบ' }, labels: {
    en: ['Past influence', 'Present situation', 'Hidden influence', 'Challenge', 'External influence', 'Advice', 'Likely direction'],
    th: ['อิทธิพลจากอดีต', 'สถานการณ์ปัจจุบัน', 'สิ่งที่ซ่อนอยู่', 'ความท้าทาย', 'อิทธิพลจากภายนอก', 'คำแนะนำ', 'แนวโน้ม'],
  } },
} as const;
export type SpreadId = keyof typeof SPREADS;
