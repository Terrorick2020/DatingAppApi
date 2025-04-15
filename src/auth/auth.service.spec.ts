import { Test, TestingModule } from '@nestjs/testing'
import { Request, Role, Sex, Status } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { PrismaServiceMock } from '../../test/mock/prisma.service.mock'
import { UserService } from '../user/user.service'
import { UserServiceMock } from '../../test/mock/user.service.mock'
import { AuthService } from './auth.service'

describe('AuthService', () => {
	let service: AuthService
	let userService: UserService
	let prismaService: PrismaService

	const mockedTelegramId = 'telegramId_mocked'

	beforeEach(async () => {
		const module: TestingModule = await Test.createTestingModule({
			providers: [
				AuthService,
				{ provide: PrismaService, useClass: PrismaServiceMock },
				{ provide: UserService, useClass: UserServiceMock },
			],
		}).compile()

		service = module.get<AuthService>(AuthService)
		userService = module.get<UserService>(UserService)
		prismaService = module.get<PrismaService>(PrismaService)
	})

	it('should be defined', () => {
		expect(service).toBeDefined()
	})

	describe('check', () => {
		it('should return user status when telegramId exists', async () => {
			const result = await service.check({ telegramId: mockedTelegramId })
			expect(result.data).toBe('Pro')
		})

		it('should return "None" when telegramId does not exist', async () => {
			const result = await service.check({ telegramId: 'non_existing' })
			expect(result.data).toBe('None')
		})
	})

	describe('uploadPhoto', () => {
		it('should save photo correctly', async () => {
			const result = await service.uploadPhoto({
				key: 'someKey',
				telegramId: mockedTelegramId,
			})
			expect(result.message).toBe('Фото временно сохранено')
		})
	})

	describe('register', () => {
		it('should register new user successfully', async () => {
			const dto = {
				telegramId: mockedTelegramId,
				name: 'John Doe',
				town: 'Townsville',
				sex: Sex.Male,
				age: 30,
				bio: 'Hello!',
				lang: 'en',
				geo: true,
				findRequest: Request.Love,
				role: Role.User,
				status: Status.Pro,
			}

			const result = await service.register(dto)
			expect(result.message).toBe('Пользователь создан и фото привязаны')
		})

		it('should fail if telegramId is invalid', async () => {
			const dto = {
				telegramId: 'non_existing',
				name: 'John Doe',
				town: 'Townsville',
				sex: Sex.Male,
				age: 30,
				bio: 'Hello!',
				lang: 'en',
				geo: true,
				findRequest: Request.Love,
				role: Role.User,
				status: Status.Pro,
			}

			const result = await service.register(dto)
			expect(result.message).toContain('Ошибка при регистрации пользователя')
		})
	})
})
