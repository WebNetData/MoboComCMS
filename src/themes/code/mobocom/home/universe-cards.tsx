import Link from '@/platform/routing/Link'
import { themeImage, themeImageSet } from '@/themes/sdk/server'
import Icon from '../icons'
import { discoveryLinks, homeLive, type HomeProps } from './discovery'

export function UniverseFeature({ data, locale }: Pick<HomeProps, 'data' | 'locale'>) {
  const media = data.showcase.filter(item => homeLive(item.href, data.disabledPaths))
  const feature = media.find(item => item.kind === 'cinema' && (item.image || item.cover)) || media.find(item => item.image || item.cover)
  if (!feature) return null
  const fa = locale === 'fa'
  return <Link href={feature.href} className="muv-feature">
    <img className="muv-feature-art" src={themeImage(feature.image || feature.cover, 1280)} srcSet={themeImageSet(feature.image || feature.cover, 1280)} sizes="(max-width: 760px) 94vw, 48vw" alt="" fetchPriority="high"/>
    <span className="muv-feature-label"><Icon name={feature.kind === 'cinema' ? 'film' : 'grid'} size={16}/>{fa ? 'انتخاب بعدی‌ات اینجاست' : 'Find your next favourite'}</span>
    <span className="muv-feature-copy"><small>{fa ? 'بیشتر ببین، بیشتر کشف کن' : 'Watch more. Discover more.'}</small><strong dir="auto">{feature.title}</strong>{feature.meta && <span dir="auto">{feature.meta}</span>}</span>
    <span className="muv-feature-open" aria-hidden="true"><Icon name="arrow" size={24}/></span>
  </Link>
}

export function UniverseHighlights({ site, data, locale }: Pick<HomeProps, 'site' | 'data' | 'locale'>) {
  const fa = locale === 'fa'
  const media = data.showcase.filter(item => homeLive(item.href, data.disabledPaths))
  const album = media.find(item => item.kind === 'music')
  const game = media.find(item => item.kind === 'games')
  const prompt = discoveryLinks(site, data, locale).find(item => item.href === '/prompts')
  if (!album && !game && !prompt) return null
  return <div className="muv-highlights">
    {album && <Link href={album.href} className="muv-highlight muv-listening">
      <div className="muv-highlight-heading"><Icon name="music" size={18}/><span>{fa ? 'صدای امروزت' : 'Your daily soundtrack'}</span><Icon name="arrow" size={16}/></div>
      <div className="muv-listening-body"><div className="muv-record-art">{album.cover ? <img src={themeImage(album.cover, 320)} alt="" loading="lazy"/> : <Icon name="music" size={40}/>}<span className="muv-record" aria-hidden="true"/></div><span className="muv-highlight-copy"><strong dir="auto">{album.title}</strong><small dir="auto">{album.meta}</small><span className="muv-equalizer" aria-hidden="true">{[12, 24, 18, 32, 22, 14, 26, 18, 30, 12].map((height, index) => <i key={index} style={{ height }}/>)}</span></span></div>
    </Link>}
    {game && <Link href={game.href} className="muv-highlight muv-gaming">
      {(game.image || game.cover) && <img src={themeImage(game.image || game.cover, 640)} alt="" loading="lazy"/>}
      <div className="muv-highlight-heading"><Icon name="game" size={18}/><span>{fa ? 'ماجراجویی بعدی' : 'Your next adventure'}</span><Icon name="arrow" size={16}/></div>
      <span className="muv-highlight-copy"><strong dir="auto">{game.title}</strong><small dir="auto">{game.meta}</small></span>
    </Link>}
    {prompt && <Link href={prompt.href} className="muv-highlight muv-prompt">
      <div className="muv-highlight-heading"><Icon name={prompt.icon || 'pen'} size={18}/><span>{prompt.title}</span><Icon name="arrow" size={16}/></div>
      <span className="muv-prompt-visual" aria-hidden="true"><span/><span/><span/><span className="muv-prompt-cursor"/></span>
      <span className="muv-highlight-copy"><strong>{fa ? 'به ایده‌ات شکل بده' : 'Give your idea a direction'}</strong><small>{fa ? 'پرامپت برای متن، تصویر، ویدیو و وب' : 'Prompts for text, images, video and web'}</small></span>
    </Link>}
  </div>
}
