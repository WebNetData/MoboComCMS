import Icon from '@/components/site/Icon'

export default function MiniAppHeading({ title, icon }: { title: string; icon: string }) {
  return <div className="tg-page-heading"><span className="tg-heading-icon"><Icon name={icon} size={24} /></span><h1>{title}</h1><span className="tg-heading-line" aria-hidden="true" /></div>
}
