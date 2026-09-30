import { registerImporter } from '@/modules/imports/server/registry'
import { storeImporter } from '@/modules/imports/server/adapters/store'

/** Built-in destinations. Plugins and new modules call registerImporter() the same way. */
registerImporter(storeImporter)
