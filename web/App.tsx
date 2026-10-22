import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { SPREADS, type Locale, type SpreadId } from '../domain/catalog.js';
import type { Snapshot } from '../domain/reading.js';
import { bridge, ToolError } from './bridge.js';
import { CardBack, CardFace } from './art.js';
import { COPY } from './i18n.js';
import './style.css';

type Session = { snapshot: Snapshot; accessToken: string };
type Pending = { name: string; args: Record<string, unknown> };
const spreadIds: SpreadId[] = ['one-card', 'two-card', 'three-card', 'horseshoe'];
const counts = [1, 2, 3, 7];

function AppView() {
  const [locale, setLocale] = useState<Locale>('en');
  const [spreadId, setSpreadId] = useState<SpreadId>('three-card');
  const [reversals, setReversals] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [page, setPage] = useState(0);
  const [small, setSmall] = useState(window.innerWidth < 600);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [error, setError] = useState('');
  const [unavailable, setUnavailable] = useState(false);
  const [sent, setSent] = useState(false);
  const [copyText, setCopyText] = useState('');
  const [copied, setCopied] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const locked = useRef(false);
  const active = useRef<Session | null>(null);
  const recovered = useRef(false);
  const c = COPY[locale];
  const reading = session?.snapshot;
  const pageSize = small ? 6 : 12;
  const pages = Math.ceil((reading?.slots.length ?? 78) / pageSize);
  const currentPage = Math.min(page, pages - 1);
  const complete = reading?.status === 'completed';
  const ready = reading && reading.status !== 'selecting';

  function save(value: Session, nextPage = page) {
    active.current = value;
    setSession(value);
    setLocale(value.snapshot.settings.locale);
    bridge.save({ readingId: value.snapshot.readingId, page: nextPage }, value.accessToken);
  }
  function accept(result: CallToolResult, token?: string): Session {
    const snapshot = result.structuredContent?.snapshot as Snapshot | undefined;
    const accessToken = token ?? result._meta?.accessToken as string | undefined;
    if (!snapshot || !accessToken) throw new Error('The server returned an incomplete reading.');
    const next = { snapshot, accessToken };
    save(next); return next;
  }
  function failure(err: unknown) {
    const code = err instanceof ToolError ? err.code : '';
    if (code === 'NOT_FOUND' || code === 'EXPIRED') {
      setUnavailable(true); setPending(null); setError(code === 'EXPIRED' ? c.expired : c.lost);
      bridge.clear(active.current?.snapshot.readingId);
    } else {
      setError(locale === 'en' && err instanceof Error ? err.message : c.error);
    }
  }
  async function recover() {
    if (recovered.current || active.current) return;
    const saved = bridge.load(); if (!saved) return;
    recovered.current = true; locked.current = true; setBusy(true);
    try {
      const result = await bridge.call('get_reading', { readingId: saved.readingId, accessToken: saved.accessToken });
      setPage(saved.page); accept(result, saved.accessToken);
    } catch (err) { failure(err); } finally { locked.current = false; setBusy(false); }
  }
  useEffect(() => {
    const media = matchMedia('(max-width: 599px)');
    const change = () => { setSmall(media.matches); setPage(0); };
    media.addEventListener('change', change);
    const unsubscribe = bridge.subscribe(result => {
      if (!active.current && result.structuredContent?.locale === 'th') setLocale('th');
      void recover();
    });
    void recover();
    return () => { media.removeEventListener('change', change); unsubscribe(); };
  }, []);
  useEffect(() => { document.documentElement.lang = locale; }, [locale]);
  useEffect(() => {
    if (session) bridge.save({ readingId: session.snapshot.readingId, page: currentPage }, session.accessToken);
  }, [page, small, session]);
  useEffect(() => {
    if (confirm) dialog.current?.showModal(); else dialog.current?.close();
  }, [confirm]);
  useEffect(() => {
    if (!reading || unavailable) return;
    const timeout = window.setTimeout(() => { setUnavailable(true); setError(c.expired); }, Math.max(0, reading.expiresAt - Date.now()));
    return () => clearTimeout(timeout);
  }, [reading?.expiresAt, unavailable, locale]);

  async function start() {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError('');
    try {
      const result = await bridge.call('configure_reading', { spreadId, reversals, locale });
      setPage(0); const next = accept(result); save(next, 0);
      setUnavailable(false); setSent(false); setCopyText(''); setPending(null);
    } catch (err) { failure(err); } finally { locked.current = false; setBusy(false); }
  }
  function reset() {
    bridge.clear(session?.snapshot.readingId); active.current = null; setSession(null); setPage(0);
    setError(''); setPending(null); setUnavailable(false); setSent(false); setCopyText(''); setConfirm(false);
  }
  async function refresh() {
    const current = active.current; if (!current || locked.current) return;
    locked.current = true; setBusy(true); setError('');
    try {
      accept(await bridge.call('get_reading', { readingId: current.snapshot.readingId, accessToken: current.accessToken }), current.accessToken);
      setPending(null);
    } catch (err) { failure(err); } finally { locked.current = false; setBusy(false); }
  }
  function textFor(snapshot: Snapshot) {
    const lines = snapshot.cards.map(card => `${card.position + 1}. ${card.positionLabel}: ${card.name[locale]} (${card.name.en}), ${card.orientation}. ${card.meaning}`);
    return [locale === 'th' ? 'ช่วยอ่านไพ่ชุดนี้เป็นภาษาไทย โดยเชื่อมกับคำถามในบทสนทนา' : 'Please interpret this completed tarot spread using my question in this conversation.',
      snapshot.spreadName, ...lines,
      locale === 'th' ? 'อธิบายแต่ละตำแหน่ง เชื่อมโยงไพ่ และแนะนำสิ่งที่ควรทบทวน ใช้ไพ่ชุดเดิมสำหรับคำถามต่อเนื่อง' : 'Explain each position, connect the cards, and suggest practical reflection points. Reuse these exact cards for follow-up questions.',
    ].join('\n');
  }
  async function send(snapshot: Snapshot) {
    const text = textFor(snapshot);
    setCopyText(text);
    const readingContext = { spreadName: snapshot.spreadName, settings: snapshot.settings, cards: snapshot.cards };
    const delivered = await bridge.interpret(text, readingContext);
    setSent(delivered);
  }
  async function execute(request: Pending) {
    const current = active.current; if (!current || locked.current || unavailable) return;
    locked.current = true; setBusy(true); setError(''); setPending(request);
    try {
      const result = await bridge.call(request.name, request.args);
      const next = accept(result, current.accessToken);
      setPending(null);
      if (request.name === 'complete_reading') await send(next.snapshot);
    } catch (err) {
      if (err instanceof ToolError && ['CONFLICT', 'INVALID_SLOT', 'COMPLETED', 'RETRY_MISMATCH', 'INCOMPLETE', 'INVALID_INPUT'].includes(err.code)) {
        setPending(null);
        try { accept(await bridge.call('get_reading', { readingId: current.snapshot.readingId, accessToken: current.accessToken }), current.accessToken); } catch { /* retain the original error */ }
      }
      failure(err);
    } finally { locked.current = false; setBusy(false); }
  }
  function act(name: string, slotId?: string) {
    if (!session || pending || locked.current) return;
    void execute({ name, args: { readingId: session.snapshot.readingId, accessToken: session.accessToken,
      revision: session.snapshot.revision, requestId: crypto.randomUUID(), ...(slotId ? { slotId } : {}) } });
  }
  async function read() {
    if (!reading || !ready || busy) return;
    if (!complete) return act('complete_reading');
    locked.current = true; setBusy(true); setError('');
    try { await send(reading); } catch (err) { failure(err); } finally { locked.current = false; setBusy(false); }
  }
  async function copy() {
    const text = copyText || (reading ? textFor(reading) : ''); setCopyText(text);
    try { await navigator.clipboard.writeText(text); setCopied(true); } catch { setCopied(false); }
  }

  return <main className="shell">
    <header className="masthead"><div className="wordmark">✳ <span>{c.brand}</span><small>{c.tagline}</small></div>
      <label className="language"><span className="sr-only">Language / ภาษา</span><select aria-label="Language / ภาษา" value={locale} disabled={busy || !!session} onChange={e => setLocale(e.target.value as Locale)}><option value="en">EN</option><option value="th">ไทย</option></select></label>
    </header>
    {bridge.preview && <p className="preview-note">{c.preview}</p>}
    {!session ? <>
      <section className="intro"><div className="eyebrow">01 — {c.spread}</div><h1>{c.heading}<br /><em>{c.heading2}</em></h1><p>{c.intro}</p>
        <div className="intro-deck" aria-hidden="true"><div><CardBack /></div><div><CardBack /></div><div><CardBack /></div></div>
      </section>
      <section className="configuration" aria-label={c.spread}>
        <fieldset className="spread-options" disabled={busy}><legend className="sr-only">{c.spread}</legend>
          {spreadIds.map((id, i) => <label className={`spread-option ${spreadId === id ? 'active' : ''}`} key={id}>
            <input type="radio" name="spread" value={id} checked={spreadId === id} onChange={() => setSpreadId(id)} />
            <span className="spread-count">{String(counts[i]).padStart(2, '0')}</span><strong>{SPREADS[id].name[locale]}</strong><span className="spread-labels">{SPREADS[id].labels[locale].join(' · ')}</span>
          </label>)}
        </fieldset>
        <label className="reverse-toggle"><span><strong>{c.reversals}</strong><small>{c.reversalHint}</small></span><input type="checkbox" role="switch" checked={reversals} disabled={busy} onChange={e => setReversals(e.target.checked)} /></label>
        <button className="primary start" disabled={busy} onClick={() => void start()}>{busy ? c.wait : c.start}<span aria-hidden="true">↗</span></button>
      </section>
    </> : <>
      <section className="reading-heading"><div><div className="eyebrow">{reading!.spreadName} · {reading!.settings.reversals ? c.reversed : c.upright}</div>
        <h1>{ready ? (complete ? c.complete : c.ready) : c.pick}</h1>
        <p aria-live="polite">{ready ? c.completeHint : <>{c.focus}: <strong>{reading!.labels[reading!.cards.length]}</strong></>}</p></div>
        <button className="text-button" disabled={busy} onClick={() => setConfirm(true)}>{c.newReading} ↗</button>
      </section>
      <section className="spread-tray" aria-label={c.selected}>
        {reading!.labels.map((label, index) => {
          const card = reading!.cards[index];
          return <article className={`spread-position ${card ? 'revealed' : ''}`} key={index}>
            <span className="position-label">{index + 1}. {label}</span>
            <div className="tray-card">{card ? <CardFace card={card} /> : <div className="empty-card"><span>{String(index + 1).padStart(2, '0')}</span></div>}</div>
            {card && <><strong>{card.name[locale]}</strong><small>{card.orientation === 'reversed' ? c.reversed : c.upright}</small></>}
          </article>;
        })}
      </section>
      <div className="progress-line"><span aria-live="polite">{reading!.cards.length} / {reading!.labels.length} {c.progress}</span><div><span style={{ width: `${reading!.cards.length / reading!.labels.length * 100}%` }} /></div></div>
      {!ready && <section className="picker" aria-label={c.pick}>
        <div className="deck-grid" aria-busy={busy}>
          {reading!.slots.slice(currentPage * pageSize, (currentPage + 1) * pageSize).map((slot, i) => <button key={slot.id} className={`deck-card ${slot.selected ? 'chosen' : ''}`} disabled={slot.selected || busy || !!pending || unavailable}
            aria-label={`${c.card} ${currentPage * pageSize + i + 1}${slot.selected ? ` — ${c.chosen}` : ''}`} onClick={() => act('select_card', slot.id)}>
            <CardBack /><span className="slot-number">{slot.selected ? '✓' : String(currentPage * pageSize + i + 1).padStart(2, '0')}</span>
          </button>)}
        </div>
        <nav className="pagination" aria-label={c.page}><button disabled={currentPage === 0 || busy} onClick={() => setPage(currentPage - 1)}>← {c.previous}</button><span>{c.page} {currentPage + 1} / {pages}</span><button disabled={currentPage === pages - 1 || busy} onClick={() => setPage(currentPage + 1)}>{c.next} →</button></nav>
        <div className="draw-actions"><button className="secondary" disabled={busy || !!pending || unavailable} onClick={() => act('draw_remaining_cards')}>{c.auto}</button>
          {reading!.cards.length === 0 && <button className="text-button" disabled={busy || !!pending || unavailable} onClick={() => void start()}>{c.shuffle}</button>}</div>
      </section>}
      {ready && <section className="completion">
        <button className="primary" disabled={busy || !!pending || sent || unavailable} onClick={() => void read()}>{busy ? c.wait : sent ? c.sent : c.read}<span aria-hidden="true">✧</span></button>
        <button className="text-button" onClick={() => void copy()}>{copied ? c.copied : c.copy}</button>
        {sent && <p role="status">{c.sent}</p>}
        {copyText && !sent && <div className="handoff"><p>{c.handoff}</p><textarea aria-label={c.copy} readOnly value={copyText} onFocus={e => e.target.select()} /></div>}
      </section>}
      {reading!.cards.length > 0 && <details className="meanings"><summary>{c.details}</summary>{reading!.cards.map(card => <div key={card.id}><strong>{card.position + 1}. {card.positionLabel} — {card.name[locale]}</strong><p>{card.meaning}</p></div>)}</details>}
    </>}
    {error && <section className="error" role="alert"><p>{error}</p>
      {pending && !unavailable && <button disabled={busy} onClick={() => void execute(pending)}>{c.retry}</button>}
      {session && !unavailable && <button disabled={busy} onClick={() => void refresh()}>{c.refresh}</button>}
      {unavailable && <button onClick={() => setConfirm(true)}>{c.newReading}</button>}
    </section>}
    <footer><span aria-hidden="true">✧</span> {c.footer}</footer>
    <dialog ref={dialog} onCancel={() => setConfirm(false)} onClose={() => setConfirm(false)}><h2>{c.confirmTitle}</h2><p>{c.confirmText}</p><div><button className="secondary" autoFocus onClick={() => setConfirm(false)}>{c.cancel}</button><button className="primary" onClick={reset}>{c.confirm}</button></div></dialog>
  </main>;
}

createRoot(document.getElementById('root')!).render(<AppView />);
