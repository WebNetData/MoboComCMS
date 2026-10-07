import type { NextRequest } from 'next/server'
import { setFeatured } from '@/modules/content/server/http/editorial-collections'

type Context = { params: Promise<{ id: string }> }
export const dynamic = 'force-dynamic'
export async function PUT(req: NextRequest, context: Context) { return setFeatured(req, context, true) }
export async function DELETE(req: NextRequest, context: Context) { return setFeatured(req, context, false) }
