import { Test, TestingModule } from '@nestjs/testing'
import { UserController } from './user.controller'
import { UserService } from './user.service'
import { PrismaService } from '../../prisma/prisma.service'
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
		it('should return public profile for user', async () => {
			const userId = '1'
			const result = await controller.getPublicProfile(userId)
			expect(result.message).toBe('Публичный профиль получен')
		})
	})
})
