import { Test, TestingModule } from '@nestjs/testing'
import { Role, Sex, Status } from '@prisma/client'
import { AuthServiceMock } from '../../test/mock/auth.service.mock'
import { StorageServiceMock } from '../../test/mock/storage.service.mock'
import { StorageService } from '../storage/storage.service'
import { AuthController } from './auth.controller'
import { AuthService } from './auth.service'
import { CheckAuthDto } from './dto/check-auth.dto'
import { CreateAuthDto } from './dto/create-auth.dto'

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
		it('should return user status when telegramId exists', async () => {
			const dto: CheckAuthDto = { telegramId: fixedTelegramId }
			const result = await controller.check(dto)
			expect(result.data).toBe('Pro')
			expect(result.message).toBe('Пользователь найден')
		})

		it('should return "None" when telegramId does not exist', async () => {
			const dto: CheckAuthDto = { telegramId: 'non_existing' }
			const result = await controller.check(dto)
			expect(result.data).toBe('None')
			expect(result.message).toBe('Пользователь не зарегистрирован')
		})
	})

	describe('uploadPhoto', () => {
		it('should return uploaded photo info', async () => {
			const file = { buffer: Buffer.from('dummy') } as Express.Multer.File
			const dto = { telegramId: fixedTelegramId }

			const result = await controller.uploadPhoto(file, dto as any)
			expect(result.message).toBe('Фото временно сохранено')
			expect(result.data).toHaveProperty('photoId')
		})
	})

	describe('register', () => {
		it('should register user successfully', async () => {
			const dto: CreateAuthDto = {
				telegramId: fixedTelegramId,
				name: 'John',
				town: 'Town',
				sex: Sex.Male,
				age: 30,
				bio: 'Bio',
				lang: 'en',
				enableGeo: true,
				interestId: 1,
				photoIds: [1, 2],
			}
			const result = await controller.register(dto)
			expect(result.message).toBe('Пользователь создан и фото привязаны')
		})
	})
})
