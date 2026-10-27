import { renderEditorialText } from '@/shared/content/sanitize'
import type { personPage } from '@/modules/cinema/server/people'
import styles from './discovery.module.css'
import { sized, srcSet } from '@/shared/media/image'

export default function PersonHeader({person,fa}:{person:NonNullable<Awaited<ReturnType<typeof personPage>>>;fa:boolean}){
  return <header className={styles.profileHero}>
    <span className={styles.portrait}>{person.image?<img src={sized(person.image, 160)} srcSet={srcSet(person.image, 160)} alt="" width={144} height={176}/>:<span aria-hidden="true">{person.name.slice(0,1)}</span>}</span>
    <div className={styles.profileIntro}><div className={styles.roles}>{person.castCount>0&&<span>{fa?'بازیگر':'Actor'}</span>}{person.directorCount>0&&<span>{fa?'کارگردان':'Director'}</span>}</div><h1 dir="auto">{person.name}</h1><p>{fa?'فیلم‌ها و سریال‌های موجود در موبوکام که این هنرمند در آن‌ها حضور داشته است.':'Films and series available on MoboCom featuring this person.'}</p>{person.bio&&<div className={styles.bio} dir="auto" dangerouslySetInnerHTML={{__html:renderEditorialText(person.bio)}}/>}</div>
  </header>
}
