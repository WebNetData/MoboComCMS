import { registerImporter } from '@/modules/imports/server/registry'
import { storeImporter } from '@/modules/imports/server/adapters/store'
import { magazineImporter } from '@/modules/imports/server/adapters/magazine'
import { gamesImporter, moviesImporter, seriesImporter, softwareImporter } from '@/modules/imports/server/adapters/sections'
import { musicImporter } from '@/modules/imports/server/adapters/music'

/** Built-in destinations. A module or plugin adds its own with registerImporter(). */
for (const adapter of [storeImporter, magazineImporter, moviesImporter, seriesImporter, gamesImporter, softwareImporter, musicImporter]) registerImporter(adapter)
