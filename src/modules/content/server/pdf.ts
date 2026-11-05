/** Public address of Content's PDF editions; authorization and typed templates remain server-owned. */
export { contentPdfAvailable,generateContentPdf } from './pdf/service'
export { getPdfSettings,savePdfSettings,pdfSettingsState,restorePdfSettings } from './pdf/settings'
export { GET_pdf,GET_settings,PATCH_settings } from './pdf/http'
