import { Test, TestingModule } from '@nestjs/testing'
import { PrismaService } from '../../prisma/prisma.service'
import { StorageService } from '../storage/storage.service'
import { UserService } from './user.service'
import { PrismaServiceMock } from '../../test/mock/prisma.service.mock'
import { StorageServiceMock } from '../../test/mock/storage.service.mock'

describe('UserService', () => {
	let service: UserService

	const fixedTelegramId = 'telegramId_mocked'

	beforeEach(async () => {
		const module: TestingModule = await Test.createTestingModule({
			providers: [
				UserService,
				{ provide: PrismaService, useValue: PrismaServiceMock },
				{ provide: StorageService, useClass: StorageServiceMock },
			],
		}).compile()

		service = module.get<UserService>(UserService)
	})

	it('should be defined', () => {
		expect(service).toBeDefined()
	})

	describe('findByTelegramId', () => {
		it('should return user by telegramId', async () => {
			const user = await service.findByTelegramId(fixedTelegramId)
			expect(user.data.telegramId).toBe(fixedTelegramId)
		})
	})

	describe('checkTgID', () => {
		it('should return Pro for valid id', async () => {
			const status = await service.checkTgID(fixedTelegramId)
			expect(status).toBe('Pro')
		})

		it('should return None for non-existing id', async () => {
			const status = await service.checkTgID('non_existing')
			expect(status).toBe('None')
		})
	})

	describe('savePhotos', () => {
		it('should save photo keys', async () => {
			const result = await service.savePhotos('1', ['key1', 'key2'])
			expect(result.message).toBe('Фотографии сохранены')
		})
	})

	describe('getPublicProfile', () => {
		it('should return profile for valid userId', async () => {
			const result = await service.getPublicProfile('1')
			expect(result.message).toBe('Публичный профиль получен')
		})

		it('should return error for invalid userId', async () => {
			const result = await service.getPublicProfile('999')
			expect(result.message).toBe('Пользователь не найден')
		})
	})
})
