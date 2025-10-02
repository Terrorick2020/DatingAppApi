import { ValidationPipe } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { NestFactory } from '@nestjs/core'
import { MicroserviceOptions, Transport } from '@nestjs/microservices'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { PrismaService } from '~/prisma/prisma.service'
import { AppModule } from './app/app.module'
import { AllExceptionsFilter } from './common/filters/http-exception.filter'
import { LoggingInterceptor } from './common/interceptor/all-logging.interceptor'
import { AppLogger } from './common/logger/logger.service'
import { WebsocketAdapter } from './websocket/websocket.adapter'

async function bootstrap() {
	const app = await NestFactory.create(AppModule)

	app.enableCors({
		origin: (origin, callback) => {
			const allowedOrigins = ['http://localhost:4177', 'https://vmestedate.ru']
			if (!origin || allowedOrigins.includes(origin)) {
				callback(null, true)
			} else {
				callback(new Error('Not allowed by CORS'))
			}
		},
		credentials: true, 
		methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
		allowedHeaders: [
			'Content-Type',
			'Accept',
			'Origin',
			'X-Requested-With',
			'Authorization',
			'X-Spectre-Telegram-Id', 
		],
		preflightContinue: false, 
		optionsSuccessStatus: 204, 
	})

	const appLogger = app.get(AppLogger)
	const prisma = app.get(PrismaService)

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

	// TCP микросервис
	// const tcpPort = parseInt(process.env.TCP_PORT || '7755')
	// const tcpHost = process.env.TCP_HOST || '0.0.0.0'

	// app.connectMicroservice<MicroserviceOptions>({
	// 	transport: Transport.TCP,
	// 	options: {
	// 		host: tcpHost,
	// 		port: tcpPort,
	// 		retryAttempts: 5,
	// 		retryDelay: 1000,
	// 	},
	// })

	// await app.startAllMicroservices()
	// appLogger.log(`TCP микросервис запущен на ${tcpHost}:${tcpPort}`, 'Bootstrap')

	// // WebSocket адаптер
	// const configService = app.get(ConfigService)
	// const websocketAdapter = new WebsocketAdapter(app, configService)
	// app.useWebSocketAdapter(websocketAdapter)

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
