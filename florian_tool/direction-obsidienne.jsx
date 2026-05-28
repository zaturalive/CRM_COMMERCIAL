// Direction B: Obsidienne
// Warm onyx + glass + pearl accent. Apple Watch Ultra reveal × clinic at night.

const B = {
  bg: '#0A0B0E',
  bgSoft: '#0F1015',
  glass: 'rgba(255,255,255,0.04)',
  glassHi: 'rgba(255,255,255,0.07)',
  text: '#F0F2F5',
  textDim: 'rgba(240,242,245,0.6)',
  textFaint: 'rgba(240,242,245,0.38)',
  hair: 'rgba(240,242,245,0.10)',
  hairStrong: 'rgba(240,242,245,0.18)',
  pearl: '#E8ECF0',
  gold: '#B5BFC7',
  font: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter Tight", "Inter", sans-serif',
  serif: '"Newsreader", "Iowan Old Style", Georgia, serif',
  mono: '"JetBrains Mono", ui-monospace, monospace',
};

const BPhoto = ({ children, style, tone = 'midnight' }) => {
  const grads = {
    midnight: 'radial-gradient(at 60% 40%, #2A2D34 0%, #14171C 50%, #08090C 100%)',
    candle: 'radial-gradient(at 30% 50%, #4A5560 0%, #1F242C 50%, #0A0B0E 100%)',
    pearl: 'radial-gradient(at 50% 30%, #5A5E64 0%, #2A2D33 50%, #0F1014 100%)',
    velvet: 'radial-gradient(at 70% 50%, #3A3F47 0%, #181C22 60%, #08090C 100%)',
  };
  return (
    <div style={{
      position: 'relative', borderRadius: 24, overflow: 'hidden',
      background: grads[tone] || grads.midnight,
      ...style
    }}>
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.04) 1px, transparent 0)',
        backgroundSize: '3px 3px', opacity: 0.7
      }}></div>
      <div style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(ellipse at 20% 0%, rgba(255,255,255,0.08), transparent 50%)'
      }}></div>
      {children}
    </div>
  );
};

const BMark = ({ size = 14, color }) => (
  <div style={{
    fontFamily: B.serif, fontStyle: 'italic', fontWeight: 400,
    fontSize: size * 1.5, letterSpacing: -size * 0.05,
    color: color || B.text, lineHeight: 1,
    display: 'inline-flex', alignItems: 'baseline'
  }}>
    <span>Vencor</span>
    <span style={{ color: B.gold }}>.</span>
  </div>
);

