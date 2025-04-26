import { NestFactory, Reflector } from '@nestjs/core'
import { AppModule } from './app/app.module'
import { LoggingInterceptor } from './common/interceptor/all-logging.interceptor'
import { AppLogger } from './common/logger/logger.service'
import { AllExceptionsFilter } from './common/filters/http-exception.filter'
import { PrismaService } from '~/prisma/prisma.service'
import { UserStatusGuard } from './common/guards/user-status.guard'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { ValidationPipe } from '@nestjs/common'

async function bootstrap() {
	const app = await NestFactory.create(AppModule)

	app.setGlobalPrefix('api')
	app.enableCors({
		origin: '*',
		methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
		allowedHeaders: 'Content-Type, Authorization',
	})

	const appLogger = app.get(AppLogger)

	const reflector = app.get(Reflector)
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

	app.useGlobalGuards(new UserStatusGuard(prisma, reflector))

	app.useGlobalInterceptors(new LoggingInterceptor(appLogger))

	app.useGlobalFilters(new AllExceptionsFilter(appLogger))

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

	// Корректное закрытие приложения с учётом Prisma
	const prismaService = app.get(PrismaService)
	// await prismaService.enableShutdownHooks(app)

	await app.listen(process.env.PORT ?? 3000)
}

void bootstrap()
