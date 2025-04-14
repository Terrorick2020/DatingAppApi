import { Test, TestingModule } from '@nestjs/testing'
import { AuthController } from './auth.controller'
import { AuthService } from './auth.service'
import { StorageService } from '../storage/storage.service'
import { AuthServiceMock } from './auth.serrvice.mock'
import { StorageServiceMock } from '../storage/storage.service.mock'
import { Request, Role, Sex, Status } from '@prisma/client'

describe('AuthController', () => {
	let controller: AuthController
	let authService: AuthService

	const fixedTelegramId = 'telegramId_mocked'

	beforeEach(async () => {
		const module: TestingModule = await Test.createTestingModule({
			controllers: [AuthController],
			providers: [
				{ provide: AuthService, useClass: AuthServiceMock },
				{ provide: StorageService, useClass: StorageServiceMock },
			],
		}).compile()

		controller = module.get<AuthController>(AuthController)
		authService = module.get<AuthService>(AuthService)
	})

	it('should be defined', () => {
		expect(controller).toBeDefined()
	})

	describe('check', () => {
		it('should check if user exists by telegramId', async () => {
			const createAuthDto = { id: fixedTelegramId }
			const result = await controller.check(createAuthDto)
			expect(result.data).toBe('Pro')
		})
	})

	describe('uploadPhoto', () => {
		it('should upload photo', async () => {
			const file = { filename: 'test.jpg' } as Express.Multer.File
			const dto = { telegramId: fixedTelegramId, key: 'testKey' }
			const result = await controller.uploadPhoto(file, dto)
			expect(result.message).toBe('Фото временно сохранено')
		})
	})

	describe('register', () => {
		it('should register new user', async () => {
			const dto = {
				telegramId: fixedTelegramId,
				name: 'John',
				town: 'Town',
				sex: Sex.Male,
				age: 30,
				bio: 'Bio',
				lang: 'en',
				geo: true,
				findRequest: Request.Love,
				role: Role.User,
				status: Status.Pro,
			}
			const result = await controller.register(dto)
			expect(result.message).toBe('Пользователь создан и фото привязаны')
		})
	})
})
