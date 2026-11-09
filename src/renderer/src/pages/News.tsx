import { ExternalLink, Newspaper } from 'lucide-react'
import logo from '@/assets/logo.png'
import { openUrl } from '@/lib/api'
import { useApp } from '@/lib/store'
import { date } from '@/lib/format'
import { Background, TopBar } from '@/components/Shell'
import { Empty } from '@/components/ui'

export function News() {
  const { config } = useApp()
  const [first, ...rest] = config.news
  return (
    <>
      <Background dim />
      <TopBar title="Haberler" />
      <div className="page">
        {!first ? (
          <div className="card">
            <Empty icon={<Newspaper />} title="Şimdilik haber yok" text="Duyurular ve güncellemeler burada görünecek." />
          </div>
        ) : (
          <>
            <div className="card news-card news-featured" style={{ marginTop: 6 }}>
              <div className="cover">
                <img src={logo} alt="" style={{ width: 110, right: '50%', bottom: '50%', transform: 'translate(50%, 50%)' }} />
              </div>
              <div className="body" style={{ justifyContent: 'center', padding: 26 }}>
                <div className="row">
                  {first.tag && <span className="tag accent">{first.tag}</span>}
                  <span className="tiny muted">{date(first.date)}</span>
                </div>
                <h4 style={{ fontSize: 22 }}>{first.title}</h4>
                <p>{first.body}</p>
                {first.url && (
                  <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => openUrl(first.url)}>
                    Devamını oku <ExternalLink />
                  </button>
                )}
              </div>
            </div>
            {rest.length > 0 && (
              <>
                <div className="section-title">
                  <h3>Önceki haberler</h3>
                </div>
                <div className="grid g3">
                  {rest.map((n) => (
                    <article key={n.id} className="card hover news-card">
                      <div className="cover">
                        <img src={logo} alt="" />
                      </div>
                      <div className="body">
                        <div className="row">
                          {n.tag && <span className="tag accent">{n.tag}</span>}
                          <span className="tiny muted">{date(n.date)}</span>
                        </div>
                        <h4>{n.title}</h4>
                        <p>{n.body}</p>
                        {n.url && (
                          <button className="btn sm" style={{ alignSelf: 'flex-start', marginTop: 'auto' }} onClick={() => openUrl(n.url)}>
                            Devamını oku <ExternalLink />
                          </button>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </>
  )
}
