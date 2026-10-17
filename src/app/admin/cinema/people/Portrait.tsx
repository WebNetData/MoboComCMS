'use client'
import { useState } from 'react'

/** Broken external media must not replace the portrait with oversized alt text. */
export default function Portrait({image,name}:{image:string;name:string}) {
  const [failed,setFailed]=useState('')
  return image&&failed!==image?<img src={image} alt="" loading="lazy" width={180} height={220} onError={()=>setFailed(image)}/>:<span aria-hidden="true">{name.slice(0,1)||'؟'}</span>
}
