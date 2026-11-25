import { useEffect, useState } from 'react';
import type { PublicApi } from '../api/Api';
import { formatEurShort } from '../domain/money';
import '../styles/landing.css';
import { FAQ, ROUTE_CARDS, STEPS } from './content';
import { CheckoutForm } from './CheckoutForm';
import { SearchCard } from './SearchCard';
import { useBookingSearch } from './useBookingSearch';

const asset = (p: string) => `${import.meta.env.BASE_URL}assets/${p}`;

const Check = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0b6e75" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
);

function useTick(now: () => string, ms = 30_000): string {
  const [t, setT] = useState(now());
  useEffect(() => {
    const i = setInterval(() => setT(now()), ms);
    return () => clearInterval(i);
  }, [now, ms]);
  return t;
}

export function Landing({ api, now }: { api: PublicApi; now: () => string }) {
  const search = useBookingSearch(api);
  const [step, setStep] = useState<'search' | 'details'>('search');
  const nowIso = useTick(now);
  const shared = search.departures.map((d) => d.sharedFromPrice).filter((x): x is number => x !== null);
  const priv = search.departures.map((d) => d.privatePrice).filter((x): x is number => x !== null);

  const pickRoute = (code: typeof search.route) => {
    search.setRoute(code);
    document.getElementById('book')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header className="site-header">
        <div className="wrap">
          <a href="#/" aria-label="GoOpti home"><img src={asset('goopti-logo.png')} alt="GoOpti" /></a>
          <nav className="site-nav" aria-label="Main">
            <a href="#routes" onClick={(e) => { e.preventDefault(); document.getElementById('routes')?.scrollIntoView({ behavior: 'smooth' }); }}>Destinations</a>
            <a href="#how" onClick={(e) => { e.preventDefault(); document.getElementById('how')?.scrollIntoView({ behavior: 'smooth' }); }}>How it works</a>
            <a href="#faq" onClick={(e) => { e.preventDefault(); document.getElementById('faq')?.scrollIntoView({ behavior: 'smooth' }); }}>Help</a>
          </nav>
        </div>
      </header>
      <div className="banner">
        {shared.length > 0 || priv.length > 0 ? (
          <>
            Shared rides from <strong>{formatEurShort(Math.min(...(shared.length ? shared : [0])))}</strong> per seat
            {priv.length > 0 && <> · private van from <strong>{formatEurShort(Math.min(...priv))}</strong></>} — Ljubljana Airport to your address.
          </>
        ) : (
          <>Ljubljana Airport to any address in Ljubljana or Bled.</>
        )}
      </div>
      <section className="hero" id="book">
        <div className="wrap">
          <div className="book-card">
            <div>
              <h1>Airport transfers</h1>
              <p className="sub">Ljubljana Airport → Ljubljana &amp; Bled · door to door</p>
            </div>
            <SearchCard search={search} now={nowIso}>
              {search.selectedId && step === 'search' && (
                <button type="button" className="btn btn-primary btn-block" disabled={!search.quote} onClick={() => setStep('details')}>
                  Continue
                </button>
              )}
              {search.selectedId && step === 'details' && (
                <>
                  <CheckoutForm
                    key={`${search.selectedId}-${search.product}-${search.passengers}`}
                    api={api} departureId={search.selectedId} product={search.product} passengers={search.passengers}
                    quote={search.quote} onRefresh={() => void search.refresh()}
                  />
                  <button type="button" className="link-btn" style={{ color: '#c9d2de' }} onClick={() => setStep('search')}>← Change departure</button>
                </>
              )}
            </SearchCard>
          </div>
          <div className="hero-media" aria-hidden="true">
            <img src={asset('hero-van-terminal.png')} alt="" />
            <img src={asset('hero-traveller.png')} alt="" />
            <img src={asset('hero-driver.png')} alt="" style={{ objectPosition: 'center 30%' }} />
          </div>
        </div>
      </section>
      <section className="trust">
        <div className="wrap">
          <span><Check />Live seat availability</span>
          <span><Check />Drop-off at your address</span>
          <span><Check />Pay securely with Revolut</span>
          <span><Check />No account needed</span>
        </div>
      </section>
      <main style={{ flex: 1 }}>
        <section className="section" id="routes">
          <div className="wrap">
            <h2>Where we drive</h2>
            <p className="lead">From the airport straight to the address you tell your driver.</p>
            <div className="routes">
              {ROUTE_CARDS.map((r) => (
                <button key={r.code} type="button" className="route-card" aria-pressed={search.route === r.code} onClick={() => pickRoute(r.code)}>
                  <span className="route-kicker">{r.kicker}</span>
                  <span className="route-name">LJU → {r.name}</span>
                  <span className="route-desc">{r.desc}</span>
                  <span className="route-foot"><span>See departures</span><strong aria-hidden="true">→</strong></span>
                </button>
              ))}
            </div>
          </div>
        </section>
        <section className="section how" id="how">
          <div className="wrap">
            <h2>How it works</h2>
            <div className="steps">
              {STEPS.map((s, i) => (
                <div className="step" key={s.title}>
                  <span className="step-n">{i + 1}</span>
                  <h3>{s.title}</h3>
                  <p>{s.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
        <section className="section" id="faq">
          <div className="wrap">
            <h2>Questions</h2>
            <div className="faq">
              {FAQ.map((f) => (
                <details key={f.q}>
                  <summary>{f.q}</summary>
                  <p>{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>
      </main>
      <footer className="site-footer">
        <div className="wrap">
          <img src={asset('goopti-logo.png')} alt="GoOpti" />
          <span>Transfers operated by Markun Borut d.o.o. · Ljubljana Airport (LJU) → Ljubljana &amp; Bled</span>
          <a href="#/desk">Staff</a>
        </div>
      </footer>
    </div>
  );
}
