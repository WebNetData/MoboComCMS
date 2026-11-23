import type { PackageRow } from './package-types'

export default function PackageReceipt({ receipt, L }: { receipt: NonNullable<PackageRow['codeApply']>; L: (en: string, fa: string) => string }) {
  return <details className="pm-receipt">
    <summary>{L('Apply receipt', 'رسید اعمال')}</summary>
    <dl>
      <dt>{L('Receipt ID', 'شناسهٔ رسید')}</dt><dd dir="ltr">{receipt.id}</dd>
      <dt>{L('Mode', 'روش')}</dt><dd dir="ltr">{receipt.mode}</dd>
      <dt>{L('Phase', 'مرحله')}</dt><dd>{L(receipt.phase, { prepared: 'آماده‌شده', planned: 'برنامه‌ریزی‌شده', effect: 'در حال اعمال', applied: 'اعمال‌شده', cancelled: 'لغوشده' }[receipt.phase])}</dd>
      {receipt.deploy && <><dt>{L('Deployment request', 'درخواست استقرار')}</dt><dd>{L(receipt.deploy, { claimed: 'درخواست ثبت‌شده', accepted: 'درخواست پذیرفته‌شده', failed: 'درخواست ناموفق', unknown: 'نتیجه نامشخص' }[receipt.deploy])}</dd></>}
    </dl>
  </details>
}
