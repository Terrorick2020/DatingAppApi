import { SetMetadata } from '@nestjs/common'

export const SMART_CAPTCHA_KEY = 'smartCaptcha'
export const RequireSmartCaptcha = () => SetMetadata(SMART_CAPTCHA_KEY, true)