window.ObsidienneTokens = () => (
  <div style={{
    height: '100%', background: B.bg, color: B.text, fontFamily: B.font,
    padding: 40, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 28, overflow: 'hidden',
    position: 'relative'
  }}>
    {/* subtle ambient glow */}
    <div style={{
      position: 'absolute', top: -100, right: -100, width: 360, height: 360,
      background: 'radial-gradient(circle, rgba(181,191,199,0.12), transparent 70%)',
      pointerEvents: 'none'
    }}></div>

      <div style={{ position: 'relative' }}>
      <div style={{ fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase', color: B.gold, marginBottom: 18 }}>System</div>
      <BMark size={15} />
      <div style={{ fontSize: 28, lineHeight: 1.05, marginTop: 22, letterSpacing: -1, fontWeight: 400 }}>Obsidienne · Platine.</div>
      <div style={{ fontSize: 13, lineHeight: 1.6, color: B.textDim, marginTop: 8 }}>
        Onyx, surfaces de verre, accent platine froid. Le cabinet privé à 22h, l'instrument de précision.
      </div>
    </div>

    <div style={{ position: 'relative' }}>
      <div style={{ fontSize: 9, letterSpacing: 1.5, textTransform: 'uppercase', color: B.textFaint, marginBottom: 14 }}>Palette</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
        {[
          ['Onyx', B.bg, B.text],
          ['Glass', '#1A1A1F', B.text],
          ['Perle', B.pearl, B.bg],
          ['Platine', B.gold, B.bg],
          ['Surface', B.bgSoft, B.text],
          ['Hairline', B.hairStrong, B.text],
        ].map(([n, c, t]) => (
          <div key={n} style={{ background: c, color: t, padding: '20px 16px', borderRadius: 14, fontSize: 11, border: `1px solid ${B.hair}` }}>
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4, letterSpacing: -0.2 }}>{n}</div>
            <div style={{ fontFamily: B.mono, fontSize: 9, opacity: 0.6 }}>{c.toUpperCase()}</div>
          </div>
        ))}
      </div>
    </div>

    <div style={{ position: 'relative' }}>
      <div style={{ fontSize: 9, letterSpacing: 1.5, textTransform: 'uppercase', color: B.textFaint, marginBottom: 14 }}>Type</div>
      <div style={{ background: B.glass, borderRadius: 14, padding: 20, border: `1px solid ${B.hair}` }}>
        <div style={{ fontFamily: B.serif, fontStyle: 'italic', fontSize: 44, fontWeight: 400, letterSpacing: -2, lineHeight: 1, marginBottom: 4, color: B.pearl }}>Aa</div>
        <div style={{ fontSize: 11, color: B.textDim }}>Newsreader Italic · wordmark & titres</div>
        <div style={{ height: 1, background: B.hair, margin: '14px 0' }}></div>
        <div style={{ fontSize: 30, fontWeight: 500, letterSpacing: -1, lineHeight: 1, marginBottom: 4 }}>Aa</div>
        <div style={{ fontSize: 11, color: B.textDim }}>SF Pro Display · UI & body</div>
      </div>
    </div>

    <div style={{ marginTop: 'auto', position: 'relative' }}>
      <div style={{ fontSize: 9, letterSpacing: 1.5, textTransform: 'uppercase', color: B.textFaint, marginBottom: 12 }}>Voice</div>
      <div style={{ fontSize: 17, lineHeight: 1.3, color: B.text, fontWeight: 400 }}>
        L'intérêt patient,<br/>
        <span style={{ fontFamily: B.serif, fontStyle: 'italic', color: B.pearl }}>maîtrisé.</span>
      </div>
    </div>
  </div>
);

window.ObsidienneLogin = () => (
  <div style={{
    height: '100%', background: B.bg, color: B.text, fontFamily: B.font,
    overflow: 'hidden', position: 'relative'
  }}>
    {/* Full-bleed photographic backdrop */}
    <BPhoto tone="candle" style={{ position: 'absolute', inset: 0, borderRadius: 0 }} />

    {/* Vignette top + bottom for legibility */}
    <div style={{
      position: 'absolute', inset: 0,
      background: 'linear-gradient(180deg, rgba(10,10,12,0.7) 0%, transparent 25%, transparent 60%, rgba(10,10,12,0.85) 100%)'
    }}></div>

    {/* Content */}
    <div style={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column', padding: '36px 56px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <BMark size={13} />
        <div style={{ fontFamily: B.mono, fontSize: 10, color: B.textFaint, letterSpacing: 1 }}>B · 02 / 03</div>
      </div>

      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 80 }}>
        {/* Left: editorial copy */}
        <div style={{ flex: 1, maxWidth: 600 }}>
          <div style={{ fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', color: B.gold, marginBottom: 24 }}>— Accès praticien</div>
          <h1 style={{
            fontSize: 96, lineHeight: 0.9, letterSpacing: -4.5, fontWeight: 300, margin: 0, color: B.text
          }}>
            L'intérêt<br/>
            patient,<br/>
            <span style={{ fontFamily: B.serif, fontStyle: 'italic', fontWeight: 400, color: B.pearl }}>maîtrisé.</span>
          </h1>
          <div style={{ fontSize: 15, lineHeight: 1.65, color: B.textDim, marginTop: 32, maxWidth: 460 }}>
            Un atelier numérique privé pour les praticiens d'esthétique et leurs consultants. Croissance mesurée. Confidentialité absolue.
          </div>
        </div>

        {/* Right: glass card */}
        <div style={{ width: 420 }}>
          <div style={{
            background: B.glass, backdropFilter: 'blur(40px)', WebkitBackdropFilter: 'blur(40px)',
            border: `1px solid ${B.hairStrong}`, borderRadius: 24, padding: '36px 32px',
            boxShadow: '0 32px 80px rgba(0,0,0,0.5)'
          }}>
            <div style={{ fontSize: 24, fontWeight: 400, letterSpacing: -0.8, marginBottom: 6 }}>Bon retour.</div>
            <div style={{ fontSize: 13, color: B.textDim, marginBottom: 28 }}>Identifiez-vous pour reprendre.</div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <input defaultValue="dr.lefebvre@clinique.fr" style={{
                width: '100%', padding: '14px 16px', background: 'rgba(0,0,0,0.25)',
                border: `1px solid ${B.hair}`, borderRadius: 12, color: B.text,
                fontSize: 14, fontFamily: B.font, outline: 'none', boxSizing: 'border-box'
              }} />
              <input type="password" defaultValue="••••••••••" style={{
                width: '100%', padding: '14px 16px', background: 'rgba(0,0,0,0.25)',
                border: `1px solid ${B.hair}`, borderRadius: 12, color: B.text,
                fontSize: 14, fontFamily: B.font, outline: 'none', boxSizing: 'border-box'
              }} />
              <button style={{
                width: '100%', padding: '14px', background: B.text, color: B.bg,
                border: 'none', borderRadius: 12, fontFamily: B.font, fontSize: 14, fontWeight: 500,
                cursor: 'pointer', marginTop: 4, letterSpacing: -0.1
              }}>Entrer</button>
            </div>

            <div style={{
              marginTop: 22, paddingTop: 18, borderTop: `1px solid ${B.hair}`,
              display: 'flex', justifyContent: 'space-between', fontSize: 12, color: B.textDim
            }}>
              <span>Mot de passe oublié ?</span>
              <span style={{ color: B.gold }}>Aide privée</span>
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: B.textFaint, letterSpacing: 0.5 }}>
        <div style={{ display: 'flex', gap: 14 }}>
          <span>Confidentiel</span><span>·</span><span>HDS · SOC 2 Type II</span><span>·</span><span>RGPD</span>
        </div>
        <div>© Vencor · Maison fondée à Lyon · MMXXIV</div>
      </div>
    </div>
  </div>
);

