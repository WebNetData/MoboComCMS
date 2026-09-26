declare module 'qrcode' {
  export interface QROptions {
    width?: number
    margin?: number
    errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H'
    color?: { dark?: string; light?: string }
    type?: 'image/png' | 'image/jpeg' | 'image/webp' | 'svg'
  }
  export function toDataURL(text: string, options?: QROptions): Promise<string>
  export function toString(text: string, options?: QROptions): Promise<string>
  const QRCode: { toDataURL: typeof toDataURL; toString: typeof toString }
  export default QRCode
}
