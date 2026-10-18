export const ARTISTS_API='/api/admin/media-library?type=music-artists'
export type Work={id:number;title:string;slug:string;status:string}
export type Artist={id:number;slug:string;name:string;nameEn:string;image:string;cover:string;bio:string;featured:boolean;updatedAt:string;profileCanEdit:boolean;_count:{tracks:number;albums:number};tracks?:Work[];albums?:Work[]}
export type ArtistPage={rows:Artist[];total:number;overall:number;page:number;pages:number;mine:boolean}
