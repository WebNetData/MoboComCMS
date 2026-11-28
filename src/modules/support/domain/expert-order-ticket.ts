export type ExpertOrderTicket = {
  id: number
  status: string
  version: number | null
  messages: { id: number; staff: boolean; text: string }[]
}

export const EXPERT_TICKET_SECURITY = 'رمز عبور، کد ورود و کد تأیید دومرحله‌ای را در تیکت ارسال نکنید.'

export const EXPERT_AUTHENTICATION_REQUEST = 'لطفاً تأیید دومرحله‌ای را در برنامه یا سایت اصلی سرویس انجام دهید و فقط نتیجه را در این تیکت اعلام کنید.'
