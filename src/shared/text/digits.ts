/** Persian/Arabic digits to Latin, everything else untouched. */
export function latinDigits(value: unknown): string {
  return String(value ?? '')
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
}
