import { ValidationPipe } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { PrismaService } from '~/prisma/prisma.service'
import { AppModule } from './app/app.module'
import { AllExceptionsFilter } from './common/filters/http-exception.filter'
import { LoggingInterceptor } from './common/interceptor/all-logging.interceptor'
import { AppLogger } from './common/logger/logger.service'
import { SmartCaptchaPatchMiddleware } from './common/middleware/smart-captcha-patch.middleware'
import { SmartCaptchaMiddleware } from './common/middleware/smart-captcha.middleware'
import { SmartCaptchaService } from './common/services/smart-captcha.service'

async function bootstrap() {
	const app = await NestFactory.create(AppModule)

	const appLogger = app.get(AppLogger)
	const prisma = app.get(PrismaService)
	const smartCaptchaService = app.get(SmartCaptchaService)

	// Smart Captcha middleware для всех запросов (кроме /user/:id)
	app.use(
		'/auth/register',
		new SmartCaptchaMiddleware(smartCaptchaService, appLogger).use.bind(
			new SmartCaptchaMiddleware(smartCaptchaService, appLogger)
		)
	)
	app.use(
		'/psychologists',
		new SmartCaptchaMiddleware(smartCaptchaService, appLogger).use.bind(
			new SmartCaptchaMiddleware(smartCaptchaService, appLogger)
		)
	)
	app.use(
		'/psychologists/:id',
		new SmartCaptchaMiddleware(smartCaptchaService, appLogger).use.bind(
			new SmartCaptchaMiddleware(smartCaptchaService, appLogger)
		)
	)

	// Smart Captcha middleware только для PATCH запросов на /user/:id
	app.use(
		'/user/:id',
		new SmartCaptchaPatchMiddleware(smartCaptchaService, appLogger).use.bind(
			new SmartCaptchaPatchMiddleware(smartCaptchaService, appLogger)
		)
	)

	// Глобальная валидация
	app.useGlobalPipes(
		new ValidationPipe({
			whitelist: true,
			transform: true,
			forbidNonWhitelisted: true,
			transformOptions: {
				enableImplicitConversion: true,
			},
		})
	)

	app.useGlobalInterceptors(new LoggingInterceptor(appLogger))
	app.useGlobalFilters(new AllExceptionsFilter(appLogger))

	// Swagger
	const config = new DocumentBuilder()
		.setTitle('Dating MiniApp API')
		.setDescription('API для приложения знакомств на TgMiniApp')
		.setVersion('1.0')
		.addTag('auth', 'Авторизация и регистрация')
		.addTag('likes', 'Управление симпатиями')
		.addTag('chats', 'Работа с чатами и сообщениями')
		.addTag('user', 'Управление пользователями')
		.addTag('redis', 'Администрирование Redis (только для админов)')
		.build()

	const document = SwaggerModule.createDocument(app, config)
	SwaggerModule.setup('docs', app, document)

	const apiPort = parseInt(process.env.PORT || '3000')

	console.log('🔥 Попытка запуска HTTP сервера...')
	await app.listen(apiPort)
	console.log('📡 HTTP сервер слушает порт', apiPort)
	console.log('✅ HTTP сервер успешно запущен')

	appLogger.log(`API сервер запущен на порту ${apiPort}`, 'Bootstrap')
}

// Глобальный захват ошибок
process.on('unhandledRejection', (reason, promise) => {
	console.error('🚨 Unhandled Rejection:', reason)
})

process.on('uncaughtException', error => {
	console.error('🚨 Uncaught Exception:', error)
})

void bootstrap()
