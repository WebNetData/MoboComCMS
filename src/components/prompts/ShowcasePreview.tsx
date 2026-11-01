import { type PromptShowcase } from '@/modules/prompts/domain/prompts'
import Icon from '@/components/site/Icon'
import WebPreview from './WebPreview'
import SampleImage from './SampleImage'
import SampleVideo from './SampleVideo'
import g from './PromptGallery.module.css'
export default function ShowcasePreview({ sample, kind, title, compact=false }: { sample: PromptShowcase; kind: string; title: string; compact?: boolean }) {
  if(sample.video)return compact?<div className={g.videoThumb}>{sample.cover&&<img src={sample.cover} alt={sample.alt||title} width={960} height={600} loading="lazy" referrerPolicy="no-referrer"/>}<span><Icon name="play" size={22}/></span><small>ویدئو</small></div>:<SampleVideo src={sample.video} poster={sample.cover} title={title}/>
  if(sample.cover)return compact?<img className={g.samplePhoto} src={sample.cover} alt={sample.alt||title} width={900} height={sample.aspect==='portrait'?1200:sample.aspect==='wide'?600:900} loading="lazy" decoding="async" referrerPolicy="no-referrer"/>:<SampleImage src={sample.cover} alt={sample.alt||title}/>
  if(sample.webLayout!=='none')return <WebPreview layout={sample.webLayout} compact={compact}/>
  if(sample.result)return <div className={kind==='CODE'||kind==='WEB'?g.codeSample:g.writtenSample}><div className={g.sampleWindow}><i/><i/><i/><span>{kind==='CODE'?'component.tsx':'یک نمونه از خروجی'}</span></div>{compact?<div className={g.textExcerpt} dir="auto">{sample.result}</div>:<pre tabIndex={0} aria-label="نمونهٔ خروجی پرامپت" dir="auto">{sample.result}</pre>}{compact&&<span className={g.paperFoot}>{kind==='CODE'?'CODE / ACCESSIBILITY':'WORDS / STORYTELLING'}</span>}</div>
  return <div className={g.noSample}><Icon name="file" size={36}/><span>الگوی آمادهٔ شخصی‌سازی</span></div>
}
