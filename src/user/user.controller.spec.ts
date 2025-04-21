import { Test, TestingModule } from '@nestjs/testing'
import { UserController } from './user.controller'
import { UserService } from './user.service'
import { UserServiceMock } from '../../test/mock/user.service.mock'

describe('UserController', () => {
	let controller: UserController
	let userService: UserService

	const fixedTelegramId = 'telegramId_mocked'

	beforeEach(async () => {
		const module: TestingModule = await Test.createTestingModule({
			controllers: [UserController],
			providers: [{ provide: UserService, useClass: UserServiceMock }],
		}).compile()

		controller = module.get<UserController>(UserController)
		userService = module.get<UserService>(UserService)
	})

	it('should be defined', () => {
		expect(controller).toBeDefined()
	})

	describe('findByTelegramId', () => {
		it('should return user by telegramId', async () => {
			const result = await controller.findByTelegramId(fixedTelegramId)
			expect(result.data.telegramId).toBe(fixedTelegramId)
		})
	})

	describe('getPublicProfile', () => {
		it('should return public profile for valid userId', async () => {
			const result = await controller.getPublicProfile('1')
			expect(result.message).toBe('Публичный профиль получен')
			expect(result.data.name).toBe('John Doe')
		})

		it('should return error for invalid userId', async () => {
			const result = await controller.getPublicProfile('999')
			expect(result.message).toBe('Пользователь не найден')
			expect(result.success).toBe(false)
		})
	})
})
