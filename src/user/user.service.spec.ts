import { Test, TestingModule } from '@nestjs/testing'
import { UserService } from './user.service'
import { PrismaService } from '../../prisma/prisma.service'
import { StorageService } from '../storage/storage.service'
import { PrismaServiceMock } from '../../prisma/prisma.service.mock'
import { StorageServiceMock } from '../storage/storage.service.mock'

describe('UserService', () => {
	let service: UserService
	let prismaService: PrismaService
	let storageService: StorageService

	const fixedTelegramId = 'telegramId_mocked'

	beforeEach(async () => {
		const module: TestingModule = await Test.createTestingModule({
			providers: [
				UserService,
				{ provide: PrismaService, useClass: PrismaServiceMock },
				{ provide: StorageService, useClass: StorageServiceMock },
			],
		}).compile()

		service = module.get<UserService>(UserService)
		prismaService = module.get<PrismaService>(PrismaService)
		storageService = module.get<StorageService>(StorageService)
	})

	it('should be defined', () => {
		expect(service).toBeDefined()
	})

	describe('findByTelegramId', () => {
		it('should return user by telegramId', async () => {
			const user = await service.findByTelegramId(fixedTelegramId)

			expect(user).toHaveProperty('data')
			expect(user.data.telegramId).toBe(fixedTelegramId)
		})
	})

	describe('checkTgID', () => {
		it('should return status for existing telegramId', async () => {
			// Вместо null передаем пустую строку, чтобы избежать ошибки
			const status = await service.checkTgID(fixedTelegramId)
			expect(status).toBe('Pro')
		})

		it('should return "None" for non-existing telegramId', async () => {
			const status = await service.checkTgID('')
			expect(status).toBe('None')
		})
	})

	describe('savePhotos', () => {
		it('should save photos correctly', async () => {
			const userId = 1
			const photoKeys = ['key1', 'key2']

			const result = await service.savePhotos(userId, photoKeys)
			expect(result.message).toBe('Фотографии сохранены')
		})
	})
})
