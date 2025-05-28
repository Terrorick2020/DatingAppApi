import { NestFactory } from '@nestjs/core'
import { AppModule } from './app/app.module'
import { LoggingInterceptor } from './common/interceptor/all-logging.interceptor'
import { AppLogger } from './common/logger/logger.service'
import { AllExceptionsFilter } from './common/filters/http-exception.filter'
import { PrismaService } from '~/prisma/prisma.service'
import { MicroserviceOptions, Transport } from '@nestjs/microservices'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { ValidationPipe } from '@nestjs/common'
import { WebsocketAdapter } from './websocket/websocket.adapter'
import { ConfigService } from '@nestjs/config'

async function bootstrap() {
	const app = await NestFactory.create(AppModule)

	// app.setGlobalPrefix('api')
	app.enableCors({
		origin: '*',
		methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
		allowedHeaders: 'Content-Type, Authorization',
	})

	const appLogger = app.get(AppLogger)
	const prisma = app.get(PrismaService)

	// Настройка глобальной валидации
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
	// app.useGlobalGuards()

	// Настройка TCP микросервиса для связи с WebSocket сервером
	const tcpPort = parseInt(process.env.TCP_PORT || '7755')
	const tcpHost = process.env.TCP_HOST || 'localhost'

	app.connectMicroservice<MicroserviceOptions>({
		transport: Transport.TCP,
		options: {
			host: tcpHost,
			port: tcpPort,
			retryAttempts: 5,
			retryDelay: 1000,
		},
	})

	// Запуск микросервиса
	await app.startAllMicroservices()
	appLogger.log(`TCP микросервис запущен на ${tcpHost}:${tcpPort}`, 'Bootstrap')

	const configService = app.get(ConfigService) // Импортируйте из @nestjs/config
	const websocketAdapter = new WebsocketAdapter(app, configService)
	app.useWebSocketAdapter(websocketAdapter)

	// Конфигурация Swagger
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
	await app.listen(apiPort)
	appLogger.log(`API сервер запущен на порту ${apiPort}`, 'Bootstrap')
}

void bootstrap()