window.ObsidienneDashboard = () => (
  <div style={{
    height: '100%', background: B.bg, color: B.text, fontFamily: B.font,
    overflow: 'hidden', display: 'flex', flexDirection: 'column', position: 'relative'
  }}>
    {/* ambient warmth */}
    <div style={{
      position: 'absolute', top: -200, left: -150, width: 600, height: 600,
      background: 'radial-gradient(circle, rgba(181,191,199,0.06), transparent 60%)',
      pointerEvents: 'none'
    }}></div>

    {/* Top bar */}
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '22px 48px', borderBottom: `1px solid ${B.hair}`,
      backdropFilter: 'blur(20px)', position: 'relative', zIndex: 10
    }}>
      <BMark size={12} />
      <div style={{ display: 'flex', gap: 32, fontSize: 13, color: B.textDim }}>
        <span style={{ color: B.text }}>Aujourd'hui</span>
        <span>Documents</span>
        <span>Mon référent</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 13 }}>
        <span style={{ color: B.textDim }}>Dr. Martin Lefebvre</span>
        <div style={{
          width: 30, height: 30, borderRadius: '50%', background: B.glassHi, color: B.text,
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 500,
          border: `1px solid ${B.hair}`
        }}>ML</div>
      </div>
    </div>

    <div style={{ flex: 1, padding: 48, overflow: 'auto', position: 'relative' }}>
      {/* HERO greeting */}
      <div style={{ marginBottom: 40 }}>
        <div style={{ fontSize: 13, color: B.gold, marginBottom: 12 }}>Mardi 19 mai</div>
        <div style={{ fontSize: 56, fontWeight: 300, letterSpacing: -2.4, lineHeight: 1, maxWidth: 800 }}>
          <span style={{ color: B.textDim }}>Bonjour,</span><br/>
          Dr. Lefebvre.<br/>
          <span style={{ fontFamily: B.serif, fontStyle: 'italic', color: B.pearl, fontWeight: 400 }}>Tout est en ordre.</span>
        </div>
      </div>

      {/* Status glass card */}
      <div style={{
        background: B.glass, backdropFilter: 'blur(40px)', WebkitBackdropFilter: 'blur(40px)',
        border: `1px solid ${B.hair}`, borderRadius: 24,
        padding: '32px 36px', marginBottom: 24, position: 'relative', overflow: 'hidden'
      }}>
        <div style={{
          position: 'absolute', top: -50, right: -50, width: 240, height: 240,
          background: 'radial-gradient(circle, rgba(181,191,199,0.1), transparent 70%)'
        }}></div>
        <div style={{ position: 'relative' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 32 }}>
            <div>
              <div style={{ fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: B.textFaint, marginBottom: 6 }}>Étape en cours</div>
              <div style={{ fontSize: 28, fontWeight: 500, letterSpacing: -0.8, marginBottom: 4 }}>Accompagnement</div>
              <div style={{ fontSize: 13, color: B.textDim }}>Phase 2 sur 3 · <span style={{ color: B.gold }}>68% accompli</span></div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: B.textFaint, marginBottom: 6 }}>Mission depuis</div>
              <div style={{ fontSize: 16, fontWeight: 500 }}>12 mars 2026</div>
              <div style={{ fontSize: 13, color: B.textDim }}>Orthopédie · Lyon</div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
            {[
              { l: 'Signature', s: 'done' }, { l: 'Audit initial', s: 'done' },
              { l: 'Accompagnement', s: 'active' }, { l: 'Bilan final', s: 'pending' }
            ].map((step, i, arr) => (
              <React.Fragment key={i}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{
                    width: 10, height: 10, borderRadius: '50%',
                    background: step.s === 'pending' ? 'transparent' : step.s === 'active' ? B.gold : B.text,
                    border: step.s === 'pending' ? `1px solid ${B.hairStrong}` : 'none',
                    boxShadow: step.s === 'active' ? `0 0 0 5px rgba(181,191,199,0.18), 0 0 20px rgba(181,191,199,0.4)` : 'none'
                  }}></div>
                  <div style={{ fontSize: 12, color: step.s === 'pending' ? B.textFaint : B.text, fontWeight: step.s === 'active' ? 500 : 400 }}>{step.l}</div>
                </div>
                {i < arr.length - 1 && <div style={{
                  flex: 1, height: 1, margin: '0 14px 22px',
                  background: arr[i + 1].s !== 'pending' ? B.text : B.hairStrong
                }}></div>}
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>

      {/* Photo hero + Consultant */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 24, marginBottom: 24 }}>
        <BPhoto tone="velvet" style={{ height: 280 }}>
          <div style={{
            position: 'absolute', inset: 0, padding: 32,
            background: 'linear-gradient(180deg, transparent 0%, transparent 30%, rgba(10,10,12,0.7) 100%)',
            display: 'flex', flexDirection: 'column', justifyContent: 'space-between'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 12px',
                background: 'rgba(255,255,255,0.08)', backdropFilter: 'blur(20px)',
                borderRadius: 100, fontSize: 11, fontWeight: 500, border: `1px solid ${B.hair}`
              }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: B.gold, boxShadow: `0 0 8px ${B.gold}` }}></span>
                Cette semaine
              </div>
              <div style={{ fontFamily: B.mono, fontSize: 10, color: B.textFaint }}>session.04</div>
            </div>
            <div>
              <div style={{ fontSize: 32, fontWeight: 400, letterSpacing: -1, marginBottom: 6, lineHeight: 1.05, color: B.text }}>
                Appel de suivi mensuel
              </div>
              <div style={{ fontSize: 13, color: B.textDim, marginBottom: 20, maxWidth: 420, lineHeight: 1.5 }}>
                Point d'avancement sur les indicateurs d'avril avec votre référent.
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontSize: 14, fontWeight: 500 }}>Vendredi 23 mai · 14:00</div>
                <button style={{
                  padding: '10px 18px', background: B.text, color: B.bg,
                  border: 'none', borderRadius: 100, fontSize: 13, fontWeight: 500, cursor: 'pointer'
                }}>Rejoindre →</button>
              </div>
            </div>
          </div>
        </BPhoto>

        <div style={{
          background: B.glass, backdropFilter: 'blur(40px)', WebkitBackdropFilter: 'blur(40px)',
          border: `1px solid ${B.hair}`, borderRadius: 24,
          padding: 28, display: 'flex', flexDirection: 'column'
        }}>
          <div style={{ fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: B.textFaint, marginBottom: 20 }}>Votre référent</div>
          <BPhoto tone="midnight" style={{ width: 72, height: 72, borderRadius: '50%', marginBottom: 18 }}>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: B.pearl, fontSize: 22, fontWeight: 500, letterSpacing: -0.5 }}>AR</div>
          </BPhoto>
          <div style={{ fontSize: 22, fontWeight: 400, letterSpacing: -0.6, marginBottom: 2 }}>Alexandre Renaud</div>
          <div style={{ fontSize: 13, color: B.textDim, marginBottom: 24 }}>Directeur des opérations</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 'auto' }}>
            <button style={{ flex: 1, padding: '12px', background: B.glassHi, color: B.text, border: `1px solid ${B.hair}`, borderRadius: 12, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>Email</button>
            <button style={{ flex: 1, padding: '12px', background: B.glassHi, color: B.text, border: `1px solid ${B.hair}`, borderRadius: 12, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>WhatsApp</button>
          </div>
        </div>
      </div>

      {/* Journey */}
      <div style={{
        background: B.glass, backdropFilter: 'blur(40px)', WebkitBackdropFilter: 'blur(40px)',
        border: `1px solid ${B.hair}`, borderRadius: 24, padding: '32px 36px', marginBottom: 24
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 28 }}>
          <div style={{ fontSize: 22, fontWeight: 500, letterSpacing: -0.6 }}>Votre parcours</div>
          <div style={{ fontSize: 13, fontFamily: B.serif, fontStyle: 'italic', color: B.pearl }}>68% accompli</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 24 }}>
          {[
            { tag: 'Phase 0', t: 'Signature', d: 'Contrat & objectifs.', date: '10 mars', s: 'done' },
            { tag: 'Phase 1', t: 'Audit initial', d: 'Analyse de votre activité.', date: '1 avril', s: 'done' },
            { tag: 'Phase 2', t: 'Accompagnement', d: 'Suivi hebdomadaire.', date: 'Depuis le 5 avril', s: 'active' },
            { tag: 'Phase 3', t: 'Bilan final', d: 'ROI & recommandations.', date: 'Fin juin', s: 'pending' }
          ].map((p, i) => (
            <div key={i} style={{
              paddingTop: 18, borderTop: `1px solid ${p.s === 'pending' ? B.hair : p.s === 'active' ? B.gold : B.text}`,
              opacity: p.s === 'pending' ? 0.55 : 1
            }}>
              <div style={{ fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', color: p.s === 'active' ? B.gold : B.textFaint, marginBottom: 8 }}>{p.tag} · {p.s === 'done' ? 'Terminé' : p.s === 'active' ? 'En cours' : 'À venir'}</div>
              <div style={{ fontSize: 16, fontWeight: 500, letterSpacing: -0.3, marginBottom: 6 }}>{p.t}</div>
              <div style={{ fontSize: 13, color: B.textDim, lineHeight: 1.5, marginBottom: 8 }}>{p.d}</div>
              <div style={{ fontSize: 11, color: B.textFaint }}>{p.date}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Documents */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16 }}>
        <div style={{ fontSize: 22, fontWeight: 500, letterSpacing: -0.6 }}>Documents</div>
        <div style={{ fontSize: 13, color: B.textDim }}>3 fichiers</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 }}>
        {[
          { t: 'Contrat de mission', d: '10 mars 2026', size: '420 Ko' },
          { t: 'Rapport d\'audit initial', d: '1 avril 2026', size: '2,1 Mo' },
          { t: 'Plan d\'action personnalisé', d: 'Mis à jour le 5 mai', size: '180 Ko' }
        ].map((d, i) => (
          <div key={i} style={{
            background: B.glass, border: `1px solid ${B.hair}`, borderRadius: 20,
            padding: 24, display: 'flex', flexDirection: 'column', gap: 16, cursor: 'pointer'
          }}>
            <div style={{
              width: 44, height: 56, borderRadius: 8, background: B.bgSoft, border: `1px solid ${B.hair}`
            }}></div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 4, letterSpacing: -0.2 }}>{d.t}</div>
              <div style={{ fontSize: 12, color: B.textDim }}>{d.d} · {d.size}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  </div>
);
