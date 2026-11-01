'use client'
import dynamic from 'next/dynamic'
import { useState } from 'react'
import Icon from '@/components/site/Icon'
import g from './PromptGallery.module.css'
const VideoPlayer=dynamic(()=>import('@/components/media/VideoPlayer'),{ssr:false,loading:()=> <p role="status">در حال آماده‌کردن پلیر…</p>})
export default function SampleVideo({src,poster,title}:{src:string;poster:string;title:string}){
  const [playing,setPlaying]=useState(false)
  return <div className={g.videoStage}>{playing?<VideoPlayer src={src} playback="video" poster={poster} title={title} resumeKey={'prompt:'+src} keyboardScope="focused"/>:<button type="button" className={g.videoPoster} onClick={()=>setPlaying(true)} aria-label="پخش نمونهٔ ویدئو">{poster&&<img src={poster} alt="" width={960} height={600} referrerPolicy="no-referrer"/>}<span><Icon name="play" size={26}/>دیدن نمونهٔ ویدئو</span></button>}</div>
}
