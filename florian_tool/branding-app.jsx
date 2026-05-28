// Vencor branding — VALIDATED
// Direction: Obsidienne · Platine
// Wordmark: Newsreader Italic

const APPLE_FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter Tight", "Inter", sans-serif';
const APPLE_SERIF = '"Newsreader", "Iowan Old Style", Georgia, serif';

// Validated wordmark — reused across the canvas
const VencorMark = ({ size = 32, color = '#F0F2F5', accent = '#B5BFC7' }) => (
  <span style={{
    fontFamily: APPLE_SERIF, fontStyle: 'italic', fontWeight: 400,
    fontSize: size, letterSpacing: -size * 0.035, color, lineHeight: 1,
    display: 'inline-flex', alignItems: 'baseline'
  }}>
    Vencor<span style={{ color: accent }}>.</span>
  </span>
);

const BrandingApp = () => {
  return (
    <DesignCanvas>
      {/* Intro — chosen direction */}
      <DCSection
        id="chosen"
        title="Identité Vencor · validée"
        subtitle="Tout est posé : la direction (Obsidienne · Platine), le wordmark (Newsreader Italic), la voix (sobre, éditoriale, sans bavardage). Voici le système, prêt à être étendu sur les autres écrans et matériaux."
      >
        <DCArtboard id="wordmark" label="Wordmark" width={520} height={380}>
          <div style={{
            height: '100%', background: '#0A0B0E', color: '#F0F2F5',
            fontFamily: APPLE_FONT, padding: 36, boxSizing: 'border-box',
            display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
            position: 'relative', overflow: 'hidden'
          }}>
            <div style={{
              position: 'absolute', top: -100, right: -100, width: 320, height: 320,
              background: 'radial-gradient(circle, rgba(181,191,199,0.14), transparent 70%)',
              pointerEvents: 'none'
            }}></div>
            <div style={{ position: 'relative' }}>
              <div style={{ fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase', color: '#B5BFC7', marginBottom: 6 }}>Wordmark · validé</div>
              <div style={{ fontSize: 13, color: 'rgba(240,242,245,0.55)' }}>Newsreader Italic — Production Type</div>
            </div>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1 }}>
              <VencorMark size={120} />
            </div>
            <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: 'rgba(240,242,245,0.5)' }}>
              <span>Italic · 400</span>
              <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 10 }}>letter-spacing: -0.035em</span>
            </div>
          </div>
        </DCArtboard>

        <DCArtboard id="system" label="Système" width={460} height={580}>
          <div style={{
            height: '100%', background: '#0A0B0E', color: '#F0F2F5',
            fontFamily: APPLE_FONT, padding: 36, boxSizing: 'border-box',
            display: 'flex', flexDirection: 'column', gap: 24, position: 'relative', overflow: 'hidden'
          }}>
            <div style={{
              position: 'absolute', top: -80, right: -80, width: 280, height: 280,
              background: 'radial-gradient(circle, rgba(181,191,199,0.10), transparent 70%)',
              pointerEvents: 'none'
            }}></div>
            <div style={{ position: 'relative' }}>
              <div style={{ fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase', color: '#B5BFC7', marginBottom: 14 }}>Tokens</div>
              <VencorMark size={36} />
              <div style={{ fontSize: 12, color: 'rgba(240,242,245,0.55)', marginTop: 10 }}>Obsidienne · Platine</div>
            </div>

            <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {[
                ['Onyx · background', '#0A0B0E'],
                ['Glass · surfaces', 'rgba(255,255,255,0.04)'],
                ['Platine · accent', '#B5BFC7'],
                ['Perle · italic accents', '#E8ECF0'],
                ['Texte', '#F0F2F5'],
              ].map(([n, c]) => (
                <div key={n} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '10px 12px', background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(240,242,245,0.10)', borderRadius: 10
                }}>
                  <div style={{ width: 28, height: 28, borderRadius: 8, background: c.startsWith('rgba') ? '#1A1D24' : c, border: '1px solid rgba(240,242,245,0.10)' }}></div>
                  <div style={{ flex: 1, fontSize: 12 }}>{n}</div>
                  <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 10, color: 'rgba(240,242,245,0.5)' }}>{c.length > 12 ? c.slice(0, 10) + '…' : c.toUpperCase()}</div>
                </div>
              ))}
            </div>

            <div style={{ position: 'relative', marginTop: 'auto' }}>
              <div style={{ fontSize: 9, letterSpacing: 1.5, textTransform: 'uppercase', color: 'rgba(240,242,245,0.38)', marginBottom: 10 }}>Type pairing</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontFamily: APPLE_SERIF, fontStyle: 'italic', fontSize: 17 }}>Display · titres</span>
                  <span style={{ color: 'rgba(240,242,245,0.5)' }}>Newsreader Italic</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontFamily: APPLE_FONT, fontSize: 15, fontWeight: 500 }}>UI · interface</span>
                  <span style={{ color: 'rgba(240,242,245,0.5)' }}>SF Pro (system)</span>
                </div>
              </div>
            </div>
          </div>
        </DCArtboard>

        <DCArtboard id="next" label="Prochaines étapes" width={460} height={580}>
          <div style={{
            height: '100%', background: '#F2EFE8', color: '#1A1816',
            fontFamily: APPLE_FONT, padding: 36, boxSizing: 'border-box',
            display: 'flex', flexDirection: 'column', gap: 18
          }}>
            <div style={{ fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase', color: 'rgba(26,24,22,0.45)' }}>What's next</div>
            <div style={{ fontSize: 24, lineHeight: 1.1, letterSpacing: -0.8, fontWeight: 500 }}>
              L'identité est posée. Reste à la déployer.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, flex: 1, marginTop: 4 }}>
              {[
                ['01', 'Décliner sur Manager + Consultant', "Les deux autres rôles, en Obsidienne · Platine + Newsreader Italic."],
                ['02', 'Brief photographique', "Direction art pour les vraies images (peau, lumière, matière) — à briefer photographe ou banque premium."],
                ['03', 'Kit de composants', 'Boutons, formulaires, modales, tableaux, états (hover, focus, error). Pour développer.'],
                ['04', 'Matériaux print', 'Carte de visite, papier à en-tête, signature email, présentation client.']
              ].map(([n, t, d]) => (
                <div key={n} style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                  <div style={{ fontSize: 22, fontWeight: 300, lineHeight: 1, color: 'rgba(26,24,22,0.3)', minWidth: 28 }}>{n}</div>
                  <div style={{ paddingTop: 4 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 3 }}>{t}</div>
                    <div style={{ fontSize: 12, color: 'rgba(26,24,22,0.6)', lineHeight: 1.55 }}>{d}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </DCArtboard>
      </DCSection>

      {/* The system in action */}
      <DCSection
        id="obsidienne-platine"
        title="Le système, appliqué"
        subtitle="Newsreader Italic comme wordmark, SF Pro pour l'UI, platine froid comme seul accent. Voici comment ça respire en situation — page de connexion et tableau de bord client."
      >
        <DCArtboard id="tokens" label="Tokens détaillés" width={460} height={820}>
          <window.ObsidienneTokens />
        </DCArtboard>
        <DCArtboard id="login" label="Login" width={1200} height={820}>
          <window.ObsidienneLogin />
        </DCArtboard>
        <DCArtboard id="dash" label="Client dashboard" width={1280} height={900}>
          <window.ObsidienneDashboard />
        </DCArtboard>
      </DCSection>
    </DesignCanvas>
  );
};

ReactDOM.createRoot(document.getElementById('root')).render(<BrandingApp />);
