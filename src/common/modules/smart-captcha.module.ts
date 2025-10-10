import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { AppLogger } from '../logger/logger.service'
import { SmartCaptchaService } from '../services/smart-captcha.service'

@Module({
	imports: [ConfigModule],
	providers: [SmartCaptchaService, AppLogger],
	exports: [SmartCaptchaService],
})
export class SmartCaptchaModule {}
